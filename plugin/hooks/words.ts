// Plain words for what Claude does. Pure functions: no `$`, so they're easy to test and share.

const LIVE_DB_WRITE =
  /^\s*(insert|update|delete|merge|upsert|alter|create|drop|truncate|grant|revoke|comment|rename|vacuum|reindex|cluster|copy|call|do|set|reset|lock)\b/im;
const READ_ONLY = /^\s*(select|with|explain|show|values|table)\b/i;
const DML_ANYWHERE =
  /\b(insert\s+into|update\s+[\w."]+\s+set|delete\s+from|merge\s+into|alter\s+table|create\s+(table|index|policy|function|trigger|view)|drop\s+\w+)\b/i;

/** Does this SQL change anything? Conservative: anything not clearly a read counts as a write. */
export function sqlWrites(sql: string): boolean {
  const statements = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length === 0) return false;
  return statements.some(
    (s) =>
      LIVE_DB_WRITE.test(s) ||
      DML_ANYWHERE.test(s) ||
      !READ_ONLY.test(s) ||
      (/\binto\b/i.test(s) && /^\s*select\b/i.test(s)),
  );
}

/** Changes that can't be undone, flagged loudly before they run. */
export function sqlIsDestructive(sql: string): boolean {
  return /\b(drop\s+(table|column|schema|function|policy|view|type)|truncate|delete\s+from\s+[\w."]+\s*(;|$)|alter\s+table\s+[\w."]+\s+disable\s+row\s+level\s+security)/im.test(
    sql.replace(/--.*$/gm, ""),
  );
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "src/pages/Pricing.tsx" → "the Pricing page"; "src/components/Hero.tsx" → "Hero". */
export function friendlyFile(path: string): string {
  const clean = path.replace(/\\/g, "/");
  const base = clean.split("/").pop() ?? clean;
  const name = base.replace(/\.(tsx|ts|jsx|js|mjs|css|scss|json|html|md|sql|toml)$/i, "");
  if (/(^|\/)supabase\/migrations\//.test(clean)) return "a database change record";
  const fn = clean.match(/supabase\/functions\/([^/]+)\//);
  if (fn)
    return fn[1] === "_shared" ? "the backend's shared code" : `the “${fn[1]}” backend function`;
  if (/tailwind\.config/.test(base)) return "the theme";
  if (/\.(css|scss)$/.test(base)) return "the styles";
  if (base === "package.json") return "the app's packages";
  if (base === "index.html") return "the page head";
  if (/^(AGENTS|CLAUDE)\.md$/.test(base)) return "Claude's working notes";
  if (/(^|\/)(pages|routes)\//.test(clean)) {
    if (/^(index|Index|home|Home)$/.test(name)) return "the home page";
    if (name === "__root") return "the page layout";
    return `the ${titleCase(name.replace(/[-_.$]/g, " ").trim())} page`;
  }
  if (/(^|\/)components\/ui\//.test(clean)) return `the ${name.replace(/-/g, " ")} style`;
  return name.replace(/[-_]/g, " ");
}

export interface FriendlyRow {
  /** One short line, past tense when done. */
  text: string;
  tone: "work" | "look" | "data" | "quiet";
}

interface ToolLike {
  tool: string;
  input: unknown;
  isRunning: boolean;
  isErrored: boolean;
}

const verb = (running: boolean, now: string, done: string) => (running ? now : done);

function domainOf(url: unknown): string {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "a web page";
  }
}

/** A plain-language line for a tool call, or undefined to keep Claude Code's own row. */
export function describeTool(call: ToolLike): FriendlyRow | undefined {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const running = call.isRunning;
  const file = typeof input.file_path === "string" ? friendlyFile(input.file_path) : "a file";
  switch (call.tool) {
    case "Edit":
    case "MultiEdit":
      return { text: `${verb(running, "Updating", "Updated")} ${file}`, tone: "work" };
    case "Write":
      return { text: `${verb(running, "Writing", "Wrote")} ${file}`, tone: "work" };
    case "NotebookEdit":
      return { text: `${verb(running, "Updating", "Updated")} a notebook`, tone: "work" };
    case "Read":
      return { text: `${verb(running, "Looking at", "Looked at")} ${file}`, tone: "look" };
    case "Glob":
    case "Grep":
    case "LS":
      return { text: verb(running, "Searching the project", "Searched the project"), tone: "look" };
    case "WebFetch":
      return { text: `${verb(running, "Reading", "Read")} ${domainOf(input.url)}`, tone: "look" };
    case "WebSearch":
      return { text: verb(running, "Searching the web", "Searched the web"), tone: "look" };
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return { text: "Updated the plan", tone: "quiet" };
    case "Task":
    case "Agent":
      return { text: verb(running, "Asking a helper", "Asked a helper"), tone: "look" };
    case "Bash":
      return describeCommand(String(input.command ?? ""), running);
    default:
      break;
  }
  const supabase = supabaseTool(call.tool);
  if (supabase) return describeSupabase(supabase, input, running);
  return undefined;
}

/** The move's steps, as the conversation shows them while Claude runs them. */
const MOVE_WORDS: Record<string, [string, string, FriendlyRow["tone"]]> = {
  create: ["Creating your new backend", "Created your new backend", "work"],
  export: ["Reading your export", "Read your export", "look"],
  copy: ["Copying your data", "Copied your data", "work"],
  files: ["Copying your files", "Copied your files", "work"],
  functions: ["Deploying your backend functions", "Deployed your backend functions", "work"],
  preview: ["Switching the preview", "Switched the preview", "work"],
  diagnose: ["Checking your new backend", "Checked your new backend", "look"],
  status: ["Checking the move", "Checked the move", "look"],
  site: ["Putting your site on Netlify", "Put your site on Netlify", "work"],
  emails: ["Setting up your emails", "Set up your emails", "work"],
  pause: ["Reading the pause", "Read the pause", "look"],
  golive: ["Switching to your new backend", "Switched to your new backend", "work"],
};

export function describeCommand(command: string, running: boolean): FriendlyRow | undefined {
  // Claude often starts with `cd <project> &&`: what follows is what matters.
  const c = command.trim().replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/, "");
  const add = c.match(
    /^(?:npm\s+(?:install|i|add)|pnpm\s+add|yarn\s+add|bun\s+add)\s+(?:-[\w-]+\s+)*([@\w./-]+)/,
  );
  if (add) return { text: `${verb(running, "Adding", "Added")} ${add[1]}`, tone: "work" };
  if (/^(npm|pnpm|yarn|bun)\s+(install|i|ci)\s*$/.test(c))
    return {
      text: verb(running, "Installing the app's packages", "Installed the app's packages"),
      tone: "work",
    };
  if (/^(npm|pnpm|yarn|bun)\s+run\s+build\b|^npx\s+vite\s+build\b/.test(c))
    return {
      text: verb(running, "Checking the app builds", "Checked the app builds"),
      tone: "look",
    };
  if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint)\b|^npx\s+(tsc|eslint|vitest)\b/.test(c))
    return { text: verb(running, "Checking for problems", "Checked for problems"), tone: "look" };
  if (/^git\s+(status|diff|log|show)\b/.test(c))
    return {
      text: verb(running, "Reviewing recent changes", "Reviewed recent changes"),
      tone: "look",
    };
  const db = c.match(/clodable(?:\.mjs")?\s+db\s+(query|run|apply|check)\b/);
  if (db) {
    return db[1] === "query" || db[1] === "check"
      ? { text: verb(running, "Looking at your database", "Looked at your database"), tone: "look" }
      : {
          text: verb(running, "Changing your database", "Changed your database"),
          tone: "work",
        };
  }
  const move = c.match(/clodable(?:\.mjs")?\s+move\s+(\w+)/);
  if (move) {
    const words = MOVE_WORDS[move[1]!] ?? MOVE_WORDS.status!;
    return { text: verb(running, words[0], words[1]), tone: words[2] };
  }
  if (/^(npx\s+)?clodable\s+/.test(c)) return { text: "Checked your draft", tone: "quiet" };
  if (/^(ls|cat|head|tail|find|grep|rg|wc|pwd)\b/.test(c))
    return {
      text: verb(running, "Looking around the project", "Looked around the project"),
      tone: "look",
    };
  if (/^(mkdir|touch|cp|mv)\b/.test(c))
    return { text: verb(running, "Organizing files", "Organized files"), tone: "work" };
  if (/^rm\b/.test(c))
    return { text: verb(running, "Removing files", "Removed files"), tone: "work" };
  if (/\b(curl|wget)\b/.test(c))
    return /localhost|127\.0\.0\.1/.test(c)
      ? { text: verb(running, "Checking the preview", "Checked the preview"), tone: "look" }
      : { text: verb(running, "Fetching a web page", "Fetched a web page"), tone: "look" };
  if (/^(lsof|ps|pgrep)\b/.test(c))
    return {
      text: verb(running, "Checking what's running", "Checked what's running"),
      tone: "quiet",
    };
  // Anything else stays out of the builder's way. Developers can turn plain wording off.
  return c
    ? { text: verb(running, "Running a command", "Ran a command"), tone: "quiet" }
    : undefined;
}

function describeSupabase(
  tool: string,
  input: Record<string, unknown>,
  running: boolean,
): FriendlyRow {
  switch (tool) {
    case "execute_sql": {
      const sql = String(input.query ?? input.sql ?? "");
      return sqlWrites(sql)
        ? { text: verb(running, "Changing your live data", "Changed your live data"), tone: "data" }
        : { text: verb(running, "Looking at your data", "Looked at your data"), tone: "look" };
    }
    case "apply_migration":
      return {
        text: `${verb(running, "Changing your database", "Changed your database")}${input.name ? `: ${String(input.name).replace(/_/g, " ")}` : ""}`,
        tone: "data",
      };
    case "list_tables":
    case "list_extensions":
    case "list_migrations":
      return {
        text: verb(running, "Looking at your database", "Looked at your database"),
        tone: "look",
      };
    case "get_advisors":
      return {
        text: verb(running, "Checking your database's safety", "Checked your database's safety"),
        tone: "look",
      };
    case "get_logs":
      return {
        text: verb(running, "Reading your backend's logs", "Read your backend's logs"),
        tone: "look",
      };
    case "search_docs":
      return {
        text: verb(running, "Reading Supabase's docs", "Read Supabase's docs"),
        tone: "look",
      };
    case "deploy_edge_function":
      return {
        text: verb(running, "Putting a backend function live", "Put a backend function live"),
        tone: "data",
      };
    case "generate_typescript_types":
      return { text: "Refreshed the app's database types", tone: "work" };
    default:
      return {
        text: verb(running, "Working with your database", "Worked with your database"),
        tone: "look",
      };
  }
}

/** A collapsed group of calls, in one line: "Updated 3 parts of your app · looked at 5 files". */
export function describeGroup(calls: ReadonlyArray<ToolLike>): string {
  let work = 0;
  let look = 0;
  let data = 0;
  for (const call of calls) {
    const row = describeTool(call);
    if (!row) look++;
    else if (row.tone === "work") work++;
    else if (row.tone === "data") data++;
    else if (row.tone === "look") look++;
  }
  const parts: string[] = [];
  if (work) parts.push(`updated ${work} part${work > 1 ? "s" : ""} of your app`);
  if (data) parts.push(`changed your database ${data === 1 ? "once" : `${data} times`}`);
  if (look) parts.push(`looked at ${look} thing${look > 1 ? "s" : ""}`);
  const text = parts.join(" · ") || "worked on your app";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Relative time without Intl surprises: "just now", "5 min ago", "2 h ago", "3 days ago". */
export function ago(iso: string | number, now: number): string {
  const then = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * The Supabase tool a call names, whichever server provides it: the one Clodable sets up
 * (`mcp__supabase__…`) or the claude.ai Supabase connector (`mcp__claude_ai_Supabase__…`).
 */
export function supabaseTool(name: string): string | undefined {
  return name.match(/^mcp__(?:claude_ai_)?supabase__(.+)$/i)?.[1];
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A site's address as people read it: "https://crumb.example/" → "crumb.example". */
export const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** A version in the history, by what it did: a restore says which version it went back to. */
export function versionName(subject: string): string {
  const back = subject.match(/^Restored the version from (.+?)(?:: (.+))?$/);
  if (!back) return subject;
  return back[2] ? `Went back to “${back[2]}”` : `Went back to the version from ${back[1]}`;
}

/**
 * What the builder pointed at in the preview, as they'd say it: "Heading <h1 class="…"> “Bread”"
 * (the toolbar's description, for Claude) reads "the heading “Bread”".
 */
export function pointedAt(element: string | undefined): string {
  const described = element?.match(/^([A-Z][a-z]+) <[^>]*>(?: “(.*)”)?$/);
  const kind = described?.[1]?.toLowerCase();
  if (!kind || kind === "element") return "this part of the page";
  return described?.[2] ? `the ${kind} “${described[2]}”` : `the ${kind}`;
}

/** The builder's words for a Point & ask request: "About the heading “Bread”: make it warmer". */
export const POINTED_AT = /^About (?:the [a-z]+(?: “[^”]*”)?|this part of the page): (.+)$/s;

/** A page of the app, as the builder knows it: "the home page", "the /menu page". */
export const pageName = (path: string | undefined) =>
  !path || path === "/" ? "the home page" : `the ${path} page`;

/** A commit subject from what the builder asked: first meaningful line, trimmed, at most 72 characters. */
export function saveMessage(request: string): string {
  // Requests Clodable wrote for the builder get the builder's words, not the error's.
  if (/^Fix (?:the home page|the \/\S* page): it's broken in the preview\.$/.test(request)) {
    return "Fixed a page that broke";
  }
  // Point & ask: what the builder asked, without what they pointed at.
  const asked = request.match(POINTED_AT)?.[1];
  if (asked) return saveMessage(asked);
  if (request.startsWith("Saving stopped: ")) return "Moved a secret key out of the code";
  if (request.startsWith("Publishing stopped: ")) return "Fixed what stopped publishing";
  // A step of the move, as the panel asked Claude: what it did, not the command.
  if (/^(Moving off Lovable: |Switch my preview )/.test(request)) {
    const what = request
      .replace(/^Moving off Lovable: /, "")
      .split(/ with `|\. Run `|\. Start from `|, then | \(|\. /)[0]!
      .replace(/^I've /, "")
      .replace(/[.!\s]+$/, "");
    return what.charAt(0).toUpperCase() + what.slice(1);
  }
  const line =
    request
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("From the preview")) ?? "";
  const cleaned = line.replace(/^(please|can you|could you|pls)\s+/i, "").replace(/[.!?\s]+$/, "");
  if (!cleaned) return "Saved changes";
  const short = cleaned.length > 72 ? `${cleaned.slice(0, 71).trimEnd()}…` : cleaned;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** What stopped, in two words: a save a secret key held back, or a publish. */
export const stoppedTitle = (code: string) =>
  code === "secret-found" ? "Not saved" : "Not published";

/** What a publish or an undo did. On Lovable's hosting, it reached GitHub; Lovable puts it live. */
export function doneTitle(kind: "published" | "undone", onLovable: boolean): string {
  if (onLovable) return kind === "published" ? "Published on GitHub" : "Undone on GitHub";
  return kind === "published" ? "You're live" : "Undone. The previous version is live";
}

/** Why something stopped, in a few words for the bar. The panel tells the whole story. */
export function shortReason(error: { code: string; message: string }): string {
  if (error.code === "conflict") return "The live site changed the same text";
  // "A secret key is in src/components/Hero.tsx" reads better as "… in Hero.tsx".
  return error.message
    .replace(/\b(?:src|app|supabase|public)\/(?:[\w.@-]+\/)*([\w.-]+\.\w+)/g, "$1")
    .replace(/\.$/, "");
}

/** The message Claude gets when the builder presses "Fix it" after a failed publish. */
export function fixPrompt(error: {
  code: string;
  message: string;
  details?: string;
  files?: string[];
}): string {
  if (error.code === "conflict") {
    return [
      "Publishing stopped: my draft and the live site both changed the same files.",
      error.files?.length ? `Files: ${error.files.join(", ")}.` : "",
      "Please combine both versions (keep both changes where you can), finish the merge so nothing is left unresolved, and check the app still builds. Then tell me it's ready to publish.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (error.code === "secret-found") {
    return [
      `Saving stopped: ${error.message}. Nothing went to GitHub.`,
      error.files?.length ? `Where: ${error.files.join(", ")}` : "",
      error.details ? `What the check found (masked):\n${error.details}` : "",
      "Please move it out of the code. Anything in the app's files reaches visitors' browsers and GitHub, so a secret key belongs on the server: for example a Supabase Edge Function secret, used from that function. If this key was ever shared or published before, tell me to replace it with its provider. Don't save or commit yourself: Clodable saves when you're done.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    `Publishing stopped: ${error.message}`,
    error.files?.length ? `Where: ${error.files.join(", ")}` : "",
    error.details ? `Details:\n${error.details.slice(0, 3000)}` : "",
    "Please fix it so I can publish again. Don't publish yourself; I'll click Publish.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
