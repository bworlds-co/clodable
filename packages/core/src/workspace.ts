import {
  isSetUp,
  type LocalState,
  loadConfig,
  loadState,
  type ProjectConfig,
  saveState,
} from "./config.js";
import { CloclodError } from "./errors.js";
import { Git } from "./git.js";
import { GhCli } from "./github/gh.js";
import type { GitHubAdapter } from "./github/types.js";
import { detectProject, type ProjectInfo } from "./project.js";

export interface WorkspaceOptions {
  cwd: string;
  /** Swap GitHub for a fake in tests and demos. */
  github?: GitHubAdapter;
  remote?: string;
  /**
   * Only open projects Cloclod was set up in (the default). Saving or publishing anywhere else
   * would commit and push someone's unrelated work. Only `kit` turns this off.
   */
  requireSetup?: boolean;
}

/** Everything one operation needs about the project in front of it. */
export class Workspace {
  private constructor(
    readonly root: string,
    readonly git: Git,
    readonly github: GitHubAdapter,
    readonly config: ProjectConfig,
    readonly project: ProjectInfo,
    readonly remote: string,
  ) {}

  static async open(options: WorkspaceOptions): Promise<Workspace> {
    const probe = new Git(options.cwd);
    if (!(await probe.isRepo())) {
      throw new CloclodError({
        code: "not-a-repo",
        message: "This folder isn't connected to GitHub yet.",
        hint: "Run `cloclod setup` here to bring in your app from GitHub.",
      });
    }
    const root = await probe.root();
    if (options.requireSetup !== false && !isSetUp(root)) {
      throw new CloclodError({
        code: "not-set-up",
        message: "Cloclod isn't set up in this project.",
        hint: "Run `cloclod setup` here to add it. Until then, Cloclod leaves this project alone.",
      });
    }
    const git = new Git(root);
    const [config, project] = await Promise.all([loadConfig(root), detectProject(root)]);
    return new Workspace(
      root,
      git,
      options.github ?? new GhCli(root),
      config,
      project,
      options.remote ?? "origin",
    );
  }

  get liveBranch(): string {
    return this.config.liveBranch;
  }

  get liveRef(): string {
    return `${this.remote}/${this.config.liveBranch}`;
  }

  async state(): Promise<LocalState> {
    return loadState(this.root);
  }

  async updateState(patch: Partial<LocalState>): Promise<LocalState> {
    const next = { ...(await this.state()), ...patch };
    await saveState(this.root, next);
    return next;
  }

  /** The GitHub login of the person at this computer, cached locally after the first lookup. */
  async login(): Promise<string> {
    const cached = (await this.state()).login;
    if (cached) return cached;
    const viewer = await this.github.viewer();
    await this.updateState({ login: viewer.login });
    return viewer.login;
  }

  /** `draft/<login>`: one draft per person, so nobody publishes someone else's unfinished work. */
  async draftBranch(): Promise<string> {
    return draftBranchFor(await this.login());
  }
}

export function draftBranchFor(login: string): string {
  const slug = login
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `draft/${slug || "me"}`;
}
