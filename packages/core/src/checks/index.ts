import type { ProjectConfig } from "../config.js";
import { ClodableError } from "../errors.js";
import { type Flow, step } from "../events.js";
import { exec } from "../exec.js";
import { type ProjectInfo, runScriptCommand } from "../project.js";
import { ScannerUnavailable } from "./gitleaks.js";
import { describeFinding, scanVersion } from "./secrets.js";

export type CheckId = "build" | "packages" | "secrets";

export interface CheckResult {
  id: CheckId;
  status: "passed" | "warning" | "failed" | "skipped";
  /** Plain-language one-liner. */
  summary: string;
  /** Raw output for developers. */
  details?: string;
  /** file:line references the fix should look at. */
  locations?: Array<{ file: string; line?: number }>;
}

const ERROR_LINE = /(error|failed|cannot|could not|unexpected|is not defined|not found)/i;
const LOCATION =
  /((?:src|app|supabase|routes)\/[\w./@-]+\.(?:tsx?|jsx?|css|mdx?|json))(?::|\()(\d+)/;

/** The most useful few lines of a failed build, with ANSI colors stripped. */
export function summarizeBuildOutput(output: string): {
  excerpt: string;
  location?: { file: string; line: number };
} {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI color codes from build output.
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
  const lines = clean.split("\n").map((l) => l.trimEnd());
  const firstError = lines.findIndex((l) => ERROR_LINE.test(l));
  const start = Math.max(0, firstError >= 0 ? firstError - 1 : lines.length - 12);
  const excerpt = lines
    .slice(start, start + 12)
    .join("\n")
    .trim();
  const locationMatch = clean.match(LOCATION);
  return locationMatch
    ? { excerpt, location: { file: locationMatch[1]!, line: Number(locationMatch[2]) } }
    : { excerpt };
}

async function checkBuild(project: ProjectInfo, config: ProjectConfig): Promise<CheckResult> {
  const script = config.app.buildScript;
  if (!project.scripts[script]) {
    return { id: "build", status: "skipped", summary: "No build step to check" };
  }
  const [command, args] = runScriptCommand(project.packageManager, script);
  const result = await exec(command, args, {
    cwd: project.root,
    env: { CI: "1", NODE_ENV: "production", FORCE_COLOR: "0" },
    timeout: 10 * 60_000,
  });
  if (result.exitCode === 0) return { id: "build", status: "passed", summary: "It builds" };
  const output = `${result.stdout}\n${result.stderr}`;
  const { excerpt, location } = summarizeBuildOutput(output);
  return {
    id: "build",
    status: "failed",
    summary: location
      ? `A page doesn't build (${location.file}, line ${location.line})`
      : "Your app doesn't build",
    details: excerpt || output.slice(-4000),
    ...(location ? { locations: [location] } : {}),
  };
}

interface AuditJson {
  error?: unknown;
  metadata?: { vulnerabilities?: Record<string, number> };
  vulnerabilities?: Record<string, { severity: string; name: string; via: unknown[] }>;
}

async function checkPackages(project: ProjectInfo): Promise<CheckResult> {
  const args: Record<ProjectInfo["packageManager"], [string, string[]] | undefined> = {
    npm: ["npm", ["audit", "--omit=dev", "--json"]],
    pnpm: ["pnpm", ["audit", "--prod", "--json"]],
    yarn: undefined,
    bun: undefined,
  };
  const command = args[project.packageManager];
  if (!command) {
    return {
      id: "packages",
      status: "skipped",
      summary: "Package check not available for this project",
    };
  }
  const result = await exec(command[0], command[1], { cwd: project.root, timeout: 120_000 });
  let audit: AuditJson;
  try {
    audit = JSON.parse(result.stdout || "{}") as AuditJson;
  } catch {
    return { id: "packages", status: "skipped", summary: "Couldn't check packages (offline?)" };
  }
  if (audit.error || !audit.metadata) {
    return { id: "packages", status: "skipped", summary: "Couldn't check packages right now" };
  }
  const counts = audit.metadata.vulnerabilities ?? {};
  const critical = counts.critical ?? 0;
  const high = counts.high ?? 0;
  const names = Object.values(audit.vulnerabilities ?? {})
    .filter((v) => v.severity === "critical" || v.severity === "high")
    .map((v) => `${v.name} (${v.severity})`);
  if (critical > 0) {
    return {
      id: "packages",
      status: "failed",
      summary: `${critical} package${critical > 1 ? "s have" : " has"} a critical security issue`,
      details: names.join("\n"),
    };
  }
  if (high > 0) {
    return {
      id: "packages",
      status: "warning",
      summary: `${high} package${high > 1 ? "s have" : " has"} a known security issue`,
      details: names.join("\n"),
    };
  }
  return { id: "packages", status: "passed", summary: "Packages look safe" };
}

/** The version about to go live, every tracked file, through gitleaks (see secrets.ts). */
async function checkSecrets(project: ProjectInfo): Promise<CheckResult> {
  let findings: Awaited<ReturnType<typeof scanVersion>>;
  try {
    findings = await scanVersion(project.root, "HEAD");
  } catch (error) {
    return {
      id: "secrets",
      status: "failed",
      summary: "Couldn't check for secret keys",
      details: error instanceof ScannerUnavailable ? error.message : String(error),
    };
  }
  const blocking = findings.filter((f) => f.severity === "block");
  if (blocking.length > 0) {
    return {
      id: "secrets",
      status: "failed",
      summary:
        blocking.length === 1
          ? `A secret key is saved in ${blocking[0]!.file}`
          : `${blocking.length} secret keys are saved in your project`,
      details: findings.map(describeFinding).join("\n"),
      locations: blocking.map((f) => ({ file: f.file, line: f.line })),
    };
  }
  if (findings.length > 0) {
    return {
      id: "secrets",
      status: "warning",
      summary: "Something that looks like a key is saved in your project",
      details: findings.map(describeFinding).join("\n"),
      locations: findings.map((f) => ({ file: f.file, line: f.line })),
    };
  }
  return { id: "secrets", status: "passed", summary: "No secret keys exposed" };
}

const RUNNING: Record<CheckId, string> = {
  build: "Checking it builds",
  packages: "Checking packages for security issues",
  secrets: "Looking for exposed secret keys",
};

/**
 * The error for checks that failed: the first one's summary, everything for developers, and the
 * files the fix should look at, for Claude.
 */
export function checksFailed(failed: CheckResult[], hint: string): ClodableError {
  return new ClodableError({
    code: "checks-failed",
    message: failed[0]?.summary ?? "A check failed.",
    hint,
    details: failed
      .map((f) => `${f.summary}\n${f.details ?? ""}`)
      .join("\n\n")
      .trim(),
    files: failed.flatMap(
      (f) => f.locations?.map((l) => (l.line ? `${l.file}:${l.line}` : l.file)) ?? [],
    ),
  });
}

/** Run the enabled checks in order, reporting each as a step. */
export async function* runChecks(project: ProjectInfo, config: ProjectConfig): Flow<CheckResult[]> {
  const enabled: CheckId[] = (["secrets", "packages", "build"] as const).filter(
    (id) => config.checks[id],
  );
  const results: CheckResult[] = [];
  for (const id of enabled) {
    const stepId = `check:${id}` as const;
    yield step(stepId, "running", RUNNING[id]);
    const result =
      id === "build"
        ? await checkBuild(project, config)
        : id === "packages"
          ? await checkPackages(project)
          : await checkSecrets(project);
    results.push(result);
    const state =
      result.status === "passed"
        ? "done"
        : result.status === "warning"
          ? "warning"
          : result.status === "skipped"
            ? "skipped"
            : "failed";
    yield step(stepId, state, result.summary);
  }
  return results;
}
