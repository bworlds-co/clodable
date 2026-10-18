import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { messageOf } from "../errors.js";
import { exec, hasCommand } from "../exec.js";
import { cacheDir } from "../places.js";

/**
 * gitleaks (https://github.com/gitleaks/gitleaks, MIT) finds the secrets, with about 220 rules its
 * community maintains. Cloclod pins one release, checks its SHA-256 before running it, and
 * downloads it once per computer, so builders install nothing.
 */
export const GITLEAKS_VERSION = "8.30.1";

/** Release files and their SHA-256, as published on the gitleaks release page. */
const RELEASES: Record<string, { file: string; sha256: string }> = {
  "darwin-arm64": {
    file: "darwin_arm64.tar.gz",
    sha256: "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  },
  "darwin-x64": {
    file: "darwin_x64.tar.gz",
    sha256: "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  },
  "linux-arm64": {
    file: "linux_arm64.tar.gz",
    sha256: "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
  },
  "linux-x64": {
    file: "linux_x64.tar.gz",
    sha256: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  },
  "win32-arm64": {
    file: "windows_arm64.zip",
    sha256: "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f",
  },
  "win32-x64": {
    file: "windows_x64.zip",
    sha256: "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
  },
};

/** The scanner couldn't be found or fetched: nothing may leave this computer unscanned. */
export class ScannerUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ScannerUnavailable";
  }
}

const executable = process.platform === "win32" ? "gitleaks.exe" : "gitleaks";
let resolved: Promise<string> | undefined;

/**
 * The gitleaks to run: `CLODABLE_GITLEAKS` if set, else the pinned release (downloaded and checked
 * the first time), else a gitleaks already installed, for systems without a pinned build.
 */
export function gitleaksBinary(): Promise<string> {
  if (process.env.CLODABLE_GITLEAKS) return Promise.resolve(process.env.CLODABLE_GITLEAKS);
  resolved ??= locate().catch((error) => {
    resolved = undefined;
    throw error;
  });
  return resolved;
}

async function locate(): Promise<string> {
  const release = RELEASES[`${process.platform}-${process.arch}`];
  const dir = join(cacheDir(), "gitleaks", GITLEAKS_VERSION);
  const path = join(dir, executable);
  if (release && existsSync(path)) return path;
  let reason = `No gitleaks build for ${process.platform}-${process.arch}.`;
  if (release) {
    try {
      await download(release, dir, path);
      return path;
    } catch (error) {
      reason = `Couldn't download gitleaks ${GITLEAKS_VERSION}: ${messageOf(error)}`;
    }
  }
  if (await hasCommand("gitleaks")) return "gitleaks";
  throw new ScannerUnavailable(`${reason} Install gitleaks, or set CLODABLE_GITLEAKS to its path.`);
}

async function download(
  release: { file: string; sha256: string },
  dir: string,
  path: string,
): Promise<void> {
  const name = `gitleaks_${GITLEAKS_VERSION}_${release.file}`;
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== release.sha256) throw new Error("the download didn't match its checksum");

  await mkdir(dir, { recursive: true });
  const work = await mkdtemp(join(dir, ".download-"));
  try {
    await writeFile(join(work, name), bytes);
    const unpacked = await exec("tar", ["-xf", name, executable], { cwd: work, timeout: 60_000 });
    if (unpacked.exitCode !== 0) throw new Error(unpacked.stderr.trim() || "couldn't unpack it");
    await chmod(join(work, executable), 0o755);
    // Another process may have finished first; either copy is the same checked file.
    await rename(join(work, executable), path).catch((error) => {
      if (!existsSync(path)) throw error;
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** One finding, as gitleaks reports it (JSON report). */
export interface GitleaksFinding {
  RuleID: string;
  Description: string;
  File: string;
  StartLine: number;
  Secret: string;
  Match: string;
  Commit?: string;
}

/**
 * Rules Cloclod adds. Supabase's newer secret keys, which gitleaks doesn't know by name yet. And
 * the keys Lovable apps use most, with gitleaks' own patterns but found anywhere: its rules expect
 * a quote, a space or a semicolon after a key, so a key pasted into a sentence ("the sk_live_….")
 * or between tags slipped through. classify() reads each as the gitleaks rule it mirrors.
 */
const CLOCLOD_RULES: Array<{
  id: string;
  description: string;
  regex: string;
  keywords: string[];
}> = [
  {
    id: "supabase-secret-key",
    description: "Supabase secret key",
    regex: String.raw`\bsb_secret_[A-Za-z0-9_-]{20,}`,
    keywords: ["sb_secret_"],
  },
  {
    id: "cloclod-stripe-key",
    description: "Stripe secret key, anywhere",
    regex: String.raw`\b((?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99})\b`,
    keywords: ["sk_test", "sk_live", "sk_prod", "rk_test", "rk_live", "rk_prod"],
  },
  {
    id: "cloclod-jwt",
    description: "JSON Web Token, anywhere",
    regex: String.raw`\b(ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9\/\\_-]{17,}\.[a-zA-Z0-9\/\\_-]{10,}={0,2})`,
    keywords: ["ey"],
  },
  {
    id: "cloclod-anthropic-key",
    description: "Anthropic API key, anywhere",
    regex: String.raw`\b(sk-ant-(?:api03|admin01)-[a-zA-Z0-9_\-]{93}AA)\b`,
    keywords: ["sk-ant-api03", "sk-ant-admin01"],
  },
  {
    id: "cloclod-sendgrid-key",
    description: "SendGrid API key, anywhere",
    regex: String.raw`\b(SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43})\b`,
    keywords: ["SG."],
  },
];

/** gitleaks' own rules (or the project's .gitleaks.toml, when a developer added one), plus ours. */
function configFor(root: string): string {
  const own = join(root, ".gitleaks.toml");
  return [
    'title = "Cloclod"',
    "",
    "[extend]",
    existsSync(own) ? `path = ${JSON.stringify(own)}` : "useDefault = true",
    ...CLOCLOD_RULES.flatMap((rule) => [
      "",
      "[[rules]]",
      `id = ${JSON.stringify(rule.id)}`,
      `description = ${JSON.stringify(rule.description)}`,
      `regex = '''${rule.regex}'''`,
      `keywords = ${JSON.stringify(rule.keywords)}`,
    ]),
    "",
  ].join("\n");
}

/** Run gitleaks with Cloclod's config and return what it found. Never prints a secret. */
export async function runGitleaks(cwd: string, args: string[]): Promise<GitleaksFinding[]> {
  const binary = await gitleaksBinary();
  const config = configFor(cwd);
  const configPath = join(
    cacheDir(),
    "gitleaks",
    `cloclod-${createHash("sha256").update(config).digest("hex").slice(0, 12)}.toml`,
  );
  if (!existsSync(configPath)) {
    await mkdir(join(cacheDir(), "gitleaks"), { recursive: true });
    await writeFile(configPath, config);
  }
  const result = await exec(
    binary,
    [
      ...args,
      "--config",
      configPath,
      "--report-format",
      "json",
      "--report-path",
      "-",
      "--exit-code",
      "0",
      "--no-banner",
      "--log-level",
      "error",
      "--max-target-megabytes",
      "2",
    ],
    { cwd, timeout: 120_000 },
  );
  if (result.exitCode !== 0) {
    throw new ScannerUnavailable(
      `gitleaks stopped with an error: ${result.stderr.trim().slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(result.stdout.trim() || "[]") as GitleaksFinding[];
  } catch {
    throw new ScannerUnavailable("gitleaks' report couldn't be read.");
  }
}
