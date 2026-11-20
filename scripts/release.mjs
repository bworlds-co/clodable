// A release: one version for the CLI, the packages, the plugin and the marketplace, and the
// marketplace's entry pinned to the release's tag. Claude Code only updates an installed plugin when
// this version changes, so every release bumps it. It installs whatever the entry points at, so the
// entry names the release's tag: installs and updates get the last release, never main.
//
//   node scripts/release.mjs 0.3.0      (or: patch, minor, major)
//
// The tag doesn't exist yet: follow "Releasing" in CONTRIBUTING.md, which pushes it before this
// commit reaches main.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packages = ["cli", "core", "design", "preview"].map((p) => `packages/${p}/package.json`);
const current = JSON.parse(readFileSync(resolve(root, packages[0]), "utf8")).version;
const [major, minor, patch] = current.split(".").map(Number);
const asked = process.argv[2];
const next =
  asked === "patch"
    ? `${major}.${minor}.${patch + 1}`
    : asked === "minor"
      ? `${major}.${minor + 1}.0`
      : asked === "major"
        ? `${major + 1}.0.0`
        : asked;
if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Which version? Now ${current}. Give x.y.z, or patch, minor or major.`);
  process.exit(1);
}
// An older or equal version would pin installs to a release that already exists.
const wanted = next.split(".").map(Number);
const differs = wanted.findIndex((n, i) => n !== [major, minor, patch][i]);
if (differs === -1 || wanted[differs] < [major, minor, patch][differs]) {
  console.error(`${next} isn't newer than ${current}. Give a higher version.`);
  process.exit(1);
}
for (const file of packages) {
  const path = resolve(root, file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = next;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}
// Installs follow releases: Claude Code fetches the plugin folder at this tag, the one
// `claude plugin tag plugin` creates. The full https address, not owner/repo: Claude Code clones
// owner/repo over SSH, which fails for builders who have no GitHub SSH key.
const tag = `clodable--v${next}`;
const marketplace = resolve(root, ".claude-plugin/marketplace.json");
const catalog = JSON.parse(readFileSync(marketplace, "utf8"));
for (const plugin of catalog.plugins) {
  plugin.source = {
    source: "git-subdir",
    url: "https://github.com/bworlds-co/clodable.git",
    path: "plugin",
    ref: tag,
  };
}
writeFileSync(marketplace, `${JSON.stringify(catalog, null, 2)}\n`);
// The build copies the version into the plugin and the marketplace, with the CLI bundle.
execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
console.log(`
${current} → ${next}. The marketplace now installs ${tag}, which isn't on GitHub yet. Next:
  1. Write docs/releases/${next}.md, run the checks, commit "Release ${next}", push, and open
     the release pull request.
  2. When it's ready to merge and up to date with main, tag its last commit:
     claude plugin tag plugin --push
  3. Then merge it right away. main must never name a tag that isn't on GitHub.
"Releasing" in CONTRIBUTING.md has the details.`);
