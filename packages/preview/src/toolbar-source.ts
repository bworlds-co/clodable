import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Replaced with the toolbar bundle when the CLI is built into a single file. */
declare const __CLOCLOD_TOOLBAR__: string | undefined;

let cached: string | undefined;

/**
 * The toolbar's browser bundle. It's embedded in the CLI build, read from dist/ when the package is
 * built, or compiled on the fly in development. Set CLODABLE_TOOLBAR_DEV=1 to rebuild it on every
 * page load while designing.
 */
export async function toolbarSource(): Promise<string> {
  if (typeof __CLOCLOD_TOOLBAR__ === "string") return __CLOCLOD_TOOLBAR__;
  const live = Boolean(process.env.CLODABLE_TOOLBAR_DEV);
  if (cached && !live) return cached;
  const dist = fileURLToPath(new URL("../dist/toolbar.js", import.meta.url));
  if (!live && existsSync(dist)) {
    cached = await readFile(dist, "utf8");
    return cached;
  }
  const esbuild = await import("esbuild");
  const result = await esbuild.build({
    entryPoints: [fileURLToPath(new URL("./client/index.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    minify: !live,
    legalComments: "none",
  });
  cached = result.outputFiles[0]!.text;
  return cached;
}
