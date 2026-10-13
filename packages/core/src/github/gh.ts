import { ClodableError, type ErrorInfo } from "../errors.js";
import { type ExecResult, exec, hasCommand } from "../exec.js";
import type {
  BuildProgress,
  CheckSummary,
  Deployment,
  GitHubAdapter,
  PullRequest,
  RepoInfo,
  Viewer,
} from "./types.js";

/** GitHubAdapter backed by the official GitHub CLI (`gh`), which Claude Desktop also relies on. */
export class GhCli implements GitHubAdapter {
  private repoCache: RepoInfo | undefined;

  constructor(readonly cwd: string) {}

  /** Run `gh` without prompts, colors or update notices; never throws for its exit code. */
  private run(args: string[], options: { timeout?: number; input?: string } = {}) {
    return exec("gh", args, {
      cwd: this.cwd,
      timeout: options.timeout ?? 60_000,
      env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
      ...(options.input === undefined ? {} : { input: options.input }),
    });
  }

  private async gh(args: string[], timeout = 60_000) {
    const result = await this.run(args, { timeout });
    if (result.exitCode !== 0) {
      throw ghError(result, {
        code: "unknown",
        message: "GitHub didn't accept a request.",
        details: `gh ${args.join(" ")}\n${result.stderr}\n${result.stdout}`.trim(),
      });
    }
    return result.stdout;
  }

  private async json<T>(args: string[]): Promise<T> {
    return JSON.parse(await this.gh(args)) as T;
  }

  async ready() {
    if (!(await hasCommand("gh", this.cwd))) return { installed: false, authenticated: false };
    const status = await this.run(["auth", "status", "--hostname", "github.com"], {
      timeout: 20_000,
    });
    return { installed: true, authenticated: status.exitCode === 0 };
  }

  /** The builder's own repositories (not forks), most recently changed first. */
  async repositories(limit = 40): Promise<Array<{ name: string; description: string | null }>> {
    const repos = await this.json<Array<{ nameWithOwner: string; description: string | null }>>([
      "repo",
      "list",
      "--limit",
      String(limit),
      "--json",
      "nameWithOwner,description",
      "--source",
    ]);
    return repos.map((r) => ({ name: r.nameWithOwner, description: r.description }));
  }

  /** Bring a repository onto this computer, into `target`. */
  async clone(repo: string, target: string): Promise<void> {
    await this.gh(["repo", "clone", repo, target], 10 * 60_000);
  }

  async viewer(): Promise<Viewer> {
    const user = await this.json<{ login: string; name: string | null; id: number }>([
      "api",
      "user",
    ]);
    return {
      login: user.login,
      name: user.name ?? undefined,
      email: `${user.id}+${user.login}@users.noreply.github.com`,
    };
  }

  async repo(): Promise<RepoInfo> {
    if (this.repoCache) return this.repoCache;
    const info = await this.json<{
      name: string;
      owner: { login: string };
      url: string;
      isPrivate: boolean;
      defaultBranchRef: { name: string } | null;
    }>(["repo", "view", "--json", "name,owner,url,isPrivate,defaultBranchRef"]);
    this.repoCache = {
      owner: info.owner.login,
      name: info.name,
      url: info.url,
      isPrivate: info.isPrivate,
      defaultBranch: info.defaultBranchRef?.name ?? "main",
    };
    return this.repoCache;
  }

  async findOpenPullRequest(head: string): Promise<PullRequest | undefined> {
    const list = await this.json<RawPr[]>([
      "pr",
      "list",
      "--head",
      head,
      "--state",
      "open",
      "--json",
      PR_FIELDS,
    ]);
    return list[0] ? toPullRequest(list[0]) : undefined;
  }

  async createPullRequest(input: { head: string; base: string; title: string; body: string }) {
    await this.gh([
      "pr",
      "create",
      "--head",
      input.head,
      "--base",
      input.base,
      "--title",
      input.title,
      "--body",
      input.body,
    ]);
    const created = await this.findOpenPullRequest(input.head);
    if (!created) {
      throw new ClodableError({
        code: "unknown",
        message: "The draft's page on GitHub couldn't be created.",
      });
    }
    return created;
  }

