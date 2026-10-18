import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloclodPreview } from "../src/plugin.js";

/**
 * Cloclod's endpoints, called the way Vite calls its middleware, from this computer or from
 * another one on the same network (Lovable's template serves on every interface).
 */

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

let root: string;
let handle: Handler;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cloclod-server-"));
  const plugin = cloclodPreview({ root, tag: false });
  const stack: Array<{ route: string; handle: Handler }> = [];
  const server = { middlewares: { stack, use() {} }, config: { logger: { error() {} } } };
  (plugin.configureServer as (server: unknown) => unknown)(server);
  handle = stack[0]!.handle;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function call(
  from: string,
  method: "GET" | "POST",
  url: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: string }> {
  const req = Readable.from(
    options.body === undefined ? [] : [Buffer.from(JSON.stringify(options.body))],
  ) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url,
    headers: {
      ...options.headers,
      ...(options.token ? { "x-cloclod-token": options.token } : {}),
    },
    socket: { remoteAddress: from },
  });
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader() {},
      end(body: string) {
        resolve({ status: res.statusCode, body });
      },
    };
    handle(req, res as unknown as ServerResponse, () => reject(new Error("passed on to the app")));
  });
}

const tokenIn = (script: string) => /"token":"([0-9a-f]+)"/.exec(script)?.[1];
const ask = {
  kind: "ask",
  page: { url: "http://localhost:8080/", path: "/" },
  request: "Make the title warmer",
};
const inbox = () =>
  existsSync(join(root, ".clodable/inbox")) ? readdirSync(join(root, ".clodable/inbox")) : [];

describe("Cloclod's endpoints", () => {
  it("answer this computer: the toolbar with its token, then the requests it makes", async () => {
    for (const from of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      const toolbar = await call(from, "GET", "/__cloclod/toolbar.js");
      expect(toolbar.status).toBe(200);
      const token = tokenIn(toolbar.body);
      expect(token).toBeDefined();
      expect((await call(from, "POST", "/__cloclod/inbox", { token, body: ask })).status).toBe(200);
    }
    expect(inbox()).toHaveLength(3);
  });

  it("don't answer another computer on the network, even with the token", async () => {
    const token = tokenIn((await call("127.0.0.1", "GET", "/__cloclod/toolbar.js")).body);
    for (const from of ["192.168.1.40", "fe80::1c2b:3aff:fe4d:5e6f", "::ffff:192.168.1.40"]) {
      const toolbar = await call(from, "GET", "/__cloclod/toolbar.js");
      expect(toolbar.status).toBe(403);
      expect(toolbar.body).not.toContain(token);
      expect((await call(from, "POST", "/__cloclod/inbox", { token, body: ask })).status).toBe(403);
      expect((await call(from, "POST", "/__cloclod/text", { token, body: {} })).status).toBe(403);
    }
    expect(inbox()).toEqual([]);
  });

  it("give the toolbar its token as an argument, and only to a script tag, never to the page's scripts", async () => {
    const asScript = await call("127.0.0.1", "GET", "/__cloclod/toolbar.js", {
      headers: { "sec-fetch-dest": "script" },
    });
    expect(asScript.status).toBe(200);
    // Handed to the toolbar's code, not put on window, where any script of the page would read it.
    expect(asScript.body).not.toMatch(/window\.__CLOCLOD__\s*=/);
    expect(asScript.body).toMatch(/^\(function \(__CLOCLOD__\) \{\n/);
    expect(asScript.body).toMatch(/\n\}\)\(\{"token":"[0-9a-f]+","backend":"live"\}\);$/);
    // A page script's fetch() says so (the browser sets it; the page can't), and is refused.
    for (const dest of ["empty", "iframe", "worker"]) {
      const read = await call("127.0.0.1", "GET", "/__cloclod/toolbar.js", {
        headers: { "sec-fetch-dest": dest },
      });
      expect(read.status).toBe(403);
      expect(tokenIn(read.body)).toBeUndefined();
    }
  });

  it("leave the app's own pages to the app, wherever they're asked from", async () => {
    await expect(call("192.168.1.40", "GET", "/")).rejects.toThrow("passed on to the app");
  });
});
