import { buildError, type PageError, ROUTES } from "../shared.js";
import { api } from "./api.js";
import { h, icon } from "./dom.js";

/**
 * Catch what breaks a page (runtime errors, rejected promises, Vite's build overlay) and offer one
 * calm way forward: "Try to fix", which hands the error to Claude with the page and the source.
 */

const recentConsole: string[] = [];
const early: PageError[] = [];
let sink: ((error: PageError) => void) | undefined;

function emit(error: PageError) {
  if (sink) sink(error);
  else early.push(error);
}

/** Said when the page's own code didn't load. The dev server knows which file it couldn't build, and why. */
const DIDNT_LOAD = "Part of the app didn't load";
const ASK_SERVER = new RegExp(
  `^${DIDNT_LOAD}$|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed`,
  "i",
);

/** "Claude is on it" outlasts the reloads a fix goes through, for two minutes at most. */
const FIXING = "clodable:fixing";
function isFixing(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(FIXING) ?? 0) < 120_000;
  } catch {
    return false;
  }
}
function setFixing(on: boolean) {
  try {
    if (on) sessionStorage.setItem(FIXING, String(Date.now()));
    else sessionStorage.removeItem(FIXING);
  } catch {}
}

/** Start listening as soon as the script runs, before the app mounts, and buffer until the toolbar is ready. */
export function installEarlyCapture() {
  // A file the page needs couldn't be built (missing, or a typo). The browser only flags the script
  // tag, the page stays blank, and Vite's own message went out before anyone was listening.
  addEventListener(
    "error",
    (event) => {
      const script = event.target;
      if (!(script instanceof HTMLScriptElement) || script.hasAttribute("data-clodable-toolbar")) {
        return;
      }
      if (script.src && new URL(script.src, location.href).origin !== location.origin) return;
      emit({ message: DIDNT_LOAD, kind: "build" });
    },
    true,
  );
  addEventListener("error", (event) => {
    const error = event.error as Error | undefined;
    emit({
      message: error?.message ?? event.message,
      ...(error?.stack ? { stack: error.stack } : {}),
      kind: "runtime",
    });
  });
  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as Error | string | undefined;
    const message =
      typeof reason === "string" ? reason : (reason?.message ?? "A background task failed");
    emit({
      message,
      ...(typeof reason === "object" && reason?.stack ? { stack: reason.stack } : {}),
      kind: "promise",
    });
  });
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    recentConsole.push(
      args
        .map((a) => (a instanceof Error ? a.message : String(a)))
        .join(" ")
        .slice(0, 400),
    );
    if (recentConsole.length > 8) recentConsole.shift();
    original(...args);
  };
}

interface ViteHot {
  on(event: string, cb: (payload: unknown) => void): void;
}

/** Vite's client tells us about build errors even when the app turned Vite's own overlay off (Lovable does). */
async function viteHot(): Promise<ViteHot | undefined> {
  try {
    const client = (await import(/* @vite-ignore */ `${location.origin}/@vite/client`)) as {
      createHotContext?: (path: string) => ViteHot;
    };
    return client.createHotContext?.(ROUTES.toolbar);
  } catch {
    return undefined;
  }
}
const IGNORE = [/ResizeObserver loop/i, /Script error\.?$/i, /__clodable/];

function sourceFromStack(stack: string | undefined) {
  if (!stack) return undefined;
  for (const line of stack.split("\n")) {
    const match = line.match(/https?:\/\/[^/]+\/(src\/[^?:)\s]+)(?:\?[^:)]*)?:(\d+):(\d+)/);
    if (match) return { file: match[1]!, line: Number(match[2]), column: Number(match[3]) };
  }
  return undefined;
}

/** The app looks empty: React unmounted the root after an error, so offer help in the middle. */
function pageLooksBlank(): boolean {
  const root = document.getElementById("root") ?? document.body;
  return (root.innerText ?? "").trim().length === 0;
}

const fileName = (path: string) => path.split("/").pop() ?? path;
const strong = (text: string) => h("strong", {}, text);

