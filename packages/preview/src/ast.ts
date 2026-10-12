import { parse } from "@babel/parser";

/** Minimal Babel AST shapes we rely on. Babel's full types are heavy and we only need these. */
export interface Node {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  [key: string]: unknown;
}

export function parseModule(code: string, file: string): Node | undefined {
  try {
    const ast = parse(code, {
      sourceType: "module",
      sourceFilename: file,
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    }) as unknown as { program: Node };
    return ast.program;
  } catch {
    return undefined;
  }
}

const SKIP_KEYS = new Set([
  "loc",
  "start",
  "end",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "range",
]);

/** Depth-first walk over every AST node. Return `false` from `visit` to skip a subtree. */
export function walk(
  node: unknown,
  visit: (node: Node, parent: Node | undefined) => boolean | undefined,
  parent?: Node,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  const n = node as Node;
  if (typeof n.type !== "string") return;
  if (visit(n, parent) === false) return;
  for (const key of Object.keys(n)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = n[key];
    if (value && typeof value === "object") walk(value, visit, n);
  }
}

/** "div", "Button", "motion.div": the written name of a JSX element. */
export function jsxName(name: Node): string {
  if (name.type === "JSXIdentifier") return name.name as string;
  if (name.type === "JSXMemberExpression") {
    return `${jsxName(name.object as Node)}.${jsxName(name.property as Node)}`;
  }
  if (name.type === "JSXNamespacedName") {
    return `${(name.namespace as Node).name as string}:${(name.name as Node).name as string}`;
  }
  return "";
}
