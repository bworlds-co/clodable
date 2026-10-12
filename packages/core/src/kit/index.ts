import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONFIG_PATH, type ProjectConfig, ProjectConfigSchema } from "../config.js";
import type { ProjectInfo } from "../project.js";
import { agentsMd } from "./agents-md.js";

/**
 * The repo kit: the handful of plain files that make a Lovable project a Clodable project.
 * Every file is merged with what's already there. Nothing the project owns is overwritten.
 */

export interface KitOptions {
  /** The command Desktop's preview runs. Defaults to the project-local CLI. */
  devCommand?: { executable: string; args: string[] };
  /** Default port for the preview (Lovable apps use 8080). */
  port?: number;
  /** GitHub repository that hosts the Clodable plugin marketplace. */
  marketplaceRepo?: string;
  liveUrl?: string;
}

export interface KitChange {
  path: string;
  action: "create" | "update" | "unchanged";
  /** Why this file matters, for the setup screen. */
  purpose: string;
  content: string;
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
  return `${existing.trimEnd()}\n\n## Working with Clodable\n\n${block}\n`;
}

export async function planKit(
  project: ProjectInfo,
  config: ProjectConfig,
  options: KitOptions = {},
): Promise<KitChange[]> {
  const root = project.root;
  const changes: KitChange[] = [];
  const add = (path: string, purpose: string, before: string | undefined, content: string) => {
    changes.push({
      path,
      purpose,
      content,
      action: before === undefined ? "create" : before === content ? "unchanged" : "update",
    });
  };

  // AGENTS.md: the shared working agreement for any coding agent.
  const agentsBefore = await read(root, "AGENTS.md");
  add(
    "AGENTS.md",
    "How Claude should work with you: plain words, careful with live data",
    agentsBefore,
    mergeManagedBlock(
      agentsBefore,
      agentsMd({
        appName: project.name,
        appType: project.appType,
        liveBranch: config.liveBranch,
        supabaseRef: config.supabase.projectRef ?? project.supabase.projectRef,
        backend: config.backend,
        hosting: config.hosting,
      }),
    ),
  );

  // CLAUDE.md just points Claude at AGENTS.md, so every agent reads the same rules.
  const claudeBefore = await read(root, "CLAUDE.md");
  const claudeAfter = !claudeBefore
    ? "@AGENTS.md\n"
    : claudeBefore.includes("@AGENTS.md")
      ? claudeBefore
      : `${claudeBefore.trimEnd()}\n\n@AGENTS.md\n`;
  add("CLAUDE.md", "Points Claude to AGENTS.md", claudeBefore, claudeAfter);

  // .claude/launch.json: how Desktop starts the preview.
  const launchBefore = await read(root, ".claude/launch.json");
  const launch = parseJson<{ version?: string; configurations?: Array<Record<string, unknown>> }>(
    launchBefore,
    {},
  );
  const dev = options.devCommand ?? { executable: "npx", args: ["clodable", "dev"] };
  const ours = {
    name: "app",
    runtimeExecutable: dev.executable,
    runtimeArgs: dev.args,
    // Lovable's templates, classic and TanStack Start, both serve on 8080.
    port: options.port ?? 8080,
    autoPort: true,
  };
  const others = (launch.configurations ?? []).filter(
    (c) =>
      !(Array.isArray(c.runtimeArgs) && (c.runtimeArgs as string[]).includes("clodable")) &&
      c.name !== "app",
  );
  add(
    ".claude/launch.json",
    "Starts your app in the preview, with the Clodable toolbar",
    launchBefore,
    json({ version: launch.version ?? "0.0.1", configurations: [ours, ...others] }),
  );

  // .claude/settings.json: the plugin, plus safe permission defaults for any session in this folder.
  const settingsBefore = await read(root, ".claude/settings.json");
  // biome-ignore lint/suspicious/noExplicitAny: the person's own settings file, in whatever shape it has
  const settings = parseJson<Record<string, any>>(settingsBefore, {});
  const marketplace = options.marketplaceRepo ?? "bworlds-co/clodable";
  const permissions = settings.permissions ?? {};
  add(
    ".claude/settings.json",
    "Turns on Clodable for this project and keeps the live site safe",
    settingsBefore,
    json({
      ...settings,
      enabledPlugins: { ...settings.enabledPlugins, "clodable@clodable": true },
      extraKnownMarketplaces: {
        ...settings.extraKnownMarketplaces,
        // Kept up to date on its own: a marketplace that isn't Anthropic's doesn't auto-update otherwise.
        clodable: { source: { source: "github", repo: marketplace }, autoUpdate: true },
      },
      permissions: {
        ...permissions,
        allow: union(permissions.allow, [
          "Bash(npx clodable status:*)",
          "Bash(npx clodable check:*)",
          "Bash(npx clodable history:*)",
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
          "Bash(npx clodable publish:*)",
          "Bash(npx clodable undo:*)",
          "mcp__supabase__deploy_edge_function",
        ]),
      },
    }),
  );

  // .mcp.json: the official Supabase connection, scoped to this app's project only. Not on Lovable
  // Cloud: Lovable owns that project, so the builder's Supabase login can't reach it.
  const ref = config.supabase.projectRef ?? project.supabase.projectRef;
  if (config.backend === "lovable-cloud") {
    const mcpBefore = await read(root, ".mcp.json");
    const mcp = parseJson<{ mcpServers?: Record<string, { url?: string }> }>(mcpBefore, {});
    const ours = mcp.mcpServers?.supabase?.url?.startsWith("https://mcp.supabase.com/");
    if (mcpBefore !== undefined && ours) {
      const { supabase: _, ...others } = mcp.mcpServers ?? {};
      add(
        ".mcp.json",
        "No Supabase connection while your database is on Lovable Cloud",
        mcpBefore,
        json({ ...mcp, mcpServers: others }),
      );
    }
  } else if (ref) {
    const mcpBefore = await read(root, ".mcp.json");
    const mcp = parseJson<{ mcpServers?: Record<string, unknown> }>(mcpBefore, {});
    const features = ["database", "docs", "debugging", "development", "functions", "storage"].join(
      ",",
    );
    add(
      ".mcp.json",
      "Connects Claude to your Supabase database, for this app only",
      mcpBefore,
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

  // .clodable/config.json: project settings shared by everyone.
  const configBefore = await read(root, CONFIG_PATH);
  const nextConfig = ProjectConfigSchema.parse({
    ...config,
    app: { ...config.app, type: project.appType },
    supabase: { ...config.supabase, ...(ref ? { projectRef: ref } : {}) },
    ...(options.liveUrl ? { liveUrl: options.liveUrl } : {}),
  });
  add(
    CONFIG_PATH,
    "Clodable's settings for this project",
    configBefore,
    json({ $schema: "https://clodable.dev/schema/config.json", ...nextConfig }),
  );

  // .gitignore: keep this computer's state and the inbox out of git.
  const ignoreBefore = await read(root, ".gitignore");
  const wanted = [".clodable/local/", ".clodable/inbox/"];
  const missing = wanted.filter(
    (line) => !(ignoreBefore ?? "").split("\n").some((l) => l.trim() === line),
  );
  add(
    ".gitignore",
    "Keeps Clodable's local files out of your project history",
    ignoreBefore,
    missing.length === 0
      ? (ignoreBefore ?? "")
      : `${(ignoreBefore ?? "").trimEnd()}${ignoreBefore ? "\n\n" : ""}# Clodable (this computer only)\n${missing.join("\n")}\n`,
  );

  return changes;
}

export async function applyKit(root: string, changes: KitChange[]): Promise<KitChange[]> {
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
