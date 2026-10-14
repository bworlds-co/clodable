import { existsSync } from "node:fs";
import { join } from "node:path";
import { ClodableError } from "./errors.js";
import { type ExecResult, exec } from "./exec.js";

const COMMIT_KINDS = ["save", "restore", "sync", "publish", "undo", "setup"] as const;

/** What a commit was, recorded as a `Clodable-Kind` trailer so history can be read back. */
export type CommitKind = (typeof COMMIT_KINDS)[number];

const KIND_KEY = "Clodable-Kind";

/** The trailer a commit's message ends with: `Clodable-Kind: publish`. */
export const kindTrailer = (kind: CommitKind) => `${KIND_KEY}: ${kind}`;

const KIND_LINE = new RegExp(`\\n?${KIND_KEY}:.*$`, "m");

/** A trailer's value, if it's a kind Clodable knows. */
function kindOf(value: string): CommitKind | undefined {
  const kind = value.trim();
  return (COMMIT_KINDS as readonly string[]).includes(kind) ? (kind as CommitKind) : undefined;
}

export interface Commit {
  sha: string;
  subject: string;
  body: string;
  date: string;
  author: string;
  kind: CommitKind | undefined;
}

export interface Identity {
  name: string;
  email: string;
}

const FIELD = "\x1f";
const RECORD = "\x1e";

export class Git {
  constructor(readonly cwd: string) {}

