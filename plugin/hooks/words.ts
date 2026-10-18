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
    case "mcp__clodable__open_panel":
      return { text: verb(running, "Opening Clodable", "Opened Clodable"), tone: "quiet" };
    case "mcp__clodable__app_context":
      return {
        text: verb(running, "Looking at your app's setup", "Checked your app's setup"),
        tone: "look",
      };
    case "mcp__clodable__remember_app":
      return {
        text: verb(running, "Remembering your app's setup", "Remembered your app's setup"),
        tone: "quiet",
      };
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
  functions: ["Setting up your backend functions", "Set up your backend functions", "work"],
  preview: ["Switching the preview", "Switched the preview", "work"],
  diagnose: ["Checking your new backend", "Checked your new backend", "look"],
  status: ["Checking the move", "Checked the move", "look"],
  site: ["Preparing your website", "Prepared your website", "work"],
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
  const site = c.match(/clodable(?:\.mjs")?\s+site\s+create\b/);
  if (site) return { text: verb(running, "Setting up hosting", "Set up hosting"), tone: "work" };
  const backend = c.match(/clodable(?:\.mjs")?\s+backend\s+create\b/);
  if (backend)
    return { text: verb(running, "Creating your backend", "Created your backend"), tone: "work" };
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
  if (request === FIX_TEXT.secret) return "Moved a secret key out of the code";
  if (request === FIX_TEXT.publish) return "Fixed what stopped publishing";
  if (request === FIX_TEXT.conflict) return "Combined the draft with the live site";
  if (request.startsWith("Prepare a web address for my app.")) return "Set up hosting";
  // A step of the move, or the panel's own request: what it did, not the command or the rest.
  if (
    /^(Moving off Lovable: |Switch my preview |Put my site online|Prepare a web address for my app|Add a backend to my app)/.test(
      request,
    )
  ) {
    const what = request
      .replace(/^Moving off Lovable: /, "")
      .split(/ with `|\. Run `|\. Start from `|, then | \(|\. | in my Supabase organization/)[0]!
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

/**
 * Beside a command the panel hands Claude. The builder's earlier `/clodable` in the transcript
 * reads like a skill to load first, and isn't one. And Clodable saves after the reply, so its
 * files and git aren't the builder's concern.
 */
export const OWN_COMMAND =
  "That's Clodable's own command: run it as it is, with nothing to load first. Clodable saves what it changes after your reply, so don't list the files it touched, and never mention git, commits or pushes.";

/**
 * Setup just wrote the folder's AGENTS.md, which Claude reads when a conversation starts: one that
 * started before it gets it as it is, out of the builder's sight.
 */
export const appRules = (agentsMd: string) =>
  `Clodable just set itself up in this folder, after this conversation started, so you haven't read its AGENTS.md yet. Here it is: follow it from now on.\n\n${agentsMd.trim()}`;

/** Fix it's requests, in the builder's words: one per kind of stop, the same each time. */
export const FIX_TEXT = {
  conflict: "Combine my draft with the changes on the live site, so I can publish again.",
  secret: "Move the secret key out of my code, so my changes can be saved.",
  publish: "Fix what stopped my publish, so I can publish again.",
} as const;

const RECOVERY_VOICE =
  "Keep the builder's progress updates and final reply in plain words, including while you work: Saved, Publish, Live, Undo, Restore. The technical instructions here are for you only. Never tell the builder about commits, pushes, branches, merges, pull requests or deploys. For example: 'The key stayed on this computer' and 'I kept both changes. Publish when you're ready'. Explain what changed and their next step briefly.";

/**
 * What "Fix it" sends after a stop: the builder's words, and what stopped (the error, the files,
 * the build's output), which reaches Claude beside their message.
 */
export function fixRequest(error: {
  code: string;
  message: string;
  details?: string;
  files?: string[];
}): { text: string; details: string } {
  if (error.code === "conflict") {
    return {
      text: FIX_TEXT.conflict,
      details: [
        "From Clodable's Fix it: publishing stopped because the builder's draft and the live site both changed the same files.",
        RECOVERY_VOICE,
        error.files?.length ? `Files: ${error.files.join(", ")}.` : "",
        "Compare both versions with read-only inspection first (git show / git diff against the live branch). Keep the working files and preview intact while the builder decides: do not start git merge or write conflict markers before asking. Keep compatible changes from each. If both versions replace the same wording or behavior and cannot both be kept, show the builder the two choices in plain words and ask which to keep BEFORE choosing or removing either. Do not decide by timestamps or assume their draft should win. Only after they choose, combine the files and finish the merge so nothing is left unresolved, then check the app still builds. If a merge was already in progress before this request, preserve all work and explain the preview's temporary state; never abort it or discard files blindly. Say exactly what was kept; never claim both changes were kept if one was replaced. Then tell them it's ready to publish.",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  if (error.code === "secret-found") {
    return {
      text: FIX_TEXT.secret,
      details: [
        `From Clodable's Fix it: saving stopped. ${error.message}. Nothing went to GitHub.`,
        RECOVERY_VOICE,
        error.files?.length ? `Where: ${error.files.join(", ")}` : "",
        error.details ? `What the check found (masked):\n${error.details}` : "",
        "Move it out of the code. Anything in the app's files reaches visitors' browsers and GitHub, so a secret key belongs on the server: for example a Supabase Edge Function secret, used from that function. If this key was ever shared or published before, tell them to replace it with its provider. Don't save or commit yourself: Clodable saves when you're done.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  return {
    text: FIX_TEXT.publish,
    details: [
      `From Clodable's Fix it: publishing stopped. ${error.message}`,
      RECOVERY_VOICE,
      error.files?.length ? `Where: ${error.files.join(", ")}` : "",
      error.details ? `Details:\n${error.details.slice(0, 3000)}` : "",
      "Fix the actual cause so they can publish again. A saved version is not proof that the host put it live: read pendingPublish in app_context/status. Never edit unrelated copy, metadata or configuration, create an empty save, or force a code change merely to trigger publishing. For access failures, open the site view with open_panel: Use saved connection refreshes this app’s publishing credential, or the builder enters a replacement token there. Do not ask for a new token if the saved connection works. After the cause is fixed, point to Retry Publish when pendingPublish exists (it retries the same version), otherwise Publish. If no supported retry is available, explain that limitation and keep the app unchanged. Don't publish yourself or rerun hosting: the builder clicks Publish.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
