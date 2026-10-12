import { ClodableError } from "../errors.js";
import { type Flow, step } from "../events.js";
import { storeSecret } from "../local-secrets.js";
import type { Workspace } from "../workspace.js";
import { RESEND_KEY, ResendApi } from "./resend-api.js";
import { loadMove, type MoveState, updateMove } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/**
 * Emails for real people: Supabase's built-in sender only writes to the project's own team, so
 * sign-up and password-reset emails go through the builder's Resend account, from their own domain.
 * Resend's DNS records are added by the builder at their domain's provider; Clodable checks them,
 * then gives Supabase a key that can only send from that domain.
 */

export async function connectResend(key: string): Promise<{ domains: string[] }> {
  const trimmed = key.trim();
  if (!/^re_[A-Za-z0-9_]{10,}$/.test(trimmed)) {
    throw new ClodableError({
      code: "resend-auth",
      message: "That doesn't look like a Resend key.",
      hint: "It starts with re_. In Resend: API Keys → Create API Key, with Full access.",
    });
  }
  const api = new ResendApi(trimmed);
  const domains = await api.domains();
  await storeSecret(RESEND_KEY, trimmed);
  return { domains: domains.map((d) => d.name) };
}

/**
 * Going live without emails of their own, for builders without a domain yet: new people sign up
 * without confirming, and nobody receives a password-reset email. Setting emails up later undoes it.
 */
export async function skipEmails(ws: Workspace): Promise<{ noEmailsAt: string }> {
  const noEmailsAt = new Date().toISOString();
  await updateMove(ws.root, (s) => {
    s.switch = { ...s.switch, noEmailsAt };
  });
  return { noEmailsAt };
}

/** The Resend region nearest the new backend. */
function regionFor(supabaseRegion: string): string {
  if (supabaseRegion.startsWith("eu-")) return "eu-west-1";
  if (supabaseRegion.startsWith("sa-")) return "sa-east-1";
  if (supabaseRegion.startsWith("ap-")) return "ap-northeast-1";
  return "us-east-1";
}

export interface EmailsOutcome {
  domain: string;
  sender: string;
  /** "verified", or Resend's status while the DNS records aren't seen yet. */
  status: string;
  records: NonNullable<MoveState["emails"]>["records"];
  /** Supabase now sends through Resend. */
  connected: boolean;
}

const domainPattern = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

export async function* setUpEmails(
  ws: Workspace,
  options: { domain?: string; sender?: string } = {},
): Flow<EmailsOutcome> {
  const state = await loadMove(ws.root);
  if (!state.home) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Create your new backend first: emails are sent from it.",
    });
  }
  const domain = (options.domain ?? state.emails?.domain ?? "").trim().toLowerCase();
  if (!domainPattern.test(domain)) {
    throw new ClodableError({
      code: "move-not-ready",
      message: domain
        ? `“${domain}” isn't a domain name.`
        : "Which domain should your emails come from?",
      hint: "A domain you own, like example.com: emails will come from no-reply@ that domain.",
    });
  }
  const resend = await ResendApi.required();
  yield step("move:emails", "running", "Setting up your emails", `From ${domain}`);
  let found = (await resend.domains()).find((d) => d.name === domain);
  if (!found) found = await resend.createDomain(domain, regionFor(state.home.region));
  let current = await resend.domain(found.id);
  if (current.status !== "verified") {
    await resend.verifyDomain(found.id).catch(() => {});
    current = await resend.domain(found.id);
  }
  const sender = (options.sender ?? state.emails?.sender ?? `no-reply@${domain}`).trim();
  const records = (current.records ?? []).map((r) => ({
    type: r.type,
    name: r.name,
    value: r.value,
    ...(r.priority !== undefined ? { priority: r.priority } : {}),
    ...(r.status ? { status: r.status } : {}),
  }));
  await updateMove(ws.root, (s) => {
    s.emails = {
      domain,
      domainId: found!.id,
      sender,
      status: current.status,
      records,
      ...(s.emails?.domain === domain && s.emails.connectedAt
        ? { connectedAt: s.emails.connectedAt }
        : {}),
    };
  });

  if (current.status !== "verified") {
    yield step(
      "move:emails",
      "warning",
      "Your domain needs its email records",
      `Add the ${records.length} records at your domain's provider, then check again`,
    );
    return { domain, sender, status: current.status, records, connected: false };
  }

  const latest = await loadMove(ws.root);
  if (!latest.emails?.connectedAt) {
    yield step("move:emails", "running", "Setting up your emails", "Connecting Resend to Supabase");
    const sending = await resend.createSendingKey(`Clodable · ${ws.project.name}`, found.id);
    const supabase = await SupabaseApi.required();
    await supabase.updateAuthConfig(state.home.ref, {
      smtp_admin_email: sender,
      smtp_sender_name: ws.project.name,
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_pass: sending.token,
      // Supabase allows 30 emails an hour through your own sender until told otherwise: invites and
      // password resets for a busy hour would be refused.
      rate_limit_email_sent: 100,
    });
    await updateMove(ws.root, (s) => {
      if (s.emails) s.emails.connectedAt = new Date().toISOString();
      if (s.switch?.noEmailsAt) delete s.switch.noEmailsAt;
    });
  }
  yield step("move:emails", "done", "Your emails are ready", `From ${sender}, through Resend`);
  return { domain, sender, status: current.status, records, connected: true };
}
