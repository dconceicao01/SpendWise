import { readFile } from "node:fs/promises";

const [schemaPath, dataPath] = process.argv.slice(2);

if (!schemaPath || !dataPath) {
  process.stderr.write("Expected schema and data dump paths.\n");
  process.exit(2);
}

const [schema, data] = await Promise.all([
  readFile(schemaPath, "utf8"),
  readFile(dataPath, "utf8"),
]);

const qualifiedName = (name) =>
  name
    .split(".")
    .map((part) => `"?${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"?`)
    .join("\\.");

const table = (text, name) =>
  new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?${qualifiedName(name)}\\b`, "i").test(text);

const copyData = (text, name) => {
  return new RegExp(`^COPY\\s+${qualifiedName(name)}\\s*\\(`, "im").test(text);
};

const requiredTables = ["auth.users", "auth.identities"];
const missingSchema = requiredTables.filter((name) => !table(schema, name));
const missingData = requiredTables.filter((name) => !copyData(data, name));

if (missingSchema.length || missingData.length) {
  process.stderr.write(
    "Backup refused: dump does not contain the required Supabase Auth schema and data markers. No archive was uploaded.\n",
  );
  process.exit(1);
}

process.stdout.write("Supabase Auth schema and data markers found.\n");
