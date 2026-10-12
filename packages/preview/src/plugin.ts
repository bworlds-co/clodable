import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { type NewInboxItem, writeInbox } from "@clodable/core";
import { cssVariables } from "@clodable/design";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type { Plugin, ViteDevServer } from "vite";
import { DEVICES, type Device, framePage } from "./frame.js";
import { htmlInjectionMiddleware, injectToolbar } from "./inject.js";
import { parseSourceAttr, tagJsx } from "./tagger.js";
import { editText, probeText } from "./text-edit.js";
import { toolbarSource } from "./toolbar-source.js";

export interface PreviewOptions {
  /** Project root. Defaults to Vite's root. */
  root?: string;
  /** Tag JSX with source locations (needed for inline editing and point-and-ask). Default true. */
  tag?: boolean;
  /** Which backend the app talks to: "copy" while trying a move off Lovable. */
  backend?: () => "live" | "copy";
}

const MAX_BODY = 64 * 1024;
const EDITABLE = /\.(tsx|jsx)$/;

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.statusCode = status;
  res.setHeader("content-type", `${type}; charset=utf-8`);
  res.setHeader("cache-control", "no-store");
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

/** A file Vite couldn't build, in the toolbar's terms, and when. */
export interface BuildError {
  message: string;
  stack: string;
  kind: "build";
  source?: { file: string; line: number };
  at: number;
}

/** A few lines of the file around a position, the way code frames usually look. */
export function codeFrame(code: string, line: number, column?: number): string {
  const lines = code.split("\n");
  if (line < 1 || line > lines.length) return "";
  const from = Math.max(1, line - 2);
  const to = Math.min(lines.length, line + 2);
  const width = String(to).length;
  const frame: string[] = [];
  for (let n = from; n <= to; n++) {
    frame.push(`${n === line ? ">" : " "} ${String(n).padStart(width)} | ${lines[n - 1]}`);
    if (n === line && column !== undefined)
      frame.push(`  ${" ".repeat(width)} | ${" ".repeat(column)}^`);
  }
  return frame.join("\n");
}

/** Describe Vite's error for a file it couldn't build (a missing import, a typo), with paths relative to the app. */
export function describeBuildError(error: unknown, root: string, at = Date.now()): BuildError {
  const e = (error && typeof error === "object" ? error : { message: String(error) }) as {
    message?: string;
    id?: string;
    frame?: string;
    loc?: { file?: string; line?: number; column?: number };
  };
  const message = stripVTControlCharacters(String(e.message ?? "The app couldn't be built"));
  const where = e.loc?.file ?? e.id?.split("?")[0];
  const inside = (base: string) => {
    const rel = where ? relative(base, resolve(base, where)) : "";
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : "";
  };
  // Vite names files by their real path, which differs when the app's folder is reached through a link.
  let file = inside(root);
  if (!file && where) {
    try {
      file = inside(realpathSync(root));
    } catch {}
  }
  // Vite's frame shows the file after its own changes, so its line numbers don't match the file.
  let frame = e.frame && stripVTControlCharacters(e.frame);
  if (where && e.loc?.line) {
    try {
      frame =
        codeFrame(readFileSync(resolve(root, where), "utf8"), e.loc.line, e.loc.column) || frame;
    } catch {}
  }
  return {
    message: message.split("\n")[0]!.slice(0, 300),
    stack: [where, message, frame].filter(Boolean).join("\n").slice(0, 4000),
    kind: "build",
    ...(file ? { source: { file, line: e.loc?.line ?? 1 } } : {}),
    at,
  };
}

/** The conversation whose preview pane sent a request, when the pane was labelled with one. */
const conversationOf = (body: Record<string, unknown>) =>
  typeof body.conversation === "string" && /^[\w-]{1,64}$/.test(body.conversation)
    ? { conversation: body.conversation }
    : {};

