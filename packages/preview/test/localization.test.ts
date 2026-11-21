// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { labelOf, snippet } from "../src/client/describe.js";
import { installEarlyCapture } from "../src/client/errors.js";
import { locale, refreshLocale } from "../src/client/i18n.js";
import { Toolbar } from "../src/client/toolbar.js";
import { framePage } from "../src/frame.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("the preview follows Claude's catalog language", () => {
  let shadow: ShadowRoot;
  let heading: HTMLHeadingElement;
  const requests: Array<Record<string, unknown>> = [];
  let savedLocale: string | null = "fr";
  const button = (name: string) => {
    const found = Array.from(shadow.querySelectorAll("button")).find(
      (element) => element.getAttribute("aria-label") === name || element.textContent === name,
    );
    if (!found) throw new Error(`No button "${name}"`);
    return found;
  };
  const language = (value: string, event = "clodable:locale") => {
    sessionStorage.setItem("clodable:locale", value);
    dispatchEvent(
      event === "storage"
        ? new StorageEvent("storage", { key: "clodable:locale", newValue: value })
        : new CustomEvent(event),
    );
  };

  beforeAll(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("clodable:locale", "fr");
    document.documentElement.lang = "en";
    heading = document.createElement("h1");
    heading.textContent = "Build something great";
    heading.setAttribute("data-cl-src", "src/App.tsx:4:5");
    document.body.append(heading);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(heading);
    vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
      if (path === "/__clodable/locale") return Response.json({ locale: savedLocale });
      if (path === "/__clodable/inbox") {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ ok: true });
      }
      return Response.json({ error: null, line: null });
    });
    installEarlyCapture();
    new Toolbar("app").mount();
    shadow = document.querySelector("clodable-toolbar")!.shadowRoot!;
  });

  it("loads French controls and accessible names without translating the app", () => {
    expect(button("Afficher les outils Clodable").textContent).toContain("Outils");
    button("Afficher les outils Clodable").click();
    expect(button("Modifier le texte").title).toContain("Modifier le texte");
    expect(shadow.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
      "Outils de l’aperçu Clodable",
    );
    expect((shadow.host as HTMLElement).lang).toBe("fr");
    expect(document.documentElement.lang).toBe("en");
    expect(labelOf(heading)).toBe("Titre");
    expect(snippet(heading)).toBe("Build something great");
    expect(heading.textContent).toBe("Build something great");
  });

  it("sends the French suggestion with the original selected text and source", async () => {
    button("Sélectionner et demander").click();
    heading.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 12, clientY: 12 }));
    expect(shadow.querySelector("textarea")?.getAttribute("aria-label")).toBe(
      "Que voulez-vous modifier ?",
    );
    button("Reformule ce texte").click();
    expect(shadow.querySelector("textarea")?.value).toBe("Reformule ce texte");
    button("Envoyer à Claude").click();
    await settle();
    expect(requests[0]).toMatchObject({
      request: "Reformule ce texte",
      source: { file: "src/App.tsx", line: 4, column: 5 },
    });
    expect(requests[0]?.element).toContain("Build something great");
    expect(requests[0]?.element).toMatch(/^Heading <h1/);
    expect(shadow.textContent).toContain("Envoyé à Claude");
  });

  it("redraws after Claude labels a loaded pane and keeps keyboard focus", () => {
    button("Masquer les outils Clodable").focus();
    language("en");
    expect(button("Edit text").textContent).toBe("Edit text");
    expect(shadow.activeElement?.getAttribute("aria-label")).toBe("Hide Clodable tools");
    language("fr-FR", "storage");
    expect(button("Modifier le texte").textContent).toBe("Modifier le texte");
    expect(shadow.activeElement?.getAttribute("aria-label")).toBe("Masquer les outils Clodable");
  });

  it("falls back to English for an unsupported catalog and an unavailable preference", () => {
    language("de");
    expect(button("Edit text").textContent).toBe("Edit text");
    sessionStorage.removeItem("clodable:locale");
    dispatchEvent(new CustomEvent("clodable:locale"));
    expect(locale()).toBe("en");
    expect(button("Edit text").textContent).toBe("Edit text");
    language("fr");
  });

  it("refreshes a retained preview from its conversation when focused", async () => {
    sessionStorage.setItem("clodable:conversation", "retained-chat");
    language("en");
    savedLocale = "fr";
    dispatchEvent(new Event("focus"));
    await settle();
    expect(locale()).toBe("fr");
    expect(button("Modifier le texte").textContent).toBe("Modifier le texte");
    savedLocale = "en";
    await refreshLocale();
    expect(locale()).toBe("en");
    expect(button("Edit text").textContent).toBe("Edit text");
    savedLocale = null;
    language("fr");
    await refreshLocale();
    expect(locale()).toBe("fr");
    sessionStorage.removeItem("clodable:conversation");
  });

  it("explains errors in French while preserving raw code details", async () => {
    dispatchEvent(new ErrorEvent("error", { message: "unknownName is not defined" }));
    await settle();
    expect(shadow.textContent).toContain("Un problème est survenu sur cette page");
    expect(shadow.textContent).toContain(
      "Cette page fait référence à unknownName, qui n’existe pas.",
    );
    button("Afficher les détails").click();
    expect(shadow.querySelector(".raw")?.textContent).toBe("unknownName is not defined");
    button("Demander une correction").focus();
    button("Demander une correction").click();
    expect(shadow.textContent).toContain("Claude corrige le problème…");
    expect(shadow.activeElement?.getAttribute("aria-label")).toBe("Fermer");
    await settle();
  });

  it("keeps the locale on the device frame without changing the app's route", () => {
    const html = framePage({
      device: "phone",
      path: "/pricing?plan=pro",
      landscape: false,
      css: "",
    });
    expect(html).toContain('src="/pricing?plan=pro&amp;__clodable_frame=1"');
    const frame = new DOMParser().parseFromString(html.replace(/src="[^"]*"/g, ""), "text/html");
    const stage = document.importNode(frame.querySelector("main")!, true);
    stage.querySelector("iframe")!.removeAttribute("src");
    document.body.append(stage);
    heading.tabIndex = 0;
    heading.focus();
    new Toolbar("outer").mount();
    expect(locale()).toBe("fr");
    expect(document.title).toBe("Aperçu sur téléphone");
    expect(stage.querySelector(".device")?.getAttribute("aria-label")).toBe(
      "Aperçu sur téléphone, 390 sur 844",
    );
    expect(stage.querySelector("iframe")?.title).toBe("Votre application sur 390 pixels de large");
  });
});
