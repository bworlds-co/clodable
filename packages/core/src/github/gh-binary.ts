import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { messageOf } from "../errors.js";
import { commandPath, exec } from "../exec.js";
import { cacheDir } from "../places.js";

/**
 * The GitHub CLI (https://cli.github.com, MIT), which Clodable signs in and talks to GitHub with.
 * A builder who doesn't have it installs nothing: Clodable pins one release, checks its SHA-256,
 * and downloads it once per computer, as it does for gitleaks. One already installed is used first:
 * both read the same sign-in.
 */
export const GH_VERSION = "2.102.0";

/** Release files and their SHA-256, from the release's own checksums file. */
const RELEASES: Record<string, { file: string; sha256: string }> = {
  "darwin-arm64": {
    file: "macOS_arm64.zip",
    sha256: "da922c20d1792e5b2cbf375593d7a658acf034c12c84e007e71c76ef959c337e",
  },
  "darwin-x64": {
    file: "macOS_amd64.zip",
    sha256: "b245f24eb2bf5f75b426b4c26da3651a107f8d5b6f4fddfbfccc5679041378b3",
  },
  "linux-arm64": {
    file: "linux_arm64.tar.gz",
    sha256: "7862c86c72f43df3a2d93ddde6f473285b4e2af61b494849846827e513ef6484",
  },
  "linux-x64": {
    file: "linux_amd64.tar.gz",
    sha256: "bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386",
  },
  "win32-arm64": {
    file: "windows_arm64.zip",
    sha256: "5dcf12aa8525eabd0c46ec414f323ab6cf65229fc2cd46543cc705001bbaf223",
  },
  "win32-x64": {
    file: "windows_amd64.zip",
    sha256: "ae64e556ecc240b200f7eba60d550e4bb60d78e860e69dd88c449405b86067f4",
  },
};

const executable = process.platform === "win32" ? "gh.exe" : "gh";

/**
 * Where Clodable keeps the command-line tools it fetched for the builder (the GitHub CLI, Node.js):
 * the plugin adds it to the PATH of Claude's session, after the builder's own.
 */
export function toolsBin(): string {
  return join(cacheDir(), "bin");
}

let resolved: Promise<string> | undefined;

/**
 * The GitHub CLI to run: `CLODABLE_GH` if set, else the one installed on this computer, else the
 * pinned release (downloaded and checked the first time). Rejects when none can be had.
 */
export async function ghBinary(): Promise<string> {
  if (process.env.CLODABLE_GH) return process.env.CLODABLE_GH;
  // One installed is looked up each time: it may come or go while Clodable runs.
  const installed = await commandPath("gh");
  if (installed && !installed.startsWith(toolsBin())) return installed;
  resolved ??= ours().catch((error) => {
    resolved = undefined;
    throw error;
  });
  return resolved;
}

/** Whether the GitHub CLI in use is the one Clodable fetched. */
export async function ghIsOurs(): Promise<boolean> {
  return (await ghBinary().catch(() => "")).startsWith(cacheDir());
}

/** Clodable's own copy, downloaded and checked the first time. */
async function ours(): Promise<string> {
  const release = RELEASES[`${process.platform}-${process.arch}`];
  if (!release) throw new Error(`No GitHub CLI build for ${process.platform}-${process.arch}.`);
  const dir = join(cacheDir(), "gh", GH_VERSION);
  const path = join(dir, executable);
  if (!existsSync(path)) {
    try {
      await download(release, dir, path);
    } catch (error) {
      throw new Error(`Couldn't download the GitHub CLI ${GH_VERSION}: ${messageOf(error)}`);
    }
  }
  await linkInBin(path);
  return path;
}

async function download(
  release: { file: string; sha256: string },
  dir: string,
  path: string,
): Promise<void> {
  const name = `gh_${GH_VERSION}_${release.file}`;
  const url = `https://github.com/cli/cli/releases/download/v${GH_VERSION}/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== release.sha256) throw new Error("the download didn't match its checksum");

  await mkdir(dir, { recursive: true });
  const work = await mkdtemp(join(dir, ".download-"));
  try {
    await writeFile(join(work, name), bytes);
    // Windows' archive holds bin/gh.exe; the others, a folder named after the archive.
    const inside =
      process.platform === "win32"
        ? `bin/${executable}`
        : `${name.replace(/\.(zip|tar\.gz)$/, "")}/bin/${executable}`;
    // bsdtar (macOS, Windows) reads zip archives too.
    const unpacked = await exec("tar", ["-xf", name, inside], { cwd: work, timeout: 60_000 });
    if (unpacked.exitCode !== 0) throw new Error(unpacked.stderr.trim() || "couldn't unpack it");
    await chmod(join(work, inside), 0o755);
    // Another process may have finished first; either copy is the same checked file.
    await rename(join(work, inside), path).catch((error) => {
      if (!existsSync(path)) throw error;
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** `gh` in Clodable's bin folder, which the plugin puts on the session's PATH. */
async function linkInBin(path: string): Promise<void> {
  if (process.platform === "win32") return;
  const link = join(toolsBin(), executable);
  await mkdir(toolsBin(), { recursive: true });
  await unlink(link).catch(() => {});
  await symlink(path, link).catch(() => {});
}
