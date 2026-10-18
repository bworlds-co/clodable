/**
 * What the dev server and the toolbar in the page agree on. No imports: the toolbar's bundle takes
 * this file whole, and it stays small.
 */

/** The attribute that carries "file:line:column" of the JSX that rendered an element. */
export const SOURCE_ATTR = "data-cl-src";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/** "src/pages/Index.tsx:12:7" → its file, line and column. */
export function parseSourceAttr(value: string): SourceLocation | undefined {
  const match = value.match(/^(.+):(\d+):(\d+)$/);
  if (!match) return undefined;
  return { file: match[1]!, line: Number(match[2]), column: Number(match[3]) };
}

/**
 * The name the toolbar's code gets its config (the token) under. The server wraps the bundle in a
 * function with this parameter, never on `window`, and client/api.ts refers to it by this name.
 */
export const CONFIG_NAME = "__CLOCLOD__";

/** The dev server's own addresses. Everything under PREFIX is Cloclod's, never the app's. */
export const PREFIX = "/__cloclod/";
export const ROUTES = {
  toolbar: `${PREFIX}toolbar.js`,
  health: `${PREFIX}health`,
  frame: `${PREFIX}frame`,
  probe: `${PREFIX}text/probe`,
  text: `${PREFIX}text`,
  inbox: `${PREFIX}inbox`,
  originalLine: `${PREFIX}original-line`,
  buildError: `${PREFIX}build-error`,
} as const;

/** Marks the app's page inside a device frame, so its toolbar reports where it goes. */
export const FRAME_PARAM = "__cloclod_frame";

/** The device frames' screens, upright, in CSS pixels. */
export const SCREENS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
} as const;

/** What broke a page, as the toolbar shows it and hands it to Claude. */
export interface PageError {
  message: string;
  stack?: string;
  kind: "runtime" | "build" | "promise";
  source?: { file: string; line: number };
}

/** A build error in the toolbar's terms: its first line, and the start of its trace. */
export function buildError(
  message: string,
  stack: string,
  source?: { file: string; line: number },
): PageError & { kind: "build"; stack: string } {
  return {
    message: message.trim().split("\n")[0]!.slice(0, 300),
    stack: stack.slice(0, 4000),
    kind: "build",
    ...(source ? { source } : {}),
  };
}
