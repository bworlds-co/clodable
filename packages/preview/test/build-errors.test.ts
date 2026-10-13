import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readInbox } from "@clodable/core";
import MagicString from "magic-string";
import { createServer, type Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { clodablePreview, codeFrame, describeBuildError } from "../src/index.js";

/** Stands in for the transforms that add lines before the app's code (React Refresh, for one). */
const addsLines: Plugin = {
  name: "adds-lines",
  transform(code, id) {
    if (!id.endsWith("page.js")) return undefined;
    const s = new MagicString(code).prepend("// one\n// two\n// three\n");
    return { code: s.toString(), map: s.generateMap({ hires: true, source: id }) };
  },
};

describe("build errors", () => {
  it("remembers the file Vite couldn't build, so a page that loaded blank can say why", async () => {
    const root = mkdtempSync(join(tmpdir(), "clodable-build-errors-"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "index.html"),
      '<div id="root"></div><script type="module" src="/src/main.js"></script>',
    );
    writeFileSync(join(root, "src/main.js"), 'import "./Reviews.js";\n');
    writeFileSync(
      join(root, "src/page.js"),
      'export const ready = true;\nthrow new Error("boom");\n',
    );
    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [clodablePreview({ root, tag: false }), addsLines],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    try {
      const base = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
      const toolbar = await (await fetch(`${base}/__clodable/toolbar.js`)).text();
      const token = toolbar.match(/"token":"([0-9a-f]+)"/)![1]!;
      const ask = (since: number, auth = true) =>
        fetch(`${base}/__clodable/build-error`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(auth ? { "x-clodable-token": token } : {}),
          },
          body: JSON.stringify({ since }),
        });
      const pageLoad = Date.now();
      expect((await (await ask(pageLoad)).json()).error).toBeNull();

      // The browser asks for the module, and Vite answers 500 with nobody listening yet.
      expect((await fetch(`${base}/src/main.js`)).status).toBe(500);
      const { error } = await (await ask(pageLoad)).json();
      expect(error).toMatchObject({
        kind: "build",
        message: expect.stringContaining('Failed to resolve import "./Reviews.js"'),
        source: { file: "src/main.js", line: 1 },
      });
      expect(error.at).toBeUndefined();
      // The code frame shows the file as it is on disk, with its real line numbers.
      expect(error.stack).toContain('> 1 | import "./Reviews.js";');

      // Only errors since the time asked about count, and only the toolbar may ask.
      expect((await (await ask(Date.now() + 1000)).json()).error).toBeNull();
      expect((await ask(pageLoad, false)).status).toBe(403);

      // A runtime error on line 5 of the code Vite served is on line 2 of the file.
      expect((await fetch(`${base}/src/page.js`)).status).toBe(200);
      const mapped = await fetch(`${base}/__clodable/original-line`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-clodable-token": token },
        body: JSON.stringify({ file: "src/page.js", line: 5, column: 1 }),
      });
      expect((await mapped.json()).line).toBe(2);

      // A request keeps the conversation of the pane it came from, and only a well-formed one.
      const request = (conversation: string) =>
        fetch(`${base}/__clodable/inbox`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-clodable-token": token },
          body: JSON.stringify({
            kind: "fix",
            page: { url: base, path: "/" },
            error: { message: "boom", kind: "runtime" },
            conversation,
          }),
        });
      await request("smv2abc123");
      await request('x"; rm -rf /');
      const kept = (await readInbox(root)).map((item) => item.conversation);
      expect(kept.sort()).toEqual([undefined, "smv2abc123"].sort());

      // Only the requests the toolbar makes, with only the fields it sends.
      const post = (body: object) =>
        fetch(`${base}/__clodable/inbox`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-clodable-token": token },
          body: JSON.stringify(body),
        });
      const asked = await post({
        kind: "ask",
        page: { url: base, path: "/" },
        request: "make it bigger",
        note: "not the toolbar's",
      });
      const { id } = await asked.json();
      expect((await readInbox(root)).find((item) => item.id === id)).not.toHaveProperty("note");
      expect((await post({ kind: "ask", page: { url: base, path: "/" } })).status).toBe(400);
      expect((await post({ kind: "edit", page: { url: base, path: "/" } })).status).toBe(400);
      expect((await post({ kind: "fix", page: "/", error: { message: "x" } })).status).toBe(400);
    } finally {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("frames code with real line numbers and a caret", () => {
    const code = "a\nb\nconst x = y;\nd\ne\nf";
    expect(codeFrame(code, 3, 10)).toBe(
      "  1 | a\n  2 | b\n> 3 | const x = y;\n    |           ^\n  4 | d\n  5 | e",
    );
    expect(codeFrame(code, 9)).toBe("");
  });

  it("describes errors in the app's terms: first line, relative path, no terminal colors", () => {
    const error = describeBuildError(
      {
        message: "\u001b[31mUnexpected token\u001b[39m (3:4)\nmore detail",
        id: "/app/src/pages/Index.tsx?t=123",
        loc: { file: "/app/src/pages/Index.tsx", line: 3 },
        frame: "1 | <div>\n  |    ^",
      },
      "/app",
      42,
    );
    expect(error).toEqual({
      message: "Unexpected token (3:4)",
      stack: "/app/src/pages/Index.tsx\nUnexpected token (3:4)\nmore detail\n1 | <div>\n  |    ^",
      kind: "build",
      source: { file: "src/pages/Index.tsx", line: 3 },
      at: 42,
    });
    expect(describeBuildError(new Error("boom"), "/app").source).toBeUndefined();
    expect(
      describeBuildError({ message: "x", id: "/elsewhere/lib.js" }, "/app").source,
    ).toBeUndefined();
  });
});
