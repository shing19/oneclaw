import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const sourceSchemaPath = resolve(
  projectRoot,
  "packages/core/src/config/schema.json",
);
const distSchemaPath = resolve(projectRoot, "dist/schema.json");

await mkdir(dirname(distSchemaPath), { recursive: true });
await copyFile(sourceSchemaPath, distSchemaPath);
