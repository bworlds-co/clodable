import { promises as dns } from "node:dns";
import { saveConfig } from "../config.js";
import { ClodableError } from "../errors.js";
import type { Workspace } from "../workspace.js";
import { NetlifyApi } from "./netlify-api.js";
import { liveSignIn } from "./sign-in.js";
import { loadMove, type MoveState, updateMove } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/**
 * The app's own domain (yourapp.com), moved to its site on Netlify once it's live there: before
 * Lovable goes, so nobody lands on an app whose backend is gone. Clodable adds it to the site, says
 * which records change at the domain's provider, checks them, then points sign-in links at it.
 */

/** Netlify's load balancer, for a domain without a subdomain (its docs: an A record). */
export const NETLIFY_APEX_IP = "75.2.60.5";

const TWO_PART_SUFFIXES = /\.(co|com|org|net|ac|gov)\.(uk|au|nz|jp|br|za|in|il|kr|mx|ar|tr)$/;

/** yourapp.com (or yourapp.co.uk): no subdomain in front. */
export function isApex(domain: string): boolean {
  const labels = domain.split(".").length;
  return TWO_PART_SUFFIXES.test(domain) ? labels === 3 : labels === 2;
}

/** A domain name as people write it: yourapp.com, mail.yourapp.co.uk. */
export const isDomainName = (name: string) => /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(name);

function clean(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

/** What the domain's provider holds for it now, as Netlify needs it. Tests answer from a file. */
async function pointsToNetlify(domain: string, siteHost: string): Promise<boolean> {
  const fake = process.env.CLODABLE_FAKE_DNS;
  if (fake) {
    const table = JSON.parse(fake) as Record<string, { A?: string[]; CNAME?: string[] }>;
    const entry = table[domain] ?? {};
    return (entry.A ?? []).includes(NETLIFY_APEX_IP) || (entry.CNAME ?? []).includes(siteHost);
  }
  const [a, cname] = await Promise.all([
    dns.resolve4(domain).catch(() => [] as string[]),
    dns.resolveCname(domain).catch(() => [] as string[]),
  ]);
  return (
    a.includes(NETLIFY_APEX_IP) ||
    cname.some((c) => c.replace(/\.$/, "") === siteHost || c.endsWith(".netlify.app"))
  );
}

export interface DomainOutcome {
  name: string;
  records: NonNullable<NonNullable<MoveState["domain"]>["records"]>;
  ready: boolean;
  url: string;
}

/** Add the domain to the site (or look at its records again), and finish once they point here. */
export async function setDomain(ws: Workspace, input?: string): Promise<DomainOutcome> {
  const state = await loadMove(ws.root);
  if (!state.site || !state.switch?.liveAt) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Go live on your new site first.",
      hint: "Your domain moves once the app works at its Netlify address.",
    });
  }
  const name = clean(input ?? state.domain?.name ?? "");
  if (!isDomainName(name) || name.endsWith(".lovable.app") || name.endsWith(".netlify.app")) {
    throw new ClodableError({
      code: "invalid-config",
      message: name ? `“${name}” isn't a domain of your own.` : "Which domain?",
      hint: "The one your app uses, like yourapp.com or app.yourapp.com.",
    });
  }
  const siteHost = new URL(state.site.url).host;
  const netlify = await NetlifyApi.required();
  if (state.domain?.name !== name) await netlify.setCustomDomain(state.site.id, name);
  const records = isApex(name)
    ? [
        { type: "A", name: "@", value: NETLIFY_APEX_IP },
        { type: "CNAME", name: "www", value: siteHost },
      ]
    : [{ type: "CNAME", name: name.split(".")[0]!, value: siteHost }];
  const ready = await pointsToNetlify(name, siteHost);
  const url = `https://${name}`;
  if (ready) {
    await netlify.provisionCertificate(state.site.id).catch(() => {});
    // Sign-in links (confirmations, password resets) come back to the domain now.
    const supabase = await SupabaseApi.required();
    if (state.home) await liveSignIn(supabase, state.home.ref, url);
    await saveConfig(ws.root, { ...ws.config, liveUrl: url });
  }
  await updateMove(ws.root, (s) => {
    s.domain = {
      name,
      records,
      ...(ready ? { readyAt: s.domain?.readyAt ?? new Date().toISOString() } : {}),
    };
  });
  return { name, records, ready, url };
}

/** The app keeps its Netlify address. */
export async function skipDomain(ws: Workspace): Promise<{ skipped: true }> {
  await updateMove(ws.root, (s) => {
    s.domain = { skipped: true };
  });
  return { skipped: true };
}
