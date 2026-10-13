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

/**
 * The script that labels this conversation's preview pane with its name, so the pane's requests
 * (Try to fix, Point & ask) come back here and not to another conversation open on the app. It
 * only sets one value in the tab's own storage. Permissions allow exactly this text, nothing else.
 */
export const labelScript = (id: string) =>
  `/* Clodable: label this preview */ location.protocol.startsWith("http") ? (sessionStorage.setItem("clodable:conversation", "${id}"), "labelled") : "not ready"`;
export const LABEL_SCRIPT =
  /^\/\* Clodable: label this preview \*\/ location\.protocol\.startsWith\("http"\) \? \(sessionStorage\.setItem\("clodable:conversation", "s[a-z0-9]+"\), "labelled"\) : "not ready"$/;

/**
 * The app's preview in Desktop's own Browser pane. A link would open another window, and Desktop
 * opens its pane only for a request in this conversation: Auto mode refuses Clodable's own call,
 * even for a press. So the press becomes the builder's request, and Claude opens it.
 */
export function previewRequest(url: string | null): string {
  return url ? `Open my app's preview here (${url}).` : "Start my app's preview and open it here.";
}
