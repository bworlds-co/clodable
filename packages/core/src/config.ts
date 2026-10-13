import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ClodableError } from "./errors.js";
import { writeJsonFile } from "./places.js";

/** `.clodable/config.json`: committed and shared by everyone working on the project. */
export const ProjectConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1).default(1),
  /** The branch the host deploys. It always equals what's live. */
  liveBranch: z.string().default("main"),
  /** Where visitors see the app. Shown after Publish. */
  liveUrl: z.url().optional(),
  app: z
    .object({
      type: z.enum(["vite-spa", "tanstack-start", "unknown"]).default("unknown"),
      /** The package.json script that builds the app for production. */
      buildScript: z.string().default("build"),
    })
    .default({ type: "unknown", buildScript: "build" }),
  supabase: z
    .object({
      projectRef: z.string().optional(),
    })
    .default({}),
  /**
   * Where the app's data lives. On Lovable Cloud, Lovable owns the database and backend functions:
   * Clodable shapes the pages, and the move to the builder's own Supabase is a guided step.
   */
  backend: z.enum(["unknown", "lovable-cloud", "supabase", "none"]).default("unknown"),
  /** Who puts the site live: a host that deploys from GitHub, or Lovable (only on its Publish click). */
  hosting: z.enum(["unknown", "github", "lovable"]).default("unknown"),
  checks: z
    .object({
      build: z.boolean().default(true),
      packages: z.boolean().default(true),
      secrets: z.boolean().default(true),
    })
    .default({ build: true, packages: true, secrets: true }),
  publish: z
    .object({
      /** Wait for the repository's own CI checks on the draft before publishing. */
      waitForCi: z.boolean().default(true),
      ciTimeoutMinutes: z.number().positive().default(20),
      deployTimeoutMinutes: z.number().positive().default(10),
    })
    .default({ waitForCi: true, ciTimeoutMinutes: 20, deployTimeoutMinutes: 10 }),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/** `.clodable/local/state.json`: this computer only (git-ignored). */
export const LocalStateSchema = z.object({
  login: z.string().optional(),
  /** The open pull request of this person's draft, if any. */
  pullRequest: z.object({ number: z.number(), url: z.string() }).optional(),
  lastPublish: z
    .object({
      sha: z.string(),
      title: z.string(),
      at: z.string(),
      url: z.string().optional(),
      prNumber: z.number().optional(),
    })
    .optional(),
});

export type LocalState = z.infer<typeof LocalStateSchema>;

export const CONFIG_PATH = ".clodable/config.json";
export const STATE_PATH = ".clodable/local/state.json";

/** Whether Clodable was set up in this project: its settings file is committed at the root. */
export function isSetUp(root: string): boolean {
  return existsSync(join(root, CONFIG_PATH));
}

export async function loadConfig(root: string): Promise<ProjectConfig> {
  const path = join(root, CONFIG_PATH);
  if (!existsSync(path)) return ProjectConfigSchema.parse({});
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new ClodableError({
      code: "invalid-config",
      message: "Clodable's settings file can't be read.",
      hint: `Check ${CONFIG_PATH} for a typo, or delete it and run \`clodable setup\` again.`,
      details: String(error),
      files: [CONFIG_PATH],
    });
  }
  const parsed = ProjectConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ClodableError({
      code: "invalid-config",
      message: "Clodable's settings file has a value it doesn't understand.",
      hint: `Check ${CONFIG_PATH}.`,
      details: z.prettifyError(parsed.error),
      files: [CONFIG_PATH],
    });
  }
  return parsed.data;
}

export function saveConfig(root: string, config: ProjectConfig): Promise<void> {
  return writeJsonFile(join(root, CONFIG_PATH), {
    $schema: "https://clodable.dev/schema/config.json",
    ...config,
  });
}

export async function loadState(root: string): Promise<LocalState> {
  const path = join(root, STATE_PATH);
  if (!existsSync(path)) return {};
  try {
    return LocalStateSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return {};
  }
}

export function saveState(root: string, state: LocalState): Promise<void> {
  return writeJsonFile(join(root, STATE_PATH), state);
}