  async run(
    args: string[],
    options: { input?: string; timeout?: number } = {},
  ): Promise<ExecResult> {
    return exec("git", args, {
      cwd: this.cwd,
      env: { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      ...(options.input !== undefined ? { input: options.input } : {}),
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
    });
  }

  /** Run and return trimmed stdout; throw with git's message on failure. */
  async ok(args: string[], options: { input?: string; timeout?: number } = {}): Promise<string> {
    const result = await this.run(args, options);
    if (result.exitCode !== 0) {
      throw new ClodableError({
        code: "unknown",
        message: "Something unexpected went wrong.",
        hint: "Try again. If it keeps happening, share the details with your developer.",
        details: `git ${args.join(" ")}\n${result.stderr || result.stdout}`.trim(),
      });
    }
    return result.stdout.trim();
  }

  async isRepo(): Promise<boolean> {
    const result = await this.run(["rev-parse", "--is-inside-work-tree"]);
    return result.exitCode === 0 && result.stdout.trim() === "true";
  }

  async root(): Promise<string> {
    return this.ok(["rev-parse", "--show-toplevel"]);
  }

  async currentBranch(): Promise<string | undefined> {
    const result = await this.run(["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  async head(): Promise<string | undefined> {
    const result = await this.run(["rev-parse", "--verify", "--quiet", "HEAD"]);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  async revParse(ref: string): Promise<string | undefined> {
    const result = await this.run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  /** Changed paths in the working tree, including untracked files (respecting .gitignore). */
  async changedFiles(): Promise<string[]> {
    const out = await this.ok(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const entries = out.split("\0").filter(Boolean);
    const files: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const status = entry.slice(0, 2);
      files.push(entry.slice(3));
      // Renames and copies carry the original path as the next NUL-separated field.
      if (status.startsWith("R") || status.startsWith("C")) i++;
    }
    return files;
  }

  async hasChanges(): Promise<boolean> {
    return (await this.changedFiles()).length > 0;
  }

  async identity(): Promise<Identity | undefined> {
    const name = (await this.run(["config", "user.name"])).stdout.trim();
    const email = (await this.run(["config", "user.email"])).stdout.trim();
    return name && email ? { name, email } : undefined;
  }

  async setLocalIdentity(identity: Identity): Promise<void> {
    await this.ok(["config", "--local", "user.name", identity.name]);
    await this.ok(["config", "--local", "user.email", identity.email]);
  }

  /** Stage everything and commit. Returns the new commit's sha, or undefined if nothing changed. */
  async commitAll(
    subject: string,
    options: { body?: string; kind: CommitKind; identity?: Identity; allowEmpty?: boolean },
  ): Promise<string | undefined> {
    await this.ok(["add", "--all"]);
    const staged = await this.run(["diff", "--cached", "--quiet"]);
    if (staged.exitCode === 0 && !options.allowEmpty) return undefined;
    const message = [
      cleanSubject(subject),
      options.body?.trim() ? `\n${options.body.trim()}` : "",
      `\n${kindTrailer(options.kind)}`,
    ].join("\n");
    const identityArgs = options.identity
      ? ["-c", `user.name=${options.identity.name}`, "-c", `user.email=${options.identity.email}`]
      : [];
    const result = await this.run(
      [
        ...identityArgs,
        "commit",
        "--quiet",
        "--no-verify",
        ...(options.allowEmpty ? ["--allow-empty"] : []),
        "-F",
        "-",
      ],
      { input: message },
    );
    if (result.exitCode !== 0) {
      if (/tell me who you are|user\.email|empty ident/i.test(result.stderr)) {
        throw new ClodableError({
          code: "git-identity",
          message: "Saving needs to know who you are.",
          hint: "Run `clodable setup` once to connect your GitHub account.",
          details: result.stderr,
        });
      }
      throw new ClodableError({
        code: "unknown",
        message: "Your changes couldn't be saved.",
        details: result.stderr || result.stdout,
      });
    }
    return this.head();
  }

  async remoteUrl(remote = "origin"): Promise<string | undefined> {
    const result = await this.run(["remote", "get-url", remote]);
    return result.exitCode === 0 ? result.stdout.trim() : undefined;
  }

  async fetch(remote: string, ...refs: string[]): Promise<ExecResult> {
    return this.run(["fetch", "--quiet", "--prune", remote, ...refs], { timeout: 120_000 });
  }

  async push(
    branch: string,
    options: { remote?: string; setUpstream?: boolean; forceWithLease?: boolean } = {},
  ): Promise<{ ok: boolean; rejected: boolean; offline: boolean; stderr: string }> {
    const result = await this.run(
      [
        "push",
        "--quiet",
        ...(options.setUpstream ? ["--set-upstream"] : []),
        ...(options.forceWithLease ? ["--force-with-lease"] : []),
        options.remote ?? "origin",
        `${branch}:${branch}`,
      ],
      { timeout: 180_000 },
    );
    const stderr = result.stderr;
    return {
      ok: result.exitCode === 0,
      rejected: /rejected|non-fast-forward|fetch first/i.test(stderr),
      offline:
        /could not resolve host|unable to access|network is unreachable|timed out|could not read from remote/i.test(
          stderr,
        ),
      stderr,
    };
  }

  async deleteRemoteBranch(branch: string, remote = "origin"): Promise<boolean> {
    const result = await this.run(["push", "--quiet", remote, "--delete", branch], {
      timeout: 120_000,
    });
    return result.exitCode === 0;
  }

  /** Merge `ref` into the current branch. Leaves conflicts in place for someone to resolve. */
  async merge(ref: string, message: string): Promise<{ ok: boolean; conflicts: string[] }> {
    const result = await this.run(["merge", "--no-edit", "--no-ff", "-m", message, ref]);
    if (result.exitCode === 0) return { ok: true, conflicts: [] };
    const conflicts = await this.conflictedFiles();
    if (conflicts.length === 0) {
      throw new ClodableError({
        code: "unknown",
        message: "Your draft couldn't be brought up to date.",
        details: result.stderr || result.stdout,
      });
    }
    return { ok: false, conflicts };
  }

  async isMerging(): Promise<boolean> {
    return (await this.run(["rev-parse", "--quiet", "--verify", "MERGE_HEAD"])).exitCode === 0;
  }

  async conflictedFiles(): Promise<string[]> {
    const out = (await this.run(["diff", "--name-only", "--diff-filter=U"])).stdout;
    return out.split("\n").filter(Boolean);
  }

  async abortMerge(): Promise<void> {
    await this.run(["merge", "--abort"]);
  }

  /** Commits in `range`, newest first. */
  /** The files each commit in `range` changed, by sha. */
  async filesBy(
    range: string,
    options: { noMerges?: boolean; limit?: number } = {},
  ): Promise<Map<string, string[]>> {
    const result = await this.run([
      "log",
      "--format=%x00%H",
      "--name-only",
      ...(options.noMerges ? ["--no-merges"] : []),
      ...(options.limit ? [`-n${options.limit}`] : []),
      range,
      "--",
    ]);
    const files = new Map<string, string[]>();
    if (result.exitCode !== 0) return files;
    for (const block of result.stdout.split("\0").filter((b) => b.trim())) {
      const [sha = "", ...paths] = block.split("\n");
      files.set(sha.trim(), paths.map((p) => p.trim()).filter(Boolean));
    }
    return files;
  }

  async log(
    range: string,
    options: { noMerges?: boolean; firstParent?: boolean; limit?: number } = {},
  ): Promise<Commit[]> {
    const format = [
      "%H",
      "%s",
      "%b",
      "%aI",
      "%an",
      `%(trailers:key=${KIND_KEY},valueonly,separator=)`,
    ]
      .join(FIELD)
      .concat(RECORD);
    const result = await this.run([
      "log",
      `--format=${format}`,
      ...(options.noMerges ? ["--no-merges"] : []),
      ...(options.firstParent ? ["--first-parent"] : []),
      ...(options.limit ? [`-n${options.limit}`] : []),
      range,
      "--",
    ]);
    if (result.exitCode !== 0) return [];
    return result.stdout
      .split(RECORD)
      .map((record) => record.replace(/^\n/, ""))
      .filter((record) => record.trim().length > 0)
      .map((record) => {
        const [sha = "", subject = "", body = "", date = "", author = "", kind = ""] =
          record.split(FIELD);
        return {
          sha,
          subject,
          body: body.replace(KIND_LINE, "").trim(),
          date,
          author,
          kind: kindOf(kind),
        };
      });
  }

  async count(range: string, options: { noMerges?: boolean } = {}): Promise<number> {
    const result = await this.run([
      "rev-list",
      "--count",
      ...(options.noMerges ? ["--no-merges"] : []),
      range,
    ]);
    return result.exitCode === 0 ? Number(result.stdout.trim()) || 0 : 0;
  }

  async diffNames(range: string): Promise<string[]> {
    const result = await this.run(["diff", "--name-only", range]);
    return result.exitCode === 0 ? result.stdout.split("\n").filter(Boolean) : [];
  }

  async branchExists(name: string): Promise<boolean> {
    return (
      (await this.run(["show-ref", "--verify", "--quiet", `refs/heads/${name}`])).exitCode === 0
    );
  }

  async remoteBranchExists(name: string, remote = "origin"): Promise<boolean> {
    return (
      (await this.run(["show-ref", "--verify", "--quiet", `refs/remotes/${remote}/${name}`]))
        .exitCode === 0
    );
  }

  /** Switch branches, carrying uncommitted changes along (git's default behavior). */
  async switchTo(
    name: string,
    options: { create?: boolean; startPoint?: string; reset?: boolean } = {},
  ) {
    if (options.reset) {
      return this.ok([
        "switch",
        "--quiet",
        "-C",
        name,
        ...(options.startPoint ? [options.startPoint] : []),
      ]);
    }
    if (options.create) {
      return this.ok([
        "switch",
        "--quiet",
        "-c",
        name,
        ...(options.startPoint ? [options.startPoint] : []),
      ]);
    }
    return this.ok(["switch", "--quiet", name]);
  }

  /**
   * Make the working tree match `sha` (tracked files only), without moving the branch. The paths in
   * `keep` (files or folders, from the top) stay as they are.
   */
  async restoreTree(sha: string, keep: string[] = []): Promise<void> {
    await this.ok([
      "restore",
      `--source=${sha}`,
      "--staged",
      "--worktree",
      "--",
      ":/",
      ...keep.map((path) => `:(top,exclude)${path}`),
    ]);
  }

  async stageAll(): Promise<void> {
    await this.ok(["add", "--all"]);
  }

  /** Commits on this computer that no branch of `remote` has yet, newest first. */
  async unsent(remote = "origin", options: { merges?: boolean } = {}): Promise<string[]> {
    const result = await this.run([
      "rev-list",
      ...(options.merges ? ["--merges"] : []),
      "HEAD",
      "--not",
      `--remotes=${remote}`,
    ]);
    return result.exitCode === 0 ? result.stdout.split("\n").filter(Boolean) : [];
  }

  async hasRemoteRefs(remote = "origin"): Promise<boolean> {
    const result = await this.run(["for-each-ref", "--count=1", `refs/remotes/${remote}/`]);
    return result.exitCode === 0 && result.stdout.trim().length > 0;
  }

  async parents(sha: string): Promise<string[]> {
    const out = await this.ok(["rev-list", "--parents", "-n", "1", sha]);
    return out.split(" ").slice(1).filter(Boolean);
  }

  /** Move the branch back to `ref`, keeping every change staged. Nothing in the files is lost. */
  async resetSoft(ref: string): Promise<void> {
    await this.ok(["reset", "--quiet", "--soft", ref]);
  }

  async lsFiles(): Promise<string[]> {
    const out = await this.ok(["ls-files", "-z"]);
    return out.split("\0").filter(Boolean);
  }

  async worktreeAdd(path: string, branch: string, startPoint: string): Promise<Git> {
    await this.ok(["worktree", "add", "--quiet", "-B", branch, path, startPoint]);
    return new Git(path);
  }

  async worktreeRemove(path: string): Promise<void> {
    await this.run(["worktree", "remove", "--force", path]);
    await this.run(["worktree", "prune"]);
  }

  gitDir(): string {
    return join(this.cwd, ".git");
  }

  hasGitDir(): boolean {
    return existsSync(this.gitDir());
  }
}

/** One line, at most 72 characters, ending without a period: a good commit subject. */
export function cleanSubject(text: string): string {
  const firstLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "Update";
  const singleSpaced = firstLine.replace(/\s+/g, " ").replace(/[.\s]+$/, "");
  const capitalized = singleSpaced.charAt(0).toUpperCase() + singleSpaced.slice(1);
  return capitalized.length <= 72 ? capitalized : `${capitalized.slice(0, 71).trimEnd()}…`;
}

/** owner/repo from a GitHub remote URL (https or ssh). */
export function parseGitHubRemote(url: string): { owner: string; repo: string } | undefined {
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1]!, repo: match[2]! } : undefined;
}
