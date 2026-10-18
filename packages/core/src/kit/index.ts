import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CONFIG_PATH,
  configFile,
  type ProjectConfig,
  ProjectConfigSchema,
  supabaseRef,
} from "../config.js";
import { NETLIFY_TOML, WORKFLOW_PATH } from "../move/site.js";
import type { ProjectInfo } from "../project.js";
import { agentsMd } from "./agents-md.js";
import { hasLocalRuntime, installRuntime, LOCAL_CLI, LOCAL_PREVIEW } from "./runtime.js";

/**
 * The repo kit: the handful of plain files that make a Lovable project a Cloclod project.
 * Every file is merged with what's already there. Nothing the project owns is overwritten.
 */

export interface KitOptions {
  /** The command Desktop's preview runs. Defaults to the project-local CLI. */
  devCommand?: { executable: string; args: string[] };
  /** Default port for the preview (Lovable apps use 8080). */
  port?: number;
  /** GitHub repository that hosts the Cloclod plugin marketplace. */
  marketplaceRepo?: string;
  liveUrl?: string;
  /** Refresh only the installed runtime and its instructions, without changing account settings. */
  runtimeOnly?: boolean;
}

export interface KitChange {
  path: string;
  action: "create" | "update" | "unchanged";
  /** Why this file matters, for the setup screen. */
  purpose: string;
  content: string;
}

/**
 * Cloclod's own files in a project: its settings and this computer's state, how Claude works here,
 * and what publishes the site to Netlify (the workflow, and how Netlify builds the app). Restoring
 * or undoing an earlier version of the app leaves them as they are now: going back past the day
 * the site went online mustn't stop it updating. `.gitignore` is the app's: it's restored, then
 * keepIgnored() puts Cloclod's lines back.
 */
export const CLOCLOD_FILES = [
  ".clodable",
  ".claude",
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
  WORKFLOW_PATH,
  NETLIFY_TOML,
];

/** One of Cloclod's own files, or a file inside one of its folders (a path from the top). */
export function cloclodFile(path: string): boolean {
  return CLOCLOD_FILES.some((own) => path === own || path.startsWith(`${own}/`));
}

/** Put Cloclod's lines back in `.gitignore` if they're missing, so this computer's state stays out of git. */
export async function keepIgnored(root: string): Promise<void> {
  await applyKit(root, [await gitignorePlan(root)]);
}

const BEGIN = "<!-- clodable:begin";
const END = "<!-- clodable:end -->";

