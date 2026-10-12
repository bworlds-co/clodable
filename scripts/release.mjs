// A release: one version for the CLI, the packages, the plugin and the marketplace. Claude Code only
// updates an installed plugin when this version changes, so every release bumps it.
//
//   node scripts/release.mjs 0.2.0      (or: patch, minor, major)
//
// Then commit, push, and tag the release: claude plugin tag plugin --push
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
for (const file of packages) {
  const path = resolve(root, file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = next;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}
// The build copies the version into the plugin and the marketplace, with the CLI bundle.
execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
console.log(`\n${current} → ${next}. Commit and push, then: claude plugin tag plugin --push`);
