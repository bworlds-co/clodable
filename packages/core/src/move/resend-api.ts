import { CloclodError } from "../errors.js";
import { readSecret } from "../local-secrets.js";
import { type ApiService, callApi } from "./http.js";

/**
 * Resend's API, with the builder's own key: their sending domain and a narrow key for Supabase.
 * The builder's key stays on this computer; Supabase only ever gets a key that can send from their
 * domain and nothing else. `CLODABLE_RESEND_API` points it elsewhere (tests).
 */

export const RESEND_KEY = "resend-key";
export const RESEND_KEYS_PAGE = "https://resend.com/api-keys";

export interface ResendRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  status?: string;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  region?: string;
  records?: ResendRecord[];
}

export class ResendApi {
  private readonly base: string;
  private readonly service: ApiService;

  constructor(key: string, base = process.env.CLODABLE_RESEND_API ?? "https://api.resend.com") {
    this.base = base.replace(/\/+$/, "");
    this.service = {
      name: "Resend",
      token: key,
      failed: "resend-failed",
      refused: (status, message, details) =>
        status === 401 || status === 403
          ? new CloclodError({
              code: "resend-auth",
              message: /restricted|sending/i.test(message)
                ? "That Resend key can only send emails."
                : "Resend didn't accept that key.",
              hint: "Create a key with Full access in Resend (API Keys → Create API Key), then connect again.",
              details,
            })
          : new CloclodError({
              code: "resend-failed",
              message: "Resend refused the request.",
              hint: "Try again in a minute. If it keeps happening, share the details with your developer.",
              details,
            }),
    };
  }

  static async required(): Promise<ResendApi> {
    const key = await readSecret(RESEND_KEY);
    if (!key) {
      throw new CloclodError({
        code: "resend-auth",
        message: "Resend isn't connected on this computer yet.",
        hint: "Connect your Resend account in the Cloclod panel first.",
      });
    }
    return new ResendApi(key);
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return callApi<T>(this.service, method, `${this.base}${path}`, body);
  }

  async domains(): Promise<ResendDomain[]> {
    return (await this.request<{ data: ResendDomain[] }>("GET", "/domains")).data ?? [];
  }

  domain(id: string) {
    return this.request<ResendDomain>("GET", `/domains/${encodeURIComponent(id)}`);
  }

  createDomain(name: string, region: string) {
    return this.request<ResendDomain>("POST", "/domains", { name, region });
  }

  verifyDomain(id: string) {
    return this.request<{ id: string }>("POST", `/domains/${encodeURIComponent(id)}/verify`);
  }

  /** A key that can only send, and only from this domain: what Supabase gets. */
  createSendingKey(name: string, domainId: string) {
    return this.request<{ id: string; token: string }>("POST", "/api-keys", {
      name,
      permission: "sending_access",
      domain_id: domainId,
    });
  }
}
