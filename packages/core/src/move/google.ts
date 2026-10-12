import { ClodableError } from "../errors.js";
import { setSetting } from "../settings.js";
import type { Workspace } from "../workspace.js";
import { textFiles } from "./assess.js";
import { loadMove, updateMove } from "./state.js";
import { projectUrl, SupabaseApi } from "./supabase-api.js";

/**
 * Google sign-in. On Lovable it goes through Lovable's own sign-in broker
 * (@lovable.dev/cloud-auth-js), which only works on Lovable. On the new backend the builder's own
 * Google client signs people in: Clodable turns Google on in Supabase with it, and Claude switches
 * the app's button to Supabase's own sign-in (Lovable's broker stays the fallback until the switch).
 */

/** Set where the app runs on the new backend: the code signs in with Supabase's Google there. */
export const GOOGLE_SETTING = "VITE_GOOGLE_SIGN_IN";

export interface GoogleStatus {
  /** People sign in with Google (in the export), or the code offers it. */
  used: boolean;
  /** Google is on in the new backend, with the builder's client. */
  configured: boolean;
  skipped: boolean;
  /** The code signs in through Lovable's broker only. */
  brokerOnly: boolean;
  /** What the builder's Google client must allow as its redirect. */
  redirect?: string;
}

export async function googleStatus(ws: Workspace): Promise<GoogleStatus> {
  const state = await loadMove(ws.root);
  const files = await textFiles(ws.root, ["src"]);
  const code = files.map((f) => f.text).join("\n");
  const broker = /@lovable\.dev\/cloud-auth-js/.test(code);
  const offers = broker || /signInWithOAuth\(\s*\{[^}]*provider:\s*["'`]google["'`]/.test(code);
  const people = (state.export?.summary.people.providers.google ?? 0) > 0;
  return {
    // Claude's facts say whether the app offers it; people who already sign in with Google need it.
    used: (state.facts ? state.facts.signIn.google : offers) || people,
    configured: Boolean(state.google?.at),
    skipped: Boolean(state.google?.skippedAt),
    brokerOnly: broker && !new RegExp(GOOGLE_SETTING).test(code),
    ...(state.home ? { redirect: `${projectUrl(state.home.ref)}/auth/v1/callback` } : {}),
  };
}

/** Turn Google on in the new backend with the builder's own client (its secret on stdin). */
export async function setGoogleSignIn(
  ws: Workspace,
  clientId: string | undefined,
  secret: string,
): Promise<GoogleStatus> {
  const id = (clientId ?? "").trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new ClodableError({
      code: "invalid-config",
      message: "That doesn't look like a Google client ID.",
      hint: "It ends with .apps.googleusercontent.com.",
    });
  }
  if (secret.trim().length < 10) {
    throw new ClodableError({ code: "invalid-config", message: "That client secret is empty." });
  }
  const state = await loadMove(ws.root);
  if (!state.home) {
    throw new ClodableError({ code: "move-not-ready", message: "Create your new backend first." });
  }
  const api = await SupabaseApi.required();
  await api.updateAuthConfig(state.home.ref, {
    external_google_enabled: true,
    external_google_client_id: id,
    external_google_secret: secret.trim(),
  });
  await setSetting(ws, GOOGLE_SETTING, "supabase");
  await updateMove(ws.root, (s) => {
    s.google = { at: new Date().toISOString() };
  });
  return googleStatus(ws);
}

/** Google sign-in stays off on the new backend. */
export async function skipGoogle(ws: Workspace): Promise<{ skipped: true }> {
  await updateMove(ws.root, (s) => {
    s.google = { ...s.google, skippedAt: new Date().toISOString() };
  });
  return { skipped: true };
}
