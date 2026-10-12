/**
 * The Clodable mark: a clod of clay with a thumbprint pressed into it. Shaped by you.
 *
 * The print is three open, slanted ridges, clipped by the clod, so it reads as pressed in rather than
 * drawn on. At 24 px and below, a two-ridge version with heavier strokes stays legible.
 * The exploration lives in scripts/logo-lab.mts.
 */

export interface LogoOptions {
  size?: number;
  /** Fill of the clod. Defaults to the brand clay. */
  clay?: string;
  /** Color of the thumbprint ridges. Defaults to paper. */
  groove?: string;
  /** Use the simplified print. By default it's on at 24 px and below. */
  small?: boolean;
  label?: string;
}

/** A river-stone-shaped clod: fuller at the bottom right, slightly flattened at the top left. */
export const CLOD_PATH =
  "M17.5 12.5C25.2 6.2 41.5 4.6 50.6 11.8c8.6 6.8 9.6 20.7 6.4 30.4-3.3 10.1-13.8 16.7-26.3 16.1C17.4 57.7 7.4 50.3 5.9 38.8 4.5 28.3 10.4 18.3 17.5 12.5z";

/** Thumbprint ridges: open arcs of three concentric ellipses tilted −32° around (31, 33). */
export const PRINT_PATHS = [
  "M33.86 37.58A3.6 5.4 -32 1 1 35.18 34.48",
  "M29.61 42.05A7.8 10.8 -32 1 1 36.12 42.48",
  "M21.45 40.65A12.2 16.4 -32 1 1 33.35 48.28",
] as const;

export const PRINT_PATHS_SMALL = [
  "M34.1 39.66A5.2 7.4 -32 1 1 36.84 36.04",
  "M26.8 44.59A11.2 15.2 -32 1 1 36.32 46.99",
] as const;

let uid = 0;

function markBody(clay: string, groove: string, small: boolean): string {
  const id = `clod-${(uid++).toString(36)}`;
  const prints = small ? PRINT_PATHS_SMALL : PRINT_PATHS;
  const stroke = small ? 4.2 : 3.2;
  return `<defs><clipPath id="${id}"><path d="${CLOD_PATH}"/></clipPath></defs><path d="${CLOD_PATH}" fill="${clay}"/><g clip-path="url(#${id})" fill="none" stroke="${groove}" stroke-width="${stroke}" stroke-linecap="round">${prints
    .map((d) => `<path d="${d}"/>`)
    .join("")}</g>`;
}

export function logoSvg(options: LogoOptions = {}): string {
  const size = options.size ?? 32;
  const small = options.small ?? size <= 24;
  const a11y = options.label
    ? `role="img" aria-label="${options.label.replace(/"/g, "&quot;")}"`
    : `aria-hidden="true" focusable="false"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" ${a11y}>${markBody(
    options.clay ?? "#B9502B",
    options.groove ?? "#FBF8F3",
    small,
  )}</svg>`;
}

/** The mark plus the lowercase wordmark, for the README and docs. The text is live, in the display face. */
export function lockupSvg(
  options: { height?: number; ink?: string; clay?: string; groove?: string } = {},
): string {
  const h = options.height ?? 48;
  const w = Math.round((h * 246) / 60);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 246 60" role="img" aria-label="Clodable"><g transform="translate(0 -2)">${markBody(
    options.clay ?? "#B9502B",
    options.groove ?? "#FBF8F3",
    false,
  )}</g><text x="72" y="43" fill="${options.ink ?? "#1F1A16"}" font-family="Fraunces, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" font-size="38" font-weight="600" letter-spacing="-0.5">clodable</text></svg>`;
}
