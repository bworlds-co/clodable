import type { IncomingMessage, ServerResponse } from "node:http";
import { PREFIX, ROUTES } from "./shared.js";

export const TOOLBAR_TAG = `<script src="${ROUTES.toolbar}" defer data-clodable-toolbar></script>`;

/** Insert the toolbar script into an HTML document, once. */
export function injectToolbar(html: string): string | undefined {
  if (html.includes("data-clodable-toolbar")) return html;
  const head = html.search(/<\/head>/i);
  if (head >= 0) return html.slice(0, head) + TOOLBAR_TAG + html.slice(head);
  const body = html.search(/<body[^>]*>/i);
  if (body >= 0) {
    const close = html.indexOf(">", body) + 1;
    return html.slice(0, close) + TOOLBAR_TAG + html.slice(close);
  }
  return undefined;
}

const TAG_BYTES = Buffer.from(TOOLBAR_TAG, "utf8");

/** Byte-level version of injectToolbar, so no multi-byte character is ever decoded and re-encoded. */
export function injectToolbarBytes(bytes: Uint8Array): Uint8Array | undefined {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.includes("data-clodable-toolbar")) return bytes;
  let at = buf.indexOf("</head>");
  if (at < 0) at = buf.indexOf("</HEAD>");
  if (at < 0) {
    const body = buf.indexOf("<body");
    if (body < 0) return undefined;
    const close = buf.indexOf(">", body);
    if (close < 0) return undefined;
    at = close + 1;
  }
  return Buffer.concat([buf.subarray(0, at), TAG_BYTES, buf.subarray(at)]);
}

type Next = (error?: unknown) => void;
type Callback = (error?: Error | null) => void;

/** Give up looking for </head> after this much HTML, and pass everything through untouched. */
const MAX_HOLD = 512 * 1024;

const toBuffer = (chunk: unknown, encoding?: BufferEncoding): Buffer | undefined => {
  if (typeof chunk === "string") return Buffer.from(chunk, encoding ?? "utf8");
  if (chunk instanceof Uint8Array)
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return undefined;
};

/**
 * Middleware that adds the toolbar to HTML rendered by a server framework (TanStack Start, Nitro).
 * React streams HTML in small pieces, and `</head>` can be split between two of them. So the start
 * of the document is held back until the head closes, the tag is inserted, and then everything
 * streams on untouched. A page that never closes its head is passed through as it was.
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
