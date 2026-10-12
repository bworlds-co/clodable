import { type ColorScheme, font, motion, type Palette, palette, radius, shadow } from "./tokens.js";

const kebab = (key: string) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function schemeVars(scheme: ColorScheme): string {
  const colors = Object.entries(palette[scheme] as Palette)
    .map(([key, value]) => `--cl-${kebab(key)}: ${value};`)
    .join(" ");
  const shadows = Object.entries(shadow[scheme])
    .map(([key, value]) => `--cl-shadow-${key}: ${value};`)
    .join(" ");
  return `${colors} ${shadows} color-scheme: ${scheme};`;
}

const staticVars = [
  ...Object.entries(radius).map(([k, v]) => `--cl-radius-${k}: ${v};`),
  `--cl-font-ui: ${font.ui};`,
  `--cl-font-mono: ${font.mono};`,
  `--cl-font-display: ${font.display};`,
  `--cl-fast: ${motion.fast};`,
  `--cl-base: ${motion.base};`,
  `--cl-slow: ${motion.slow};`,
  `--cl-ease-out: ${motion.easeOut};`,
  `--cl-ease-in-out: ${motion.easeInOut};`,
  `--cl-spring: ${motion.spring};`,
].join(" ");

export interface CssVariablesOptions {
  /** Selector that receives the variables. Use `:host` inside a shadow root. */
  selector?: string;
  /** Follow the OS setting (default), or force a scheme. */
  scheme?: ColorScheme | "auto";
}

/**
 * The tokens as CSS custom properties, named `--cl-*`.
 * With `scheme: "auto"`, dark values apply under `prefers-color-scheme: dark`, and an explicit
 * `[data-theme]` attribute on the selector always wins.
 */
export function cssVariables(options: CssVariablesOptions = {}): string {
  const selector = options.selector ?? ":root";
  const scheme = options.scheme ?? "auto";
  if (scheme !== "auto") return `${selector} { ${staticVars} ${schemeVars(scheme)} }`;
  const forced = (s: ColorScheme) =>
    selector === ":host"
      ? `:host([data-theme="${s}"]) { ${schemeVars(s)} }`
      : `${selector}[data-theme="${s}"] { ${schemeVars(s)} }`;
  return [
    `${selector} { ${staticVars} ${schemeVars("light")} }`,
    `@media (prefers-color-scheme: dark) { ${selector} { ${schemeVars("dark")} } }`,
    forced("light"),
    forced("dark"),
  ].join("\n");
}
