// Bundles the CLI into one dependency-free file: dist/cloclod.mjs.
// The toolbar's browser bundle (built by @clodable/preview, which pnpm builds first) is embedded,
// so `npx cloclod dev` works without anything else.
// The app's own Vite is never bundled: it's loaded from the app's node_modules at run time.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const toolbarPath = "../preview/dist/toolbar.js";
if (!existsSync(toolbarPath)) {
  console.error("Build the toolbar first: pnpm --filter @clodable/preview build");
  process.exit(1);
}
const toolbar = readFileSync(toolbarPath, "utf8");

// A fresh dist: the package ships all of it, so nothing from an earlier build may stay behind.
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/cloclod.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false,
  legalComments: "none",
  external: ["vite", "esbuild", "fsevents"],
  define: {
    __CLOCLOD_TOOLBAR__: JSON.stringify(toolbar),
    __CLOCLOD_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __cloclodCreateRequire } from 'node:module';",
      "const require = __cloclodCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  metafile: true,
});
chmodSync("dist/cloclod.mjs", 0o755);
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`dist/cloclod.mjs ${(bytes / 1024).toFixed(0)} KB`);
writeFileSync("dist/.version", pkg.version);
