import { type Node, parseModule, walk } from "./ast.js";

/**
 * Inline text editing without AI: find the JSX element at a source location, find the piece of
 * static text the builder changed, and rewrite just that text. Formatting, indentation and
 * everything else in the file stay exactly as they were.
 */

export type TextEditFailure =
  /** The element isn't at that location (the file changed since the page loaded). */
  | "not-found"
  /** The text is computed (a variable, a prop, data). Claude should change it instead. */
  | "dynamic"
  /** The same text appears twice in that element, so we can't tell which one. */
  | "ambiguous";

export type TextEditResult =
  | { ok: true; code: string; line: number }
  | { ok: false; reason: TextEditFailure };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
};

const decode = (text: string) => text.replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e);

/** How the browser shows JSX text: entities decoded, whitespace runs collapsed, ends trimmed. */
export const normalize = (text: string) => decode(text).replace(/\s+/g, " ").trim();

interface Candidate {
  kind: "text" | "string";
  node: Node;
  /** The visible text. */
  text: string;
}

function findElement(program: Node, line: number, column: number, text?: string): Node | undefined {
  let exact: Node | undefined;
  const sameLine: Node[] = [];
  walk(program, (node) => {
    if (node.type === "JSXElement") {
      const opening = node.openingElement as Node;
      if (opening.loc.start.line === line) {
        if (opening.loc.start.column + 1 === column) exact = node;
        sameLine.push(node);
      }
    }
    return undefined;
  });
  if (exact) return exact;
  // Some source maps lose the column. On that line, prefer the element that holds this text.
  if (text !== undefined) {
    const target = normalize(text);
    const holder = sameLine.find((el) => candidates(el).list.some((c) => c.text === target));
    if (holder) return holder;
  }
  return sameLine.length === 1 ? sameLine[0] : undefined;
}

function candidates(element: Node): { list: Candidate[]; hasDynamic: boolean } {
  const list: Candidate[] = [];
  let hasDynamic = false;
  for (const child of (element.children as Node[]) ?? []) {
    if (child.type === "JSXText") {
      const text = normalize(child.value as string);
      if (text) list.push({ kind: "text", node: child, text });
    } else if (child.type === "JSXExpressionContainer") {
      const expression = child.expression as Node;
      if (expression.type === "StringLiteral") {
        list.push({
          kind: "string",
          node: expression,
          text: normalize(expression.value as string),
        });
      } else if (
        expression.type === "TemplateLiteral" &&
        (expression.expressions as Node[]).length === 0
      ) {
        const quasi = (expression.quasis as Node[])[0];
        const cooked = ((quasi?.value as { cooked?: string })?.cooked ?? "") as string;
        list.push({ kind: "string", node: expression, text: normalize(cooked) });
      } else if (expression.type !== "JSXEmptyExpression") {
        hasDynamic = true;
      }
    }
  }
  return { list, hasDynamic };
}

/** Can this text be edited in place? Used to show the right affordance before the builder types. */
export function probeText(
  code: string,
  file: string,
  line: number,
  column: number,
  text: string,
): { editable: true } | { editable: false; reason: TextEditFailure } {
  const program = parseModule(code, file);
  const element = program && findElement(program, line, column, text);
  if (!element) return { editable: false, reason: "not-found" };
  const target = normalize(text);
  const { list, hasDynamic } = candidates(element);
  const matches = list.filter((c) => c.text === target);
  if (matches.length === 1) return { editable: true };
  if (matches.length > 1) return { editable: false, reason: "ambiguous" };
  return { editable: false, reason: hasDynamic || list.length === 0 ? "dynamic" : "not-found" };
}

/** JSX text can't contain these characters raw; such text is written as a string expression instead. */
const NEEDS_EXPRESSION = /[{}<>]/;

export function editText(
  code: string,
  file: string,
  location: { line: number; column: number },
  before: string,
  after: string,
): TextEditResult {
  const program = parseModule(code, file);
  const element = program && findElement(program, location.line, location.column, before);
  if (!element) return { ok: false, reason: "not-found" };
  const target = normalize(before);
  const { list, hasDynamic } = candidates(element);
  const matches = list.filter((c) => c.text === target);
  if (matches.length === 0)
    return { ok: false, reason: hasDynamic || list.length === 0 ? "dynamic" : "not-found" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous" };
  const match = matches[0]!;
  const next = after.replace(/\s+/g, " ").trim();
  let replacement: string;
  let start: number;
  let end: number;

  if (match.kind === "text") {
    // Keep the original surrounding whitespace (indentation, line breaks) and replace only the words.
    const raw = code.slice(match.node.start, match.node.end);
    const lead = raw.match(/^\s*/)![0];
    const trail = raw.match(/\s*$/)![0];
    start = match.node.start + lead.length;
    end = match.node.end - trail.length;
    replacement = NEEDS_EXPRESSION.test(next) ? `{${JSON.stringify(next)}}` : next;
  } else {
    const quote = code[match.node.start] === "'" ? "'" : '"';
    start = match.node.start;
    end = match.node.end;
    replacement =
      quote === "'"
        ? `'${next.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
        : JSON.stringify(next);
  }
  const out = code.slice(0, start) + replacement + code.slice(end);
  return { ok: true, code: out, line: match.node.loc.start.line };
}