async function read(root: string, path: string): Promise<string | undefined> {
  const full = join(root, path);
  return existsSync(full) ? readFile(full, "utf8") : undefined;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

export function mergeManagedBlock(existing: string | undefined, generated: string): string {
  const block = generated.slice(generated.indexOf(BEGIN), generated.indexOf(END) + END.length);
  if (!existing) return generated;
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if (start >= 0 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }
  return `${existing.trimEnd()}\n\n## Working with Cloclod\n\n${block}\n`;
}

/** The kit for this project, file by file: what each change is for, and its new content. */
export async function planKit(
  project: ProjectInfo,
  config: ProjectConfig,
  options: KitOptions = {},
): Promise<KitChange[]> {
  const root = project.root;
  const ref = supabaseRef(config, project);
  if (options.runtimeOnly) {
    return [
      await agentsPlan(root, project, config, ref),
      await launchPlan(root, options),
      await gitignorePlan(root),
    ];
  }
  const planned = [
    await agentsPlan(root, project, config, ref),
    await claudePlan(root),
    await launchPlan(root, options),
    await settingsPlan(root, options),
    await mcpPlan(root, config, ref),
    await configPlan(root, project, config, ref, options),
    await gitignorePlan(root),
  ];
  return planned.filter((file) => file !== undefined);
}

/** A file's change: created, updated, or left as it is. */
function change(
  path: string,
  purpose: string,
  before: string | undefined,
  content: string,
): KitChange {
  return {
    path,
    purpose,
    content,
    action: before === undefined ? "create" : before === content ? "unchanged" : "update",
  };
}

/** AGENTS.md: the shared working agreement for any coding agent. */
async function agentsPlan(
  root: string,
  project: ProjectInfo,
  config: ProjectConfig,
  ref: string | undefined,
): Promise<KitChange> {
  const before = await read(root, "AGENTS.md");
  return change(
    "AGENTS.md",
    "How Claude should work with you: plain words, careful with live data",
    before,
    mergeManagedBlock(
      before,
      agentsMd({
        appName: project.name,
        appType: project.appType,
        liveBranch: config.liveBranch,
        supabaseRef: ref,
        backend: config.backend,
        hosting: config.hosting,
        cliCommand: hasLocalRuntime(root) ? `node "${LOCAL_CLI}"` : undefined,
      }),
    ),
  );
}

/** CLAUDE.md just points Claude at AGENTS.md, so every agent reads the same rules. */
async function claudePlan(root: string): Promise<KitChange> {
  const before = await read(root, "CLAUDE.md");
  const after = !before
    ? "@AGENTS.md\n"
    : before.includes("@AGENTS.md")
      ? before
      : `${before.trimEnd()}\n\n@AGENTS.md\n`;
  return change("CLAUDE.md", "Points Claude to AGENTS.md", before, after);
}

/** .claude/launch.json: how Desktop starts the preview. */
async function launchPlan(root: string, options: KitOptions): Promise<KitChange> {
  const before = await read(root, ".claude/launch.json");
  const launch = parseJson<{ version?: string; configurations?: Array<Record<string, unknown>> }>(
    before,
    {},
  );
  const existing = launch.configurations?.find((configuration) => configuration.name === "app");
  const override = cloclodDev(launch.configurations ?? []);
  if (options.runtimeOnly && override && before) {
    return change(
      ".claude/launch.json",
      "Keeps your explicit Cloclod preview command",
      before,
      before,
    );
  }
  const dev =
    options.devCommand ??
    override ??
    (hasLocalRuntime(root) ? installedPreviewCommand() : previewCommand());
  const ours = {
    name: "app",
    runtimeExecutable: dev.executable,
    runtimeArgs: dev.args,
    // Lovable's templates, classic and TanStack Start, both serve on 8080.
    port:
      options.port ??
      (options.runtimeOnly && typeof existing?.port === "number" ? existing.port : 8080),
    autoPort:
      options.runtimeOnly && typeof existing?.autoPort === "boolean" ? existing.autoPort : true,
  };
  const others = (launch.configurations ?? []).filter(
    (c) =>
      !(Array.isArray(c.runtimeArgs) && (c.runtimeArgs as string[]).includes("cloclod")) &&
      c.name !== "app",
  );
  return change(
    ".claude/launch.json",
    "Starts your app in the preview, with the Cloclod toolbar",
    before,
    json({ version: launch.version ?? "0.0.1", configurations: [ours, ...others] }),
  );
}

/**
 * Where the plugin keeps the tools it fetched for a builder who has none (Node.js, the GitHub CLI),
 * as a shell spells it on macOS and Linux: `bin` in the tools folder of the data folder Claude
 * Code gives `cloclod@cloclod`, the plugin these settings turn on.
 */
const TOOLS_PATH = "$HOME/.claude/plugins/data/cloclod-cloclod/tools/bin";

function installedPreviewCommand(): { executable: string; args: string[] } {
  return process.platform === "win32"
    ? { executable: "node", args: [LOCAL_CLI, "dev"] }
    : { executable: "/bin/sh", args: [LOCAL_PREVIEW] };
}

/**
 * How Desktop starts the preview: `npx cloclod dev`. Desktop starts it with its own PATH, where
 * the Node.js Cloclod fetched isn't, so on macOS and Linux it goes through `sh`, with Cloclod's
 * tools after the builder's own.
 */
export function previewCommand(platform: NodeJS.Platform = process.platform): {
  executable: string;
  args: string[];
} {
  if (platform === "win32") return { executable: "npx", args: ["cloclod", "dev"] };
  return {
    executable: "/bin/sh",
    args: ["-c", `PATH="$PATH:${TOOLS_PATH}" exec npx cloclod dev`],
  };
}

/**
 * The preview's command already in launch.json, when it runs Cloclod's own: a demo, or a test of
 * an unreleased Cloclod, runs it from a folder rather than from npm, and planning the kit again
 * (answering a question, say) keeps it. Earlier versions' own, plain `npx cloclod dev` or through
 * `sh` with another tools folder, becomes today's.
 */
function cloclodDev(
  configurations: Array<Record<string, unknown>>,
): { executable: string; args: string[] } | undefined {
  const app = configurations.find((c) => c.name === "app");
  const executable = app?.runtimeExecutable;
  const args = app?.runtimeArgs;
  if (typeof executable !== "string" || !Array.isArray(args)) return undefined;
  const words = [executable, ...args].map(String);
  const command = words.join(" ");
  if (args.includes(LOCAL_PREVIEW) || args.includes(LOCAL_CLI)) return undefined;
  if (command === "npx cloclod dev") return undefined;
  if (/^\/bin\/sh -c PATH="\$PATH:[^"]*" exec npx cloclod dev$/.test(command)) return undefined;
  return words.some((w) => w.includes("cloclod")) && words.includes("dev")
    ? { executable, args: args.map(String) }
    : undefined;
}

/** .claude/settings.json: the plugin, plus safe permission defaults for any session in this folder. */
async function settingsPlan(root: string, options: KitOptions): Promise<KitChange> {
  const before = await read(root, ".claude/settings.json");
  // biome-ignore lint/suspicious/noExplicitAny: the person's own settings file, in whatever shape it has
  const settings = parseJson<Record<string, any>>(before, {});
  const marketplace = options.marketplaceRepo ?? "bworlds-co/cloclod";
  const permissions = settings.permissions ?? {};
  return change(
    ".claude/settings.json",
    "Turns on Cloclod for this project and keeps the live site safe",
    before,
    json({
      ...settings,
      enabledPlugins: { ...settings.enabledPlugins, "cloclod@cloclod": true },
      extraKnownMarketplaces: {
        ...settings.extraKnownMarketplaces,
        // Kept up to date on its own: a marketplace that isn't Anthropic's doesn't auto-update otherwise.
        cloclod: { source: { source: "github", repo: marketplace }, autoUpdate: true },
      },
      permissions: {
        ...permissions,
        allow: union(permissions.allow, [
          "Bash(npx cloclod status:*)",
          "Bash(npx cloclod check:*)",
          "Bash(npx cloclod history:*)",
          "Bash(npm run build)",
          "Bash(npm run lint)",
          "Bash(npm install)",
          "Bash(git status)",
          "Bash(git diff:*)",
          "Bash(git log:*)",
          "Bash(git show:*)",
        ]),
        ask: union(permissions.ask, ["mcp__supabase__apply_migration"]),
        deny: union(permissions.deny, [
          "Bash(git push:*)",
          "Bash(git reset --hard:*)",
          "Bash(gh pr merge:*)",
          "Bash(npx cloclod publish:*)",
          "Bash(npx cloclod undo:*)",
          "mcp__supabase__deploy_edge_function",
        ]),
      },
    }),
  );
}

/**
 * .mcp.json: the official Supabase connection, scoped to this app's project only. Not on Lovable
 * Cloud: Lovable owns that project, so the builder's Supabase login can't reach it.
 */
async function mcpPlan(
  root: string,
  config: ProjectConfig,
  ref: string | undefined,
): Promise<KitChange | undefined> {
  if (config.backend === "lovable-cloud") {
    const before = await read(root, ".mcp.json");
    const mcp = parseJson<{ mcpServers?: Record<string, { url?: string }> }>(before, {});
    const ours = mcp.mcpServers?.supabase?.url?.startsWith("https://mcp.supabase.com/");
    if (before === undefined || !ours) return undefined;
    const { supabase: _, ...others } = mcp.mcpServers ?? {};
    return change(
      ".mcp.json",
      "No Supabase connection while your database is on Lovable Cloud",
      before,
      json({ ...mcp, mcpServers: others }),
    );
  }
  if (!ref) return undefined;
  const before = await read(root, ".mcp.json");
  const mcp = parseJson<{ mcpServers?: Record<string, unknown> }>(before, {});
  const features = ["database", "docs", "debugging", "development", "functions", "storage"].join(
    ",",
  );
  return change(
    ".mcp.json",
    "Connects Claude to your Supabase database, for this app only",
    before,
    json({
      ...mcp,
      mcpServers: {
        ...mcp.mcpServers,
        supabase: {
          type: "http",
          url: `https://mcp.supabase.com/mcp?project_ref=${ref}&features=${encodeURIComponent(features)}`,
        },
      },
    }),
  );
}

/** .clodable/config.json: project settings shared by everyone. */
async function configPlan(
  root: string,
  project: ProjectInfo,
  config: ProjectConfig,
  ref: string | undefined,
  options: KitOptions,
): Promise<KitChange> {
  const before = await read(root, CONFIG_PATH);
  const next = ProjectConfigSchema.parse({
    ...config,
    app: { ...config.app, type: project.appType },
    supabase: { ...config.supabase, ...(ref ? { projectRef: ref } : {}) },
    ...(options.liveUrl ? { liveUrl: options.liveUrl } : {}),
  });
  return change(CONFIG_PATH, "Cloclod's settings for this project", before, json(configFile(next)));
}

/** .gitignore: keep this computer's state and the inbox out of git. */
async function gitignorePlan(root: string): Promise<KitChange> {
  const before = await read(root, ".gitignore");
  const wanted = [".clodable/local/", ".clodable/inbox/"];
  const missing = wanted.filter(
    (line) => !(before ?? "").split("\n").some((l) => l.trim() === line),
  );
  return change(
    ".gitignore",
    "Keeps Cloclod's local files out of your project history",
    before,
    missing.length === 0
      ? (before ?? "")
      : `${(before ?? "").trimEnd()}${before ? "\n\n" : ""}# Cloclod (this computer only)\n${missing.join("\n")}\n`,
  );
}

export async function applyKit(root: string, changes: KitChange[]): Promise<KitChange[]> {
  // Install before pointing Desktop at the bundle; a failed copy leaves the old launch usable.
  if (changes.some((change) => change.path === ".claude/launch.json")) await installRuntime(root);
  const written: KitChange[] = [];
  for (const change of changes) {
    if (change.action === "unchanged") continue;
    const full = join(root, change.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, change.content);
    written.push(change);
  }
  return written;
}
