import MagicString from "magic-string";
import { jsxName, type Node, parseModule, walk } from "./ast.js";
import { SOURCE_ATTR } from "./shared.js";

const SKIP_ELEMENTS = new Set([
  "Fragment",
  "React.Fragment",
  "Suspense",
  "React.Suspense",
  "StrictMode",
  "React.StrictMode",
]);

export interface TagResult {
  code: string;
  map: ReturnType<MagicString["generateMap"]>;
  count: number;
}

/**
 * Add `data-cl-src="src/pages/Index.tsx:12:7"` to every JSX element, in development only.
 *
 * Host elements (`<h1>`) get it directly. Components (`<Button>`) get it as a prop: most UI
 * components (shadcn/ui, Radix) spread props onto their DOM element after their own attributes,
 * so the DOM ends up carrying the *usage* site, which is exactly where the visible text lives.
 */
export interface TagOptions {
  /** Map a position in `code` back to the original file, when other plugins transformed it first. */
  locate?: (line: number, column: number) => { line: number; column: number } | undefined;
  /** The file as it is on disk. Source maps often keep only the line, so the column is found here. */
  original?: string;
}

export function tagJsx(
  code: string,
  file: string,
  options: TagOptions = {},
): TagResult | undefined {
  const { locate, original } = options;
  const originalLines =
    original !== undefined && original !== code ? original.split("\n") : undefined;
  const seen = new Map<string, number>();
  /** Exact column of the nth `<name` on an original line, when the map only knows the line. */
  const columnOn = (line: number, name: string): number | undefined => {
    const text = originalLines?.[line - 1];
    if (text === undefined) return undefined;
    const key = `${line}:${name}`;
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    const pattern = new RegExp(`<${name.replace(/[.$]/g, "\\$&")}(?![\\w$.-])`, "g");
    const hits = [...text.matchAll(pattern)];
    const hit = hits[nth] ?? hits[hits.length - 1];
    return hit?.index;
  };
  if (!code.includes("<")) return undefined;
  const program = parseModule(code, file);
  if (!program) return undefined;
  const s = new MagicString(code);
  let count = 0;
  walk(program, (node) => {
    if (node.type !== "JSXOpeningElement") return;
    const nameNode = node.name as Node;
    const name = jsxName(nameNode);
    if (!name || name.includes(":") || SKIP_ELEMENTS.has(name)) return;
    const attributes = (node.attributes as Node[]) ?? [];
    const already = attributes.some(
      (a) => a.type === "JSXAttribute" && (a.name as Node | undefined)?.name === SOURCE_ATTR,
    );
    if (already) return;
    let at = { line: node.loc.start.line, column: node.loc.start.column };
    if (originalLines) {
      const mapped = locate?.(at.line, at.column);
      if (mapped) at = { line: mapped.line, column: columnOn(mapped.line, name) ?? mapped.column };
    }
    s.appendLeft(nameNode.end, ` ${SOURCE_ATTR}="${file}:${at.line}:${at.column + 1}"`);
    count++;
  });
  if (count === 0) return undefined;
  return {
    code: s.toString(),
    map: s.generateMap({ hires: "boundary", source: file, includeContent: true }),
    count,
  };
}
