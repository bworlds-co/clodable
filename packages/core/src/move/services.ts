import { randomBytes } from "node:crypto";
import { ClodableError } from "../errors.js";
import { CODE_DIRS, LOVABLE_AI } from "../project.js";
import { setSetting } from "../settings.js";
import type { Workspace } from "../workspace.js";
import { textFiles } from "./assess.js";
import { localFunctions } from "./functions.js";
import { ResendApi } from "./resend-api.js";
import { loadMove, updateMove } from "./state.js";
import { projectUrl, SupabaseApi } from "./supabase-api.js";

/**
 * Lovable's own services, which stop working off Lovable: its AI gateway, its
 * email API, and its connectors. Clodable finds where the code uses them, keeps the builder's own
 * keys where the code will read them (the preview, the site, the backend functions), and Claude
 * changes the code to call the builder's provider instead.
 */

/** Where an OpenAI-style chat API answers, and a model like the one Lovable's AI picked. */
export const AI_PROVIDERS = {
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.5-flash",
  },
  gemini: {
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
  },
  openai: { name: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
} as const;
export type AiProvider = keyof typeof AI_PROVIDERS;

const EMAIL = /api\.lovable\.dev|x-lovable-signature/;
const CONNECTOR = /connector-gateway\.lovable\.dev\/([a-z0-9_-]+)/gi;

export interface ServicesStatus {
  /** The code calls Lovable's AI, and whether it reads the builder's own (AI_API_KEY) too. */
  ai: boolean;
  /** The features using it, as Claude named them. */
  aiFeatures: string[];
  aiSwitched: boolean;
  aiProvider?: string;
  /** The code sends emails through Lovable, and whether it reads the builder's Resend key too. */
  emails: boolean;
  emailsSwitched: boolean;
  /** Clodable gave the app a Resend key that sends from the builder's domain. */
  appEmails: boolean;
  /** The app has its own sign-in emails (supabase/functions/auth-email-hook), and they're on. */
  hook: boolean;
  hookOn: boolean;
  /** Services the app reaches through Lovable's connectors. */
  connectors: string[];
}

export async function servicesStatus(ws: Workspace): Promise<ServicesStatus> {
  const files = await textFiles(ws.root, CODE_DIRS);
  const any = (pattern: RegExp) => files.some((f) => pattern.test(f.text));
  const connectors = new Set<string>();
  for (const f of files)
    for (const m of f.text.matchAll(CONNECTOR)) connectors.add(m[1]!.toLowerCase());
  const state = await loadMove(ws.root);
  const hook = (await localFunctions(ws.root)).some((fn) => fn.name === "auth-email-hook");
  // Claude's facts decide which of Lovable's services the app uses; the scan, which are switched.
  const facts = state.facts;
  const found = [...connectors].sort();
  return {
    ai: facts ? facts.ai.length > 0 : any(LOVABLE_AI),
    aiFeatures: facts?.ai.map((f) => f.feature) ?? [],
    aiSwitched: any(/\bAI_API_KEY\b/),
    ...(state.services?.ai ? { aiProvider: state.services.ai.provider } : {}),
    emails: facts ? facts.appEmails.length > 0 : any(EMAIL),
    emailsSwitched: any(/\bRESEND_API_KEY\b/),
    appEmails: Boolean(state.services?.appEmailsAt),
    hook,
    hookOn: Boolean(state.services?.hookAt),
    connectors: facts && facts.connectors.length === 0 ? [] : found,
  };
}

/**
 * Lovable's AI the app still calls with no key of its own: the features Claude named, if it looked.
 * Undefined when the app doesn't use Lovable's AI, or already reads the builder's key.
 */
export async function lovableAiLeft(root: string): Promise<{ features: string[] } | undefined> {
  const state = await loadMove(root);
  const files = await textFiles(root, CODE_DIRS);
  const any = (pattern: RegExp) => files.some((f) => pattern.test(f.text));
  const used = state.facts ? state.facts.ai.length > 0 : any(LOVABLE_AI);
  if (!used || any(/\bAI_API_KEY\b/)) return undefined;
  return { features: state.facts?.ai.map((f) => f.feature) ?? [] };
}

/** Whether the app uses any of them (the move then has a step for it). */
export function usesLovableServices(status: ServicesStatus): boolean {
  return status.ai || status.emails || status.connectors.length > 0 || status.hook;
}

/**
 * What's left to switch. Until the switch the app still runs on Lovable, so the code keeps
 * Lovable's service as the fallback when the builder's key isn't set: reading the builder's key is
 * what counts. Sign-in emails need the builder's emails first.
 */
export function servicesLeft(
  status: ServicesStatus,
  emailsConnected: boolean,
  emailsSkipped = false,
): string[] {
  return [
    ...(status.ai && !status.aiSwitched ? ["AI"] : []),
    // Without emails of their own (skipped), the app's own emails stop with Lovable: nothing to do.
    ...(status.emails && !status.emailsSwitched && !emailsSkipped ? ["emails"] : []),
    ...(status.hook && emailsConnected && !status.hookOn ? ["sign-in emails"] : []),
    ...status.connectors,
  ];
}

