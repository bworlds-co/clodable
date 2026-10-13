import { type PageError, ROUTES } from "../shared.js";
import type { TextEditFailure } from "../text-edit.js";

declare global {
  interface Window {
    __CLODABLE__?: { token: string; backend?: "live" | "copy" };
    __CLODABLE_MOUNTED__?: boolean;
  }
}

const token = () => window.__CLODABLE__?.token ?? "";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-clodable-token": token() },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Clodable ${path}: ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The conversation whose preview pane shows this page. Its Claude labels the pane when it opens it,
 * so requests from here go back to that conversation and not to another one open on the app.
 */
const conversation = (): { conversation?: string } => {
  try {
    const id = sessionStorage.getItem("clodable:conversation");
    return id ? { conversation: id } : {};
  } catch {
    return {};
  }
};

export const page = () => ({
  url: location.href,
  path: location.pathname + location.search,
  title: document.title,
});

export type Probe = { editable: true } | { editable: false; reason: TextEditFailure };
export type EditResult =
  | { ok: true; file: string; line: number }
  | { ok: false; reason: TextEditFailure | "empty" };

export const api = {
  probe: (src: string, text: string) => post<Probe>(ROUTES.probe, { src, text }),
  edit: (src: string, before: string, after: string) =>
    post<EditResult>(ROUTES.text, { src, before, after, page: page(), ...conversation() }),
  ask: (
    request: string,
    element: string,
    source?: { file: string; line: number; column: number },
  ) =>
    post<{ ok: boolean }>(ROUTES.inbox, {
      kind: "ask",
      page: page(),
      request,
      element,
      ...(source ? { source } : {}),
      ...conversation(),
    }),
  fix: (error: PageError, consoleLines: string[]) =>
    post<{ ok: boolean }>(ROUTES.inbox, {
      kind: "fix",
      page: page(),
      error,
      console: consoleLines,
      ...conversation(),
    }),
  /** The line in the file itself, for a position the browser reported in the code Vite served. */
  originalLine: (at: { file: string; line: number; column: number }) =>
    post<{ line: number | null }>(ROUTES.originalLine, at).then((result) => result.line),
  /** The last file the dev server couldn't build since `since` (epoch ms), if any. */
  buildError: (since: number) =>
    post<{ error: PageError | null }>(ROUTES.buildError, { since }).then((result) => result.error),
};
