import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClodableError } from "../errors.js";
import { Git } from "../git.js";
import type {
  BuildProgress,
  CheckSummary,
  Deployment,
  GitHubAdapter,
  PullRequest,
  RepoInfo,
  Viewer,
} from "./types.js";

/**
 * An in-memory GitHub on top of a local bare repository. It's used by tests, and by demos that
 * show Clodable without touching a real account. Merges really happen in the bare repo.
 */
export class FakeGitHub implements GitHubAdapter {
  readonly pullRequests: PullRequest[] = [];
  /** Decides what checks a pull request reports. By default it has none. */
  checkFor: (pr: PullRequest) => CheckSummary = () => ({ state: "none" });
  /** Decides what a merge commit's deployments look like. By default, a successful production deploy. */
  deploymentFor: (sha: string) => Deployment[] = () => [
    {
      id: 1,
      environment: "Production",
      isProduction: true,
      state: "success",
      url: "https://crumb-and-co.example",
    },
  ];

  /**
   * With `stateFile`, pull requests survive across processes. That lets the CLI run against a
   * fake GitHub for demos (`CLODABLE_FAKE_GITHUB=<bare repo>`).
   */
  static persistent(
    bareRepo: string,
    stateFile = `${bareRepo}/clodable-fake-github.json`,
  ): FakeGitHub {
    const fake = new FakeGitHub(bareRepo);
    fake.stateFile = stateFile;
    // A repository nothing puts online yet: no host reports a deployment.
    if (process.env.CLODABLE_FAKE_HOST === "none") fake.deploymentFor = () => [];
    if (existsSync(stateFile)) {
      fake.pullRequests.push(...(JSON.parse(readFileSync(stateFile, "utf8")) as PullRequest[]));
    }
    return fake;
  }

  private stateFile: string | undefined;

  private persist() {
    if (this.stateFile) writeFileSync(this.stateFile, JSON.stringify(this.pullRequests, null, 2));
  }

  constructor(
    readonly bareRepo: string,
    readonly user: Viewer = { login: "ada", name: "Ada", email: "1+ada@users.noreply.github.com" },
    readonly info: RepoInfo = {
      owner: "crumb",
      name: "site",
      url: "https://github.com/crumb/site",
      defaultBranch: "main",
      isPrivate: true,
    },
  ) {}

  async ready() {
    return { installed: true, authenticated: true };
  }

  async createPrivateRepository(name: string): Promise<{ repo: RepoInfo; cloneUrl: string }> {
    if (existsSync(this.bareRepo))
      throw new ClodableError({
        code: "already-there",
        message: "That app name is already in use.",
      });
    const seed = await mkdtemp(join(tmpdir(), "clodable-new-app-"));
    try {
      const git = new Git(seed);
      await git.ok(["init", "--quiet", "--initial-branch=main"]);
      await git.setLocalIdentity({ name: "GitHub", email: "noreply@github.com" });
      await writeFile(join(seed, "README.md"), `# ${name}\n`);
      await git.commitAll("Initial app", { kind: "setup" });
      await mkdir(join(this.bareRepo, ".."), { recursive: true });
      await git.ok(["clone", "--bare", seed, this.bareRepo]);
      Object.assign(this.info, {
        owner: this.user.login,
        name,
        url: `https://github.com/${this.user.login}/${name}`,
      });
      return { repo: this.info, cloneUrl: this.bareRepo };
    } finally {
      await rm(seed, { recursive: true, force: true });
    }
  }

  async viewer() {
    return this.user;
  }

  async repo() {
    return this.info;
  }

  async findOpenPullRequest(head: string) {
    return this.pullRequests.find((pr) => pr.headRef === head && pr.state === "open");
  }

  async createPullRequest(input: { head: string; base: string; title: string; body: string }) {
    const number = this.pullRequests.length + 1;
    const pr: PullRequest = {
      number,
      url: `${this.info.url}/pull/${number}`,
      title: input.title,
      body: input.body,
      headRef: input.head,
      baseRef: input.base,
      state: "open",
    };
    this.pullRequests.push(pr);
    this.persist();
    return pr;
  }

  async updatePullRequest(number: number, input: { title?: string; body?: string }) {
    const pr = this.pullRequests.find((p) => p.number === number);
    if (!pr) return;
    if (input.title !== undefined) pr.title = input.title;
    if (input.body !== undefined) pr.body = input.body;
    this.persist();
  }

  async checks(number: number) {
    const pr = this.pullRequests.find((p) => p.number === number);
    return pr ? this.checkFor(pr) : ({ state: "none" } as const);
  }

  async merge(number: number, input: { subject: string; body: string }) {
    const pr = this.pullRequests.find((p) => p.number === number);
    if (pr?.state !== "open") {
      throw new ClodableError({ code: "not-found", message: "That draft isn't open any more." });
    }
    const dir = await mkdtemp(join(tmpdir(), "clodable-fake-merge-"));
    try {
      const git = new Git(dir);
      await git.ok(["clone", "--quiet", this.bareRepo, "."]);
      await git.ok(["config", "user.name", "GitHub"]);
      await git.ok(["config", "user.email", "noreply@github.com"]);
      await git.ok(["switch", "--quiet", pr.baseRef]);
      const merged = await git.run(["merge", "--squash", `origin/${pr.headRef}`]);
      if (merged.exitCode !== 0) {
        throw new ClodableError({
          code: "merge-blocked",
          message: "GitHub couldn't combine your draft with the live site.",
          details: merged.stderr || merged.stdout,
        });
      }
      await git.ok(["commit", "--quiet", "-m", `${input.subject}\n\n${input.body}`]);
      await git.ok(["push", "--quiet", "origin", pr.baseRef]);
      const sha = (await git.head())!;
      pr.state = "merged";
      pr.mergeCommitSha = sha;
      this.persist();
      return { sha };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async deploymentsFor(sha: string) {
    return this.deploymentFor(sha);
  }

  async hasDeployments() {
    return this.deploymentFor("HEAD").length > 0;
  }

  /** Decides what a commit's GitHub build is doing. By default, none: the host builds elsewhere. */
  buildFor: (sha: string) => BuildProgress | undefined = () => undefined;

  async buildProgress(sha: string) {
    return this.buildFor(sha);
  }

  /** Repository secrets for GitHub Actions, kept next to the bare repository (tests read them). */
  readonly secrets: Record<string, string> = {};

  async setSecret(name: string, value: string) {
    const file = `${this.bareRepo}/clodable-fake-secrets.json`;
    const all = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>)
      : {};
    all[name] = value;
    this.secrets[name] = value;
    writeFileSync(file, JSON.stringify(all, null, 2));
  }
}
