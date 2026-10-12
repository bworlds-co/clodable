import { type IconName, svgIcon } from "@clodable/design";

type Child = Node | string | number | false | null | undefined;
type Props = Record<string, unknown> & {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
};

/** A tiny hyperscript: h("button", { class: "x", onclick }, "Label"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key === "style") {
      if (typeof value === "string") el.setAttribute("style", value);
      else Object.assign(el.style, value);
    } else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

export function icon(name: IconName, size = 18): HTMLElement {
  const span = document.createElement("span");
  span.className = "ic";
  span.innerHTML = svgIcon(name, { size, strokeWidth: size <= 16 ? 1.7 : 1.6 });
  return span;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
