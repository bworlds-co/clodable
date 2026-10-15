import type { NewKeys } from "./fixes.js";
import { projectUrl } from "./supabase-api.js";

/** A Supabase backend the way an app's code reaches it. */
export interface Backend {
  ref: string;
  url: string;
  publishable: string;
  /** For code that carries an anon key: the legacy one if the project has it, else publishable. */
  anon: string;
  /** For server code: the legacy service key if the project has it, else the secret key. */
  serviceRole: string;
}

/** The copy the preview shows while trying a move, and the project the code names today. */
export interface PreviewBackend extends Backend {
  /** Lovable Cloud's project. */
  from?: string;
}

/** The backend behind a project's keys, as homeKeys gives them. */
export function backendOf(
  ref: string,
  keys: { publishable: string; secret: string; legacy: NewKeys },
): Backend {
  return {
    ref,
    url: projectUrl(ref),
    publishable: keys.publishable,
    anon: keys.legacy.anon ?? keys.publishable,
    serviceRole: keys.legacy.serviceRole ?? keys.secret,
  };
}

/** The variables Lovable's templates read, browser side (VITE_) and server side. */
export function backendEnv(b: Backend) {
  return {
    VITE_SUPABASE_URL: b.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: b.publishable,
    VITE_SUPABASE_ANON_KEY: b.anon,
    VITE_SUPABASE_PROJECT_ID: b.ref,
    SUPABASE_URL: b.url,
    SUPABASE_PUBLISHABLE_KEY: b.publishable,
    SUPABASE_ANON_KEY: b.anon,
    /** The only secret one: it never goes in a file that goes to GitHub, or into a page. */
    SUPABASE_SERVICE_ROLE_KEY: b.serviceRole,
  };
}

/** Their names. */
export const BACKEND_ENV = Object.keys(
  backendEnv({ ref: "", url: "", publishable: "", anon: "", serviceRole: "" }),
) as Array<keyof ReturnType<typeof backendEnv>>;

/**
 * `.env` text with these values: lines that name them are rewritten in place (quotes kept), and
 * the ones missing are added at the end.
 */
export function envWith(text: string, values: Record<string, string>): string {
  const seen = new Set<string>();
  const lines = text.split("\n").map((line) => {
    const match = line.match(/^(\s*(?:export\s+)?)([A-Z0-9_]+)(\s*=\s*)(["']?)(.*?)\4\s*$/);
    if (!match || !(match[2]! in values)) return line;
    seen.add(match[2]!);
    return `${match[1]}${match[2]}${match[3]}${match[4]}${values[match[2]!]}${match[4]}`;
  });
  const missing = Object.entries(values).filter(([key]) => !seen.has(key));
  if (missing.length === 0) return lines.join("\n");
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  return `${[...lines, ...missing.map(([key, value]) => `${key}="${value}"`)].join("\n")}\n`;
}
