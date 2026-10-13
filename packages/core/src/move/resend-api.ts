import { ClodableError, messageOf } from "../errors.js";
import { readSecret } from "../local-secrets.js";

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

  constructor(
    private readonly key: string,
    base = process.env.CLODABLE_RESEND_API ?? "https://api.resend.com",
  ) {
    this.base = base.replace(/\/+$/, "");
  }

  static async required(): Promise<ResendApi> {
    const key = await readSecret(RESEND_KEY);
    if (!key) {
      throw new ClodableError({
        code: "resend-auth",
        message: "Resend isn't connected on this computer yet.",
        hint: "Connect your Resend account in the Clodable panel first.",
      });
    }
    return new ResendApi(key);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          "User-Agent": "clodable",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new ClodableError({
        code: "offline",
        message: "Couldn't reach Resend.",
        hint: "Check your internet connection, then try again.",
        details: messageOf(error),
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
      const details = `Resend answered ${response.status}: ${message.slice(0, 400)}`;
      if (response.status === 401 || response.status === 403) {
        throw new ClodableError({
          code: "resend-auth",
          message: /restricted|sending/i.test(message)
            ? "That Resend key can only send emails."
            : "Resend didn't accept that key.",
          hint: "Create a key with Full access in Resend (API Keys → Create API Key), then connect again.",
          details,
        });
      }
      throw new ClodableError({
        code: "resend-failed",
        message: "Resend refused the request.",
        hint: "Try again in a minute. If it keeps happening, share the details with your developer.",
        details,
      });
    }
    return (text ? JSON.parse(text) : undefined) as T;
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
