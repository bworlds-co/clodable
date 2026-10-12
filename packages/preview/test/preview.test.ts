import { describe, expect, it } from "vitest";
import { editText, injectToolbar, probeText, tagJsx } from "../src/index.js";

const page = `import { Button } from "@/components/ui/button";

export default function Hero({ name }: { name: string }) {
  return (
    <section className="hero">
      <h1 className="text-5xl">
        Baked before sunrise, <span className="text-primary">gone by noon.</span>
      </h1>
      <p>
        Crumb &amp; Co. is a small-batch bakery
        on Maple Street.
      </p>
      <Button size="lg">Order ahead</Button>
      <p>{"Open until 3pm"}</p>
      <p>Hello {name}</p>
      <>
        <em>Twice</em>
      </>
    </section>
  );
}
`;

const at = (code: string, needle: string) => {
  const index = code.indexOf(needle);
  const before = code.slice(0, index);
  const line = before.split("\n").length;
  const column = index - before.lastIndexOf("\n");
  return { line, column };
};

describe("tagger", () => {
  it("tags host elements and components with their source location, but not fragments", () => {
    const result = tagJsx(page, "src/components/Hero.tsx")!;
    expect(result.count).toBe(8);
    expect(result.code).toContain(
      '<section data-cl-src="src/components/Hero.tsx:5:5" className="hero">',
    );
    expect(result.code).toContain('<Button data-cl-src="src/components/Hero.tsx:13:7" size="lg">');
    expect(result.code).toContain("<>");
    expect(result.map.mappings.length).toBeGreaterThan(0);
  });

  it("leaves files without JSX alone and survives syntax errors", () => {
    expect(tagJsx("export const x = 1 < 2;", "src/a.ts")).toBeUndefined();
    expect(() => tagJsx("export const A = () => <div", "src/b.tsx")).not.toThrow();
  });
});

describe("inline text editing", () => {
  const h1 = at(page, "<h1");
  const p = at(page, "<p>\n        Crumb");
  const button = at(page, "<Button");
  const literal = at(page, '<p>{"Open');
  const hello = at(page, "<p>Hello");

  it("edits the direct text of an element, keeping the rest of the file intact", () => {
    const result = editText(page, "x.tsx", h1, "Baked before sunrise,", "Baked at dawn,");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain(
      '<h1 className="text-5xl">\n        Baked at dawn, <span className="text-primary">gone by noon.</span>',
    );
    expect(result.code.replace("Baked at dawn,", "Baked before sunrise,")).toBe(page);
  });

  it("matches text the way the browser shows it: entities decoded, whitespace collapsed", () => {
    const result = editText(
      page,
      "x.tsx",
      p,
      "Crumb & Co. is a small-batch bakery on Maple Street.",
      "A tiny bakery.",
    );
    expect(result.ok && result.code).toContain("<p>\n        A tiny bakery.\n      </p>");
  });

  it("edits text passed to components, and string literals", () => {
    const one = editText(page, "x.tsx", button, "Order ahead", "Reserve a loaf");
    expect(one.ok && one.code).toContain('<Button size="lg">Reserve a loaf</Button>');
    const two = editText(page, "x.tsx", literal, "Open until 3pm", 'Open until "late"');
    expect(two.ok && two.code).toContain('<p>{"Open until \\"late\\""}</p>');
  });

  it("writes special characters safely", () => {
    const result = editText(page, "x.tsx", button, "Order ahead", "Order {now} <today>");
    expect(result.ok && result.code).toContain(
      '<Button size="lg">{"Order {now} <today>"}</Button>',
    );
  });

  it("refuses dynamic text and stale locations, with a reason the toolbar can explain", () => {
    expect(probeText(page, "x.tsx", hello.line, hello.column, "Hello Ada")).toEqual({
      editable: false,
      reason: "dynamic",
    });
    expect(probeText(page, "x.tsx", h1.line, h1.column, "Baked before sunrise,")).toEqual({
      editable: true,
    });
    expect(editText(page, "x.tsx", { line: 1, column: 1 }, "x", "y")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(editText(page, "x.tsx", h1, "Not there", "y")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("toolbar injection", () => {
  it("injects once, before </head>, or after <body> when there is no head", () => {
    const html = "<html><head><title>x</title></head><body><div id=root></div></body></html>";
    const once = injectToolbar(html)!;
    expect(once).toContain("data-clodable-toolbar></script></head>");
    expect(injectToolbar(once)).toBe(once);
    expect(injectToolbar("<body class=a><p>hi</p></body>")).toContain(
      '<body class=a><script src="/__clodable/toolbar.js"',
    );
    expect(injectToolbar("<p>fragment</p>")).toBeUndefined();
  });
});
