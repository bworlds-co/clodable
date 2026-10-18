import { ClodableError, messageOf } from "../errors.js";
import { forgetSecret, readSecret } from "../local-secrets.js";

/**
 * Supabase's Management API, with the builder's own access token: only the calls the move makes.
 * The token is read from this computer's secret store and sent nowhere but api.supabase.com; it never
 * appears in an error, a log or an event. `CLODABLE_SUPABASE_API` points it elsewhere (tests use a
 * fake), and `CLODABLE_SUPABASE_PROJECT_URL` ("http://127.0.0.1:5432/{ref}") moves project hosts.
 */

export const SUPABASE_TOKEN = "supabase-token";
export const TOKENS_PAGE = "https://supabase.com/dashboard/account/tokens";

/**
 * What a scoped token needs for the move, by call, as Supabase's access-token docs name them. A
 * token without one of these gets a 403, which then says which permission to add.
 */
const PERMISSIONS: Array<[string, RegExp, string]> = [
  ["GET", /^\/v1\/organizations$/, "Organizations: Read"],
  ["GET", /^\/v1\/organizations\/[^/]+$/, "Organization Settings: Read"],
  ["GET", /^\/v1\/projects$/, "Projects (account-wide): Read"],
  ["GET", /^\/v1\/projects\/available-regions/, "Organization Projects: Read"],
  ["POST", /^\/v1\/projects$/, "Organization Projects: Read-write"],
  ["GET", /^\/v1\/projects\/[a-z]+(\/health.*)?$/, "Project Settings: Read"],
  ["GET", /\/config\/database\/pooler$/, "Connection Pooling: Read"],
  ["PATCH", /\/database\/password$/, "Database Config: Read-write"],
  ["GET", /\/api-keys/, "API Keys: Read and API Key Secrets: Read"],
  ["POST", /\/api-keys/, "API Keys: Read-write"],
  ["POST", /\/database\/query$/, "Database: Read-write"],
  ["GET", /\/functions$/, "Edge Functions: Read"],
  ["POST", /\/functions\/deploy/, "Edge Functions: Read-write"],
  ["GET", /\/secrets$/, "Edge Function Secrets: Read"],
  ["POST", /\/secrets$/, "Edge Function Secrets: Read-write"],
  ["GET", /\/config\/storage$/, "Storage Config: Read"],
  ["PATCH", /\/config\/storage$/, "Storage Config: Read-write"],
  ["PATCH", /\/config\/auth$/, "Auth Config: Read-write and Project Settings: Read-write"],
];

/** The permission a scoped token lacks when Supabase refuses this call. */
export function permissionFor(method: string, path: string): string | undefined {
  const bare = path.split("?")[0]!;
  return PERMISSIONS.find(([m, pattern]) => m === method && pattern.test(bare))?.[2];
}

/** Every permission the move uses, for people who make a scoped token instead of a full one. */
export const MOVE_PERMISSIONS = [
  "Organizations: Read",
  "Organization Settings: Read",
  "Projects (account-wide): Read",
  "Organization Projects: Read-write",
  "Project Settings: Read-write",
  "Database: Read-write",
  "Database Config: Read-write",
  "Connection Pooling: Read",
  "API Keys: Read-write",
  "API Key Secrets: Read",
  "Edge Functions: Read-write",
  "Edge Function Secrets: Read-write",
  "Storage Config: Read-write",
  "Auth Config: Read-write",
];

export interface Organization {
  id: string;
  slug: string;
  name: string;
  plan?: "free" | "pro" | "team" | "enterprise" | "platform";
}

export interface SupabaseProject {
  id: string;
  ref: string;
  organization_slug: string;
  name: string;
  region: string;
  status: string;
  created_at: string;
}

export interface Region {
  code: string;
  name: string;
  type: "specific" | "smartGroup";
  status?: string;
}

export interface Pooler {
  database_type: "PRIMARY" | "READ_REPLICA";
  db_user: string;
  db_host: string;
  db_port: number;
  db_name: string;
  pool_mode: string;
}

export interface ApiKey {
  name: string;
  type?: "legacy" | "publishable" | "secret" | "";
  api_key?: string;
}

export interface EdgeFunction {
  slug: string;
  name: string;
  status: string;
  version: number;
  verify_jwt?: boolean;
}

/** The address of a project's own services (auth, storage, functions). */
export function projectUrl(ref: string): string {
  const template = process.env.CLODABLE_SUPABASE_PROJECT_URL;
  return template ? template.replace("{ref}", ref) : `https://${ref}.supabase.co`;
}

type Retry = "safe" | "rate-limit-only";

interface RequestOptions {
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
  /** POSTs that create something are only retried when Supabase refused them before doing anything. */
  retry?: Retry;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** One finding of Supabase's advisors. */
export interface SupabaseLint {
  name: string;
  title: string;
  level: "ERROR" | "WARN" | "INFO";
  detail?: string;
  remediation?: string;
}

export class SupabaseApi {
  private readonly base: string;

