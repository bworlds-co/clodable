import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { exec } from "../exec.js";
import { type GitleaksFinding, runGitleaks } from "./gitleaks.js";

/**
 * Secret keys must never leave the builder's computer. gitleaks finds them (see gitleaks.ts); this
 * file is the thin layer for Lovable apps on top: which findings stop a save or a publish, which
 * are only a note, and which are public on purpose.
 */

export interface SecretFinding {
  file: string;
  line: number;
  /** What it looks like, in words: "Stripe live secret key". */
  kind: string;
  /** The gitleaks rule that found it. */
  rule: string;
  /** The match with most characters masked, safe to show. */
  preview: string;
  severity: "block" | "warn";
}

const jwtPayload = (token: string): Record<string, unknown> | undefined => {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
};

export function mask(secret: string): string {
  if (secret.length <= 10) return `${secret.slice(0, 2)}…`;
  return `${secret.slice(0, 6)}…${secret.slice(-2)}`;
}

/** Rules that guess, or that also match keys made for browser code: a note, never a stop. */
const NOTE_ONLY = new Set([
  "generic-api-key",
  "gcp-api-key",
  "jwt-base64",
  "mapbox-api-token",
  "algolia-api-key",
  "contentful-delivery-api-token",
  "new-relic-browser-api-token",
  "flutterwave-public-key",
  "lob-pub-api-key",
  "mailgun-pub-key",
  "easypost-test-api-token",
  "gitlab-feature-flag-client-token",
]);

const NAMES: Record<string, string> = {
  "aws-access-token": "AWS access key",
  "gcp-api-key": "Google API key",
  "generic-api-key": "Something that looks like a key",
  "openai-api-key": "OpenAI API key",
  "anthropic-api-key": "Anthropic API key",
  "github-pat": "GitHub token",
  "github-fine-grained-pat": "GitHub token",
  "private-key": "Private key",
  "sendgrid-api-token": "SendGrid API key",
};

const named = (rule: string) =>
  NAMES[rule] ??
  rule
    .replace(/-/g, " ")
    .replace(/\b(api|aws|gcp|jwt|pat|id|url|ci)\b/g, (w) => w.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());

/** Clodable's rules that find gitleaks' patterns anywhere, read as the rule they mirror. */
const MIRRORS: Record<string, string> = {
  "clodable-stripe-key": "stripe-access-token",
  "clodable-jwt": "jwt",
  "clodable-anthropic-key": "anthropic-api-key",
  "clodable-sendgrid-key": "sendgrid-api-token",
};

/** Decide what a gitleaks finding means for a Lovable app. Undefined: public on purpose. */
export function classify(finding: GitleaksFinding): SecretFinding | undefined {
  const found = { ...finding, RuleID: MIRRORS[finding.RuleID] ?? finding.RuleID };
  const secret = found.Secret || found.Match;
  const base = {
    file: found.File,
    line: found.StartLine,
    rule: found.RuleID,
    preview: mask(secret),
  };
  // Supabase's public keys ship in every Lovable app on purpose. The service_role key must not.
  if (/^sb_publishable_/.test(secret)) return undefined;
  if (found.RuleID === "supabase-secret-key" || /^sb_secret_/.test(secret)) {
    return { ...base, rule: "supabase-secret-key", kind: "Supabase secret key", severity: "block" };
  }
  if (found.RuleID === "jwt") {
    const payload = jwtPayload(secret);
    if (payload?.role === "service_role" || payload?.role === "supabase_admin") {
      return { ...base, kind: "Supabase service_role key", severity: "block" };
    }
    if (payload?.iss === "supabase" || payload?.role === "anon") return undefined;
    return { ...base, kind: "Access token", severity: "warn" };
  }
  if (found.RuleID === "stripe-access-token") {
    const test = /^[sr]k_test_/.test(secret);
    return {
      ...base,
      kind: test ? "Stripe test key" : "Stripe live secret key",
      severity: test ? "warn" : "block",
    };
  }
  const note = NOTE_ONLY.has(found.RuleID) || /-(client-id|access-id|api-id)$/.test(found.RuleID);
  return { ...base, kind: named(found.RuleID), severity: note ? "warn" : "block" };
}

/** One finding per key and place, the most serious reading first. */
function settle(findings: GitleaksFinding[], fileOf: (f: GitleaksFinding) => string) {
  const kept = new Map<string, SecretFinding>();
  for (const found of findings) {
    const finding = classify({ ...found, File: fileOf(found) });
    if (!finding) continue;
    const key = `${finding.file}:${finding.line}:${found.Secret || found.Match}`;
    const before = kept.get(key);
    if (!before || (before.severity === "warn" && finding.severity === "block")) {
      kept.set(key, finding);
    }
  }
  return [...kept.values()].sort(
    (a, b) =>
      Number(a.severity === "warn") - Number(b.severity === "warn") ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}

/** What's about to be saved: the staged changes, only the lines they add. */
export async function scanStaged(root: string): Promise<SecretFinding[]> {
  const findings = await runGitleaks(root, ["git", "--pre-commit", "--staged", "."]);
  return settle(findings, (f) => f.File);
}

/** Saves that exist on this computer but not on GitHub yet. */
export async function scanUnsent(root: string, remote: string): Promise<SecretFinding[]> {
  const findings = await runGitleaks(root, [
    "git",
    `--log-opts=HEAD --not --remotes=${remote}`,
    ".",
  ]);
  return settle(findings, (f) => f.File);
}

/** Every tracked file of a version, as it would go live. */
export async function scanVersion(root: string, ref = "HEAD"): Promise<SecretFinding[]> {
  const snapshot = await mkdtemp(join(tmpdir(), "clodable-scan-"));
  try {
    const archive = join(snapshot, ".clodable-version.tar");
    const packed = await exec("git", ["archive", "--format=tar", "-o", archive, ref], {
      cwd: root,
      timeout: 60_000,
    });
    if (packed.exitCode !== 0) throw new Error(packed.stderr.trim() || "git archive failed");
    const unpacked = await exec("tar", ["-xf", archive], { cwd: snapshot, timeout: 60_000 });
    if (unpacked.exitCode !== 0) throw new Error(unpacked.stderr.trim() || "tar failed");
    await rm(archive, { force: true });
    const findings = await runGitleaks(snapshot, ["dir", "."]);
    return settle(findings, (f) =>
      relative(snapshot, resolve(snapshot, f.File)).split(sep).join("/"),
    );
  } finally {
    await rm(snapshot, { recursive: true, force: true });
  }
}

/** "Stripe live secret key in src/pay.ts:3 (sk_liv…ab)", for details. Never the key itself. */
export const describeFinding = (f: SecretFinding) =>
  `${f.kind} in ${f.file}:${f.line} (${f.preview})`;
