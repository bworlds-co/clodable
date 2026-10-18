/**
 * The Cloclod mark: the clod, Cloclod's mascot. A lump of clay that comes alive, half sculpted,
 * that you finish shaping. This is its front pose, drawn flat on a 16 × 16 pixel grid.
 *
 * Each pixel is a square, drawn with crisp edges. At multiples of 8 px (16, 24, 32, 48, 64) every
 * square lands on whole pixels of a 2x screen, so the mark stays sharp; other sizes blur its edges.
 * One version works on light and dark backgrounds.
 */
import { WORDMARK_PATH } from "./wordmark.js";

/** One letter per pixel: `.` empty, `o` outline, `b` clay, `e` eyes and mouth. */
export const MARK_ROWS = [
  ".........ooo....",
  ".......oobbbo...",
  "......obbbbbo...",
  "....oobbbbbbo...",
  "...obbbbbbbbbo..",
  "..obbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  ".obbeebbbbeebbo.",
  "obbbeebbbbeebbbo",
  "obbbbbbeebbbbbbo",
  "obbbbbbbbbbbbbbo",
  "oobbbbbbbbbbbbbo",
  "..obbbbbbbbbbbo.",
  "..oobbbooobbboo.",
  "....obo...obo...",
  "....ooo...ooo...",
] as const;

export interface MarkColors {
  outline: string;
  clay: string;
  eyes: string;
}

/**
 * The light clay of the character sheet, lighter than the palette's `clay`: in that deeper clay the
 * clod read as brown, and a brown lump with a face reads as something else. Buttons keep `clay`.
 */
export const MARK_COLORS: MarkColors = { outline: "#3B1A10", clay: "#E88858", eyes: "#2A140C" };

export interface LogoOptions {
  /** Width and height in px. Keep it a multiple of 8. */
  size?: number;
  colors?: Partial<MarkColors>;
  label?: string;
}

/** The mark's squares in grid units: one path per color, one run of squares per row. */
function markPaths(colors: MarkColors): string {
  const fills: Record<string, string> = { o: colors.outline, b: colors.clay, e: colors.eyes };
  const runs: Record<string, string> = {};
  MARK_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x] as string;
      let n = 1;
      while (row[x + n] === c) n++;
      if (fills[c]) runs[c] = `${runs[c] ?? ""}M${x} ${y}h${n}v1h-${n}z`;
      x += n;
    }
  });
  return Object.entries(runs)
    .map(([c, d]) => `<path fill="${fills[c]}" d="${d}"/>`)
    .join("");
}

export function logoSvg(options: LogoOptions = {}): string {
  const size = options.size ?? 32;
  const a11y = options.label
    ? `role="img" aria-label="${options.label.replace(/"/g, "&quot;")}"`
    : `aria-hidden="true" focusable="false"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges" ${a11y}>${markPaths(
    { ...MARK_COLORS, ...options.colors },
  )}</svg>`;
}

/** Width of the lockup at its natural height of 48: the mark, a 12 px gap, the word. */
const LOCKUP_WIDTH = 186;

/**
 * The mark plus the lowercase wordmark, for the README and docs. Keep the height a multiple of 16
 * (48 by default) so the mark's squares stay whole.
 */
export function lockupSvg(
  options: { height?: number; ink?: string; colors?: Partial<MarkColors> } = {},
): string {
  const h = options.height ?? 48;
  const w = Math.round((h * LOCKUP_WIDTH) / 48);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${LOCKUP_WIDTH} 48" role="img" aria-label="Cloclod"><g shape-rendering="crispEdges" transform="scale(3)">${markPaths(
    { ...MARK_COLORS, ...options.colors },
  )}</g><path transform="translate(58.7 39)" fill="${options.ink ?? "#1F1A16"}" d="${WORDMARK_PATH}"/></svg>`;
}

/** The word alone, for places where a drawing of the mascot stands above it (the README header). */
export function wordmarkSvg(options: { height?: number; ink?: string } = {}): string {
  const h = options.height ?? 30;
  const w = Math.round((h * 127) / 30);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 -29 127 30" role="img" aria-label="Cloclod"><path fill="${options.ink ?? "#1F1A16"}" d="${WORDMARK_PATH}"/></svg>`;
}
