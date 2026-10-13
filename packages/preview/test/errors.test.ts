// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ErrorWatcher, installEarlyCapture } from "../src/client/errors.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("the error card, from the keyboard", () => {
  let shadow: ShadowRoot;
  const button = (name: string) => {
    const found = Array.from(shadow.querySelectorAll("button")).find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    );
    if (!found) throw new Error(`No button "${name}"`);
    return found;
  };
  const focused = () => {
    const el = shadow.activeElement as HTMLElement | null;
    return el?.getAttribute("aria-label") ?? el?.textContent;
  };

  // The inbox's answers, in turn; then it takes every request.
  const answers: Array<() => Response> = [() => new Response("", { status: 503 })];

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (path: string) =>
      path === "/__clodable/inbox"
        ? (answers.shift() ?? (() => Response.json({ ok: true })))()
        : Response.json({ error: null, line: null }),
    );
    installEarlyCapture();
    const host = document.createElement("div");
    document.body.append(host);
    shadow = host.attachShadow({ mode: "open" });
    const layer = document.createElement("div");
    const slot = document.createElement("div");
    shadow.append(layer, slot);
    new ErrorWatcher(layer, slot, () => {}).start();
    dispatchEvent(new ErrorEvent("error", { message: "boom is not defined" }));
    await settle();
  });

  it("brings Try to fix back, focused, when Claude can't be reached", async () => {
    button("Try to fix").focus();
    button("Try to fix").click();
    await settle();
    expect(shadow.textContent).not.toContain("Claude is fixing it…");
    expect(focused()).toBe("Try to fix");
  });

  it("keeps focus in the card when Try to fix is pressed", async () => {
    button("Try to fix").focus();
    button("Try to fix").click();
    expect(shadow.textContent).toContain("Claude is fixing it…");
    expect(focused()).toBe("Dismiss");
    await settle();
  });
});
