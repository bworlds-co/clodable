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
