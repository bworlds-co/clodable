import type { IncomingMessage, ServerResponse } from "node:http";
import { PREFIX, ROUTES } from "./shared.js";

/**
 * The toolbar's script tag. Neither deferred nor async, and first in <head>: the toolbar starts
 * before any script of the app, keeps the browser's own fetch, and its token never meets one.
 */
export const TOOLBAR_TAG = `<script src="${ROUTES.toolbar}" data-clodable-toolbar></script>`;

/** Just after the page's opening <head …> (not a <header>), else just after <body …>. */
function afterOpening(html: string): number | undefined {
  const opening = /<head(?=[\s>])[^>]*>/i.exec(html) ?? /<body(?=[\s>])[^>]*>/i.exec(html);
  return opening ? opening.index + opening[0].length : undefined;
}

/** Insert the toolbar script into an HTML document, once. */
export function injectToolbar(html: string): string | undefined {
  if (html.includes("data-clodable-toolbar")) return html;
  const at = afterOpening(html);
  return at === undefined ? undefined : html.slice(0, at) + TOOLBAR_TAG + html.slice(at);
}

const TAG_BYTES = Buffer.from(TOOLBAR_TAG, "utf8");

/** Byte-level version of injectToolbar, so no multi-byte character is ever decoded and re-encoded. */
export function injectToolbarBytes(bytes: Uint8Array): Uint8Array | undefined {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.includes("data-clodable-toolbar")) return bytes;
  // Latin-1 reads one character per byte: a position in that text is the same position in bytes.
  const at = afterOpening(buf.toString("latin1"));
  if (at === undefined) return undefined;
  return Buffer.concat([buf.subarray(0, at), TAG_BYTES, buf.subarray(at)]);
}

type Next = (error?: unknown) => void;
type Callback = (error?: Error | null) => void;

/** Give up looking for <head> after this much HTML, and pass everything through untouched. */
const MAX_HOLD = 512 * 1024;

const toBuffer = (chunk: unknown, encoding?: BufferEncoding): Buffer | undefined => {
  if (typeof chunk === "string") return Buffer.from(chunk, encoding ?? "utf8");
  if (chunk instanceof Uint8Array)
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return undefined;
};

/**
 * Middleware that adds the toolbar to HTML rendered by a server framework (TanStack Start, Nitro).
 * React streams HTML in small pieces, and `<head …>` can be split between two of them. So the start
 * of the document is held back until the head opens, the tag is inserted, and then everything
 * streams on untouched. A page with no head or body is passed through as it was.
 */
export function htmlInjectionMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: Next,
): void {
  const url = req.url ?? "";
  const accept = req.headers.accept ?? "";
  if (
    req.method !== "GET" ||
    !accept.includes("text/html") ||
    url.startsWith(PREFIX) ||
    url.startsWith("/@")
  ) {
    next();
    return;
  }

  const write = res.write.bind(res) as (chunk: unknown, ...rest: unknown[]) => boolean;
  const end = res.end.bind(res) as (...args: unknown[]) => ServerResponse;
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;

  let mode: "unknown" | "hold" | "pass" = "unknown";
  let held: Buffer[] = [];
  let heldBytes = 0;

  const decide = () => {
    if (mode === "pass") return mode;
    const type = String(res.getHeader("content-type") ?? "");
    if (!type.includes("text/html")) {
      mode = "pass";
      return mode;
    }
    // A fixed length can't grow once the headers are out. Streamed (chunked) responses can.
    if (res.getHeader("content-length") !== undefined) {
      if (res.headersSent) {
        mode = "pass";
        return mode;
      }
      res.removeHeader("content-length");
    }
    mode = "hold";
    return mode;
  };

  /** Try to inject into what's held. Returns the bytes to send, or undefined to keep holding. */
  const release = (final: boolean): Buffer | undefined => {
    const all = Buffer.concat(held);
    const injected = injectToolbarBytes(all);
    if (injected === undefined && !final && heldBytes < MAX_HOLD) return undefined;
    held = [];
    heldBytes = 0;
    mode = "pass";
    return Buffer.from(injected ?? all);
  };

  res.writeHead = ((...args: unknown[]) => {
    const headers = args.find((a, i) => i > 0 && a && typeof a === "object" && !Array.isArray(a)) as
      | Record<string, unknown>
      | undefined;
    if (headers) {
      const type = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1];
      if (String(type ?? "").includes("text/html")) {
        for (const key of Object.keys(headers))
          if (key.toLowerCase() === "content-length") delete headers[key];
      }
    }
    return writeHead(...args);
  }) as typeof res.writeHead;

  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (decide() !== "hold") return write(chunk, ...rest);
    const encoding = typeof rest[0] === "string" ? (rest[0] as BufferEncoding) : undefined;
    const callback = rest.find((r) => typeof r === "function") as Callback | undefined;
    const buf = toBuffer(chunk, encoding);
    if (!buf) return write(chunk, ...rest);
    held.push(buf);
    heldBytes += buf.length;
    const out = release(false);
    if (out === undefined) {
      callback?.();
      return true;
    }
    return callback ? write(out, callback) : write(out);
  }) as typeof res.write;

  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    if (typeof chunk === "function") {
      if (mode === "hold" && held.length > 0) write(release(true));
      return end(chunk, ...rest);
    }
    if (decide() !== "hold") return end(chunk, ...rest);
    const encoding = typeof rest[0] === "string" ? (rest[0] as BufferEncoding) : undefined;
    const buf = chunk === undefined || chunk === null ? undefined : toBuffer(chunk, encoding);
    if (buf) {
      held.push(buf);
      heldBytes += buf.length;
    }
    const out = held.length > 0 ? release(true) : undefined;
    const callback = rest.find((r) => typeof r === "function");
    return out ? end(out, ...(callback ? [callback] : [])) : end(...(callback ? [callback] : []));
  }) as typeof res.end;

  next();
}
