import type { SupabaseApi } from "./supabase-api.js";

/**
 * Where sign-in links in emails may come back to, and who may sign up: the copy while the builder
 * tries it in the preview, then the live site.
 */

/** Where Lovable's templates serve the app locally, Desktop's preview included. */
const PREVIEW_ORIGIN = "http://localhost:8080";
/** Any local port: the preview, and the builder's own dev server. */
const LOCALHOST = "http://localhost:*/**";
const PREVIEW_REDIRECTS = [LOCALHOST, "http://127.0.0.1:*/**"];

/** The addresses links may come back to, as Supabase keeps them (one string, commas between). */
function allowList(current: unknown, adding: string[]): string {
  const allowed = new Set(
    String(current ?? "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean),
  );
  for (const url of adding) allowed.add(url);
  return [...allowed].join(",");
}

/**
 * Sign-ins on the copy, while the builder tries it in the preview. Links from sign-up and reset
 * emails come back to the preview (any local port), not to Supabase's default localhost:3000.
 * New people don't wait for a confirmation email: Supabase's built-in mailer only writes to the
 * project's own team, twice an hour. The switch sets all of this to match the live app.
 */
export async function prepareCopySignIn(api: SupabaseApi, ref: string): Promise<void> {
  const current = await api.authConfig(ref);
  await api.updateAuthConfig(ref, {
    site_url: PREVIEW_ORIGIN,
    uri_allow_list: allowList(current.uri_allow_list, PREVIEW_REDIRECTS),
    mailer_autoconfirm: true,
  });
}

/**
 * Sign-in for real people: links in emails come back to the site (and still to local previews).
 * `confirmEmail` and `signUp` (whether anyone may create an account, or only invited people) are
 * left as they are when not given.
 */
export async function liveSignIn(
  api: SupabaseApi,
  ref: string,
  url: string,
  confirmEmail?: boolean,
  signUp?: boolean,
): Promise<void> {
  const auth = await api.authConfig(ref);
  await api.updateAuthConfig(ref, {
    site_url: url,
    uri_allow_list: allowList(auth.uri_allow_list, [`${url}/**`, LOCALHOST]),
    ...(confirmEmail !== undefined ? { mailer_autoconfirm: !confirmEmail } : {}),
    ...(signUp !== undefined ? { disable_signup: !signUp } : {}),
  });
}

type Auth = { site_url?: unknown; uri_allow_list?: unknown };

/** Sign-in links can come back to a preview on this computer. */
export const backToPreview = (auth: Auth) =>
  String(auth.uri_allow_list ?? "").includes("http://localhost:*");

/** Sign-in links come back to the live site. */
export const backToSite = (auth: Auth, site: string) =>
  auth.site_url === site && String(auth.uri_allow_list ?? "").includes(`${site}/**`);

/**
 * Sign-in on a backend Cloclod just made for the app: links come back to the preview, and to the
 * live site when there is one. New people don't wait for a confirmation email: Supabase's built-in
 * mailer only writes to the project's own team.
 */
export async function newBackendSignIn(
  api: SupabaseApi,
  ref: string,
  site: string | undefined,
): Promise<void> {
  const current = await api.authConfig(ref);
  await api.updateAuthConfig(ref, {
    site_url: site ?? PREVIEW_ORIGIN,
    uri_allow_list: allowList(current.uri_allow_list, [
      ...PREVIEW_REDIRECTS,
      ...(site ? [`${site}/**`] : []),
    ]),
    mailer_autoconfirm: true,
  });
}
