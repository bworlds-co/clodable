import type { Locale } from "../i18n/index.ts";

// Desktop's preview, as Clodable reads it (the address and the tab its tools return) and labels it
// (so the toolbar's requests come back to the right conversation). Pure functions: no `$`.

/** The preview's port in any text Desktop's preview tools return. */
export function previewPortIn(text: string): string | undefined {
  return text.match(/\\?"port\\?":\s*(\d+)/)?.[1] ?? text.match(/localhost:(\d+)/)?.[1];
}

/** The tab Desktop's preview tools opened, in any text they return. */
export function previewTabIn(text: string): string | undefined {
  return text.match(/\\?"tabId\\?":\s*\\?"([\w-]+)\\?"/)?.[1];
}

/** The fixed preview script shares this conversation and its catalog with Clodable's toolbar. */
export const labelScript = (id: string, locale: Locale = "en") =>
  `/* Clodable: label this preview */ location.protocol.startsWith("http") ? (sessionStorage.setItem("clodable:conversation", "${id}"), sessionStorage.setItem("clodable:locale", "${locale}"), window.dispatchEvent(new Event("clodable:locale")), "labelled") : "not ready"`;
export const LABEL_SCRIPT =
  /^\/\* Clodable: label this preview \*\/ location\.protocol\.startsWith\("http"\) \? \(sessionStorage\.setItem\("clodable:conversation", "s[a-z0-9]+"\), sessionStorage\.setItem\("clodable:locale", "(?:en|fr)"\), window\.dispatchEvent\(new Event\("clodable:locale"\)\), "labelled"\) : "not ready"$/;

/**
 * The app's preview in Desktop's own Browser pane. A link would open another window, and Desktop
 * opens its pane only for a request in this conversation: Auto mode refuses Clodable's own call,
 * even for a press. So the press becomes the builder's request, and Claude opens it.
 */
export function previewRequest(url: string | null): string {
  const action = url
    ? `Open my app's preview here (${url}).`
    : "Start my app's preview and open it here.";
  return `The address is for your tool call only. Open Desktop's Browser pane, then confirm in one short sentence in the builder's language. Never put localhost, a port number, a local URL or a link to it in the builder's progress or final reply. Don't tour the page unless asked.\n${action}`;
}
