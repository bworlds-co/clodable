// What Claude may do on its own in an app Cloclod set up, and what stays the builder's: the
// commands and paths the guards and the permission checks look for. Pure functions: no `$`.

export const PUSH_OR_REWRITE =
  /\bgit\s+(push|reset\s+--hard|rebase|filter-branch|filter-repo|update-ref)\b|\bgh\s+pr\s+merge\b/;
/**
 * Cloclod's command line, as a command names it: `cloclod` (npx), the plugin's `cli/cloclod.mjs`,
 * or the copy setup puts in each app, which keeps its earlier name for now
 * (`.clodable/local/clodable.mjs`). A quoted path ends with its quote.
 */
export const CLI = String.raw`(?:cloclod(?:\.mjs)?|clodable\.mjs)["']?`;
export const OUR_PUBLISH = new RegExp(String.raw`\b${CLI}\s+(publish|undo)\b`);
/** Creating the builder's private app on GitHub: they choose the account in the panel. */
export const SETUP_NEW = new RegExp(String.raw`\b${CLI}\s+setup\b[^\n]*--new\b`);
/** Creating the site or the backend: the builder confirms the account and cost in the panel. */
export const CREATE_SERVICE = new RegExp(String.raw`\b${CLI}\s+(site|backend)\s+create\b`);
export const LEAVE_DRAFT = /\bgit\s+(checkout|switch)\s+(-[-\w]+\s+)*(main|master)\b/;
/**
 * Cloclod's private folder on this computer: the Supabase token, database passwords, and the
 * export with people's emails and password hashes. It never goes into a conversation.
 */
export const PRIVATE_FOLDER =
  /Library\/Application Support\/clodable|\.config\/clodable|AppData[\\/]Roaming[\\/]clodable|clodable[\\/]secrets\.json/i;
export const PRIVATE_FOLDER_DENY =
  "That folder holds Cloclod's keys and the people's data from the Lovable export, so it stays out of the conversation. Use `cloclod move status` or `cloclod move diagnose` instead: they report what's safe to see.";
/**
 * Steps that take a secret (a token, a key): the builder types those in the Cloclod panel, never
 * in the chat.
 */
export const SECRET_STEP = new RegExp(
  String.raw`${CLI}\s+move\s+(connect|secret|vault-secret|disconnect|forget|netlify|setting|resend|ai|google)\b|${CLI}\s+move\s+files\b.*--private|${CLI}\s+connect\b`,
);

/** A copied GitHub address or owner/name, normalized for setup's --repo argument. */
export function githubRepo(input: string): string | undefined {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (
        url.hostname !== "github.com" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash
      )
        return undefined;
      value = url.pathname.replace(/^\//, "");
    } catch {
      return undefined;
    }
  }
  value = value.replace(/\/$/, "").replace(/\.git$/, "");
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?\/[\w.-]+$/i.test(value)) return undefined;
  const name = value.split("/")[1];
  return name === "." || name === ".." ? undefined : value;
}

/** Whether a tool's file or path is inside Cloclod's private folder. */
export function inPrivateFolder(input: unknown): boolean {
  const fields = input as Record<string, unknown>;
  return [fields.file_path, fields.path, fields.notebook_path].some((v) =>
    PRIVATE_FOLDER.test(String(v ?? "")),
  );
}

/**
 * Cloclod's database commands (`npx cloclod db query|run|apply …`, the plugin's own CLI, or the
 * app's installed copy), with what they act on. `single`: one command and one quoted argument,
 * nothing else for the shell.
 */
export function dbCommandIn(
  command: string,
): { action: "query" | "run" | "apply" | "check"; arg: string; single: boolean } | undefined {
  const m = command.match(
    /^(?:npx\s+cloclod|node\s+"[^"]*(?:cloclod|clodable)\.mjs")\s+db\s+(query|run|apply|check)(?:\s+([\s\S]*))?$/,
  );
  if (!m) return undefined;
  const rest = (m[2] ?? "").trim();
  const quoted = rest.match(/^"([^"`$\\]*)"$|^'([^']*)'$/);
  const bare = /^[\w./-]+$/.test(rest) ? rest : undefined;
  const arg = quoted ? (quoted[1] ?? quoted[2] ?? "") : (bare ?? rest);
  return {
    action: m[1] as "query" | "run" | "apply" | "check",
    arg,
    single: Boolean(quoted || bare),
  };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Claude sometimes repeats its working folder before the panel's command. Strip only a literal
 * cd into this app, never another folder, shell expansion, or an extra command. The remaining
 * command still has to pass its exact allowlist.
 */
export function commandInApp(command: string, cwd: string): string {
  const value = command.trim();
  if (!cwd || /[\n\r]/.test(cwd)) return value;
  const paths: string[] = [];
  if (!cwd.includes("'")) paths.push(`'${cwd}'`);
  if (!/["`$\\]/.test(cwd)) paths.push(`"${cwd}"`);
  if (/^[\w/.-]+$/.test(cwd)) paths.push(cwd);
  for (const path of paths) {
    const prefix = new RegExp(`^cd\\s+(?:--\\s+)?${escapeRegExp(path)}\\s*&&\\s*`);
    if (prefix.test(value)) return value.replace(prefix, "");
  }
  return value;
}