  async updatePullRequest(number: number, input: { title?: string; body?: string }) {
    const args = ["pr", "edit", String(number)];
    if (input.title !== undefined) args.push("--title", input.title);
    if (input.body !== undefined) args.push("--body", input.body);
    if (args.length > 3) await this.gh(args);
  }

  async checks(number: number): Promise<CheckSummary> {
    const result = await this.run(["pr", "checks", String(number), "--json", "name,bucket,link"]);
    // `gh pr checks` exits 8 while checks are pending and 1 when any failed; the JSON is still printed.
    if (!result.stdout.trim()) {
      if (/no checks reported/i.test(result.stderr)) return { state: "none" };
      const failure = ghError(result, {
        code: "unknown",
        message: "Couldn't read the checks on GitHub.",
        details: result.stderr.trim(),
      });
      // Signed out or offline exits 1 too: that isn't "no checks".
      if (failure.code !== "unknown") throw failure;
      if (result.exitCode !== 0 && result.exitCode !== 8 && result.exitCode !== 1) throw failure;
      return { state: "none" };
    }
    const checks = JSON.parse(result.stdout) as Array<{
      name: string;
      bucket: string;
      link?: string;
    }>;
    const relevant = checks.filter((c) => c.bucket !== "skipping");
    if (relevant.length === 0) return { state: "none" };
    const failed = relevant.filter((c) => c.bucket === "fail" || c.bucket === "cancel");
    if (failed.length > 0) {
      return {
        state: "failure",
        total: relevant.length,
        failed: failed.map((c) => ({ name: c.name, url: c.link })),
      };
    }
    const pending = relevant.filter((c) => c.bucket === "pending");
    if (pending.length > 0) {
      return { state: "pending", total: relevant.length, done: relevant.length - pending.length };
    }
    return { state: "success", total: relevant.length };
  }

  async merge(number: number, input: { subject: string; body: string }) {
    await this.gh(
      ["pr", "merge", String(number), "--squash", "--subject", input.subject, "--body", input.body],
      120_000,
    );
    const merged = await this.json<{ mergeCommit: { oid: string } | null; state: string }>([
      "pr",
      "view",
      String(number),
      "--json",
      "mergeCommit,state",
    ]);
    if (!merged.mergeCommit?.oid) {
      throw new ClodableError({
        code: "merge-blocked",
        message: "GitHub didn't publish your draft.",
        hint: "Your repository may require something before publishing. Open the draft on GitHub to see why.",
      });
    }
    return { sha: merged.mergeCommit.oid };
  }

  async setSecret(name: string, value: string): Promise<void> {
    const repo = await this.repo();
    // The value goes in on stdin, never as an argument.
    const result = await this.run(["secret", "set", name, "--repo", `${repo.owner}/${repo.name}`], {
      input: value,
    });
    if (result.exitCode !== 0) {
      throw ghError(result, {
        code: "unknown",
        message: `GitHub didn't accept the ${name} secret your site needs to publish.`,
        hint: "Check you can change this repository's settings on GitHub, then try again.",
        details: result.stderr.trim().slice(0, 500),
      });
    }
  }

  /** The last successful build's duration, per workflow: read once per publish. */
  private readonly lastBuild = new Map<number, number | undefined>();