/** The error in the builder's words: what's wrong, and where. The raw message waits behind "Show details". */
function explain(error: PageError): Array<Node | string> {
  const at = error.source && fileName(error.source.file);
  const missing = error.message.match(/Failed to resolve import "([^"]+)" from "([^"]+)"/);
  if (missing) {
    const wanted = missing[1]!;
    const from = missing[2]!;
    // "@/components/Reviews" is a file in the app; "framer-motion" is a package nobody installed.
    if (/^(\.|\/|@\/|~\/)/.test(wanted)) {
      const file = wanted.replace(/^(@|~)\//, "").replace(/^(\.\.?\/)+/, "");
      return [strong(fileName(from)), " refers to ", strong(file), ", a file that doesn’t exist."];
    }
    return [strong(fileName(from)), " uses ", strong(wanted), ", a package that isn’t installed."];
  }
  const unknown = error.message.match(
    /^(?:\w*Error: )?([\w$]+) is not defined$|Can't find variable: ([\w$]+)/,
  );
  if (unknown) {
    const name = (unknown[1] ?? unknown[2])!;
    return [at ? strong(at) : "This page", " refers to ", strong(name), ", which doesn’t exist."];
  }
  if (ASK_SERVER.test(error.message)) return ["Part of the app’s code didn’t load."];
  if (error.kind === "build") {
    return at
      ? [strong(at), ` has a mistake on line ${error.source!.line}.`]
      : ["A mistake in the code stops it from loading."];
  }
  return at
    ? ["The problem starts in ", strong(at), `, line ${error.source!.line}.`]
    : ["Something in the code went wrong."];
}

/** For developers: where, the raw message, then the code frame or the stack (without the noise). */
function technical(error: PageError): { where: string; frame: string } {
  const where = error.source ? `${error.source.file}:${error.source.line}` : "";
  const frame: string[] = [];
  for (const line of (error.stack ?? "").split("\n")) {
    if (!line.trim() || line.endsWith(error.message)) continue;
    if (error.source && line.endsWith(error.source.file)) continue;
    // "http://localhost:5173/src/App.tsx?t=1712:4:9" reads better as "src/App.tsx:4:9".
    frame.push(line.replace(/https?:\/\/[^/\s]+\/(@fs\/)?/g, "").replace(/\?[^:)\s]*(?=:\d)/g, ""));
  }
  return { where, frame: frame.slice(0, 24).join("\n") };
}

/** A build error from Vite's client ("vite:error"), which it sends even with its overlay off. */
function fromViteEvent(payload: unknown): PageError | undefined {
  const err = (
    payload as {
      err?: {
        message?: string;
        stack?: string;
        loc?: { file?: string; line?: number };
        id?: string;
      };
    }
  ).err;
  if (!err) return undefined;
  const file = err.loc?.file ?? err.id ?? "";
  const match = file.match(/(src\/[^?:]+)/);
  return buildError(
    err.message ?? "The app couldn't be built",
    `${file}\n${err.message ?? ""}\n${err.stack ?? ""}`,
    match ? { file: match[1]!, line: err.loc?.line ?? 1 } : undefined,
  );
}

/** A build error from Vite's own overlay, when the app keeps it on. */
function fromOverlay(): PageError | undefined {
  const overlay = document.querySelector("vite-error-overlay") as
    | (HTMLElement & { shadowRoot: ShadowRoot | null })
    | null;
  if (!overlay) return undefined;
  const text =
    overlay.shadowRoot?.querySelector(".message-body")?.textContent ?? "The app couldn't be built";
  const file = overlay.shadowRoot?.querySelector(".file")?.textContent ?? "";
  const match = file.match(/(src\/[^:]+):(\d+)/);
  return buildError(
    text,
    `${file}\n${text}`,
    match ? { file: match[1]!, line: Number(match[2]) } : undefined,
  );
}

/** The card's title: what happened, or that Claude is on it. */
function titleOf(error: PageError, working: boolean, screen: boolean): string {
  if (working) return "Claude is fixing it…";
  if (error.kind === "build") return "Your app can’t load";
  return screen ? "This page can’t load" : "Something broke on this page";
}

export class ErrorWatcher {
  private card: HTMLElement | undefined;
  private current: PageError | undefined;
  private dismissed = new Set<string>();
  private detailsOpen = false;
  private updateStarted = 0;

  constructor(
    private readonly layer: HTMLElement,
    private readonly dockSlot: HTMLElement,
    private readonly toast: (text: string, tone?: "ok" | "warn") => void,
  ) {}

  start() {
    sink = (error) => this.capture(error);
    const pending = early.splice(0);
    for (const error of pending) this.capture(error);
    // A blank page that said nothing: its code may have failed before the toolbar was listening.
    if (!pending.length && pageLooksBlank()) {
      api.buildError(performance.timeOrigin).then(
        (found) => {
          if (found && !this.current) this.show(found);
        },
        () => {},
      );
    }
    // A page that loads fine has nothing left to fix.
    setTimeout(() => {
      if (!this.current) setFixing(false);
    }, 3000);
    void viteHot().then((hot) => {
      hot?.on("vite:error", (payload) => {
        const error = fromViteEvent(payload);
        if (error) this.capture(error);
      });
      hot?.on("vite:beforeUpdate", () => {
        this.updateStarted = Date.now();
      });
      hot?.on("vite:afterUpdate", () => void this.afterUpdate());
    });
    new MutationObserver(() => {
      const error = fromOverlay();
      if (error) this.capture(error);
    }).observe(document.documentElement, { childList: true });
  }

