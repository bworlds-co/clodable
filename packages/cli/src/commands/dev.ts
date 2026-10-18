import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  detectPackageManager,
  exec,
  loadMove,
  localSettings,
  MOVE_PATH,
  messageOf,
  type PreviewBackend,
  previewBackend,
  SETTINGS_PATH,
} from "@clodable/core";
import { startDevServer } from "@clodable/preview";
import pc from "picocolors";
import type { Context } from "../context.js";
import { ash, clay, link, oxide } from "../ui.js";

function findAppRoot(start: string): string {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/** Start the app's own dev server with Cloclod's preview toolbar. This is what Claude Desktop's preview runs. */
export async function devCommand(
  ctx: Context,
  options: { port?: number; host?: string; toolbar?: boolean },
) {
  const root = findAppRoot(ctx.cwd);
  // First run on a new computer: install the app's packages, so the preview just starts.
  if (!existsSync(join(root, "node_modules")) && existsSync(join(root, "package.json"))) {
    const pm = detectPackageManager(root);
    process.stdout.write(
      `\n  ${clay("●")} ${pc.bold("cloclod")} ${ash("·")} installing your app's packages (first time only)…\n`,
    );
    const installed = await exec(pm, ["install"], { cwd: root, timeout: 15 * 60_000 });
    if (installed.exitCode !== 0) {
      process.stderr.write(
        `\n  ${oxide("✕")} ${pc.bold("Your app's packages couldn't be installed.")}\n\n    ${installed.stderr.trim().split("\n").slice(-6).join("\n    ")}\n\n`,
      );
      process.exitCode = 1;
      return;
    }
  }
  const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
  const port = options.port ?? envPort;
  try {
    // Keys are fetched once per backend, then kept in this process's memory only.
    const known = new Map<string, PreviewBackend>();
    const server = await startDevServer({
      root,
      ...(port ? { port } : {}),
      ...(options.host ? { host: options.host } : {}),
      toolbar: options.toolbar !== false,
      backend: {
        current: async () => {
          const move = await loadMove(root);
          if (move.preview !== "copy" || !move.home) return undefined;
          const cached = known.get(move.home.ref);
          if (cached) return cached;
          const fresh = await previewBackend(root);
          if (fresh) known.set(move.home.ref, fresh);
          return fresh;
        },
        watch: join(root, MOVE_PATH),
      },
      // The settings the app's server code reads, from Cloclod's private store on this computer.
      settings: { current: () => localSettings(root), watch: join(root, SETTINGS_PATH) },
    });
    process.stdout.write(
      `\n  ${clay("●")} ${pc.bold("cloclod")} ${ash("·")} your app is running${server.backend === "copy" ? ash(" on your new backend (a copy of your data)") : ""}\n\n`,
    );
    for (const url of server.urls.slice(0, 2)) process.stdout.write(`    ${link(url)}\n`);
    process.stdout.write(
      `\n  ${ash("Preview tools: Edit text (⌥⇧E) · Point & ask (⌥⇧A). Only you see them.")}\n\n`,
    );
    const stop = () => {
      void server.close().then(() => process.exit(0));
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (error) {
    process.stderr.write(
      `\n  ${oxide("✕")} ${pc.bold("Your app couldn't start.")}\n\n    ${messageOf(error)}\n\n`,
    );
    process.exitCode = 1;
  }
}
