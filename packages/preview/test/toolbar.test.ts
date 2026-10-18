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
    shadow = document.querySelector("cloclod-toolbar")!.shadowRoot!;
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
    press("Hide Cloclod tools");
    expect(focused()).toBe("Show Cloclod tools");
    press("Show Cloclod tools");
    expect(focused()).toBe("Hide Cloclod tools");
  });

  it("is one tab stop, the last button pressed", () => {
    const tabbable = Array.from(shadow.querySelectorAll("button")).filter((b) => b.tabIndex === 0);
    expect(tabbable.map((b) => b.getAttribute("aria-label"))).toEqual(["Hide Cloclod tools"]);
  });

  it("moves through the menu with the arrow keys, and Escape hands focus back", () => {
    const key = (name: string) =>
      (shadow.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true, composed: true }),
      );
    press("Cloclod menu");
    expect(button("Cloclod menu").getAttribute("aria-expanded")).toBe("true");
    expect(shadow.activeElement?.textContent).toContain("Edit text");
    key("ArrowDown");
    expect(shadow.activeElement?.textContent).toContain("Point & ask Claude");
    key("End");
    expect(shadow.activeElement?.textContent).toContain("Hide these tools");
    key("ArrowDown");
    expect(shadow.activeElement?.textContent).toContain("Edit text");
    key("Escape");
    expect(shadow.querySelector('[role="menu"]')).toBeNull();
    expect(focused()).toBe("Cloclod menu");
    expect(button("Cloclod menu").getAttribute("aria-expanded")).toBe("false");
  });

  it("hides from the menu onto the pebble", () => {
    press("Cloclod menu");
    const hide = Array.from(shadow.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((b) =>
      b.textContent?.includes("Hide these tools"),
    )!;
    hide.focus();
    hide.click();
    expect(focused()).toBe("Show Cloclod tools");
    press("Show Cloclod tools");
    expect(focused()).toBe("Hide Cloclod tools");
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

  it("keeps a short preview clear, without saving an automatic Hide preference", () => {
    press("Edit text"); // Return to idle after the preceding shortcut check.
    vi.stubGlobal("innerHeight", 320);
    dispatchEvent(new Event("resize"));
    expect(button("Show Cloclod tools").textContent).toContain("Tools");
    expect(shadow.querySelector('[role="toolbar"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem("cloclod:toolbar")!).minimized).toBe(false);
    press("Show Cloclod tools");
    expect(button("Edit text").isConnected).toBe(true);
    expect(focused()).toBe("Hide Cloclod tools");
    vi.stubGlobal("innerHeight", 820);
    dispatchEvent(new Event("resize"));
    expect(button("Edit text").isConnected).toBe(true);
  });

  it("shows tools from shortcuts in a short preview and keeps Copy visible when hidden", () => {
    vi.stubGlobal("__CLOCLOD__", { backend: "copy" });
    vi.stubGlobal("innerHeight", 320);
    dispatchEvent(new Event("resize"));
    expect(button("Show Cloclod tools").textContent).toContain("Copy");
    dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", altKey: true, shiftKey: true }));
    expect(shadow.querySelector('[role="toolbar"]')).not.toBeNull();
    press("Hide Cloclod tools");
    expect(button("Show Cloclod tools").textContent).toContain("Copy");
    dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", altKey: true, shiftKey: true }));
    expect(button("Edit text").getAttribute("aria-pressed")).toBe("true");
    dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(button("Show Cloclod tools").textContent).toContain("Copy");
    vi.unstubAllGlobals();
  });
});
