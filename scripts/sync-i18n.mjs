import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "plugin/i18n");
const check = process.argv.includes("--check");
if (!check) mkdirSync(target, { recursive: true });

// Installed plugins can only import files inside their own directory.
for (const name of ["index.ts", "mod.ts"]) {
  const source = readFileSync(resolve(root, "packages/i18n/src", name), "utf8");
  const file = resolve(target, name);
  if (check) {
    if (readFileSync(file, "utf8") !== source) {
      throw new Error(`${file} is stale. Run pnpm sync:i18n.`);
    }
  } else if (!existsSync(file) || readFileSync(file, "utf8") !== source) {
    writeFileSync(file, source);
  }
}
