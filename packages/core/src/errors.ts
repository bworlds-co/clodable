/**
 * Every error Clodable shows a builder has a stable code, a plain-language message, and a way
 * forward. Developers get the raw details separately.
 */
export type ErrorCode =
  | "not-a-repo"
  | "not-set-up"
  | "no-remote"
  | "gh-missing"
  | "gh-auth"
  | "git-identity"
  | "nothing-to-publish"
  | "conflict"
  | "checks-failed"
  | "secret-found"
  | "ci-failed"
  | "push-rejected"
  | "merge-blocked"
  | "deploy-failed"
  | "offline"
  | "on-live-branch"
  | "not-found"
  | "invalid-config"
  /** Moving off Lovable: Supabase refused the access token, or a step isn't possible yet. */
  | "supabase-auth"
  | "supabase-limit"
  | "supabase-failed"
  | "move-not-ready"
  | "export-not-found"
  | "export-unreadable"
  | "tools-unavailable"
  | "copy-failed"
  | "netlify-auth"
  | "netlify-failed"
  | "resend-auth"
  | "resend-failed"
  | "unknown";

export interface ErrorInfo {
  code: ErrorCode;
  /** What happened, in the builder's words. */
  message: string;
  /** What to do next. */
  hint?: string;
  /** Raw output for developers ("Show details"). */
  details?: string;
  /** Files involved, relative to the project root. */
  files?: string[];
}

export class ClodableError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;
  readonly details: string | undefined;
  readonly files: string[] | undefined;

  constructor(info: ErrorInfo) {
    super(info.message);
    this.name = "ClodableError";
    this.code = info.code;
    this.hint = info.hint;
    this.details = info.details;
    this.files = info.files;
  }

  toJSON(): ErrorInfo {
    return {
      code: this.code,
      message: this.message,
      ...(this.hint ? { hint: this.hint } : {}),
      ...(this.details ? { details: this.details } : {}),
      ...(this.files ? { files: this.files } : {}),
    };
  }
}

export function toErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof ClodableError) return error.toJSON();
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "unknown",
    message: "Something unexpected went wrong.",
    hint: "Try again. If it keeps happening, share the details with your developer.",
    details: message,
  };
}