/** How Claude runs a move step: Cloclod's own command line, next to the plugin at `root`. */
export function moveCommandLine(root: string, args: string[]): string {
  return `node "${root}/cli/cloclod.mjs" move ${args.join(" ")}`;
}

/** Claude's own runs of the move's steps, exactly as the panel's requests spell them. */
export function isMoveStep(root: string, command: string): boolean {
  return new RegExp(
    `^node "${escapeRegExp(root)}/cli/cloclod\\.mjs" move (status|check|facts|choices|create|export|copy|verify|diagnose|files|functions|secrets|preview|teams|site|settings|emails|pause|golive|domain|services|app-emails)( --?[\\w-]+| [\\w.:@-]+)*$`,
  ).test(command);
}

/** How Claude puts the site online or creates the backend: Cloclod's own command line. */
export function onlineCommandLine(root: string, args: string[]): string {
  return `node "${root}/cli/cloclod.mjs" ${args.join(" ")}`;
}

/** Claude's own runs of those, exactly as the panel's requests spell them. */
export function isOnlineStep(root: string, command: string): boolean {
  return new RegExp(
    `^node "${escapeRegExp(root)}/cli/cloclod\\.mjs" (site|backend)( create)?( --(team|org|region) [\\w.-]+)*$`,
  ).test(command);
}

/** Only informational commands from the installed bundle or its project-local copy. */
export function isRuntimeRead(root: string, command: string): boolean {
  return new RegExp(
    `^node "(?:${escapeRegExp(root)}/cli/cloclod\\.mjs|\\.clodable/local/clodable\\.mjs)" (status|history|doctor|check|settings)( --json)?$`,
  ).test(command);
}

/**
 * Claude records what it found in the app with a quoted heredoc: inert JSON, nothing in it runs. A
 * line equal to the delimiter would end it early and run the rest, so none is allowed.
 */
export function isFactsRecord(root: string, command: string): boolean {
  const m = command.match(
    new RegExp(
      `^node "${escapeRegExp(root)}/cli/cloclod\\.mjs" move facts --set <<'(\\w+)'\n([\\s\\S]*)\n(\\w+)$`,
    ),
  );
  if (!m || m[1] !== m[3]) return false;
  return !m[2]!.split("\n").some((line) => line === m[1]);
}

export const SAFE_BASH = [
  /^(npm|pnpm|yarn|bun)\s+(install|i|ci|add)\b/,
  /^(npm|pnpm|yarn|bun)\s+run\s+(build|lint|test|typecheck|check)\b/,
  /^(npm|pnpm|yarn|bun)\s+(test|lint)\b/,
  /^npx\s+(tsc|eslint|prettier|vitest|cloclod\s+(status|check|history|doctor))\b/,
  /^git\s+(status|diff|log|show|blame)\b/,
  /^(ls|pwd|cat|head|tail|wc|grep|rg)\b/,
];

/** A command Claude may run without asking: one of SAFE_BASH, with nothing else for the shell. */
export const safeCommand = (command: string) =>
  !/[;&|`$<>]/.test(command) && SAFE_BASH.some((r) => r.test(command));

export const SUPABASE_READS = new Set([
  "list_tables",
  "list_extensions",
  "list_migrations",
  "get_advisors",
  "get_logs",
  "search_docs",
  "get_project_url",
  "get_publishable_keys",
  "get_anon_key",
  "list_edge_functions",
  "get_edge_function",
  "generate_typescript_types",
  "list_storage_buckets",
  "get_storage_config",
]);

/** A path inside the project at `root`, and not in .git, a .env file or node_modules. */
export function insideProject(path: unknown, root: string): boolean {
  // Windows paths use backslashes and drive letters; compare with forward slashes everywhere.
  const slash = (value: string) => value.replace(/\\/g, "/");
  const p = slash(String(path ?? ""));
  const base = slash(root).replace(/\/$/, "");
  if (!p || !base) return false;
  const absolute = /^([a-zA-Z]:)?\//.test(p) ? p : `${base}/${p}`;
  if (!absolute.toLowerCase().startsWith(`${base.toLowerCase()}/`) || absolute.includes("/../"))
    return false;
  return !/\/\.git\/|\/\.env(\.|$)|\/node_modules\//.test(absolute);
}