  /** The token saved on this computer: forgotten if Supabase refuses it (expired, deleted). */
  private stored = false;

  constructor(
    private readonly token: string,
    base = process.env.CLODABLE_SUPABASE_API ?? "https://api.supabase.com",
  ) {
    this.base = base.replace(/\/+$/, "");
  }

  /** The API with the token saved on this computer, or undefined if Supabase isn't connected yet. */
  static async onThisComputer(): Promise<SupabaseApi | undefined> {
    const token = await readSecret(SUPABASE_TOKEN);
    if (!token) return undefined;
    const api = new SupabaseApi(token);
    api.stored = true;
    return api;
  }

  static async required(): Promise<SupabaseApi> {
    const api = await SupabaseApi.onThisComputer();
    if (!api) {
      throw new ClodableError({
        code: "supabase-auth",
        message: "Supabase isn't connected on this computer yet.",
        hint: "Connect your Supabase account first: it's the first step of the move.",
      });
    }
    return api;
  }

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const retry = options.retry ?? (method === "GET" ? "safe" : "rate-limit-only");
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${this.base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
            "User-Agent": "clodable",
            ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          ...(options.form
            ? { body: options.form }
            : options.body !== undefined
              ? { body: JSON.stringify(options.body) }
              : {}),
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
      } catch (error) {
        if (retry === "safe" && attempt < 3) {
          await wait(1000 * attempt);
          continue;
        }
        throw new ClodableError({
          code: "offline",
          message: "Couldn't reach Supabase.",
          hint: "Check your internet connection, then try again.",
          details: messageOf(error),
        });
      }
      if (response.status === 429 && attempt < 4) {
        const after = Number(
          response.headers.get("retry-after") ?? response.headers.get("x-ratelimit-reset") ?? 5,
        );
        await wait(Math.min(Number.isFinite(after) ? after : 5, 60) * 1000);
        continue;
      }
      if (response.status >= 500 && retry === "safe" && attempt < 3) {
        await wait(1500 * attempt);
        continue;
      }
      const text = await response.text();
      if (!response.ok) {
        // A saved token Supabase refuses is no use: forgotten, the panel asks to connect again.
        if (
          response.status === 401 &&
          this.stored &&
          (await readSecret(SUPABASE_TOKEN)) === this.token
        ) {
          await forgetSecret(SUPABASE_TOKEN).catch(() => {});
        }
        if (response.status === 404 && method === "GET" && /^\/v1\/projects\/[a-z]+$/.test(path)) {
          throw new ClodableError({
            code: "not-found",
            message: "Your new backend isn't available to this Supabase account.",
            hint: "Open Supabase and check the account and project. It may have been removed or your access may have changed. Your live app hasn't changed.",
          });
        }
        throw describeFailure(response.status, text, permissionFor(method, path));
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as T;
      }
    }
  }

  organizations() {
    return this.request<Organization[]>("GET", "/v1/organizations");
  }

  organization(slug: string) {
    return this.request<Organization>("GET", `/v1/organizations/${encodeURIComponent(slug)}`);
  }

  projects() {
    return this.request<SupabaseProject[]>("GET", "/v1/projects");
  }

  project(ref: string) {
    return this.request<SupabaseProject>("GET", `/v1/projects/${ref}`);
  }

  async regions(slug: string): Promise<{ recommended?: Region; all: Region[] }> {
    const answer = await this.request<{
      recommendations?: { specific?: Region[] };
      all?: { specific?: Region[] };
    }>("GET", `/v1/projects/available-regions?organization_slug=${encodeURIComponent(slug)}`);
    const open = (list: Region[] | undefined) =>
      (list ?? []).filter((r) => r.status !== "capacity");
    const recommended = open(answer.recommendations?.specific)[0];
    return { ...(recommended ? { recommended } : {}), all: open(answer.all?.specific) };
  }

  createProject(input: { name: string; org: string; password: string; region: string }) {
    return this.request<SupabaseProject>("POST", "/v1/projects", {
      body: {
        name: input.name,
        organization_slug: input.org,
        db_pass: input.password,
        region_selection: { type: "specific", code: input.region },
      },
      timeoutMs: 60_000,
    });
  }

  health(ref: string, services: string[]) {
    return this.request<Array<{ name: string; healthy: boolean; status: string }>>(
      "GET",
      `/v1/projects/${ref}/health?services=${services.join(",")}`,
    );
  }

  async pooler(ref: string): Promise<Pooler | undefined> {
    const list = await this.request<Pooler[]>("GET", `/v1/projects/${ref}/config/database/pooler`);
    return list.find((p) => p.database_type === "PRIMARY") ?? list[0];
  }

  setPassword(ref: string, password: string) {
    return this.request<{ message: string }>("PATCH", `/v1/projects/${ref}/database/password`, {
      body: { password },
      retry: "safe",
    });
  }

  apiKeys(ref: string) {
    return this.request<ApiKey[]>("GET", `/v1/projects/${ref}/api-keys?reveal=true`);
  }

  createApiKey(ref: string, type: "publishable" | "secret") {
    return this.request<ApiKey>("POST", `/v1/projects/${ref}/api-keys?reveal=true`, {
      body: {
        type,
        name: "default",
        ...(type === "secret" ? { secret_jwt_template: { role: "service_role" } } : {}),
      },
    });
  }

  /** SQL as the dashboard's editor runs it (the `postgres` role). Rows of the last statement. */
  query<T = Record<string, unknown>>(ref: string, sql: string): Promise<T[]> {
    return this.request<T[]>("POST", `/v1/projects/${ref}/database/query`, {
      body: { query: sql },
      timeoutMs: 75_000,
      retry: "rate-limit-only",
    }).then((rows) => (Array.isArray(rows) ? rows : []));
  }

  functions(ref: string) {
    return this.request<EdgeFunction[]>("GET", `/v1/projects/${ref}/functions`);
  }

  deployFunction(
    ref: string,
    slug: string,
    metadata: {
      name: string;
      entrypoint_path: string;
      import_map_path?: string;
      verify_jwt: boolean;
    },
    files: Array<{ path: string; content: Uint8Array<ArrayBuffer> }>,
  ) {
    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    for (const file of files) form.append("file", new Blob([file.content]), file.path);
    return this.request<EdgeFunction>(
      "POST",
      `/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`,
      { form, timeoutMs: 180_000, retry: "safe" },
    );
  }

  secretNames(ref: string) {
    return this.request<Array<{ name: string }>>("GET", `/v1/projects/${ref}/secrets`).then(
      (list) => list.map((s) => s.name),
    );
  }

  setSecrets(ref: string, secrets: Array<{ name: string; value: string }>) {
    return this.request<void>("POST", `/v1/projects/${ref}/secrets`, {
      body: secrets,
      retry: "safe",
    });
  }

  /** Supabase's own advice on the project (`security`: tables without access rules, exposed data). */
  async advisors(ref: string, kind: "security" | "performance" = "security") {
    const answer = await this.request<{ lints?: SupabaseLint[] }>(
      "GET",
      `/v1/projects/${ref}/advisors/${kind}`,
    );
    return answer?.lints ?? [];
  }

  authConfig(ref: string) {
    return this.request<Record<string, unknown>>("GET", `/v1/projects/${ref}/config/auth`);
  }

  updateAuthConfig(ref: string, patch: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("PATCH", `/v1/projects/${ref}/config/auth`, {
      body: patch,
      retry: "safe",
    });
  }

  storageConfig(ref: string) {
    return this.request<{ fileSizeLimit: number }>("GET", `/v1/projects/${ref}/config/storage`);
  }

  updateStorageConfig(ref: string, patch: { fileSizeLimit: number }) {
    return this.request<void>("PATCH", `/v1/projects/${ref}/config/storage`, {
      body: patch,
      retry: "safe",
    });
  }
}

