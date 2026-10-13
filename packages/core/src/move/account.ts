import { ClodableError } from "../errors.js";
import { storeSecret } from "../local-secrets.js";
import {
  type Organization,
  SUPABASE_TOKEN,
  SupabaseApi,
  type SupabaseProject,
} from "./supabase-api.js";

/**
 * The builder's Supabase account: connecting it on this computer, and what it offers for the new
 * backend (its organizations, their plans, the regions, the free projects already running).
 */

export interface OrganizationChoice {
  slug: string;
  name: string;
  plan: string;
  /** Free organizations: how many more active free projects the account may have (at most 2). */
  freeLeft?: number;
}

/** Check a Supabase access token and keep it on this computer. */
export async function connectSupabase(
  token: string,
): Promise<{ organizations: OrganizationChoice[] }> {
  const trimmed = token.trim();
  if (!/^sbp_[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    throw new ClodableError({
      code: "supabase-auth",
      message: "That doesn't look like a Supabase access token.",
      hint: "It starts with sbp_. Create one in Supabase: Account → Access Tokens → Generate new token.",
    });
  }
  const api = new SupabaseApi(trimmed);
  const organizations = await organizationChoices(api);
  await storeSecret(SUPABASE_TOKEN, trimmed);
  return { organizations };
}

export async function organizationChoices(api: SupabaseApi): Promise<OrganizationChoice[]> {
  return (await accountChoices(api)).organizations;
}

/** Free projects running now, which count toward Supabase's limit of 2 per person. */
export interface RunningFreeProject {
  name: string;
  organization: string;
}

async function accountChoices(
  api: SupabaseApi,
): Promise<{ organizations: OrganizationChoice[]; freeProjects: RunningFreeProject[] }> {
  const [organizations, projects] = await Promise.all([api.organizations(), api.projects()]);
  const detailed = await Promise.all(
    organizations.map(async (o: Organization) => ({
      ...o,
      plan: (await api.organization(o.slug).catch(() => o)).plan ?? "free",
    })),
  );
  // Free projects count across every free organization the person runs.
  const running = new Set([
    "ACTIVE_HEALTHY",
    "ACTIVE_UNHEALTHY",
    "COMING_UP",
    "UNKNOWN",
    "RESTORING",
  ]);
  const freeSlugs = new Set(detailed.filter((o) => o.plan === "free").map((o) => o.slug));
  const freeProjects = projects
    .filter((p: SupabaseProject) => freeSlugs.has(p.organization_slug) && running.has(p.status))
    .map((p) => ({
      name: p.name,
      organization: detailed.find((o) => o.slug === p.organization_slug)?.name ?? "",
    }));
  return {
    organizations: detailed.map((o) => ({
      slug: o.slug,
      name: o.name,
      plan: o.plan,
      ...(o.plan === "free" ? { freeLeft: Math.max(0, 2 - freeProjects.length) } : {}),
    })),
    freeProjects,
  };
}

export interface HomeChoices {
  organizations: OrganizationChoice[];
  /** The free projects already running: the ones to pause when the limit is reached. */
  freeProjects: RunningFreeProject[];
  /** Where Supabase suggests, from this computer's location. */
  region?: { code: string; name: string };
  regions: Array<{ code: string; name: string }>;
}

export async function homeChoices(): Promise<HomeChoices> {
  const api = await SupabaseApi.required();
  const { organizations, freeProjects } = await accountChoices(api);
  const first = organizations[0];
  if (!first) return { organizations, freeProjects, regions: [] };
  const regions = await api.regions(first.slug).catch(() => ({ all: [] }) as { all: never[] });
  return {
    organizations,
    freeProjects,
    ...("recommended" in regions && regions.recommended
      ? { region: { code: regions.recommended.code, name: regions.recommended.name } }
      : {}),
    regions: regions.all.map((r) => ({ code: r.code, name: r.name })),
  };
}

/** What a new project costs in this organization, in plain words. */
export function costOf(org: OrganizationChoice): string {
  if (org.plan === "free") return "Free";
  return "About $10 a month, added to your Supabase plan";
}
