// Copies the bundled CLI into the plugin, so the plugin works on its own once installed from the
// marketplace. Run after `pnpm -r build` (the root `pnpm build` does both).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = resolve(root, "packages/cli/dist/clodable.mjs");
if (!existsSync(bundle)) {
  console.error("Build the CLI first: pnpm --filter clodable build");
  process.exit(1);
}
mkdirSync(resolve(root, "plugin/cli"), { recursive: true });
copyFileSync(bundle, resolve(root, "plugin/cli/clodable.mjs"));

// Keep the plugin, the CLI and the marketplace on one version.
const version = JSON.parse(
  readFileSync(resolve(root, "packages/cli/package.json"), "utf8"),
).version;
for (const file of ["plugin/.claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
  const path = resolve(root, file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  if (json.version !== undefined) json.version = version;
  if (json.metadata?.version !== undefined) json.metadata.version = version;
  for (const plugin of json.plugins ?? []) plugin.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`plugin/cli/clodable.mjs · v${version}`);
