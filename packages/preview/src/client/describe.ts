/** Builder-friendly names for page elements: "Heading", "Button", "Image", never "div". */
import { SOURCE_ATTR } from "../shared.js";

/** The nearest element the JSX tagger marked, and where in the code it comes from. */
export function sourceOf(el: Element | null): { el: Element; src: string } | undefined {
  const host = el?.closest(`[${SOURCE_ATTR}]`);
  const src = host?.getAttribute(SOURCE_ATTR);
  return host && src ? { el: host, src } : undefined;
}

export type Kind =
  | "heading"
  | "text"
  | "button"
  | "link"
  | "image"
  | "input"
  | "list"
  | "section"
  | "nav"
  | "card"
  | "icon"
  | "element";

export function kindOf(el: Element): Kind {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "button" || role === "button") return "button";
  if (tag === "a") {
    const cls = el.getAttribute("class") ?? "";
    // Styled like a button (shadcn's <Button asChild><a>…), so call it what it looks like.
    return /\brounded/.test(cls) && /\b(bg-|border)/.test(cls) && /\b(px-|h-\d)/.test(cls)
      ? "button"
      : "link";
  }
  if (tag === "img" || tag === "picture" || tag === "video") return "image";
  if (tag === "svg") return "icon";
  if (["input", "textarea", "select"].includes(tag)) return "input";
  if (["ul", "ol", "li", "dl"].includes(tag)) return "list";
  if (tag === "nav" || tag === "header" || tag === "footer") return "nav";
  if (["section", "main", "article", "aside"].includes(tag)) return "section";
  if (["p", "span", "label", "strong", "em", "small", "blockquote", "figcaption"].includes(tag))
    return "text";
  const cls = el.getAttribute("class") ?? "";
  if (/\bcard\b|rounded-(lg|xl|2xl)/.test(cls) && el.children.length > 1) return "card";
  if (el.children.length === 0 && el.textContent?.trim()) return "text";
  return el.children.length > 2 ? "section" : "element";
}

const LABELS: Record<Kind, string> = {
  heading: "Heading",
  text: "Text",
  button: "Button",
  link: "Link",
  image: "Image",
  input: "Field",
  list: "List",
  section: "Section",
  nav: "Navigation",
  card: "Card",
  icon: "Icon",
  element: "Element",
};

export function labelOf(element: Element): string {
  const kind = kindOf(element);
  if (kind === "nav") {
    const tag = element.tagName.toLowerCase();
    return tag === "header" ? "Header" : tag === "footer" ? "Footer" : "Navigation";
  }
  return LABELS[kind];
}

export function snippet(element: Element, max = 42): string {
  const alt = element.getAttribute("alt") ?? element.getAttribute("aria-label");
  const text = (alt ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** One line Claude can read: what the builder pointed at, in plain words plus its markup. */
export function describeForClaude(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const cls = (element.getAttribute("class") ?? "").split(/\s+/).slice(0, 8).join(" ");
  const text = snippet(element, 80);
  return `${labelOf(element)} <${tag}${cls ? ` class="${cls}"` : ""}>${text ? ` “${text}”` : ""}`;
}

export const SUGGESTIONS: Record<Kind, string[]> = {
  heading: ["Rewrite it", "Make it bigger", "Change the font"],
  text: ["Rewrite it", "Make it shorter", "Change the color"],
  button: ["Change the label", "Make it stand out", "Change what it does"],
  link: ["Change where it goes", "Change the text", "Style it as a button"],
  image: ["Replace the image", "Make it rounder", "Make it bigger"],
  input: ["Change the placeholder", "Make it required", "Change the label"],
  list: ["Add an item", "Change the layout", "Reorder it"],
  section: ["Change the layout", "Add something here", "Change the background"],
  nav: ["Add a link", "Change the logo", "Make it sticky"],
  card: ["Change the layout", "Add a picture", "Make it stand out"],
  icon: ["Use a different icon", "Make it bigger", "Change the color"],
  element: ["Change the style", "Move it", "Remove it"],
};
