import { type IconName, logoSvg } from "@clodable/design";
import { FRAME_PARAM, parseSourceAttr, ROUTES, SCREENS } from "../shared.js";
import { api } from "./api.js";
import { describeForClaude, kindOf, labelOf, SUGGESTIONS, snippet, sourceOf } from "./describe.js";
import { h, icon } from "./dom.js";
import { ErrorWatcher } from "./errors.js";
import { anchor, Highlight, Toasts } from "./overlay.js";
import { styles } from "./styles.js";

type Mode = "idle" | "edit" | "ask";
type Device = "desktop" | "tablet" | "phone";
/** app: the normal preview. outer: the device stage. inner: the app inside the device frame. */
export type Surface = "app" | "outer" | "inner";

const STORE = "clodable:toolbar";
/** The mark the device frame adds to the app's address, left out of the routes it reports. */
const FRAME_MARK = new RegExp(`[?&]${FRAME_PARAM}=1`);
const MESSAGES = {
  dynamic:
    "This text is filled in automatically, from your data or a list in your code, so it can't be typed over here.",
  notFound: "The page changed while you were editing. Try once more.",
  ambiguous: "That exact text appears twice here, so Claude should change it.",
};

interface Editing {
  el: HTMLElement;
  /** What the app had before we touched it, restored exactly, so React's references stay valid. */
  restore: () => void;
  editable: HTMLElement;
  node: Text;
  src: string;
  before: string;
  bar: HTMLElement;
  saving: boolean;
}

export class Toolbar {
  private host!: HTMLElement;
  private shadow!: ShadowRoot;
  private layer!: HTMLDivElement;
  private dockWrap!: HTMLDivElement;
  private hintSlot!: HTMLDivElement;
  private errorSlot!: HTMLDivElement;
  private dockSlot!: HTMLDivElement;
  private toasts = new Toasts();
  private hover!: Highlight;
  private active!: Highlight;
  private popover: HTMLElement | undefined;
  private mode: Mode = "idle";
  private minimized = false;
  private editing: Editing | undefined;
  private device: Device;

  constructor(private readonly surface: Surface) {
    const params = new URLSearchParams(location.search);
    this.device = surface === "outer" ? ((params.get("device") as Device) ?? "phone") : "desktop";
    try {
      this.minimized = JSON.parse(localStorage.getItem(STORE) ?? "{}").minimized === true;
    } catch {
      this.minimized = false;
    }
  }

