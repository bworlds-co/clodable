// What Claude may do on its own in an app Clodable set up, and what stays the builder's: the
// commands and paths the guards and the permission checks look for. Pure functions: no `$`.

export const PUSH_OR_REWRITE =
  /\bgit\s+(push|reset\s+--hard|rebase|filter-branch|filter-repo|update-ref)\b|\bgh\s+pr\s+merge\b/;
export const OUR_PUBLISH = /\bclodable(?:\.mjs)?["']?\s+(publish|undo)\b/;
export const LEAVE_DRAFT = /\bgit\s+(checkout|switch)\s+(-[-\w]+\s+)*(main|master)\b/;
/**
 * Clodable's private folder on this computer: the Supabase token, database passwords, and the
 * export with people's emails and password hashes. It never goes into a conversation.
 */
export const PRIVATE_FOLDER =
  /Library\/Application Support\/clodable|\.config\/clodable|AppData[\\/]Roaming[\\/]clodable|clodable[\\/]secrets\.json/i;
export const PRIVATE_FOLDER_DENY =
  "That folder holds Clodable's keys and the people's data from the Lovable export, so it stays out of the conversation. Use `clodable move status` or `clodable move diagnose` instead: they report what's safe to see.";
/**
 * Steps that take a secret (a token, a key): the builder types those in the Clodable panel, never
 * in the chat.
 */
export const SECRET_STEP =
  /clodable(?:\.mjs"?)?\s+move\s+(connect|secret|vault-secret|disconnect|forget|netlify|setting|resend|ai|google)\b|clodable(?:\.mjs"?)?\s+move\s+files\b.*--private|clodable(?:\.mjs"?)?\s+connect\b/;

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

/** Whether a tool's file or path is inside Clodable's private folder. */
export function inPrivateFolder(input: unknown): boolean {
  const fields = input as Record<string, unknown>;
  return [fields.file_path, fields.path, fields.notebook_path].some((v) =>
    PRIVATE_FOLDER.test(String(v ?? "")),
  );
}

/**
 * Clodable's database commands (`npx clodable db query|run|apply …`, or the plugin's own CLI), with
 * what they act on. `single`: one command and one quoted argument, nothing else for the shell.
 */
export function dbCommandIn(
  command: string,
): { action: "query" | "run" | "apply" | "check"; arg: string; single: boolean } | undefined {
  const m = command.match(
    /^(?:npx\s+clodable|node\s+"[^"]*clodable\.mjs")\s+db\s+(query|run|apply|check)(?:\s+([\s\S]*))?$/,
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

/** How Claude runs a move step: Clodable's own command line, next to the plugin at `root`. */
export function moveCommandLine(root: string, args: string[]): string {
  return `node "${root}/cli/clodable.mjs" move ${args.join(" ")}`;
}

/** Claude's own runs of the move's steps, exactly as the panel's requests spell them. */
export function isMoveStep(root: string, command: string): boolean {
  return new RegExp(
    `^node "${escapeRegExp(root)}/cli/clodable\\.mjs" move (status|check|facts|rehearsal|choices|create|export|copy|verify|diagnose|files|functions|secrets|preview|teams|site|settings|emails|pause|golive|domain|services|app-emails)( --?[\\w-]+| [\\w.:@-]+)*$`,
  ).test(command);
}

/** How Claude puts the site online or creates the backend: Clodable's own command line. */
export function onlineCommandLine(root: string, args: string[]): string {
  return `node "${root}/cli/clodable.mjs" ${args.join(" ")}`;
}

/** Claude's own runs of those, exactly as the panel's requests spell them. */
export function isOnlineStep(root: string, command: string): boolean {
  return new RegExp(
    `^node "${escapeRegExp(root)}/cli/clodable\\.mjs" (site|backend)( create)?( --(team|org|region) [\\w.-]+)*$`,
  ).test(command);
}

/** Only informational commands from the installed bundle or its project-local copy. */
export function isRuntimeRead(root: string, command: string): boolean {
  return new RegExp(
    `^node "(?:${escapeRegExp(root)}/cli/clodable\\.mjs|\\.clodable/local/clodable\\.mjs)" (status|history|doctor|check|settings)( --json)?$`,
  ).test(command);
}

/**
 * Claude records what it found in the app with a quoted heredoc: inert JSON, nothing in it runs. A
 * line equal to the delimiter would end it early and run the rest, so none is allowed.
 */
export function isFactsRecord(root: string, command: string): boolean {
  const m = command.match(
    new RegExp(
      `^node "${escapeRegExp(root)}/cli/clodable\\.mjs" move (?:facts|rehearsal) --set <<'(\\w+)'\n([\\s\\S]*)\n(\\w+)$`,
    ),
  );
  if (!m || m[1] !== m[3]) return false;
  return !m[2]!.split("\n").some((line) => line === m[1]);
}

export const SAFE_BASH = [
  /^(npm|pnpm|yarn|bun)\s+(install|i|ci|add)\b/,
  /^(npm|pnpm|yarn|bun)\s+run\s+(build|lint|test|typecheck|check)\b/,
  /^(npm|pnpm|yarn|bun)\s+(test|lint)\b/,
  /^npx\s+(tsc|eslint|prettier|vitest|clodable\s+(status|check|history|doctor))\b/,
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
