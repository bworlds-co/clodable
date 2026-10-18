import { CloclodError } from "../errors.js";
import { readSecret } from "../local-secrets.js";
import { type ApiService, callApi } from "./http.js";

/**
 * Netlify's API, with the builder's own access token: only what moving the website needs. The token
 * lives in this computer's secret store and goes nowhere but api.netlify.com (and, for deploys, the
 * repository's GitHub secrets). `CLODABLE_NETLIFY_API` points it elsewhere (tests).
 */

export const NETLIFY_TOKEN = "netlify-token";
export const NETLIFY_TOKENS_PAGE =
  "https://app.netlify.com/user/applications#personal-access-tokens";

export interface NetlifyAccount {
  id: string;
  slug: string;
  name: string;
  type_name?: string;
}

export interface NetlifySite {
  id: string;
  name: string;
  url: string;
  ssl_url?: string;
  admin_url: string;
  account_slug: string;
  published_deploy?: { state: string; published_at?: string } | null;
}

export class NetlifyApi {
  private readonly base: string;
  private readonly service: ApiService;

  constructor(
    token: string,
    base = process.env.CLODABLE_NETLIFY_API ?? "https://api.netlify.com/api/v1",
  ) {
    this.base = base.replace(/\/+$/, "");
    this.service = {
      name: "Netlify",
      token,
      failed: "netlify-failed",
      refused: (status, _message, details) =>
        status === 401
          ? new CloclodError({
              code: "netlify-auth",
              message: "Netlify didn't accept your access token.",
              hint: "It may have expired or been deleted. Create a new one and connect again.",
              details,
            })
          : new CloclodError({
              code: "netlify-failed",
              message: status === 422 ? "Netlify refused that." : "Netlify refused the request.",
              hint: "Try again in a minute. If it keeps happening, share the details with your developer.",
              details,
            }),
    };
  }

  static async onThisComputer(): Promise<NetlifyApi | undefined> {
    const token = await readSecret(NETLIFY_TOKEN);
    return token ? new NetlifyApi(token) : undefined;
  }

  static async required(): Promise<NetlifyApi> {
    const api = await NetlifyApi.onThisComputer();
    if (!api) {
      throw new CloclodError({
        code: "netlify-auth",
        message: "Netlify isn't connected on this computer yet.",
        hint: "Connect your Netlify account in the Cloclod panel first.",
      });
    }
    return api;
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return callApi<T>(this.service, method, `${this.base}${path}`, body);
  }

  user() {
    return this.request<{ id: string; email?: string; full_name?: string }>("GET", "/user");
  }

  accounts() {
    return this.request<NetlifyAccount[]>("GET", "/accounts");
  }

  site(id: string) {
    return this.request<NetlifySite>("GET", `/sites/${encodeURIComponent(id)}`);
  }

  /** The site's own domain (yourapp.com): Netlify serves it, with a certificate once DNS points here. */
  setCustomDomain(id: string, domain: string) {
    return this.request<NetlifySite>("PATCH", `/sites/${encodeURIComponent(id)}`, {
      custom_domain: domain,
    });
  }

  /** Ask Netlify for the domain's certificate now (it also does so on its own, later). */
  provisionCertificate(id: string) {
    return this.request<unknown>("POST", `/sites/${encodeURIComponent(id)}/ssl`);
  }

  /** A new site in this team. Netlify names are unique across all of Netlify: a taken one is a 422. */
  createSite(account: string, name: string) {
    return this.request<NetlifySite>("POST", `/${encodeURIComponent(account)}/sites`, { name });
  }

  /** The names of the site's environment values (never their values). */
  async envKeys(account: string, siteId: string): Promise<string[]> {
    const vars = await this.request<Array<{ key: string }>>(
      "GET",
      `/accounts/${encodeURIComponent(account)}/env?site_id=${encodeURIComponent(siteId)}`,
    );
    return vars.map((v) => v.key);
  }

  /** Set one value for every context, creating the key if it's new. */
  async setEnv(
    account: string,
    siteId: string,
    key: string,
    value: string,
    { secret = false, existing }: { secret?: boolean; existing?: string[] } = {},
  ): Promise<void> {
    const keys = existing ?? (await this.envKeys(account, siteId));
    const at = `/accounts/${encodeURIComponent(account)}/env`;
    const site = `site_id=${encodeURIComponent(siteId)}`;
    if (keys.includes(key)) {
      await this.request("PATCH", `${at}/${encodeURIComponent(key)}?${site}`, {
        context: "all",
        value,
      });
      return;
    }
    const create = (isSecret: boolean) =>
      this.request("POST", `${at}?${site}`, [
        { key, values: [{ value, context: "all" }], ...(isSecret ? { is_secret: true } : {}) },
      ]);
    // Secret values need a plan that has them: without one, a plain value still works.
    await create(secret).catch((error: unknown) => {
      if (!secret) throw error;
      return create(false);
    });
  }
}
