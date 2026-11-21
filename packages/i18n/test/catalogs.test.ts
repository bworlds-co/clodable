import { describe, expect, test } from "vitest";
import * as cli from "../src/cli.js";
import * as core from "../src/core.js";
import * as mod from "../src/mod.js";
import * as preview from "../src/preview.js";

const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{([\w]+)\}/g)].map((match) => match[1]))].sort();

describe("French catalogs", () => {
  for (const [surface, module] of Object.entries({ mod, preview, core, cli })) {
    test(`${surface} keeps every interpolation value`, () => {
      for (const catalog of Object.values(module)) {
        if (!catalog || typeof catalog !== "object") continue;
        for (const [source, translation] of Object.entries(catalog)) {
          if (typeof translation !== "string") continue;
          expect(translation.trim(), `${surface}: ${source}`).not.toBe("");
          expect(placeholders(translation), `${surface}: ${source}`).toEqual(placeholders(source));
        }
      }
    });
  }
});