/** Supabase's answer, in the builder's words. Its own message goes to the details. */
function describeFailure(status: number, text: string, permission?: string): ClodableError {
  let message = text;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    message = body.message ?? body.error ?? text;
  } catch {
    // plain text
  }
  const details = `Supabase answered ${status}: ${message.slice(0, 500)}`;
  if (status === 401) {
    return new ClodableError({
      code: "supabase-auth",
      message: "Supabase didn't accept your access token.",
      hint: "It may have expired or been deleted. Connect your Supabase account again in the Clodable panel.",
      details,
    });
  }
  if (/active free projects/i.test(message)) {
    return new ClodableError({
      code: "supabase-limit",
      message:
        "You already run 2 free Supabase projects, the most Supabase allows per person across all your organizations.",
      hint: "Pause one you don't use in Supabase, or pick an organization on a paid plan, then try again.",
      details,
    });
  }
  if (status === 402) {
    return new ClodableError({
      code: "supabase-limit",
      message: "This goes past what your Supabase plan includes.",
      hint: "Check your plan in Supabase (Organization → Billing), then try again.",
      details,
    });
  }
  if (status === 403) {
    return new ClodableError({
      code: "supabase-auth",
      message: permission
        ? `Your Supabase access token is missing a permission: ${permission}.`
        : "Your Supabase access token isn't allowed to do this.",
      hint: "Create a new token that has it (or a full-access one: “Create legacy token”), then connect again. If the permission is there, your role in the organization may not allow it: ask its owner.",
      details,
    });
  }
  return new ClodableError({
    code: "supabase-failed",
    message: "Supabase refused the request.",
    hint: "Try again in a minute. If it keeps happening, share the details with your developer.",
    details,
  });
}