/** Going on without switching (a prototype whose AI doesn't matter): those features stop with Lovable. */
export async function skipServices(ws: Workspace): Promise<{ skipped: true }> {
  await updateMove(ws.root, (s) => {
    s.services = { ...s.services, skippedAt: new Date().toISOString() };
  });
  return { skipped: true };
}

/** The new backend's function secrets, where the backend functions will read them. */
async function functionSecrets(ws: Workspace, values: Array<{ name: string; value: string }>) {
  const state = await loadMove(ws.root);
  if (!state.home || (await localFunctions(ws.root)).length === 0) return;
  const api = await SupabaseApi.required();
  await api.setSecrets(state.home.ref, values);
  await updateMove(ws.root, (s) => {
    s.secrets = [...new Set([...(s.secrets ?? []), ...values.map((v) => v.name)])].sort();
  });
}

/**
 * The builder's own AI provider: its address and key go where the code reads them (the preview,
 * the site on Netlify, the backend functions). Claude then points the code at them.
 */
export async function setAiProvider(
  ws: Workspace,
  provider: string | undefined,
  key: string,
): Promise<{ provider: AiProvider; url: string; model: string }> {
  if (!provider || !(provider in AI_PROVIDERS)) {
    throw new ClodableError({
      code: "invalid-config",
      message: "Which AI provider?",
      hint: `One of: ${Object.keys(AI_PROVIDERS).join(", ")}.`,
    });
  }
  const chosen = AI_PROVIDERS[provider as AiProvider];
  const value = key.trim();
  if (value.length < 20) {
    throw new ClodableError({
      code: "invalid-config",
      message: `That doesn't look like a ${chosen.name} key.`,
      hint: "Paste the whole key, as the provider shows it once.",
    });
  }
  await setSetting(ws, "AI_API_URL", chosen.url);
  await setSetting(ws, "AI_API_KEY", value);
  await functionSecrets(ws, [
    { name: "AI_API_URL", value: chosen.url },
    { name: "AI_API_KEY", value },
  ]);
  await updateMove(ws.root, (s) => {
    s.services = { ...s.services, ai: { provider, at: new Date().toISOString() } };
  });
  return { provider: provider as AiProvider, url: chosen.url, model: chosen.model };
}

/**
 * The app's own emails, through the builder's Resend account: a key that can only send, only
 * from their domain, where the code reads it (RESEND_API_KEY), with the sender (EMAIL_FROM).
 */
export async function provisionAppEmails(
  ws: Workspace,
): Promise<{ sender: string; domain: string }> {
  const state = await loadMove(ws.root);
  if (!state.emails?.connectedAt || !state.emails.domainId) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Set up your emails first: your app's own emails go out the same way.",
    });
  }
  const resend = await ResendApi.required();
  const key = await resend.createSendingKey(
    `Clodable · ${ws.project.name} · app`,
    state.emails.domainId,
  );
  const sender = state.emails.sender;
  await setSetting(ws, "RESEND_API_KEY", key.token);
  await setSetting(ws, "EMAIL_FROM", sender);
  await functionSecrets(ws, [
    { name: "RESEND_API_KEY", value: key.token },
    { name: "EMAIL_FROM", value: sender },
  ]);
  await updateMove(ws.root, (s) => {
    s.services = { ...s.services, appEmailsAt: new Date().toISOString() };
  });
  return { sender, domain: state.emails.domain };
}

/**
 * The app's own sign-in emails (its `auth-email-hook` function, Lovable's templates): Supabase
 * sends confirmations and password resets through it, signed with a secret both share.
 */
export async function enableEmailHook(ws: Workspace): Promise<{ on: true }> {
  const state = await loadMove(ws.root);
  if (!state.home) {
    throw new ClodableError({ code: "move-not-ready", message: "Create your new backend first." });
  }
  const api = await SupabaseApi.required();
  const deployed = (await api.functions(state.home.ref)).find((f) => f.slug === "auth-email-hook");
  if (deployed?.status !== "ACTIVE") {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Deploy your backend functions first: the sign-in emails come from auth-email-hook.",
      hint: "clodable move functions",
    });
  }
  const secret = `v1,whsec_${randomBytes(32).toString("base64")}`;
  await api.setSecrets(state.home.ref, [{ name: "SEND_EMAIL_HOOK_SECRET", value: secret }]);
  await api.updateAuthConfig(state.home.ref, {
    hook_send_email_enabled: true,
    hook_send_email_uri: `${projectUrl(state.home.ref)}/functions/v1/auth-email-hook`,
    hook_send_email_secrets: secret,
  });
  await updateMove(ws.root, (s) => {
    s.services = { ...s.services, hookAt: new Date().toISOString() };
  });
  return { on: true };
}