/** Clodable's dev-only Vite plugin: source tagging, the toolbar, and its local endpoints. */
export function clodablePreview(options: PreviewOptions = {}): Plugin {
  const token = randomBytes(16).toString("hex");
  const tagged = new Set<string>();
  let root = options.root ?? process.cwd();
  let server: ViteDevServer | undefined;
  let lastBuildError: BuildError | undefined;

  const inRoot = (file: string) => {
    const full = resolve(root, file);
    const rel = relative(root, full);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? full : undefined;
  };

  const authorized = (req: IncomingMessage) => {
    if (req.headers["x-clodable-token"] !== token) return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      const host = new URL(origin).hostname;
      return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    } catch {
      return false;
    }
  };

  async function handle(req: IncomingMessage, res: ServerResponse, next: (e?: unknown) => void) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (!path.startsWith("/__clodable/")) return next();

    if (req.method === "GET" && path === "/__clodable/toolbar.js") {
      const config = JSON.stringify({
        token,
        version: "0.1.0",
        backend: options.backend?.() ?? "live",
      });
      return send(
        res,
        200,
        `window.__CLODABLE__=${config};\n${await toolbarSource()}`,
        "text/javascript",
      );
    }
    if (req.method === "GET" && path === "/__clodable/health") {
      return send(res, 200, { ok: true, tagged: tagged.size });
    }
    if (req.method === "GET" && path === "/__clodable/frame") {
      const deviceId = (url.searchParams.get("device") ?? "phone") as Device["id"];
      const device = deviceId in DEVICES ? deviceId : "phone";
      const html = framePage({
        device,
        path: url.searchParams.get("path") ?? "/",
        landscape: url.searchParams.get("landscape") === "1",
        css: cssVariables(),
      });
      return send(res, 200, injectToolbar(html) ?? html, "text/html");
    }

    if (req.method !== "POST") return send(res, 405, { error: "method" });
    if (!authorized(req)) return send(res, 403, { error: "forbidden" });

    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: "bad-request" });
    }

    if (path === "/__clodable/text/probe" || path === "/__clodable/text") {
      const location = parseSourceAttr(String(body.src ?? ""));
      const full = location && inRoot(location.file);
      if (!location || !full || !EDITABLE.test(full) || !tagged.has(full) || !existsSync(full)) {
        return send(res, 200, { ok: false, editable: false, reason: "not-found" });
      }
      const code = await readFile(full, "utf8");
      if (path === "/__clodable/text/probe") {
        return send(
          res,
          200,
          probeText(code, location.file, location.line, location.column, String(body.text ?? "")),
        );
      }
      const before = String(body.before ?? "");
      const after = String(body.after ?? "");
      if (!after.trim()) return send(res, 200, { ok: false, reason: "empty" });
      const result = editText(code, location.file, location, before, after);
      if (!result.ok) return send(res, 200, result);
      await writeFile(full, result.code);
      const page = (body.page as { url: string; path: string } | undefined) ?? {
        url: "",
        path: "/",
      };
      await writeInbox(root, {
        kind: "edit",
        page,
        source: { file: location.file, line: result.line },
        before,
        after,
        ...conversationOf(body),
      }).catch(() => {});
      return send(res, 200, { ok: true, file: location.file, line: result.line });
    }

    if (path === "/__clodable/inbox") {
      const kind = body.kind;
      if (kind !== "fix" && kind !== "ask") return send(res, 400, { error: "kind" });
      const { conversation: _, ...request } = body;
      const item = await writeInbox(root, {
        ...(request as unknown as NewInboxItem),
        ...conversationOf(body),
      });
      return send(res, 200, { ok: true, id: item.id });
    }

    // Browsers place runtime errors in the code Vite served. Map them back to the line in the file.
    if (path === "/__clodable/original-line") {
      const file = String(body.file ?? "");
      const mod = inRoot(file) ? await server?.moduleGraph.getModuleByUrl(`/${file}`) : undefined;
      const map = mod?.transformResult?.map;
      if (!map || !("mappings" in map) || !map.mappings) return send(res, 200, { line: null });
      const original = originalPositionFor(new TraceMap(map as never), {
        line: Number(body.line) || 1,
        column: Math.max(0, (Number(body.column) || 1) - 1),
      });
      return send(res, 200, { line: original.line });
    }

    // Why the page didn't load, or whether a change built: the last file Vite couldn't build since then.
    if (path === "/__clodable/build-error") {
      const since = Number(body.since) || 0;
      if (!lastBuildError || lastBuildError.at < since) return send(res, 200, { error: null });
      const { at: _at, ...error } = lastBuildError;
      return send(res, 200, { error });
    }

    return send(res, 404, { error: "not-found" });
  }

  return {
    name: "clodable:preview",
    apply: "serve",
    enforce: "pre",
    configResolved(config) {
      root = options.root ?? config.root;
    },
    configureServer(viteServer) {
      server = viteServer;
      const api = (req: IncomingMessage, res: ServerResponse, next: (e?: unknown) => void) => {
        handle(req, res, next).catch((error) => {
          server?.config.logger.error(`[clodable] ${String(error)}`);
          if (!res.headersSent) send(res, 500, { error: "internal" });
        });
      };
      // Go first: server frameworks (TanStack Start, Nitro) answer HTML requests in their own
      // middleware, before anything registered after them could see the response.
      const stack = (
        viteServer.middlewares as unknown as { stack?: Array<{ route: string; handle: unknown }> }
      ).stack;
      if (Array.isArray(stack)) {
        stack.unshift({ route: "", handle: api }, { route: "", handle: htmlInjectionMiddleware });
      } else {
        viteServer.middlewares.use(api);
        viteServer.middlewares.use(htmlInjectionMiddleware);
      }
      // Go last, just before Vite answers with its error: note each file it couldn't build. Vite tells
      // open pages too, but a page that is still loading isn't listening yet and stays blank.
      return () => {
        viteServer.middlewares.use(
          (
            error: unknown,
            _req: IncomingMessage,
            _res: ServerResponse,
            next: (e?: unknown) => void,
          ) => {
            lastBuildError = describeBuildError(error, root);
            next(error);
          },
        );
      };
    },
    transformIndexHtml(html) {
      return injectToolbar(html) ?? html;
    },
    transform(code, id) {
      if (options.tag === false) return undefined;
      // Only tag modules whose code still comes from a file on disk (not virtual split chunks).
      const file = id.split("?")[0]!;
      if (
        !EDITABLE.test(file) ||
        file.includes(`${sep}node_modules${sep}`) ||
        file.includes("/node_modules/")
      ) {
        return undefined;
      }
      const rel = relative(root, file);
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) return undefined;
      // Frameworks such as TanStack Router split route files differently for the server and the
      // browser before we see them. Map every position back to the file on disk, so both sides agree
      // (no hydration mismatch) and text edits land on the right line.
      let locate:
        | ((line: number, column: number) => { line: number; column: number } | undefined)
        | undefined;
      try {
        const map = this.getCombinedSourcemap();
        if (map?.mappings) {
          const trace = new TraceMap(map as never);
          locate = (line, column) => {
            const original = originalPositionFor(trace, { line, column });
            return original.line === null
              ? undefined
              : { line: original.line, column: original.column ?? column };
          };
        }
      } catch {
        locate = undefined;
      }
      let original: string | undefined;
      try {
        original = readFileSync(file, "utf8");
      } catch {
        original = undefined;
      }
      const result = tagJsx(code, rel.split(sep).join("/"), {
        ...(locate ? { locate } : {}),
        ...(original !== undefined ? { original } : {}),
      });
      if (!result) return undefined;
      tagged.add(file);
      return { code: result.code, map: result.map };
    },
  };
}
