import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type AppType = "vite-spa" | "tanstack-start" | "unknown";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface ProjectInfo {
  root: string;
  name: string;
  appType: AppType;
  packageManager: PackageManager;
  scripts: Record<string, string>;
  /** Signs that Lovable generated or still manages parts of this app. */
  lovable: {
    generated: boolean;
    usesLovableAi: boolean;
    files: string[];
    /** The project in Lovable's editor (`https://lovable.dev/projects/<id>`), from the README. */
    projectUrl?: string;
    /** The app's address on Lovable's hosting (`https://<name>.lovable.app`), from the README. */
    appUrl?: string;
  };
  supabase: {
    used: boolean;
    /** The Supabase project ref the app talks to, if it can be read from the code. */
    projectRef: string | undefined;
    hasMigrations: boolean;
    hasEdgeFunctions: boolean;
  };
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function readPackageJson(root: string): Promise<PackageJson | undefined> {
  const path = join(root, "package.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(await readFile(path, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

export function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  // Lovable projects often carry both bun.lockb and package-lock.json; npm is the safer default.
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return "bun";
  return "npm";
}

export function runScriptCommand(pm: PackageManager, script: string): [string, string[]] {
  switch (pm) {
    case "pnpm":
      return ["pnpm", ["run", script]];
    case "yarn":
      return ["yarn", ["run", script]];
    case "bun":
      return ["bun", ["run", script]];
    default:
      return ["npm", ["run", script, "--silent"]];
  }
}

const SUPABASE_URL = /https:\/\/([a-z0-9]{20})\.supabase\.co/;

/** Lovable's templates ship generic package names ("vite_react_shadcn_ts"); the folder says more. */
const TEMPLATE_NAMES =
  /^(vite[_-]react[_-]shadcn[_-]ts|tanstack[_-]start[_-]ts|vite[_-]project|my[_-]app|app)$/i;

export function friendlyName(packageName: string | undefined, root: string): string {
  const folder = root.split(/[\\/]/).filter(Boolean).pop() ?? "app";
  if (!packageName || TEMPLATE_NAMES.test(packageName)) return folder;
  return packageName;
}

export async function detectProject(root: string): Promise<ProjectInfo> {
  const pkg = (await readPackageJson(root)) ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (name: string) => name in deps;

  const appType: AppType =
    has("@tanstack/react-start") || has("@lovable.dev/vite-tanstack-config")
      ? "tanstack-start"
      : has("vite") && (has("react") || has("react-dom"))
        ? "vite-spa"
        : "unknown";

  const lovableFiles: string[] = [];
  if (has("lovable-tagger")) lovableFiles.push("package.json (lovable-tagger)");
  if (Object.keys(deps).some((d) => d.startsWith("@lovable.dev/"))) {
    lovableFiles.push("package.json (@lovable.dev)");
  }
  if (existsSync(join(root, ".lovable"))) lovableFiles.push(".lovable/");

  const supabaseDir = join(root, "supabase");
  const clientCandidates = [
    "src/integrations/supabase/client.ts",
    "src/integrations/supabase/client.js",
    "src/lib/supabase.ts",
    "src/integrations/supabase/client.server.ts",
  ];
  let projectRef: string | undefined;
  for (const candidate of clientCandidates) {
    const path = join(root, candidate);
    if (!existsSync(path)) continue;
    const match = (await readFile(path, "utf8")).match(SUPABASE_URL);
    if (match) {
      projectRef = match[1];
      break;
    }
  }
  if (!projectRef && existsSync(join(supabaseDir, "config.toml"))) {
    const toml = await readFile(join(supabaseDir, "config.toml"), "utf8");
    projectRef = toml.match(/^project_id\s*=\s*"([a-z0-9]{20})"/m)?.[1];
  }
  if (!projectRef) {
    for (const envFile of [".env", ".env.local", ".env.production"]) {
      const path = join(root, envFile);
      if (!existsSync(path)) continue;
      const match = (await readFile(path, "utf8")).match(SUPABASE_URL);
      if (match) {
        projectRef = match[1];
        break;
      }
    }
  }

  // Lovable's README links the project in its editor, and often the published address.
  const readme = existsSync(join(root, "README.md"))
    ? await readFile(join(root, "README.md"), "utf8").catch(() => "")
    : "";
  const projectUrl = readme.match(/https:\/\/lovable\.dev\/projects\/[0-9a-f-]{36}/)?.[0];
  const appUrl = readme.match(/https:\/\/[a-z0-9-]+\.lovable\.app/)?.[0];

  const usesLovableAi = await mentions(root, CODE_DIRS, LOVABLE_AI);

  return {
    root,
    name: friendlyName(pkg.name, root),
    appType,
    packageManager: detectPackageManager(root),
    scripts: pkg.scripts ?? {},
    lovable: {
      generated: lovableFiles.length > 0,
      usesLovableAi,
      files: lovableFiles,
      ...(projectUrl ? { projectUrl } : {}),
      ...(appUrl ? { appUrl } : {}),
    },
    supabase: {
      used: has("@supabase/supabase-js") || existsSync(supabaseDir),
      projectRef,
      hasMigrations:
        existsSync(join(supabaseDir, "migrations")) ||
        existsSync(join(root, "drizzle", "migrations")),
      hasEdgeFunctions: existsSync(join(supabaseDir, "functions")),
    },
  };
}

/** Shallow search: does any text file under these folders match? Bounded, so it stays fast. */
/**
 * Lovable's AI in an app's code: its gateway, or TanStack AI's Lovable adapter. Not LOVABLE_API_KEY
 * on its own: Lovable's connectors and email API read the same key.
 */
export const LOVABLE_AI =
  /ai\.gateway\.lovable\.dev|@tanstack\/ai-lovable|\blovableText\b|\bcreateLovable\b/;

/** Where an app's own code lives: its pages, its server code, its backend functions. */
export const CODE_DIRS = ["src", "server", "app", "supabase/functions"];

async function mentions(
  root: string,
  dirs: string[],
  pattern: RegExp,
  budget = 400,
): Promise<boolean> {
  let seen = 0;
  const walk = async (dir: string): Promise<boolean> => {
    if (!existsSync(dir) || seen > budget) return false;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (seen++ > budget) return false;
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (await walk(path)) return true;
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        if (pattern.test(await readFile(path, "utf8"))) return true;
      }
    }
    return false;
  };
  for (const dir of dirs) if (await walk(join(root, dir))) return true;
  return false;
}
