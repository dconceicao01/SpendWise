import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const required = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PREFIX",
];

for (const name of required) {
  if (!process.env[name]) {
    process.stderr.write(`Missing required backup setting: ${name}.\n`);
    process.exit(2);
  }
}

const archivePath = process.argv[2];
if (!archivePath || !archivePath.endsWith(".tar.gz.age")) {
  process.stderr.write("Expected an encrypted .tar.gz.age archive.\n");
  process.exit(2);
}

const bucket = process.env.R2_BUCKET;
const prefix = process.env.R2_PREFIX;
if (!/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID)) {
  process.stderr.write("R2_ACCOUNT_ID must be a 32-character Cloudflare account ID.\n");
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
  process.stderr.write("R2_BUCKET is not a valid bucket name.\n");
  process.exit(2);
}
if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*\/$/.test(prefix) || !prefix.startsWith("spendwise/")) {
  process.stderr.write("R2_PREFIX must be a SpendWise-only path ending in '/'.\n");
  process.exit(2);
}

const endpoint = `https://${process.env.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`;
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const storageGuardBytes = 9_000_000_000;

function aws(args, { json = false } = {}) {
  const result = spawnSync(
    "aws",
    [
      "--region",
      "auto",
      "--endpoint-url",
      endpoint,
      ...args,
      ...(json ? ["--output", "json"] : []),
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        AWS_DEFAULT_REGION: "auto",
        AWS_EC2_METADATA_DISABLED: "true",
      },
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  if (result.error || result.status !== 0) {
    process.stderr.write("R2 operation failed; provider output was suppressed.\n");
    process.exit(1);
  }

  if (!json) return undefined;
  try {
    return JSON.parse(result.stdout);
  } catch {
    process.stderr.write("R2 returned an invalid listing response.\n");
    process.exit(1);
  }
}

async function listObjects() {
  const objects = [];
  let continuationToken;

  do {
    const args = [
      "s3api",
      "list-objects-v2",
      "--bucket",
      bucket,
      "--max-keys",
      "1000",
      "--no-paginate",
    ];
    if (continuationToken) args.push("--continuation-token", continuationToken);
    const page = aws(args, { json: true });
    objects.push(...(page.Contents ?? []));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !continuationToken) {
      process.stderr.write("R2 listing was truncated without a continuation token.\n");
      process.exit(1);
    }
  } while (continuationToken);

  return objects;
}

const archive = await stat(archivePath);
if (!archive.isFile() || archive.size <= 0 || archive.size > storageGuardBytes) {
  process.stderr.write("Encrypted backup size is invalid or exceeds the configured free-tier guard.\n");
  process.exit(1);
}

const now = Date.now();
const objects = await listObjects();
const expired = objects.filter(
  (object) =>
    typeof object.Key === "string" &&
    object.Key.startsWith(prefix) &&
    Date.parse(object.LastModified) < now - retentionMs,
);

for (const object of expired) {
  aws(["s3api", "delete-object", "--bucket", bucket, "--key", object.Key]);
}

const expiredKeys = new Set(expired.map((object) => object.Key));
const retainedBytes = objects.reduce(
  (total, object) => total + (expiredKeys.has(object.Key) ? 0 : Number(object.Size ?? 0)),
  0,
);

if (!Number.isSafeInteger(retainedBytes) || retainedBytes + archive.size > storageGuardBytes) {
  process.stderr.write("Upload refused: the 9 GB storage guard would be exceeded. No new backup was uploaded.\n");
  process.exit(1);
}

const checksum = createHash("sha256");
for await (const chunk of createReadStream(archivePath)) checksum.update(chunk);
const digest = checksum.digest("hex");
const key = `${prefix}${new Date(now).toISOString().replaceAll(":", "-")}-${basename(archivePath)}`;
aws([
  "s3api",
  "put-object",
  "--bucket",
  bucket,
  "--key",
  key,
  "--body",
  archivePath,
  "--content-type",
  "application/octet-stream",
  "--metadata",
  `sha256=${digest}`,
]);

const head = aws(
  ["s3api", "head-object", "--bucket", bucket, "--key", key],
  { json: true },
);
if (head.ContentLength !== archive.size || head.Metadata?.sha256 !== digest) {
  process.stderr.write("Uploaded backup failed size or checksum verification.\n");
  process.exit(1);
}

process.stdout.write(`Encrypted backup stored and verified (${archive.size} bytes).\n`);
