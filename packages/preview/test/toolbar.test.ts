// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Toolbar } from "../src/client/toolbar.js";

/** The toolbar from the keyboard: wherever a press redraws it, focus stays where the builder was. */
describe("the toolbar, from the keyboard", () => {
  let shadow: ShadowRoot;
  const button = (name: string) => {
    const found = Array.from(shadow.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === name || b.title.split(" (")[0] === name,
    );
    if (!found) throw new Error(`No button "${name}"`);
    return found;
  };
  const focused = () => {
    const el = shadow.activeElement as HTMLElement | null;
    return el?.getAttribute("aria-label") ?? el?.title.split(" (")[0];
  };
  const press = (name: string) => {
    button(name).focus();
    button(name).click();
  };

  beforeAll(() => {
    localStorage.clear();
    // The dev server isn't here: every request finds nothing to report.
    vi.stubGlobal("fetch", async () => Response.json({ error: null }));
    new Toolbar("app").mount();
    shadow = document.querySelector("clodable-toolbar")!.shadowRoot!;
  });

  it("keeps focus on a tool after pressing it", () => {
    press("Edit text");
    expect(button("Edit text").getAttribute("aria-pressed")).toBe("true");
    expect(focused()).toBe("Edit text");
    press("Point & ask");
    expect(focused()).toBe("Point & ask");
    press("Point & ask");
    expect(button("Point & ask").getAttribute("aria-pressed")).toBe("false");
    expect(focused()).toBe("Point & ask");
  });

  it("hides to the pebble and comes back, focus following", () => {
    press("Hide Clodable tools");
    expect(focused()).toBe("Show Clodable tools");
    press("Show Clodable tools");
    expect(focused()).toBe("Hide Clodable tools");
  });

  it("is one tab stop, the last button pressed", () => {
    const tabbable = Array.from(shadow.querySelectorAll("button")).filter((b) => b.tabIndex === 0);
    expect(tabbable.map((b) => b.getAttribute("aria-label"))).toEqual(["Hide Clodable tools"]);
  });

  it("moves through the menu with the arrow keys, and Escape hands focus back", () => {
    const key = (name: string) =>
      (shadow.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true, composed: true }),
      );
    press("Clodable menu");
    expect(button("Clodable menu").getAttribute("aria-expanded")).toBe("true");
    expect(shadow.activeElement?.textContent).toContain("Edit text");
    key("ArrowDown");
    expect(shadow.activeElement?.textContent).toContain("Point & ask Claude");
    key("End");
    expect(shadow.activeElement?.textContent).toContain("Hide these tools");
    key("ArrowDown");
    expect(shadow.activeElement?.textContent).toContain("Edit text");
    key("Escape");
    expect(shadow.querySelector('[role="menu"]')).toBeNull();
    expect(focused()).toBe("Clodable menu");
    expect(button("Clodable menu").getAttribute("aria-expanded")).toBe("false");
  });

  it("hides from the menu onto the pebble", () => {
    press("Clodable menu");
    const hide = Array.from(shadow.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((b) =>
      b.textContent?.includes("Hide these tools"),
    )!;
    hide.focus();
    hide.click();
    expect(focused()).toBe("Show Clodable tools");
    press("Show Clodable tools");
    expect(focused()).toBe("Hide Clodable tools");
  });

  it("leaves focus alone when a shortcut is used from the page", () => {
    const own = document.createElement("button");
    document.body.append(own);
    own.focus();
    dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", altKey: true, shiftKey: true }));
    expect(button("Edit text").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(own);
    own.remove();
  });
});
