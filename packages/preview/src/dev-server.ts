import { existsSync, readFileSync, unwatchFile, watchFile } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { repoint } from "@clodable/core";
import type { Plugin } from "vite";
import { clodablePreview } from "./plugin.js";

export interface DevServerOptions {
  root: string;
  /** Desktop passes PORT when it picks a free one (autoPort). Otherwise the app's own config wins. */
  port?: number;
  host?: string | boolean;
  /** Turn the toolbar off and run the app's plain dev server. */
  toolbar?: boolean;
  /**
   * Which Supabase backend the app talks to, when not its own: the working copy of a move off
   * Lovable. Read at start and again whenever `watch` changes; the server restarts to switch.
   */
  backend?: { current(): Promise<PreviewBackend | undefined>; watch?: string };
  /**
   * The settings the app's server code reads (`process.env.GREETING`), kept by Clodable on this
   * computer. Read at start and again whenever `watch` changes; the server restarts to use them.
   */
  settings?: { current(): Promise<Record<string, string>>; watch?: string };
}

export interface PreviewBackend {
  /** The project the code names today (Lovable Cloud's). */
  from?: string;
  ref: string;
  url: string;
  publishable: string;
  /** For code that carries an anon key: the legacy one if the project has it, else publishable. */
  anon: string;
  /** For server code: the legacy service key if the project has it, else the secret key. */
  serviceRole: string;
}

/** The variables Lovable's templates read, browser side (VITE_) and server side. */
function backendEnv(b: PreviewBackend): Record<string, string> {
  return {
    VITE_SUPABASE_URL: b.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: b.publishable,
    VITE_SUPABASE_ANON_KEY: b.anon,
    VITE_SUPABASE_PROJECT_ID: b.ref,
    SUPABASE_URL: b.url,
    SUPABASE_PUBLISHABLE_KEY: b.publishable,
    SUPABASE_ANON_KEY: b.anon,
    SUPABASE_SERVICE_ROLE_KEY: b.serviceRole,
  };
}

const ORIGINAL_ENV = new Map<string, string | undefined>();

/** Point this process's environment at the backend, or back at what it was. */
function applyBackendEnv(b: PreviewBackend | undefined) {
  const wanted = b ? backendEnv(b) : {};
  const keys = Object.keys(
    backendEnv({ ref: "", url: "", publishable: "", anon: "", serviceRole: "" }),
  );
  for (const key of keys) {
    if (!ORIGINAL_ENV.has(key)) ORIGINAL_ENV.set(key, process.env[key]);
    const value = wanted[key] ?? ORIGINAL_ENV.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const SETTING_ORIGINAL = new Map<string, string | undefined>();

/** The app's settings as this process's environment. What the person's own shell set wins. */
function applySettingsEnv(values: Record<string, string>) {
  for (const key of new Set([...SETTING_ORIGINAL.keys(), ...Object.keys(values)])) {
    if (!SETTING_ORIGINAL.has(key)) SETTING_ORIGINAL.set(key, process.env[key]);
    const original = SETTING_ORIGINAL.get(key);
    const value = original ?? values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/**
 * Code that names the old backend outright (older Lovable apps write its address and key in
 * src/integrations/supabase/client.ts) talks to the copy instead, without a file changing.
 */
function backendPlugin(current: () => PreviewBackend | undefined): Plugin {
  return {
    name: "clodable:backend",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      const b = current();
      if (!b?.from || !code.includes(b.from)) return undefined;
      const file = id.split("?")[0]!;
      if (file.includes("/node_modules/") || !/\.(m?[jt]sx?)$/.test(file)) return undefined;
      const next = repoint(code, b.from, b.ref, { anon: b.anon, serviceRole: b.serviceRole });
      const url = `https://${b.ref}.supabase.co`;
      const text = url === b.url ? next.text : next.text.split(url).join(b.url);
      return text === code ? undefined : { code: text, map: null };
    },
  };
}

export interface RunningServer {
  urls: string[];
  /** Which backend the app talks to at start. */
  backend: "live" | "copy";
  close(): Promise<void>;
}

/** Find the `vite` the project itself uses. Never ours: the app must run with its own versions. */
export function resolveProjectVite(root: string): string {
  let dir = root;
  while (true) {
    const pkgPath = join(dir, "node_modules", "vite", "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        exports?: Record<string, unknown>;
        module?: string;
        main?: string;
      };
      const dot = pkg.exports?.["."] as Record<string, unknown> | string | undefined;
      const pick = (entry: unknown): string | undefined => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          return pick(e.import) ?? pick(e.default) ?? pick(e.node);
        }
        return undefined;
      };
      const entry = pick(dot) ?? pkg.module ?? pkg.main ?? "dist/node/index.js";
      return join(dirname(pkgPath), entry);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "This app's packages aren't installed yet. Run `npm install` in the project folder, then try again.",
  );
}

export async function startDevServer(options: DevServerOptions): Promise<RunningServer> {
  // Tools such as Tailwind 3 resolve their config from the working directory, as `vite` does when run in the app folder.
  if (process.cwd() !== options.root) process.chdir(options.root);
  const vite = (await import(
    pathToFileURL(resolveProjectVite(options.root)).href
  )) as typeof import("vite");
  let backend = await options.backend?.current();
  applyBackendEnv(backend);
  let settings = (await options.settings?.current().catch(() => ({}))) ?? {};
  applySettingsEnv(settings);
  const server = await vite.createServer({
    root: options.root,
    clearScreen: false,
    plugins: [
      backendPlugin(() => backend),
      ...(options.toolbar === false
        ? []
        : [clodablePreview({ root: options.root, backend: () => (backend ? "copy" : "live") })]),
    ],
    server: {
      ...(options.port ? { port: options.port, strictPort: true } : {}),
      ...(options.host !== undefined ? { host: options.host } : {}),
    },
  });
  await server.listen();
  // Switching backends: read again, and restart so every module and the server side pick it up.
  const watched = options.backend?.watch;
  let switching = Promise.resolve();
  if (watched && options.backend) {
    const source = options.backend;
    watchFile(watched, { interval: 1000 }, () => {
      switching = switching.then(async () => {
        let next: PreviewBackend | undefined;
        try {
          next = await source.current();
        } catch (error) {
          server.config.logger.warn(
            `  clodable · couldn't switch backends: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        if (JSON.stringify(next) === JSON.stringify(backend)) return;
        backend = next;
        applyBackendEnv(backend);
        server.config.logger.info(
          backend
            ? "  clodable · the preview now uses your new backend (a copy of your data)"
            : "  clodable · the preview uses your live backend again",
        );
        await server.restart();
      });
    });
  }
  // A setting pasted in Clodable: read them again, and restart so the server side has it.
  const settingsWatch = options.settings?.watch;
  if (settingsWatch && options.settings) {
    const source = options.settings;
    watchFile(settingsWatch, { interval: 1000 }, () => {
      switching = switching.then(async () => {
        const next = await source.current().catch(() => settings);
        if (JSON.stringify(next) === JSON.stringify(settings)) return;
        settings = next;
        applySettingsEnv(settings);
        server.config.logger.info("  clodable · your app's settings changed: restarting");
        await server.restart();
      });
    });
  }
  const urls = [...(server.resolvedUrls?.local ?? []), ...(server.resolvedUrls?.network ?? [])];
  return {
    urls,
    backend: backend ? "copy" : "live",
    close: async () => {
      if (watched) unwatchFile(watched);
      if (settingsWatch) unwatchFile(settingsWatch);
      await server.close();
    },
  };
}
