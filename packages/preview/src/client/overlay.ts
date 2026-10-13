import type { IconName } from "@clodable/design";
import { h, icon } from "./dom.js";

/**
 * A highlight box (and optional label chip) that tracks an element of the app while it scrolls,
 * resizes, or animates. Drawn in the shadow root, so the app's own styles are never touched.
 */
export class Highlight {
  readonly box: HTMLDivElement;
  readonly chip: HTMLDivElement;
  private target: Element | Range | undefined;
  private frame = 0;
  /** Extra boxes when an inline target wraps over several lines. */
  private lines: HTMLDivElement[] = [];
  private perLine = false;

  constructor(private readonly layer: HTMLElement) {
    this.box = h("div", { class: "hl", style: "opacity:0" });
    this.chip = h("div", { class: "chip", style: "opacity:0" });
    layer.append(this.box, this.chip);
  }

  show(
    target: Element | Range,
    variant: string,
    label?: { icon?: IconName; strong: string; muted?: string },
    options: { perLine?: boolean } = {},
  ) {
    this.target = target;
    this.perLine = Boolean(options.perLine);
    this.box.className = `hl ${variant}`;
    this.box.style.opacity = "1";
    for (const line of this.lines) line.className = `hl ${variant}`;
    if (label) {
      this.chip.className = `chip ${variant.startsWith("ask") ? "ask" : variant === "locked" ? "locked" : ""}`;
      this.chip.replaceChildren(
        ...(label.icon ? [icon(label.icon, 14)] : []),
        h("span", {}, label.strong),
        ...(label.muted ? [h("span", { class: "muted" }, label.muted)] : []),
      );
      this.chip.style.opacity = "1";
    } else {
      this.chip.style.opacity = "0";
    }
    this.place();
    if (!this.frame) this.loop();
  }

  /**
   * Show the target in `variant`, whose stylesheet animation fades it, and stop following it when
   * the fade ends. Shown again in another way meanwhile, the fade stops and nothing is hidden.
   */
  fadeOut(target: Element, variant: string) {
    this.show(target, variant);
    this.box.addEventListener("animationend", () => this.hide(), { once: true });
  }

  hide() {
    this.target = undefined;
    this.box.style.opacity = "0";
    this.chip.style.opacity = "0";
    for (const line of this.lines) line.remove();
    this.lines = [];
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private loop = () => {
    this.place();
    this.frame = this.target ? requestAnimationFrame(this.loop) : 0;
  };

  private place() {
    const r = this.target?.getBoundingClientRect();
    if (!r) return;
    if (this.perLine && this.target) {
      const rects = Array.from(this.target.getClientRects()).filter(
        (x) => x.width > 0 && x.height > 0,
      );
      if (rects.length > 1) {
        while (this.lines.length < rects.length - 1) {
          const line = h("div", { class: this.box.className });
          this.layer.append(line);
          this.lines.push(line);
        }
        while (this.lines.length > rects.length - 1) this.lines.pop()?.remove();
        const boxes = [this.box, ...this.lines];
        rects.forEach((rect, i) => {
          Object.assign(boxes[i]!.style, {
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            opacity: "1",
          });
        });
        return;
      }
    }
    Object.assign(this.box.style, {
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    const chipTop = r.top - 30 < 4 ? r.bottom + 8 : r.top - 30;
    Object.assign(this.chip.style, {
      top: `${chipTop}px`,
      left: `${Math.max(6, Math.min(r.left - 3, innerWidth - 200))}px`,
    });
  }
}

/** Position a floating panel next to a rectangle: below if there's room, else above. Always on screen. */
export function anchor(panel: HTMLElement, rect: DOMRect, gap = 10) {
  const { width, height } = panel.getBoundingClientRect();
  const below = rect.bottom + gap + height < innerHeight - 70;
  const top = below ? rect.bottom + gap : Math.max(8, rect.top - gap - height);
  const left = Math.min(Math.max(8, rect.left), innerWidth - width - 8);
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

export class Toasts {
  readonly el: HTMLDivElement;

  constructor() {
    this.el = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
  }

  show(text: string, options: { tone?: "ok" | "warn"; ms?: number } = {}) {
    const toast = h(
      "div",
      { class: `toast ${options.tone === "warn" ? "warn" : ""}` },
      icon(options.tone === "warn" ? "alert" : "check", 16),
      text,
    );
    this.el.append(toast);
    while (this.el.children.length > 3) this.el.firstElementChild?.remove();
    setTimeout(() => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 260);
    }, options.ms ?? 2600);
  }
}