  mount() {
    this.host = document.createElement("clodable-toolbar");
    this.host.setAttribute("data-clodable", "");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.append(h("style", {}, styles));
    this.layer = h("div");
    this.hintSlot = h("div");
    this.errorSlot = h("div");
    this.dockSlot = h("div");
    this.dockWrap = h(
      "div",
      { class: "dock-wrap" },
      this.toasts.el,
      this.errorSlot,
      this.hintSlot,
      this.dockSlot,
    );
    this.shadow.append(this.layer, this.dockWrap);
    this.hover = new Highlight(this.layer);
    this.active = new Highlight(this.layer);
    document.body.append(this.host);
    // Some apps replace their DOM wholesale. Come back if that happens.
    new MutationObserver(() => {
      if (!this.host.isConnected) document.body.append(this.host);
    }).observe(document.body, { childList: true });

    this.render();
    if (this.surface !== "outer") {
      new ErrorWatcher(this.layer, this.errorSlot, (text, tone) =>
        this.toasts.show(text, tone ? { tone } : {}),
      ).start();
      this.listen();
    }
    if (this.surface === "inner") this.reportRoutes();
    if (this.surface === "outer") this.followRoutes();
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  /** Redraw, keeping keyboard focus on the control pressed, or on the one that took its place. */
  private render() {
    const focused = (this.shadow.activeElement as HTMLElement | null)?.dataset.key;
    this.draw();
    if (!focused) return;
    const find = (key: string) => this.shadow.querySelector<HTMLElement>(`[data-key="${key}"]`);
    // Hiding swaps the dock for the pebble, and showing swaps it back: focus follows.
    (find(focused) ?? find("pebble") ?? find("hide"))?.focus();
  }

  private draw() {
    if (this.surface === "outer") this.drawDeviceBar();
    else if (this.minimized) this.drawPebble();
    else this.drawDock();
  }

  /** Around the device frame: the size switch, the screen's size, and Rotate. */
  private drawDeviceBar() {
    this.dockSlot.replaceChildren();
    const params = new URLSearchParams(location.search);
    const { width, height } = SCREENS[this.device === "tablet" ? "tablet" : "phone"];
    const size = params.get("landscape") === "1" ? `${height} × ${width}` : `${width} × ${height}`;
    const dock = h(
      "div",
      { class: "dock", role: "toolbar", "aria-label": "Device preview" },
      this.deviceSwitch(),
      h("span", { class: "size", "aria-label": `Screen size ${size}` }, size),
      h("span", { class: "sep", "aria-hidden": "true" }),
      h(
        "button",
        {
          class: "icon-btn",
          "aria-label": "Rotate",
          title: "Rotate",
          onclick: () => this.rotate(),
        },
        icon("refresh"),
      ),
    );
    oneTabStop(dock, this.shadow);
    this.layer.replaceChildren(
      this.hover.box,
      this.hover.chip,
      this.active.box,
      this.active.chip,
      h("div", { class: "devicebar" }, dock),
    );
  }

  /** The tools, hidden: one clod in the corner that brings them back. */
  private drawPebble() {
    this.hintSlot.replaceChildren();
    this.dockSlot.replaceChildren(
      h(
        "button",
        {
          class: "pebble",
          "data-key": "pebble",
          "aria-label": "Show Clodable tools",
          title: "Show Clodable tools (⌥⇧H)",
          onclick: () => this.setMinimized(false),
        },
        this.mark(24),
      ),
    );
  }

  /** The dock: the menu, the two tools, the size switch (on the app itself), and Hide. */
  private drawDock() {
    const tool = (mode: Mode, iconName: IconName, label: string, key: string) =>
      h(
        "button",
        {
          class: "tool",
          "data-key": mode,
          "aria-pressed": String(this.mode === mode),
          title: `${label} (${key})`,
          onclick: () => this.setMode(this.mode === mode ? "idle" : mode),
        },
        icon(iconName),
        h("span", { class: "label" }, label),
      );
    const brand = h(
      "button",
      {
        class: "brand",
        "data-key": "menu",
        "aria-label": "Clodable menu",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        onclick: (e: Event) => this.toggleMenu(e.currentTarget as HTMLElement),
      },
      this.mark(24),
    );
    // Trying a move off Lovable: say plainly which data this preview shows.
    const onCopy = window.__CLODABLE__?.backend === "copy";
    const dock = h(
      "div",
      { class: "dock", role: "toolbar", "aria-label": "Clodable preview tools" },
      brand,
      ...(onCopy
        ? [
            h(
              "span",
              {
                class: "backend",
                title:
                  "This preview uses your new backend, a copy of your data. Your live app is untouched.",
              },
              "Copy",
            ),
          ]
        : []),
      h("span", { class: "sep", "aria-hidden": "true" }),
      tool("edit", "text", "Edit text", "⌥⇧E"),
      tool("ask", "select", "Point & ask", "⌥⇧A"),
      ...(this.surface === "app"
        ? [h("span", { class: "sep", "aria-hidden": "true" }), this.deviceSwitch()]
        : []),
      h("span", { class: "sep", "aria-hidden": "true" }),
      h(
        "button",
        {
          class: "icon-btn",
          "data-key": "hide",
          "aria-label": "Hide Clodable tools",
          title: "Hide (⌥⇧H)",
          onclick: () => this.setMinimized(true),
        },
        icon("minimize"),
      ),
    );
    oneTabStop(dock, this.shadow);
    this.dockSlot.replaceChildren(dock);
    this.renderHint();
  }

  private mark(size: number) {
    const span = h("span", { "aria-hidden": "true", style: "display:grid" });
    span.innerHTML = logoSvg({ size });
    return span;
  }

  private deviceSwitch() {
    const devices: Array<[Device, IconName, string]> = [
      ["desktop", "desktop", "Full width"],
      ["tablet", "tablet", "Tablet"],
      ["phone", "phone", "Phone"],
    ];
    const index = devices.findIndex(([d]) => d === this.device);
    return h(
      "div",
      { class: "devices", role: "radiogroup", "aria-label": "Preview size" },
      h("span", {
        class: "thumb",
        "aria-hidden": "true",
        // One button's width per step: the thumb is as wide as a button.
        style: `transform: translateX(${index * 100}%)`,
      }),
      ...devices.map(([id, iconName, label]) =>
        h(
          "button",
          {
            role: "radio",
            "aria-checked": String(this.device === id),
            "aria-label": label,
            title: label,
            onclick: () => this.setDevice(id),
          },
          icon(iconName),
        ),
      ),
    );
  }

  private renderHint() {
    if (this.mode === "idle" || this.minimized) {
      this.hintSlot.replaceChildren();
      return;
    }
    const text =
      this.mode === "edit"
        ? "Click any text to change it"
        : "Click anything to ask Claude about it";
    this.hintSlot.replaceChildren(
      h(
        "div",
        { class: `hint ${this.mode === "ask" ? "ask" : ""}`, role: "status" },
        h("span", { class: "dot" }),
        text,
        h("kbd", {}, "Esc"),
      ),
    );
  }

  // ── Modes ────────────────────────────────────────────────────────────────

  private setMode(mode: Mode) {
    if (this.editing) this.finishEdit(false);
    this.closePopover();
    this.mode = mode;
    this.hover.hide();
    document.documentElement.style.cursor = "";
    this.render();
  }

  private setMinimized(minimized: boolean) {
    this.minimized = minimized;
    try {
      localStorage.setItem(STORE, JSON.stringify({ minimized }));
    } catch {
      // Storage blocked: the tools still hide, just not for the next page.
    }
    if (minimized) this.setMode("idle");
    else this.render();
  }

  private setDevice(device: Device) {
    const path =
      this.surface === "outer"
        ? (new URLSearchParams(location.search).get("path") ?? "/")
        : location.pathname + location.search;
    if (device === "desktop") {
      if (this.surface === "outer") location.href = path;
      return;
    }
    const url = `${ROUTES.frame}?device=${device}&path=${encodeURIComponent(path)}`;
    location.href = url;
  }

  private rotate() {
    const params = new URLSearchParams(location.search);
    params.set("landscape", params.get("landscape") === "1" ? "0" : "1");
    location.search = params.toString();
  }

  // ── Pointer and keyboard ─────────────────────────────────────────────────

  /** Browsers show events from inside the shadow root as the host's; other DOMs may not. */
  private isOurs(target: EventTarget | null) {
    return (
      target instanceof Node &&
      (target === this.host || this.host.contains(target) || this.shadow.contains(target))
    );
  }

  private listen() {
    let pending = 0;
    addEventListener(
      "pointermove",
      (e) => {
        if (this.mode === "idle" || this.editing || this.popover) return;
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => this.onHover(e.clientX, e.clientY, e.target));
      },
      { capture: true, passive: true },
    );
    for (const type of [
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
      "dblclick",
      "submit",
    ]) {
      addEventListener(type, (e) => this.onPointer(e as MouseEvent), { capture: true });
    }
    addEventListener("keydown", (e) => this.onKey(e), { capture: true });
    addEventListener("scroll", () => this.closePopoverIfDetached(), {
      capture: true,
      passive: true,
    });
  }