  /** After a change lands, a crashed page needs a fresh start; a healthy one just clears the card. */
  private async afterUpdate() {
    if (!this.current) return;
    if (pageLooksBlank() || this.current.kind === "build") {
      // The change that broke the app lands here too. Start fresh only if nothing failed to build since.
      const failed = await api.buildError(this.updateStarted).catch(() => null);
      if (failed) this.show(failed);
      else location.reload();
      return;
    }
    setFixing(false);
    this.dismiss(false);
  }

  private capture(error: PageError) {
    if (!error.message || IGNORE.some((r) => r.test(error.message))) return;
    if (ASK_SERVER.test(error.message)) {
      api.buildError(performance.timeOrigin).then(
        (found) => this.show(found ?? error),
        () => this.show(error),
      );
      return;
    }
    this.show(error);
  }

  private show(error: PageError) {
    if (this.dismissed.has(error.message)) return;
    const found = error.source ? undefined : sourceFromStack(error.stack);
    if (found) {
      // The browser counts lines in the code Vite served. Ask for the line in the file itself.
      const at = (line: number | null) =>
        this.show({ ...error, source: { file: found.file, line: line ?? found.line } });
      api.originalLine(found).then(at, () => at(null));
      return;
    }
    this.current = error;
    // Let the app finish reacting (React unmounts after an error), then decide where to show it.
    setTimeout(() => this.render(), 60);
  }

  private render(working = isFixing()) {
    const error = this.current;
    if (!error) return;
    // Nothing to see behind a build error or a blank page: cover it calmly. Otherwise, a small note.
    const screen = error.kind === "build" || pageLooksBlank();
    const still = Boolean(this.card?.isConnected);
    const root = this.layer.getRootNode() as Document | ShadowRoot;
    const hadFocus = Boolean(this.card?.contains(root.activeElement));
    this.card?.remove();
    const { more, details } = this.detailsToggle(error);
    // On a full screen, closing belongs to the corner; on a note, next to its title.
    const close = h(
      "button",
      { class: "close", "aria-label": "Dismiss", onclick: () => this.dismiss() },
      icon("close", 16),
    );
    const card = h(
      "div",
      {
        class: `error ${screen ? "screen" : "note"}${working ? " working" : ""}${still ? " still" : ""}`,
        role: "alert",
        "aria-labelledby": "cl-err-title",
        "aria-describedby": "cl-err-why",
      },
      h(
        "div",
        { class: "error-body" },
        h(
          "div",
          { class: "head" },
          h("span", { class: working ? "spinner" : "dot", "aria-hidden": "true" }),
          h("h3", { id: "cl-err-title" }, titleOf(error, working, screen)),
          screen ? null : close,
        ),
        h(
          "p",
          { class: "why", id: "cl-err-why" },
          ...(working ? ["The preview updates by itself when it’s fixed."] : explain(error)),
        ),
        working
          ? null
          : h(
              "div",
              { class: "actions" },
              h("button", { class: "btn primary", onclick: () => this.fix() }, "Try to fix"),
              more,
            ),
        working ? null : details,
      ),
      screen ? close : null,
    );
    this.card = card;
    if (screen) this.layer.append(card);
    else this.dockSlot.prepend(card);
    // A press redrew the card: keep focus in it, on the action that's left.
    if (hadFocus) (card.querySelector<HTMLElement>(".btn.primary") ?? close).focus();
  }

  /** "Show details" and what it shows, for developers: where, the raw message, the code frame. */
  private detailsToggle(error: PageError) {
    const { where, frame } = technical(error);
    const details = h(
      "div",
      { class: "details", id: "cl-err-details", hidden: !this.detailsOpen },
      where ? h("p", { class: "where" }, where) : null,
      h("p", { class: "raw" }, error.message),
      frame ? h("pre", { class: "frame" }, frame) : null,
    );
    const label = h("span", {}, this.detailsOpen ? "Hide details" : "Show details");
    const more = h(
      "button",
      {
        class: "btn ghost more",
        "aria-expanded": String(this.detailsOpen),
        "aria-controls": "cl-err-details",
        onclick: () => {
          this.detailsOpen = !this.detailsOpen;
          details.hidden = !this.detailsOpen;
          label.textContent = this.detailsOpen ? "Hide details" : "Show details";
          more.setAttribute("aria-expanded", String(this.detailsOpen));
        },
      },
      label,
      icon("chevronDown", 16),
    );
    return { more, details };
  }

  private async fix() {
    const error = this.current;
    if (!error) return;
    setFixing(true);
    this.render(true);
    try {
      await api.fix(error, [...recentConsole]);
    } catch {
      setFixing(false);
      this.toast("Couldn't reach Claude. Is Clodable running?", "warn");
      this.render(false);
    }
  }

  private dismiss(remember = true) {
    if (this.current && remember) this.dismissed.add(this.current.message);
    this.current = undefined;
    this.card?.remove();
    this.card = undefined;
  }
}
