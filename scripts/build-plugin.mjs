// Copies the bundled CLI into the plugin, so the plugin works on its own once installed from the
// marketplace. Run after `pnpm -r build` (the root `pnpm build` does both).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Claude Code refuses a slash command named like one of the plugin's skills, even a skill builders
// can't type: the command would quietly be missing.
const skills = readdirSync(resolve(root, "plugin/skills")).map(
  (dir) =>
    readFileSync(resolve(root, "plugin/skills", dir, "SKILL.md"), "utf8").match(
      /^name:\s*(\S+)/m,
    )?.[1] ?? dir,
);
const commands = [
  ...readFileSync(resolve(root, "plugin/hooks/register.tsx"), "utf8").matchAll(
    /\{ name: "([\w-]+)", description: /g,
  ),
].map((match) => match[1]);
const clash = commands.filter((name) => skills.includes(name));
if (commands.length === 0 || clash.length > 0) {
  console.error(
    commands.length === 0
      ? "Couldn't find the plugin's slash commands in plugin/hooks/register.tsx."
      : `Rename these skills, or Claude Code refuses their commands: ${clash.join(", ")}`,
  );
  process.exit(1);
}
const bundle = resolve(root, "packages/cli/dist/clodable.mjs");
if (!existsSync(bundle)) {
  console.error("Build the CLI first: pnpm --filter clodable build");
  process.exit(1);
}
mkdirSync(resolve(root, "plugin/cli"), { recursive: true });
copyFileSync(bundle, resolve(root, "plugin/cli/clodable.mjs"));

// Keep the plugin, the CLI and the marketplace on one version. Once a release has pinned the
// marketplace's entry to its tag (scripts/release.mjs), the pin names this version's tag too.
const version = JSON.parse(
  readFileSync(resolve(root, "packages/cli/package.json"), "utf8"),
).version;
for (const file of ["plugin/.claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
  const path = resolve(root, file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  if (json.version !== undefined) json.version = version;
  if (json.metadata?.version !== undefined) json.metadata.version = version;
  for (const plugin of json.plugins ?? []) {
    plugin.version = version;
    if (plugin.source?.ref !== undefined) plugin.source.ref = `clodable--v${version}`;
  }
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`plugin/cli/clodable.mjs · v${version}`);

// The bundled CLI carries other people's code: their licenses, and Clodable's own, go beside it,
// so every installed plugin has them.
const notices = resolve(root, "packages/cli/dist/THIRD_PARTY_NOTICES.txt");
if (!existsSync(notices)) {
  console.error("Build the CLI first: pnpm --filter clodable build");
  process.exit(1);
}
copyFileSync(notices, resolve(root, "plugin/cli/THIRD_PARTY_NOTICES.txt"));
copyFileSync(resolve(root, "LICENSE"), resolve(root, "plugin/cli/LICENSE"));
