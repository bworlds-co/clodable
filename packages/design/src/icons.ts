/**
 * Clodable's icon set: 20×20, 1.6 px rounded strokes, drawn in `currentColor`.
 * Drawn for this project. Each shape sits on whole or half pixels, so it stays crisp at 1x.
 */

type Shape = string | { circle: [cx: number, cy: number, r: number]; fill?: boolean };

const icon = (...shapes: Shape[]) => shapes;

export const icons = {
  check: icon("M4.5 10.5l3.5 3.5 7.5-8"),
  close: icon("M5.5 5.5l9 9M14.5 5.5l-9 9"),
  publish: icon("M10 13.5v-7", "M7 9.5l3-3 3 3", { circle: [10, 10, 7] }),
  undo: icon("M7.5 5.5 4 9l3.5 3.5", "M4.5 9h7.25a3.75 3.75 0 0 1 0 7.5H10"),
  restore: icon("M3.5 10a6.5 6.5 0 1 0 1.9-4.6", "M3.5 3.5v3h3", "M10 6.75V10l2.5 1.5"),
  external: icon(
    "M8.5 5.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3",
    "M11.5 4.5h4v4",
    "M15.5 4.5 9.5 10.5",
  ),
  phone: icon(
    "M8 2.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z",
    "M9 15h2",
  ),
  tablet: icon(
    "M6 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    "M9 14.5h2",
  ),
  desktop: icon(
    "M3.5 4.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
    "M7.5 17.5h5",
    "M10 14.5v3",
  ),
  text: icon(
    "M3.5 6V4.5h9V6",
    "M8 4.5v11",
    "M6 15.5h4",
    "M15 8.5v8",
    "M13.5 8.5h3",
    "M13.5 16.5h3",
  ),
  select: icon("M4.5 3.5l10.5 4.6-4.4 1.6-1.6 4.4z", "M10.6 9.7l4.4 4.4"),
  sparkles: icon(
    "M9 3.5l1.4 3.6L14 8.5l-3.6 1.4L9 13.5l-1.4-3.6L4 8.5l3.6-1.4z",
    "M15 12.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z",
  ),
  minimize: icon("M5 10h10"),
  alert: icon("M10 3.8 17.2 16.2H2.8z", "M10 8.5v3.5", "M10 14.25v.01"),
  info: icon({ circle: [10, 10, 7] }, "M10 9.25v4.5", "M10 6.5v.01"),
  globe: icon(
    { circle: [10, 10, 7] },
    "M3 10h14",
    "M10 3c1.9 2 2.9 4.4 2.9 7s-1 5-2.9 7c-1.9-2-2.9-4.4-2.9-7s1-5 2.9-7z",
  ),
  database: icon(
    "M4 5.5C4 4.1 6.7 3 10 3s6 1.1 6 2.5S13.3 8 10 8 4 6.9 4 5.5z",
    "M4 5.5v9C4 15.9 6.7 17 10 17s6-1.1 6-2.5v-9",
    "M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5",
  ),
  refresh: icon(
    "M15.5 8a6 6 0 0 0-10.4-1.6L4 8",
    "M4 4.5V8h3.5",
    "M4.5 12a6 6 0 0 0 10.4 1.6L16 12",
    "M16 15.5V12h-3.5",
  ),
  grip: icon(
    { circle: [7.5, 6, 1.1], fill: true },
    { circle: [12.5, 6, 1.1], fill: true },
    { circle: [7.5, 10, 1.1], fill: true },
    { circle: [12.5, 10, 1.1], fill: true },
    { circle: [7.5, 14, 1.1], fill: true },
    { circle: [12.5, 14, 1.1], fill: true },
  ),
  more: icon(
    { circle: [5, 10, 1.25], fill: true },
    { circle: [10, 10, 1.25], fill: true },
    { circle: [15, 10, 1.25], fill: true },
  ),
  chevronDown: icon("M6 8l4 4 4-4"),
  chevronUp: icon("M6 12l4-4 4 4"),
  arrowRight: icon("M4.5 10h11", "M11 5.5l4.5 4.5-4.5 4.5"),
  copy: icon(
    "M7.5 7.5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z",
    "M4.5 12.5h-.25a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 .75.75v.25",
  ),
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof icons;

export interface SvgOptions {
  size?: number;
  strokeWidth?: number;
  /** Accessible label. Without one, the icon is hidden from assistive technology. */
  label?: string;
  className?: string;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** An icon as an SVG string, ready for `innerHTML` or for the mod's `Svg` element. */
export function svgIcon(name: IconName, options: SvgOptions = {}): string {
  const size = options.size ?? 20;
  const stroke = options.strokeWidth ?? 1.6;
  const a11y = options.label
    ? `role="img" aria-label="${escapeAttr(options.label)}"`
    : `aria-hidden="true" focusable="false"`;
  const cls = options.className ? ` class="${escapeAttr(options.className)}"` : "";
  const body = icons[name]
    .map((shape) => {
      if (typeof shape === "string") return `<path d="${shape}"/>`;
      const [cx, cy, r] = shape.circle;
      return shape.fill
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    })
    .join("");
  return `<svg${cls} xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}
