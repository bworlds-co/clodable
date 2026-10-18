import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The CLI bundles other people's code. Their licenses travel with it: packages/cli/build.mjs writes
 * them to dist/THIRD_PARTY_NOTICES.txt (shipped on npm), and scripts/build-plugin.mjs copies them,
 * with Clodable's own LICENSE, beside the plugin's bundled CLI.
 */

const repo = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("the licenses that travel with the bundled CLI", () => {
  it("include Clodable's own, beside the npm package and the plugin's copy", () => {
    expect(read("packages/cli/LICENSE")).toBe(read("LICENSE"));
    expect(read("plugin/cli/LICENSE")).toBe(read("LICENSE"));
  });

  it("name every package the bundle depends on, each with its license text", () => {
    const notices = read("plugin/cli/THIRD_PARTY_NOTICES.txt");
    // Loaded from the app's own node_modules at run time, never bundled (see build.mjs).
    const external = new Set(["vite", "esbuild", "fsevents"]);
    const bundled = [
      // The CLI ships as one file: what it needs is only a dev dependency.
      ...Object.keys(JSON.parse(read("packages/cli/package.json")).devDependencies),
      ...Object.keys(JSON.parse(read("packages/core/package.json")).dependencies),
      ...Object.keys(JSON.parse(read("packages/preview/package.json")).dependencies),
    ].filter((name) => !name.startsWith("@clodable/") && !external.has(name));
    expect(bundled).toContain("zod");
    for (const name of bundled) {
      expect(notices).toMatch(new RegExp(`^${literal(name)} \\S+ · \\S`, "m"));
    }
    // Each entry: its name, version and license, then the license file's own words.
    const entries = notices.split(`${"=".repeat(72)}\n`).slice(1);
    expect(entries.length).toBeGreaterThanOrEqual(bundled.length);
    for (const entry of entries) {
      const text = entry.slice(entry.indexOf("\n\n") + 2);
      expect(entry.indexOf("\n\n")).toBeGreaterThan(0);
      expect(text.trim().length).toBeGreaterThan(100);
    }
  });
});
