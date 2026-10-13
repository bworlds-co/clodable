import { describe, expect, it } from "vitest";
import { type ColorScheme, type Palette, palette } from "../src/index.js";

/** WCAG 2 contrast ratio between two #RRGGBB colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

type Pair = [text: keyof Palette, on: keyof Palette];

/** Text the product draws, and what it draws it on: 4.5:1 at least. */
const TEXT: Pair[] = [
  ["ink", "paper"],
  ["ink", "bisque"],
  ["ash", "paper"],
  ["ash", "bisque"],
  ["clayText", "paper"],
  ["clayText", "bisque"],
  // The primary button, and the chips over the page (clay, cobalt and ash fills).
  ["onClay", "clay"],
  ["onClay", "cobalt"],
  ["onClay", "ash"],
];

/** Focus rings and status marks against the surfaces: 3:1 at least. */
const INDICATORS: Pair[] = [
  ["focus", "paper"],
  ["focus", "bisque"],
  ["celadon", "paper"],
  ["ochre", "paper"],
  ["oxide", "paper"],
];

describe("the palette meets WCAG AA", () => {
  for (const scheme of ["light", "dark"] as ColorScheme[]) {
    const p = palette[scheme];
    it.each(TEXT)(`${scheme}: %s text on %s`, (text, on) => {
      expect(contrast(p[text], p[on])).toBeGreaterThanOrEqual(4.5);
    });
    it.each(INDICATORS)(`${scheme}: %s on %s`, (mark, on) => {
      expect(contrast(p[mark], p[on])).toBeGreaterThanOrEqual(3);
    });
  }
});
