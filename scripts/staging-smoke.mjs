import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REQUEST_TIMEOUT_MS = 10_000;

function parseStagingOrigin(value, name) {
  if (!value) {
    throw new Error(`${name} is not configured in the GitHub staging environment`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin`);
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    throw new Error(`${name} must be a public HTTPS origin without a path or credentials`);
  }

  return url.origin;
}

async function request(fetchImpl, url, options, label) {
  try {
    return await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    throw new Error(`${label} request failed; check the staging URL and deployment`);
  }
}

function assertAllowedHeaders(response, expectedHeaders) {
  const allowedHeaders = new Set(
    (response.headers.get("access-control-allow-headers") ?? "")
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean),
  );
  const missing = expectedHeaders.filter((header) => !allowedHeaders.has(header));
  if (missing.length) {
    throw new Error("API CORS does not allow the headers required by the app");
  }
}

export async function runStagingSmoke({
  webUrl,
  apiUrl,
  fetchImpl = globalThis.fetch,
  log = console.log,
}) {
  const webOrigin = parseStagingOrigin(webUrl, "STAGING_WEB_URL");
  const apiOrigin = parseStagingOrigin(apiUrl, "STAGING_API_URL");

  const webResponse = await request(fetchImpl, `${webOrigin}/`, {}, "Web");
  const contentType = webResponse.headers.get("content-type") ?? "";
  const document = await webResponse.text();
  if (
    !webResponse.ok ||
    !contentType.toLowerCase().includes("text/html") ||
    !/<html(?:\s|>)/i.test(document)
  ) {
    throw new Error("Web staging did not return an HTML application document");
  }
  log("PASS web application responds with HTML");

  const healthResponse = await request(
    fetchImpl,
    `${apiOrigin}/api/v1/health`,
    { headers: { Accept: "application/json" } },
    "API health",
  );
  if (
    !healthResponse.ok ||
    !(healthResponse.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("application/json")
  ) {
    throw new Error("API health endpoint did not return JSON success");
  }
  const health = await healthResponse.json();
  if (health.status !== "UP") {
    throw new Error("API health endpoint reported an unhealthy status");
  }
  log("PASS API liveness");

  const corsResponse = await request(
    fetchImpl,
    `${apiOrigin}/api/v1/health`,
    {
      method: "OPTIONS",
      headers: {
        Origin: webOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type,apikey",
      },
    },
    "API CORS preflight",
  );
  const allowedMethods = new Set(
    (corsResponse.headers.get("access-control-allow-methods") ?? "")
      .split(",")
      .map((method) => method.trim().toUpperCase())
      .filter(Boolean),
  );
  if (
    !corsResponse.ok ||
    corsResponse.headers.get("access-control-allow-origin") !== webOrigin ||
    !allowedMethods.has("GET")
  ) {
    throw new Error("API CORS preflight does not allow the staging web origin");
  }
  assertAllowedHeaders(corsResponse, ["authorization", "content-type", "apikey"]);
  log("PASS API CORS allowlist");

  const protectedResponse = await request(
    fetchImpl,
    `${apiOrigin}/api/v1/budgets`,
    { headers: { Accept: "application/json", Origin: webOrigin } },
    "Protected API route",
  );
  if (protectedResponse.status !== 401) {
    throw new Error("Protected API route must reject unauthenticated requests with 401");
  }
  if (protectedResponse.headers.get("access-control-allow-origin") !== webOrigin) {
    throw new Error("Protected API response is missing the staging CORS origin");
  }
  log("PASS protected API route rejects anonymous requests");
}

async function main() {
  await runStagingSmoke({
    webUrl: process.env.STAGING_WEB_URL,
    apiUrl: process.env.STAGING_API_URL,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(`Staging smoke checks failed: ${error.message}`);
    process.exitCode = 1;
  });
}