  private onPointer(e: MouseEvent) {
    if (this.mode === "idle" || this.isOurs(e.target)) return;
    // While editing, clicks inside the text place the caret. Clicks elsewhere finish the edit.
    if (this.editing && e.target instanceof Node && this.editing.editable.contains(e.target))
      return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type !== "click") return;
    if (this.editing) {
      this.finishEdit(true);
      return;
    }
    if (this.popover) {
      this.closePopover();
      return;
    }
    if (this.mode === "edit") void this.startEdit(e.clientX, e.clientY);
    else if (this.mode === "ask") this.openComposer(e.clientX, e.clientY);
  }

  private onHover(x: number, y: number, target: EventTarget | null) {
    // A hover queued just before a click must not redraw over the panel that click opened.
    if (this.popover || this.editing || this.mode === "idle") return;
    if (this.isOurs(target)) {
      this.hover.hide();
      return;
    }
    if (this.mode === "edit") {
      const hit = textAt(x, y, this.host);
      const source = hit && sourceOf(hit.el);
      if (hit && source) {
        this.hover.show(hit.el, "edit-hover", { icon: "text", strong: "Edit text" });
        document.documentElement.style.cursor = "text";
      } else {
        this.hover.hide();
        document.documentElement.style.cursor = "";
      }
      return;
    }
    const el = elementAt(x, y, this.host);
    const source = el && sourceOf(el);
    if (el && source) {
      const what = snippet(el, 32);
      this.hover.show(el, "ask-hover", {
        strong: labelOf(el),
        ...(what ? { muted: `· ${what}` } : {}),
      });
      document.documentElement.style.cursor = "pointer";
    } else {
      this.hover.hide();
      document.documentElement.style.cursor = "";
    }
  }

  private onKey(e: KeyboardEvent) {
    const typing = isTyping(e.target) && !this.isOurs(e.target);
    if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const map: Record<string, () => void> = {
        KeyE: () => this.setMode(this.mode === "edit" ? "idle" : "edit"),
        KeyA: () => this.setMode(this.mode === "ask" ? "idle" : "ask"),
        KeyH: () => this.setMinimized(!this.minimized),
      };
      const action = map[e.code];
      if (action && !(typing && !this.editing)) {
        e.preventDefault();
        e.stopPropagation();
        action();
        return;
      }
    }
    if (e.key === "Escape") {
      if (this.editing) {
        e.preventDefault();
        e.stopPropagation();
        this.finishEdit(false);
      } else if (this.popover) {
        e.preventDefault();
        this.closePopover();
      } else if (this.mode !== "idle") {
        e.preventDefault();
        this.setMode("idle");
      }
    }
  }

  // ── Inline text editing ─────────────────────────────────────────────────

  private async startEdit(x: number, y: number) {
    const hit = textAt(x, y, this.host);
    const source = hit && sourceOf(hit.el);
    if (!hit || !source) return;
    const before = hit.node.textContent ?? "";
    let probe: Awaited<ReturnType<typeof api.probe>>;
    try {
      probe = await api.probe(source.src, before);
    } catch {
      this.toasts.show("Couldn't reach Clodable. Is the preview still running?", { tone: "warn" });
      return;
    }
    if (!probe.editable) {
      this.showLocked(hit.el, before, probe.reason);
      return;
    }
    this.hover.hide();
    const { editable, restore } = makeEditable(hit.el, hit.node);
    const bar = h(
      "div",
      { class: "pop editbar", role: "group", "aria-label": "Editing text" },
      h("span", { class: "note" }, "Editing text"),
      h("button", { class: "btn ghost", onclick: () => this.finishEdit(false) }, "Cancel"),
      h(
        "button",
        { class: "btn primary", onclick: () => this.finishEdit(true) },
        "Save",
        h("span", { class: "kbd" }, "⏎"),
      ),
    );
    this.layer.append(bar);
    this.editing = {
      el: hit.el,
      restore,
      editable,
      node: hit.node,
      src: source.src,
      before,
      bar,
      saving: false,
    };
    this.active.show(editable, "editing", undefined, { perLine: editable !== hit.el });
    editable.addEventListener("keydown", this.onEditKey);
    editable.addEventListener("focusout", this.onEditBlur);
    editable.focus({ preventScroll: true });
    placeCaret(x, y, editable);
    const reposition = () => {
      if (!this.editing) return;
      anchor(bar, this.editing.el.getBoundingClientRect(), 12);
      requestAnimationFrame(reposition);
    };
    reposition();
  }

  private onEditKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.finishEdit(true);
    }
  };

  private onEditBlur = (e: FocusEvent) => {
    if (this.isOurs(e.relatedTarget)) return;
    setTimeout(() => {
      if (this.editing && !this.editing.saving && document.activeElement !== this.editing.editable)
        this.finishEdit(true);
    }, 0);
  };

  private async finishEdit(save: boolean) {
    const editing = this.editing;
    if (!editing || editing.saving) return;
    const after = (editing.editable.textContent ?? "").replace(/\s+/g, " ").trim();
    const changed = save && after && after !== editing.before.replace(/\s+/g, " ").trim();
    editing.editable.removeEventListener("keydown", this.onEditKey);
    editing.editable.removeEventListener("focusout", this.onEditBlur);
    if (!changed) {
      editing.restore();
      editing.node.textContent = editing.before;
      this.endEdit();
      return;
    }
    editing.saving = true;
    editing.bar.replaceChildren(
      h(
        "span",
        { class: "note" },
        h("span", {
          class: "spinner",
          style: "display:inline-block;vertical-align:-3px;margin-right:8px",
        }),
        "Saving…",
      ),
    );
    try {
      const result = await api.edit(editing.src, editing.before, after);
      editing.restore();
      if (result.ok) {
        // Keep the new words on screen: the app reloads them from the source in a moment.
        editing.node.textContent = keepEdges(editing.before, after);
        this.active.fadeOut(editing.el, "saved");
        this.toasts.show("Text updated · saved to your draft");
      } else {
        editing.node.textContent = editing.before;
        this.active.hide();
        const { reason } = result;
        this.toasts.show(
          reason === "dynamic"
            ? MESSAGES.dynamic
            : reason === "ambiguous"
              ? MESSAGES.ambiguous
              : MESSAGES.notFound,
          { tone: "warn", ms: 4200 },
        );
      }
    } catch {
      editing.restore();
      editing.node.textContent = editing.before;
      this.toasts.show("Couldn't save that change. Try again.", { tone: "warn" });
    }
    this.endEdit(false);
  }

  private endEdit(hideActive = true) {
    this.editing?.bar.remove();
    this.editing = undefined;
    if (hideActive) this.active.hide();
  }

  private showLocked(el: Element, text: string, reason: string) {
    this.closePopover();
    this.hover.show(el, "locked", { icon: "info", strong: "Not editable here" });
    const ask = h(
      "button",
      {
        class: "btn primary",
        onclick: () => this.openComposerFor(el, `Change “${short(text)}” to `),
      },
      "Ask Claude",
    );
    const panel = h(
      "div",
      { class: "pop notice", role: "dialog", "aria-label": "This text can't be edited here" },
      h("h3", {}, "Claude can change this one for you"),
      h("p", {}, reason === "ambiguous" ? MESSAGES.ambiguous : MESSAGES.dynamic),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn ghost", onclick: () => this.closePopover() }, "Close"),
        ask,
      ),
    );
    this.openPopover(panel, el.getBoundingClientRect());
    ask.focus({ preventScroll: true });
  }

  // ── Point & ask ─────────────────────────────────────────────────────────

  private openComposer(x: number, y: number) {
    const el = elementAt(x, y, this.host);
    if (el && sourceOf(el)) this.openComposerFor(el);
  }

  private openComposerFor(el: Element, prefill = "") {
    this.closePopover();
    const source = sourceOf(el);
    this.hover.show(el, "ask-hover");
    const kind = kindOf(el);
    const textarea = h("textarea", {
      rows: "3",
      placeholder: "What should change? For example: make it bigger and bolder",
      "aria-label": "What should change?",
    });
    textarea.value = prefill;
    const send = h("button", { class: "btn primary", onclick: () => submit() }, "Send to Claude");
    const submit = async () => {
      const request = textarea.value.trim();
      if (!request) {
        textarea.focus();
        return;
      }
      send.setAttribute("disabled", "");
      try {
        const location = source ? parseSourceAttr(source.src) : undefined;
        await api.ask(request, describeForClaude(el), location);
        this.closePopover();
        this.setMode("idle");
        this.toasts.show("Sent to Claude");
      } catch {
        send.removeAttribute("disabled");
        this.toasts.show("Couldn't reach Claude. Is Clodable running?", { tone: "warn" });
      }
    };
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    });
    const what = snippet(el, 48);
    const panel = h(
      "div",
      {
        class: "pop composer",
        role: "dialog",
        "aria-label": `Ask Claude about this ${labelOf(el).toLowerCase()}`,
      },
      h(
        "div",
        { class: "target" },
        h("span", { class: "badge" }, icon("select", 14), labelOf(el)),
        what ? h("span", { class: "what" }, `“${what}”`) : null,
      ),
      textarea,
      h(
        "div",
        { class: "suggestions" },
        ...SUGGESTIONS[kind].map((s) =>
          h(
            "button",
            {
              class: "suggestion",
              onclick: () => {
                textarea.value = s;
                textarea.focus();
              },
            },
            s,
          ),
        ),
      ),
      h(
        "div",
        { class: "actions" },
        h("span", { class: "left" }, "⏎ to send"),
        h("button", { class: "btn ghost", onclick: () => this.closePopover() }, "Cancel"),
        send,
      ),
    );
    this.openPopover(panel, el.getBoundingClientRect());
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  // ── Popovers and menu ───────────────────────────────────────────────────

  private openPopover(panel: HTMLElement, rect: DOMRect) {
    this.closePopover(false);
    this.popover = panel;
    this.layer.append(panel);
    anchor(panel, rect);
  }

  private closePopover(hideHover = true) {
    const fromMenu =
      this.popover?.classList.contains("menu") && this.popover.contains(this.shadow.activeElement);
    this.popover?.remove();
    this.popover = undefined;
    if (hideHover) this.hover.hide();
    const brand = this.shadow?.querySelector<HTMLElement>('.brand[aria-expanded="true"]');
    brand?.setAttribute("aria-expanded", "false");
    // A menu closed with focus in it hands focus back to its button (WAI-ARIA menu button).
    if (fromMenu) brand?.focus();
  }

  private closePopoverIfDetached() {
    if (this.popover?.classList.contains("menu")) return;
    if (this.popover && !this.editing) this.closePopover();
  }

  private toggleMenu(button: HTMLElement) {
    if (this.popover?.classList.contains("menu")) {
      this.closePopover();
      return;
    }
    const item = (iconName: IconName, label: string, shortcut: string, action: () => void) =>
      h(
        "button",
        {
          class: "menu-item",
          role: "menuitem",
          onclick: () => {
            this.closePopover();
            action();
          },
        },
        icon(iconName),
        label,
        h("span", { class: "shortcut" }, shortcut),
      );
    const menu = h(
      "div",
      { class: "menu", role: "menu", "aria-label": "Clodable" },
      h(
        "div",
        { class: "head" },
        this.mark(28),
        h(
          "div",
          {},
          h("b", {}, "Clodable"),
          h("span", {}, "Only you see these tools. Visitors never do."),
        ),
      ),
      h("hr"),
      item("text", "Edit text", "⌥⇧E", () => this.setMode("edit")),
      item("select", "Point & ask Claude", "⌥⇧A", () => this.setMode("ask")),
      ...(this.surface === "app"
        ? [item("phone", "Phone preview", "", () => this.setDevice("phone"))]
        : []),
      h("hr"),
      item("minimize", "Hide these tools", "⌥⇧H", () => this.setMinimized(true)),
    );
    arrowKeys(menu, this.shadow, "ArrowUp", "ArrowDown");
    this.popover = menu;
    this.layer.append(menu);
    button.setAttribute("aria-expanded", "true");
    const r = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, r.left - 6)}px`;
    menu.style.top = `${r.top - menu.getBoundingClientRect().height - 10}px`;
    (menu.querySelector(".menu-item") as HTMLElement | null)?.focus();
  }

  // ── Device frame routing ────────────────────────────────────────────────

  private reportRoutes() {
    const report = () =>
      parent.postMessage(
        {
          type: "clodable:route",
          path: location.pathname + location.search.replace(FRAME_MARK, ""),
        },
        location.origin,
      );
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method].bind(history);
      history[method] = ((...args: Parameters<History["pushState"]>) => {
        original(...args);
        report();
      }) as History[typeof method];
    }
    addEventListener("popstate", report);
  }

  private followRoutes() {
    addEventListener("message", (e) => {
      if (e.origin !== location.origin || (e.data as { type?: string })?.type !== "clodable:route")
        return;
      const params = new URLSearchParams(location.search);
      params.set("path", (e.data as { path: string }).path || "/");
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * A toolbar is one tab stop, the button last focused (the first at the start), and arrow keys move
 * between its buttons: the WAI-ARIA toolbar pattern.
 */
function oneTabStop(toolbar: HTMLElement, root: ShadowRoot) {
  arrowKeys(toolbar, root, "ArrowLeft", "ArrowRight");
  const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"));
  for (const [i, button] of buttons.entries()) {
    button.tabIndex = i === 0 ? 0 : -1;
    button.addEventListener("focus", () => {
      for (const other of buttons) other.tabIndex = -1;
      button.tabIndex = 0;
    });
  }
}

/** Arrow keys move between a group's buttons, round the ends; Home and End jump to them. */
function arrowKeys(group: HTMLElement, root: ShadowRoot, previous: string, next: string) {
  group.addEventListener("keydown", (e) => {
    const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(root.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const to: Record<string, number> = {
      [previous]: index - 1,
      [next]: index + 1,
      Home: 0,
      End: buttons.length - 1,
    };
    const target = to[e.key];
    if (target === undefined) return;
    e.preventDefault();
    buttons[(target + buttons.length) % buttons.length]?.focus();
  });
}

const short = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
};

/** Keep the original leading and trailing whitespace around the new words, as JSX rendered it. */
function keepEdges(before: string, after: string) {
  const lead = before.match(/^\s*/)?.[0] ?? "";
  const trail = before.match(/\s*$/)?.[0] ?? "";
  return `${lead}${after}${trail}`;
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function elementAt(x: number, y: number, host: Element): Element | undefined {
  const el = document.elementFromPoint(x, y);
  if (!el || el === host || el === document.documentElement || el === document.body)
    return undefined;
  return el;
}

/** The text node under the pointer, only if the pointer is really on its glyphs. */
function textAt(x: number, y: number, host: Element): { el: HTMLElement; node: Text } | undefined {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  const position = document.caretPositionFromPoint?.(x, y);
  if (position) node = position.offsetNode;
  else node = doc.caretRangeFromPoint?.(x, y)?.startContainer ?? null;
  if (
    node &&
    node.nodeType === Node.TEXT_NODE &&
    node.textContent?.trim() &&
    node.parentElement &&
    !host.contains(node)
  ) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const inside = Array.from(range.getClientRects()).some(
      (r) => x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3,
    );
    if (inside) return { el: node.parentElement, node: node as Text };
  }
  const el = elementAt(x, y, host);
  if (!el) return undefined;
  const direct = Array.from(el.childNodes).find(
    (c): c is Text => c.nodeType === Node.TEXT_NODE && Boolean(c.textContent?.trim()),
  );
  return direct && el instanceof HTMLElement ? { el, node: direct } : undefined;
}

/**
 * Make one text node editable. When it's the element's only content, the element itself becomes
 * editable. Otherwise the text is wrapped in a temporary span. `restore` puts the original nodes back,
 * the same objects React holds.
 */
function makeEditable(el: HTMLElement, node: Text): { editable: HTMLElement; restore: () => void } {
  const meaningful = Array.from(el.childNodes).filter(
    (c) => !(c.nodeType === Node.TEXT_NODE && !c.textContent?.trim()),
  );
  if (meaningful.length === 1 && meaningful[0] === node) {
    const before = el.getAttribute("contenteditable");
    const children = Array.from(el.childNodes);
    el.setAttribute("contenteditable", "plaintext-only");
    el.setAttribute("spellcheck", "true");
    return {
      editable: el,
      restore: () => {
        if (before === null) el.removeAttribute("contenteditable");
        else el.setAttribute("contenteditable", before);
        el.removeAttribute("spellcheck");
        el.replaceChildren(...children);
      },
    };
  }
  const span = document.createElement("span");
  span.setAttribute("contenteditable", "plaintext-only");
  span.setAttribute("data-clodable-editing", "");
  span.style.outline = "none";
  node.replaceWith(span);
  span.textContent = node.textContent;
  return {
    editable: span,
    restore: () => {
      span.replaceWith(node);
    },
  };
}

function placeCaret(x: number, y: number, editable: HTMLElement) {
  const selection = getSelection();
  if (!selection) return;
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = document.caretPositionFromPoint?.(x, y);
  const range = document.createRange();
  if (position && editable.contains(position.offsetNode)) {
    range.setStart(position.offsetNode, position.offset);
  } else {
    const fallback = doc.caretRangeFromPoint?.(x, y);
    if (fallback && editable.contains(fallback.startContainer))
      range.setStart(fallback.startContainer, fallback.startOffset);
    else range.selectNodeContents(editable);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