  async buildProgress(sha: string): Promise<BuildProgress | undefined> {
    const { owner, name } = await this.repo();
    const runs = await this.json<{
      workflow_runs: Array<{ id: number; workflow_id: number; status: string }>;
    }>(["api", `repos/${owner}/${name}/actions/runs?head_sha=${sha}&per_page=5`]);
    const run = runs.workflow_runs.find((r) => r.status !== "completed") ?? runs.workflow_runs[0];
    if (!run) return undefined;
    const jobs = await this.json<{
      jobs: Array<{ steps?: Array<{ name: string; status: string }> }>;
    }>(["api", `repos/${owner}/${name}/actions/runs/${run.id}/jobs`]);
    const step = jobs.jobs.flatMap((j) => j.steps ?? []).find((s) => s.status === "in_progress");
    if (!this.lastBuild.has(run.workflow_id)) {
      const done = await this.json<{
        workflow_runs: Array<{ created_at: string; run_started_at?: string; updated_at: string }>;
      }>([
        "api",
        `repos/${owner}/${name}/actions/workflows/${run.workflow_id}/runs?status=success&per_page=1`,
      ]).catch(() => ({ workflow_runs: [] }));
      const last = done.workflow_runs[0];
      const seconds = last
        ? Math.round(
            (Date.parse(last.updated_at) - Date.parse(last.run_started_at ?? last.created_at)) /
              1000,
          )
        : undefined;
      this.lastBuild.set(run.workflow_id, seconds && seconds > 0 ? seconds : undefined);
    }
    const lastSeconds = this.lastBuild.get(run.workflow_id);
    // A finished run waits only for its deployment to say so: it's finishing, not starting.
    const doing = step?.name ?? (run.status === "completed" ? "Complete" : undefined);
    return { ...(doing ? { step: doing } : {}), ...(lastSeconds ? { lastSeconds } : {}) };
  }

  async deploymentsFor(sha: string): Promise<Deployment[]> {
    const { owner, name } = await this.repo();
    const deployments = await this.json<
      Array<{ id: number; environment: string; production_environment?: boolean }>
    >(["api", `repos/${owner}/${name}/deployments?sha=${sha}&per_page=20`]);
    const out: Deployment[] = [];
    for (const deployment of deployments) {
      const statuses = await this.json<
        Array<{
          state: Deployment["state"];
          environment_url?: string;
          log_url?: string;
          target_url?: string;
        }>
      >(["api", `repos/${owner}/${name}/deployments/${deployment.id}/statuses?per_page=1`]);
      const latest = statuses[0];
      out.push({
        id: deployment.id,
        environment: deployment.environment,
        isProduction:
          deployment.production_environment === true || /^prod/i.test(deployment.environment),
        state: latest?.state ?? "pending",
        url: latest?.environment_url || undefined,
        logUrl: latest?.log_url || latest?.target_url || undefined,
      });
    }
    return out;
  }
}

/**
 * How gh, git and Go say the network failed. Not "Could not resolve to a Repository": that's
 * GitHub answering that a name isn't there.
 */
const OFFLINE =
  /error connecting to|could not resolve host|no such host|connection refused|network is unreachable|i\/o timeout|tls handshake timeout|context deadline exceeded/i;

/**
 * A failed `gh` call in the builder's words: not connected to GitHub, offline (gh says "error
 * connecting to api.github.com" when nothing resolves), or else the caller's own message.
 */
function ghError(result: ExecResult, otherwise: ErrorInfo): ClodableError {
  const text = `${result.stderr}\n${result.stdout}`.trim();
  if (/auth login|not logged|authentication/i.test(text)) {
    return new ClodableError({
      code: "gh-auth",
      message: "Clodable isn't connected to your GitHub account.",
      hint: "Run `clodable setup` to connect it.",
      details: text,
    });
  }
  if (OFFLINE.test(text)) {
    return new ClodableError({
      code: "offline",
      message: "GitHub can't be reached right now.",
      hint: "Check your internet connection and try again.",
      details: text,
    });
  }
  return new ClodableError(otherwise);
}

const PR_FIELDS = "number,url,title,body,headRefName,baseRefName,state,mergeCommit";

interface RawPr {
  number: number;
  url: string;
  title: string;
  body: string;
  headRefName: string;
  baseRefName: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  mergeCommit: { oid: string } | null;
}

function toPullRequest(raw: RawPr): PullRequest {
  return {
    number: raw.number,
    url: raw.url,
    title: raw.title,
    body: raw.body,
    headRef: raw.headRefName,
    baseRef: raw.baseRefName,
    state: raw.state === "MERGED" ? "merged" : raw.state === "CLOSED" ? "closed" : "open",
    mergeCommitSha: raw.mergeCommit?.oid,
  };
}
