import { realpathSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const PRIVATE = /(?:^|[/\\])\.clodable[/\\]local(?:[/\\]|$)/i;

/** Backups can contain environment files. They are never preview assets, including via symlinks. */
export function privateRequest(url: string, roots: string[], base = "/"): boolean {
  let path = url.split(/[?#]/, 1)[0] ?? "/";
  try {
    for (let i = 0; i < 3; i++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch {
    return true;
  }
  if (PRIVATE.test(path)) return true;
  if (base !== "/" && path.startsWith(base))
    path = `/${path.slice(base.length).replace(/^\/+/, "")}`;
  const paths = path.startsWith("/@fs/")
    ? [path.slice("/@fs/".length)]
    : roots.map((root) => resolve(root, path.replace(/^[/\\]+/, "")));
  return paths.some((file) => {
    if (PRIVATE.test(file)) return true;
    try {
      return PRIVATE.test(realpathSync(file));
    } catch {
      return false;
    }
  });
}

/** Kept active even when the builder hides the preview toolbar. */
export function privateFilesPlugin(): Plugin {
  let roots: string[] = [];
  let base = "/";
  return {
    name: "clodable:private-files",
    apply: "serve",
    enforce: "pre",
    configResolved(config) {
      roots = [config.root, ...(config.publicDir ? [config.publicDir] : [])];
      base = config.base;
    },
    configureServer(server) {
      const protect = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!privateRequest(req.url ?? "/", roots, base)) return next();
        res.statusCode = 403;
        res.setHeader("cache-control", "no-store");
        res.end("Forbidden");
      };
      server.middlewares.stack.unshift({ route: "", handle: protect });
    },
  };
}
