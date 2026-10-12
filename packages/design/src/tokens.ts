/**
 * Clodable design tokens.
 *
 * The palette is named after ceramics:
 * - clay is the body you shape;
 * - celadon (a jade glaze) means "live and healthy";
 * - cobalt (the classic blue decoration) means "information";
 * - ochre and oxide are the warning and danger glazes;
 * - paper, bisque and slip are the quiet surfaces;
 * - ink and ash are the text.
 *
 * Every text/background pair used in the product meets WCAG AA: 4.5:1 for text, 3:1 for indicators.
 */

export type ColorScheme = "light" | "dark";

export interface Palette {
  /** App background. */
  paper: string;
  /** Raised or subtle surfaces: cards, toolbar. */
  bisque: string;
  /** Hairline borders and dividers. */
  slip: string;
  /** Stronger borders, input outlines. */
  slipStrong: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  ash: string;
  /** Primary action (Publish), brand. */
  clay: string;
  clayHover: string;
  /** Text and icons drawn in the brand color on light surfaces. */
  clayText: string;
  /** Text drawn on a clay fill. */
  onClay: string;
  claySoft: string;
  /** Live / success. */
  celadon: string;
  celadonSoft: string;
  /** Information and links. */
  cobalt: string;
  cobaltSoft: string;
  /** Warning. */
  ochre: string;
  ochreSoft: string;
  /** Danger and errors. */
  oxide: string;
  oxideSoft: string;
  /** Focus ring. */
  focus: string;
  /** Translucent scrim behind dialogs. */
  scrim: string;
}

export const palette: Record<ColorScheme, Palette> = {
  light: {
    paper: "#FBF8F3",
    bisque: "#F4EEE6",
    slip: "#E7DED2",
    slipStrong: "#D3C6B6",
    ink: "#1F1A16",
    ash: "#6B6158",
    clay: "#B9502B",
    clayHover: "#A44322",
    clayText: "#A2441F",
    onClay: "#FFFFFF",
    claySoft: "#F7E4DA",
    celadon: "#2B7354",
    celadonSoft: "#E1F0E8",
    cobalt: "#2D5BA6",
    cobaltSoft: "#E3EBF7",
    ochre: "#8F6210",
    ochreSoft: "#F7ECD4",
    oxide: "#B1281E",
    oxideSoft: "#F9E1DE",
    focus: "#2D5BA6",
    scrim: "rgba(31, 26, 22, 0.32)",
  },
  dark: {
    paper: "#15110E",
    bisque: "#1E1915",
    slip: "#352D27",
    slipStrong: "#4A4038",
    ink: "#F3EEE7",
    ash: "#A79D92",
    clay: "#E5764F",
    clayHover: "#EE8A66",
    clayText: "#F08F6B",
    onClay: "#1F1A16",
    claySoft: "#3A2419",
    celadon: "#6CC59E",
    celadonSoft: "#16342A",
    cobalt: "#8AB0F0",
    cobaltSoft: "#18263D",
    ochre: "#E6B356",
    ochreSoft: "#3A2C12",
    oxide: "#F27B70",
    oxideSoft: "#3E1A17",
    focus: "#8AB0F0",
    scrim: "rgba(0, 0, 0, 0.5)",
  },
};

/** 4 px base grid. */
export const space = {
  0: "0px",
  0.5: "2px",
  1: "4px",
  1.5: "6px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
  pill: "999px",
} as const;

export const font = {
  /** Native UI everywhere: it feels at home in Claude Desktop and in any browser. */
  ui: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
  /** Brand moments only (docs, wordmark). Falls back to the UI font. */
  display: '"Fraunces", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif',
} as const;

export const text = {
  xs: { size: "11px", line: "16px" },
  sm: { size: "12px", line: "16px" },
  md: { size: "13px", line: "18px" },
  lg: { size: "15px", line: "22px" },
  xl: { size: "18px", line: "26px" },
  "2xl": { size: "24px", line: "30px" },
} as const;

export const weight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/** Shadows are tinted warm so they sit naturally on paper. */
export const shadow: Record<ColorScheme, { sm: string; md: string; lg: string }> = {
  light: {
    sm: "0 1px 2px rgba(60, 38, 20, 0.08)",
    md: "0 1px 2px rgba(60, 38, 20, 0.06), 0 6px 16px -4px rgba(60, 38, 20, 0.14)",
    lg: "0 2px 4px rgba(60, 38, 20, 0.06), 0 18px 40px -12px rgba(60, 38, 20, 0.28)",
  },
  dark: {
    sm: "0 1px 2px rgba(0, 0, 0, 0.4)",
    md: "0 1px 2px rgba(0, 0, 0, 0.4), 0 6px 16px -4px rgba(0, 0, 0, 0.5)",
    lg: "0 2px 4px rgba(0, 0, 0, 0.4), 0 18px 40px -12px rgba(0, 0, 0, 0.7)",
  },
};

export const motion = {
  /** Hover and press feedback. */
  fast: "120ms",
  /** Most transitions. */
  base: "180ms",
  /** Panels and toasts entering. */
  slow: "260ms",
  easeOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  /** A gentle overshoot, used once per surface entrance, never in loops. */
  spring: "cubic-bezier(0.34, 1.4, 0.64, 1)",
} as const;

export const z = {
  /** Above almost anything an app might render. */
  toolbar: 2147483000,
  toast: 2147483100,
  overlay: 2147483200,
} as const;
