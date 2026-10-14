import { ClodableError, type ErrorCode, messageOf } from "../errors.js";

/** A service's API, called with the builder's own token: what each one means by a refusal. */
export interface ApiService {
  /** Its name, as builders know it: "Netlify". */
  name: string;
  token: string;
  /** The code for an answer Clodable can't read. */
  failed: ErrorCode;
  /** The error for a refusal, in this service's terms (a token it didn't accept, and the rest). */
  refused(status: number, message: string, details: string): ClodableError;
}

/**
 * One JSON call. Not reaching the service reads as offline; a refusal is the service's own to
 * explain; an answer that isn't JSON says so, instead of a parser's error.
 */
export async function callApi<T>(
  service: ApiService,
  method: string,
  url: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${service.token}`,
        "User-Agent": "clodable",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new ClodableError({
      code: "offline",
      message: `Couldn't reach ${service.name}.`,
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
    const details = `${service.name} answered ${response.status}: ${message.slice(0, 400)}`;
    throw service.refused(response.status, message, details);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ClodableError({
      code: service.failed,
      message: `${service.name} answered in a way Clodable didn't expect.`,
      hint: "Try again in a minute. If it keeps happening, share the details with your developer.",
      details: `${service.name} answered ${response.status}: ${text.slice(0, 400)}`,
    });
  }
}
