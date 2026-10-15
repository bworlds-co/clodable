/** The GitHub operations Clodable needs, behind one interface, so tests and future front ends can swap them. */

export interface Viewer {
  login: string;
  name: string | undefined;
  /** A noreply address GitHub accepts for commits: `<id>+<login>@users.noreply.github.com`. */
  email: string;
}

export interface RepoInfo {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export interface PullRequest {
  number: number;
  url: string;
  title: string;
  body: string;
  headRef: string;
  baseRef: string;
  state: "open" | "closed" | "merged";
  mergeCommitSha?: string | undefined;
}

export type CheckSummary =
  | { state: "none" }
  | { state: "pending"; total: number; done: number }
  | { state: "success"; total: number }
  | { state: "failure"; total: number; failed: Array<{ name: string; url?: string | undefined }> };

/** A GitHub Actions build of one commit, while it runs. */
export interface BuildProgress {
  /** The workflow step running now, as the workflow names it ("Install the app's packages"). */
  step?: string;
  /** How long the last successful build of the same workflow took, in seconds. */
  lastSeconds?: number;
}

export interface Deployment {
  id: number;
  environment: string;
  isProduction: boolean;
  state: "pending" | "queued" | "in_progress" | "success" | "failure" | "error" | "inactive";
  url?: string | undefined;
  logUrl?: string | undefined;
}

export interface GitHubAdapter {
  /** Is the GitHub CLI installed and signed in? */
  ready(): Promise<{ installed: boolean; authenticated: boolean }>;
  viewer(): Promise<Viewer>;
  repo(): Promise<RepoInfo>;
  findOpenPullRequest(head: string): Promise<PullRequest | undefined>;
  createPullRequest(input: {
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<PullRequest>;
  updatePullRequest(number: number, input: { title?: string; body?: string }): Promise<void>;
  checks(number: number): Promise<CheckSummary>;
  /** Squash-merge. Returns the merge commit on the base branch. */
  merge(number: number, input: { subject: string; body: string }): Promise<{ sha: string }>;
  deploymentsFor(sha: string): Promise<Deployment[]>;
  /**
   * The GitHub Actions build of a commit (the site's own workflow), while it runs: undefined when
   * the host builds outside GitHub.
   */
  buildProgress?(sha: string): Promise<BuildProgress | undefined>;
  /**
   * Whether any host ever reported a deployment to this repository: none means nothing puts it
   * online from GitHub (yet).
   */
  hasDeployments?(): Promise<boolean>;
  /** Set a repository secret for GitHub Actions; the value goes on stdin, never on a command line. */
  setSecret(name: string, value: string): Promise<void>;
}
