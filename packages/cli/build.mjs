// Bundles the CLI into one dependency-free file: dist/clodable.mjs.
// The toolbar's browser bundle (built by @clodable/preview, which pnpm builds first) is embedded,
// so `npx clodable dev` works without anything else.
// The app's own Vite is never bundled: it's loaded from the app's node_modules at run time.
// The packages bundled in keep their licenses: dist/THIRD_PARTY_NOTICES.txt carries them, and
// Clodable's own LICENSE goes beside package.json, where npm always ships it.
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const toolbarPath = "../preview/dist/toolbar.js";
if (!existsSync(toolbarPath)) {
  console.error("Build the toolbar first: pnpm --filter @clodable/preview build");
  process.exit(1);
}
const toolbar = readFileSync(toolbarPath, "utf8");

mkdirSync("dist", { recursive: true });
const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/clodable.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false,
  legalComments: "none",
  external: ["vite", "esbuild", "fsevents"],
  define: {
    __CLODABLE_TOOLBAR__: JSON.stringify(toolbar),
    __CLODABLE_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __clodableCreateRequire } from 'node:module';",
      "const require = __clodableCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  metafile: true,
});
chmodSync("dist/clodable.mjs", 0o755);
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`dist/clodable.mjs ${(bytes / 1024).toFixed(0)} KB`);
writeFileSync("dist/.version", pkg.version);
writeFileSync("dist/THIRD_PARTY_NOTICES.txt", thirdPartyNotices(result.metafile));
copyFileSync("../../LICENSE", "LICENSE");

/**
 * Every package in the bundle, with its license as the package ships it. esbuild's list of what
 * went in names them all: legal comments alone (`legalComments: "external"`) would miss every one
 * of them, since none marks its license that way.
 */
function thirdPartyNotices(metafile) {
  const dirs = new Set();
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      // pnpm's paths nest: the package is the last one named after node_modules.
      const dir = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1];
      if (dir && bytesInOutput > 0) dirs.add(resolve(dir));
    }
  }
  const entries = [...dirs].map((dir) => {
    const about = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const files = readdirSync(dir)
      .filter((file) => /^(licen[cs]e|copying|notice)([-.][\w.-]+)?$/i.test(file))
      .filter((file) => !/\.(c?js|mjs|ts|json)$/i.test(file))
      .sort();
    if (files.length === 0) {
      console.error(
        `${about.name} is bundled into dist/clodable.mjs but ships no license file: add its notice before publishing.`,
      );
      process.exit(1);
    }
    const license =
      typeof about.license === "string"
        ? about.license
        : (about.license?.type ?? (about.licenses ?? []).map((l) => l.type).join(" OR "));
    const url = [
      about.homepage,
      typeof about.repository === "string" ? about.repository : about.repository?.url,
    ]
      .map((u) => (typeof u === "string" ? u.replace(/^git\+/, "").replace(/\.git$/, "") : ""))
      .find((u) => /^https?:\/\//.test(u));
    const texts = files.map((file) =>
      readFileSync(join(dir, file), "utf8").replace(/\r\n?/g, "\n").trim(),
    );
    const title = [`${about.name} ${about.version}`, license].filter(Boolean).join(" · ");
    const text = [title, ...(url ? [url] : []), "", texts.join("\n\n")].join("\n");
    return { key: `${about.name}@${about.version}`, text };
  });
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const rule = "=".repeat(72);
  return [
    "Third-party notices",
    "",
    "Clodable's command line, clodable.mjs, includes the open-source packages below, each with its",
    "license as the package ships it. Clodable's own license is in LICENSE.",
    "",
    ...entries.flatMap((entry) => [rule, entry.text, ""]),
  ].join("\n");
}
