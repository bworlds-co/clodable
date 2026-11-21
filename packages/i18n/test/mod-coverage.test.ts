import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { french } from "../src/mod.js";

test("every fixed mod message has a French translation", () => {
  const hooks = new URL("../../../plugin/hooks/", import.meta.url);
  const missing: string[] = [];
  for (const name of readdirSync(hooks).filter((name) => /\.tsx?$/.test(name))) {
    const source = readFileSync(new URL(name, hooks), "utf8");
    for (const match of source.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")/g)) {
      const message = JSON.parse(match[1]!) as string;
      if (!Object.hasOwn(french, message)) missing.push(`${name}: ${message}`);
    }
  }
  expect(missing).toEqual([]);
});
