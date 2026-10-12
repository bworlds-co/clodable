import { ClodableError } from "../errors.js";
import { readSecret } from "../local-secrets.js";

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
}

export class NetlifyApi {
  private readonly base: string;

  constructor(
    private readonly token: string,
    base = process.env.CLODABLE_NETLIFY_API ?? "https://api.netlify.com/api/v1",
  ) {
    this.base = base.replace(/\/+$/, "");
  }

  static async onThisComputer(): Promise<NetlifyApi | undefined> {
    const token = await readSecret(NETLIFY_TOKEN);
    return token ? new NetlifyApi(token) : undefined;
  }

  static async required(): Promise<NetlifyApi> {
    const api = await NetlifyApi.onThisComputer();
    if (!api) {
      throw new ClodableError({
        code: "netlify-auth",
        message: "Netlify isn't connected on this computer yet.",
        hint: "Connect your Netlify account in the Clodable panel first.",
      });
    }
    return api;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "User-Agent": "clodable",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new ClodableError({
        code: "offline",
        message: "Couldn't reach Netlify.",
        hint: "Check your internet connection, then try again.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // plain text
      }
      const details = `Netlify answered ${response.status}: ${message.slice(0, 400)}`;
      if (response.status === 401) {
        throw new ClodableError({
          code: "netlify-auth",
          message: "Netlify didn't accept your access token.",
          hint: "It may have expired or been deleted. Create a new one and connect again.",
          details,
        });
      }
      throw new ClodableError({
        code: "netlify-failed",
        message: response.status === 422 ? "Netlify refused that." : "Netlify refused the request.",
        hint: "Try again in a minute. If it keeps happening, share the details with your developer.",
        details,
      });
    }
    return (text ? JSON.parse(text) : undefined) as T;
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

  /** A new site in this team. Netlify names are unique across all of Netlify: a taken one is a 422. */
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
