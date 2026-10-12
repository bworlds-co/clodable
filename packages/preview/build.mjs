// Builds the toolbar's browser bundle to dist/toolbar.js. The Node side is bundled by the CLI.
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/client/index.ts"],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "none",
  metafile: true,
});
mkdirSync("dist", { recursive: true });
writeFileSync("dist/toolbar.js", result.outputFiles[0].text);
const bytes = result.outputFiles[0].contents.length;
console.log(`toolbar.js ${(bytes / 1024).toFixed(1)} KB`);
