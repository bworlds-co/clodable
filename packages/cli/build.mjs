// Bundles the CLI into one dependency-free file: dist/clodable.mjs.
// The toolbar's browser bundle is embedded, so `npx clodable dev` works without anything else.
// The app's own Vite is never bundled: it's loaded from the app's node_modules at run time.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const toolbar = await build({
  entryPoints: ["../preview/src/client/index.ts"],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "none",
});

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
    __CLODABLE_TOOLBAR__: JSON.stringify(toolbar.outputFiles[0].text),
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
