// Clodable for Claude Desktop: the Publish bar above the prompt, the Clodable panel, plain-language
// activity rows, safety guards, auto-save, and the bridge from the preview toolbar to Claude.
//
// This file is the only Claude-specific part of Clodable. Every real action goes through the
// vendor-neutral `clodable` CLI, bundled next to this plugin in cli/clodable.mjs, which prints
// NDJSON events. Any other front end can drive the same commands.
import type { EngineInterface, Register, RenderElement } from "claude-code";
import { atom, read, update } from "claude-code";
import type {
  ClodableActivity,
  ClodableCheck,
  ClodableError,
  ClodableNotReady,
  ClodableStatus,
  ClodableStep,
} from "../types/index.d.ts";
import {
  ago,
  describeGroup,
  describeTool,
  fixPrompt,
  plural,
  saveMessage,
  shortReason,
  sqlIsDestructive,
  sqlWrites,
  supabaseTool,
} from "./words.ts";

const PANE = "clodable";

// Desktop clicks a button by the number its drawing gave it, and every redraw numbers each button
// anew and forgets the old numbers: a click that lands after a redraw Desktop hasn't caught up with
// is lost ("ui_press not handled"), so the click had to come twice. A button drawn the same way
// again is the same element, so its number holds; its press runs the newest closure.
const heldButtons = new Map<string, unknown>();
const newestPress = new Map<string, (e: unknown) => unknown>();
function heldButton<B>(draw: B): B {
  return ((props: { key?: unknown; onPress?: unknown }) => {
    const { onPress, ...look } = props ?? {};
    if (typeof look.key !== "string" || typeof onPress !== "function") {
      return (draw as (p: unknown) => unknown)(props);
    }
    const id = JSON.stringify(look);
    newestPress.set(id, onPress as (e: unknown) => unknown);
    let held = heldButtons.get(id);
    if (held === undefined) {
      if (heldButtons.size > 500) heldButtons.clear();
      held = (draw as (p: unknown) => unknown)({
        ...props,
        onPress: (e: unknown) => newestPress.get(id)?.(e),
      });
      heldButtons.set(id, held);
    }
    return held;
  }) as B;
}

const status = atom(
  { plugin: "clodable", key: "status" },
  null as ClodableStatus | ClodableNotReady | null,
);
const activity = atom({ plugin: "clodable", key: "activity" }, {
  kind: "idle",
  steps: [],
} as ClodableActivity);
const checks = atom({ plugin: "clodable", key: "checks" }, [] as ClodableCheck[]);

/** The clod, Clodable's mark (packages/design/src/logo.ts). Its pixels stay whole at 16 and 24 px. */
const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#3B1A10" d="M9 0h3v1h-3zM7 1h2v1h-2zM12 1h1v1h-1zM6 2h1v1h-1zM12 2h1v1h-1zM4 3h2v1h-2zM12 3h1v1h-1zM3 4h1v1h-1zM13 4h1v1h-1zM2 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM0 8h1v1h-1zM15 8h1v1h-1zM0 9h1v1h-1zM15 9h1v1h-1zM0 10h1v1h-1zM15 10h1v1h-1zM0 11h2v1h-2zM15 11h1v1h-1zM2 12h1v1h-1zM14 12h1v1h-1zM2 13h2v1h-2zM7 13h3v1h-3zM13 13h2v1h-2zM4 14h1v1h-1zM6 14h1v1h-1zM10 14h1v1h-1zM12 14h1v1h-1zM4 15h3v1h-3zM10 15h3v1h-3z"/><path fill="#E88858" d="M9 1h3v1h-3zM7 2h5v1h-5zM6 3h6v1h-6zM4 4h9v1h-9zM3 5h11v1h-11zM2 6h12v1h-12zM2 7h2v1h-2zM6 7h4v1h-4zM12 7h2v1h-2zM1 8h3v1h-3zM6 8h4v1h-4zM12 8h3v1h-3zM1 9h6v1h-6zM9 9h6v1h-6zM1 10h14v1h-14zM2 11h13v1h-13zM3 12h11v1h-11zM4 13h3v1h-3zM10 13h3v1h-3zM5 14h1v1h-1zM11 14h1v1h-1z"/><path fill="#2A140C" d="M4 7h2v1h-2zM10 7h2v1h-2zM4 8h2v1h-2zM10 8h2v1h-2zM7 9h2v1h-2z"/></svg>';

// Module state: lost on hot reload, and that's fine for all of these.
let cwd = "";
let showDetails = false;
let repoChoices: Array<{ value: string; label: string }> = [];
let chosenRepo = "";
let deviceCode = "";
const requests = new Map<string, string>();
/** True while Claude is answering: a save then would capture half-done work, so the turn's own save covers it. */
let turnActive = false;
/**
 * This conversation, among all the ones open on this app. Desktop keeps older conversations running,
 * and every one sees the preview's requests: the one its person used last takes them (`clodable
 * inbox --claim`). Each says it's there in `.clodable/local/session-<id>.json`.
 */
const me = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let lastActive = 0;
let lastPresence = 0;
let polling = false;
/**
 * Claude is working on a "Fix it" or "Let Claude combine them", from the press until the reply that
 * answers it ends. Meanwhile that button stays in place, dimmed, so nothing is asked twice.
 */
let fixing: { at: number; turnId?: string } | null = null;
/** What the move off Lovable involves for this app, read from its code. */
let assessment: any = null;
let assessing = false;
/** When the facts the assessment was read with were recorded ("" before Claude looked). */
let assessedFacts = "";
/**
 * Where the move stands (`clodable move status`), the Supabase choices for the new backend, the
 * step running now, and its last problem. Keys and tokens typed in the panel go straight to the
 * CLI's stdin: never into this state, the chat or a log.
 */
let move: any = null;
let moveChoices: any = null;
let moveRun: { title: string; detail?: string } | null = null;
let moveError: { message: string; hint?: string } | null = null;
let moveSecrets: { wanted: string[]; set: string[] } | null = null;
/** Netlify teams to put the site in, and the app's settings on the site (names only). */
let moveTeams: Array<{ slug: string; name: string }> | null = null;
let moveTeam = "";
/**
 * The settings the app's server code reads (`process.env.X`): which have a value on this computer,
 * for the preview, and on the site on Netlify once there is one. Names only, never values.
 */
let appSettingsStatus: {
  wanted: string[];
  local: string[];
  lovable: string[];
  site?: string[];
} | null = null;
/** The database's own secrets (vault) that Lovable can't hand over: names only. */
let moveVault: { wanted: string[]; set: string[]; query?: string } | null = null;
/** The editing view asks for them once by itself; panel opens and saves ask again. */
let settingsAsked = false;
/** The switch: the lines that pause the live app and undo the pause, and the sign-in choice. */
let pausePlan: { freeze: string; undo: string } | null = null;
/** Google sign-in: the client ID typed first; its secret comes next, to the CLI's stdin. */
let googleClientId = "";
/** Switching off Lovable's AI: the provider picked in the panel. */
let aiChoice: "openrouter" | "gemini" | "openai" = "openrouter";
/** Going live: who may create an account. "confirm" needs emails. */
let newPeople: "confirm" | "open" | "invite" = "confirm";
/** The way chosen a moment ago, shown at once while Clodable records it. */
let choosingMethod: "careful" | "quick" | null = null;
let moveOrg = "";
let moveRegion = "";
let loadingMove = false;
/**
 * Claude runs the move's steps in the conversation: from the press of a step's button until the
 * reply that answers it ends. Meanwhile that step's controls give way to a note.
 */
let piloting: { at: number; turnId?: string } | null = null;
const isPiloting = () => piloting !== null && Date.now() - piloting.at < 30 * 60_000;
/** The connect step's list of permissions, for a narrower token than the full-access one. */
let showPermissions = false;
/** Answers saving in the background: shown as chosen at once, so nothing gets pressed twice. */
const savingWhere: Partial<Record<"backend" | "hosting", string>> = {};
/** Setup running: its button gives way to a note until it's done. */
let settingUp = false;
const isFixing = () => fixing !== null && Date.now() - fixing.at < 10 * 60_000;
/** Edge functions Claude may deploy right now: only the ones a Publish just put live. */
let deployable: string[] = [];
/**
 * Whether this session's folder is an app Clodable set up (null until known). Everywhere else,
 * such as a developer's other projects, Clodable stays out of the way: no bar, no saves, no guards,
 * no rewording. Only /clodable answers there.
 */
let inApp: boolean | null = null;
/** The session's first status check, for hooks that run before it's back. */
let firstStatus: Promise<void> = Promise.resolve();
/** An empty folder is where an app gets brought in, so the bar invites setup there. */
let emptyFolder = false;
/** The app's preview in Desktop's Browser, once it runs. */
let previewUrl: string | null = null;
/** The preview is started once per session, from whichever comes first: session start or the bar. */
let previewAsked = false;

type Version = { sha: string; subject: string; date: string; kind: string | null };
/** The panel's history: saves not live yet, then recent publishes, newest first. Null until loaded. */
let versions: { draft: Version[]; published: Version[] } | null = null;
let loadingVersions = false;
/**
 * The save each of Claude's replies made, so Restore can sit under that reply. A reply's blocks
 * carry no turn id, so a block is matched by the end of its text. Kept per project in $.store,
 * so a resumed session still shows them.
 */
type ReplySave = { tail: string; sha: string; subject: string };
let replySaves: ReplySave[] = [];
/** Reply blocks already matched to a save, by message id. */
const blockSaves = new Map<string, ReplySave>();

async function isApp(): Promise<boolean> {
  if (inApp === null) await firstStatus.catch(() => {});
  return inApp === true;
}

async function folderIsEmpty($: EngineInterface): Promise<boolean> {
  try {
    return (await $.fs.list(".")).every((entry) => entry.name.startsWith("."));
  } catch {
    return false;
  }
}

type Result = { type: "result"; ok: boolean; data?: any; error?: ClodableError };

/** Recent notes on what Clodable tried, for developers: .clodable/local/clodable.log (never saved). */
const notes: string[] = [];
function note($: EngineInterface, line: string) {
  notes.push(`${new Date().toISOString()} ${line}`);
  if (notes.length > 200) notes.shift();
  // Only in an app Clodable set up: anywhere else, nothing is written, not even a log.
  if (cwd && inApp === true) {
    background($.fs.write(".clodable/local/clodable.log", `${notes.join("\n")}\n`));
  }
}

/** The preview's address in any text Desktop's preview tools return. */
function previewPortIn(text: string): string | undefined {
  return text.match(/\\?"port\\?":\s*(\d+)/)?.[1] ?? text.match(/localhost:(\d+)/)?.[1];
}

/** The tab Desktop's preview tools opened, in any text they return. */
function previewTabIn(text: string): string | undefined {
  return text.match(/\\?"tabId\\?":\s*\\?"([\w-]+)\\?"/)?.[1];
}

/**
 * The script that labels this conversation's preview pane with its name, so the pane's requests
 * (Try to fix, Point & ask) come back here and not to another conversation open on the app. It
 * only sets one value in the tab's own storage. Permissions allow exactly this text, nothing else.
 */
const labelScript = (id: string) =>
  `/* Clodable: label this preview */ location.protocol.startsWith("http") ? (sessionStorage.setItem("clodable:conversation", "${id}"), "labelled") : "not ready"`;
const LABEL_SCRIPT =
  /^\/\* Clodable: label this preview \*\/ location\.protocol\.startsWith\("http"\) \? \(sessionStorage\.setItem\("clodable:conversation", "s[a-z0-9]+"\), "labelled"\) : "not ready"$/;

/** Fire-and-forget background work: never an unhandled rejection (a module can unload mid-way). */
function background(work: Promise<unknown>): void {
  work.catch(() => {});
}
type Step = {
  type: "step";
  id: string;
  state: ClodableStep["state"];
  title: string;
  detail?: string;
};

// ── The CLI, from this plugin's own folder ──────────────────────────────────

function argv($: EngineInterface, args: string[]): string[] {
  return ["node", `${$.plugin.root}/cli/clodable.mjs`, ...args, "--json"];
}

function lastResult(stdout: string, stderr: string): Result {
  const lines = stdout.split("\n").filter((l) => l.trim().startsWith("{"));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]!);
      if (event.type === "result") return event as Result;
    } catch {
      // keep looking
    }
  }
  return {
    type: "result",
    ok: false,
    error: {
      code: "unknown",
      message: "Clodable didn't answer.",
      details: (stderr || stdout).slice(0, 2000),
    },
  };
}

/** The longest the engine lets `$.process.run` take; it refuses to start anything asking for more. */
const MAX_RUN_MS = 10 * 60_000;

async function cli(
  $: EngineInterface,
  args: string[],
  timeoutMs = 120_000,
  input?: string,
): Promise<Result> {
  try {
    const out = await $.process.run(argv($, args), {
      cwd,
      timeoutMs: Math.min(timeoutMs, MAX_RUN_MS),
      ...(input !== undefined ? { stdin: input } : {}),
    });
    return lastResult(out.stdout, out.stderr);
  } catch (error) {
    note($, `${args[0]} didn't run: ${String(error)}`.slice(0, 400));
    return {
      type: "result",
      ok: false,
      error: {
        code: "unknown",
        message: `Clodable couldn't run that: ${String(error)
          .replace(/^Error:\s*/, "")
          .slice(0, 160)}`,
        details: String(error),
      },
    };
  }
}

/** Run a long command (publish, undo) and stream its steps into the activity state. */
async function flow(
  $: EngineInterface,
  args: string[],
  kind: "publishing" | "undoing",
): Promise<Result> {
  await update<ClodableActivity>($, activity, () => ({ kind, steps: [] }));
  let buffer = "";
  let result: Result | undefined;
  const steps: ClodableStep[] = [];
  try {
    for await (const chunk of $.process.spawn({ argv: argv($, args), cwd })) {
      if (chunk.stream !== "stdout") continue;
      buffer += chunk.text;
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
        if (!line.startsWith("{")) continue;
        try {
          const event = JSON.parse(line) as Step | Result;
          if (event.type === "step") {
            const index = steps.findIndex((s) => s.id === event.id);
            const next: ClodableStep = {
              id: event.id,
              state: event.state,
              title: event.title,
              ...(event.detail ? { detail: event.detail } : {}),
            };
            if (index >= 0) steps[index] = next;
            else steps.push(next);
            await update<ClodableActivity>($, activity, (a) => ({ ...a, steps: [...steps] }));
          } else if (event.type === "result") {
            result = event;
          }
        } catch {
          // not an event
        }
      }
    }
  } catch (error) {
    result = {
      type: "result",
      ok: false,
      error: { code: "unknown", message: "Clodable stopped unexpectedly.", details: String(error) },
    };
  }
  return (
    result ?? {
      type: "result",
      ok: false,
      error: { code: "unknown", message: "Clodable didn't finish." },
    }
  );
}

// ── State refresh ───────────────────────────────────────────────────────────

function toStatus(data: any): ClodableStatus {
  return {
    ready: true,
    project: String(data?.project?.name ?? "your app"),
    branch: data?.branch ?? null,
    unsaved: Number(data?.unsaved ?? 0),
    unpublished: (data?.unpublished ?? []).map((c: any) => ({
      sha: c.sha,
      subject: c.subject,
      date: c.date,
      kind: c.kind ?? null,
    })),
    behindLive: Number(data?.behindLive ?? 0),
    merging: Boolean(data?.merging),
    conflicts: data?.conflicts ?? [],
    liveUrl: data?.project?.liveUrl ?? data?.lastPublish?.url ?? null,
    lastPublish: data?.lastPublish
      ? {
          sha: data.lastPublish.sha,
          title: data.lastPublish.title,
          at: data.lastPublish.at,
          url: data.lastPublish.url ?? null,
        }
      : null,
    pullRequest: data?.pullRequest ?? null,
    backend: data?.project?.backend ?? "unknown",
    hosting: data?.project?.hosting ?? "unknown",
    lovableUrl: data?.project?.lovableUrl ?? null,
    finishingMove: Boolean(data?.finishingMove),
    movedAt: data?.movedAt ?? null,
    databaseConnected:
      typeof data?.database?.connected === "boolean" ? data.database.connected : null,
  };
}

/**
 * Values are written only when they changed. Every redraw hands Clodable's buttons new handles,
 * and Desktop drops a press that names an old one: a redraw for nothing costs the next click.
 */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function refreshStatus($: EngineInterface) {
  const result = await cli($, ["status"], 30_000);
  const code = result.error?.code;
  const before = inApp;
  if (result.ok) inApp = true;
  else if (code === "not-a-repo" || code === "not-set-up") inApp = false;
  // Any other problem comes after the setup check, so this is an app with a problem to show.
  // "unknown" (the CLI didn't run) keeps what the quick look at the folder found.
  else if (code !== "unknown") inApp = true;
  if (code === "not-a-repo") emptyFolder = await folderIsEmpty($);
  // Sites drawn before Clodable knew where it is draw again.
  if (inApp !== before) $.ui.invalidate("ui.render");
  if (versions && inApp === true) background(refreshVersions($));
  const next: ClodableStatus | ClodableNotReady = result.ok
    ? ({ ...toStatus(result.data), ...savingWhere } as ClodableStatus)
    : {
        ready: false,
        reason:
          code === "not-a-repo"
            ? "not-a-repo"
            : code === "not-set-up"
              ? "no-kit"
              : code === "gh-auth"
                ? "no-github"
                : "unknown",
        message: result.error?.message ?? "Clodable isn't ready here.",
        ...(result.error?.hint ? { fix: result.error.hint } : {}),
      };
  if (!same(await read($, status), next)) {
    await update<ClodableStatus | ClodableNotReady | null>($, status, () => next);
  }
}

async function refreshChecks($: EngineInterface) {
  const result = await cli($, ["doctor"], 60_000);
  if (result.ok && Array.isArray(result.data))
    if (!same(await read($, checks), result.data)) {
      await update<ClodableCheck[]>($, checks, () => result.data as ClodableCheck[]);
    }
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function saveNow($: EngineInterface, message: string): Promise<string | undefined> {
  const a = await read($, activity);
  if (a.kind === "publishing" || a.kind === "undoing") return undefined;
  await update<ClodableActivity>($, activity, (x) =>
    x.kind === "idle" || x.kind === "published" || x.kind === "undone" || x.kind === "failed"
      ? { kind: "saving", steps: [] }
      : x,
  );
  const result = await cli($, ["save", "-m", message]);
  await update<ClodableActivity>($, activity, (x) =>
    x.kind !== "saving"
      ? x
      : result.error?.code === "secret-found"
        ? { kind: "failed", steps: [], error: result.error }
        : { kind: "idle", steps: [] },
  );
  if (!result.ok && result.error?.code !== "not-a-repo" && result.error?.code !== "secret-found") {
    $.ui.toast(`Couldn't save: ${result.error?.message ?? "unknown problem"}`);
  }
  if (result.ok && result.data?.unscanned && !result.data.offline) {
    $.ui.toast("Saved on this computer. It goes to GitHub once it's checked for secret keys.");
  }
  for (const note of result.data?.notes ?? []) $.ui.toast(`Saved. Worth a look: ${note}`);
  await refreshStatus($);
  return result.ok && result.data?.saved && result.data.sha ? String(result.data.sha) : undefined;
}

async function publishNow($: EngineInterface) {
  const a = await read($, activity);
  if (a.kind === "publishing" || a.kind === "undoing") return;
  showDetails = false;
  const result = await flow($, ["publish"], "publishing");
  if (result.ok) {
    const data = result.data ?? {};
    const onLovable = data.deploy === "lovable";
    await update<ClodableActivity>($, activity, (x) => ({
      kind: "published",
      steps: x.steps,
      title: data.title,
      url: data.url ?? null,
      at: Date.now(),
      ...(onLovable ? { onLovable, lovableUrl: data.lovableUrl ?? null } : {}),
      ...(data.site ? { site: data.site } : {}),
    }));
    $.ui.toast(
      onLovable
        ? "Published on GitHub. Click Publish in Lovable to put it live."
        : data.url
          ? `You're live! ${data.url}`
          : "Published!",
    );
    const pending: string[] = data.functions?.pending ?? [];
    if (pending.length > 0) {
      deployable = pending;
      background(
        $.prompt.submit({
          text: `Clodable just published. These backend functions changed and need to go live now: ${pending.join(", ")}. Deploy each one to Supabase with deploy_edge_function, from the code in supabase/functions/. Then tell me in one sentence.`,
        }),
      );
    }
  } else {
    await update<ClodableActivity>($, activity, (x) => ({
      kind: "failed",
      steps: x.steps,
      ...(result.error ? { error: result.error } : {}),
    }));
  }
  await refreshStatus($);
  // Moving off Lovable: a Publish moves the move on (the site is live there now).
  if (move) await loadMove($);
}

async function undoNow($: EngineInterface) {
  const s = await read($, status);
  const title = s?.ready && s.lastPublish ? s.lastPublish.title : "your last publish";
  let answer: string;
  try {
    answer = await $.ui.ask(
      `Undo “${title}”? The previous version goes live again. Changes to your database stay as they are.`,
      {
        options: ["Undo it", "Keep it live"],
        header: "Undo",
      },
    );
  } catch {
    return;
  }
  if (answer !== "Undo it") return;
  const result = await flow($, ["undo", "--yes"], "undoing");
  if (result.ok) {
    const onLovable = result.data?.deploy === "lovable";
    await update<ClodableActivity>($, activity, (x) => ({
      kind: "undone",
      steps: x.steps,
      title,
      url: result.data?.url ?? null,
      at: Date.now(),
      ...(onLovable ? { onLovable, lovableUrl: result.data?.lovableUrl ?? null } : {}),
    }));
    $.ui.toast(
      onLovable
        ? "Undone on GitHub. Click Publish in Lovable to put the previous version back live."
        : "Undone. The previous version is live again.",
    );
    if (result.data?.conflicts?.length) {
      background(
        $.prompt.submit({
          text: `I undid my last publish, and my draft overlaps with what was undone (${result.data.conflicts.join(", ")}). Please finish combining them so the draft builds, keeping my newer changes.`,
          asUser: true,
        }),
      );
    }
  } else {
    await update<ClodableActivity>($, activity, (x) => ({
      kind: "failed",
      steps: x.steps,
      ...(result.error ? { error: result.error } : {}),
    }));
  }
  await refreshStatus($);
}

async function fixIt($: EngineInterface) {
  if (isFixing()) return;
  const a = await read($, activity);
  const s = await read($, status);
  const text = a.error
    ? fixPrompt(a.error)
    : s?.ready && (s.merging || s.conflicts.length > 0)
      ? fixPrompt({ code: "conflict", message: "", files: s.conflicts })
      : undefined;
  if (!text) return;
  fixing = { at: Date.now() };
  $.ui.invalidate("ui.render");
  background($.prompt.submit({ text, asUser: true }));
}

/** Record where the data or the live site is, then refresh what the bar and the panel show. */
async function setWhere($: EngineInterface, key: "backend" | "hosting", value: string) {
  if (savingWhere[key]) return;
  savingWhere[key] = value;
  // Shown as answered right away; saving it takes a second or two.
  await update<ClodableStatus | ClodableNotReady | null>($, status, (current) =>
    current?.ready ? ({ ...current, [key]: value } as ClodableStatus) : current,
  );
  $.ui.invalidate("ui.render");
  try {
    const result = await cli($, ["config", key, value]);
    if (!result.ok) $.ui.toast(`Couldn't save that: ${result.error?.message ?? "unknown problem"}`);
  } finally {
    delete savingWhere[key];
  }
  await refreshStatus($);
}

/** What moving off Lovable involves for this app, read from its code. */
async function loadAssessment($: EngineInterface) {
  if (assessing) return;
  assessing = true;
  try {
    const result = await cli($, ["move", "check"]);
    assessment = result.ok ? result.data : { error: result.error?.message ?? "unknown problem" };
  } finally {
    assessing = false;
    $.ui.invalidate("ui.render");
  }
}

/** Where the move stands, and what the next step needs (Supabase choices, missing secrets). */
async function loadMove($: EngineInterface) {
  if (loadingMove) return;
  loadingMove = true;
  try {
    await readMove($);
  } finally {
    loadingMove = false;
    $.ui.invalidate("ui.render");
  }
}

async function readMove($: EngineInterface) {
  const result = await cli($, ["move", "status"]);
  if (!result.ok) {
    moveError = { message: result.error?.message ?? "Couldn't read the move." };
    return;
  }
  move = result.data;
  // What Claude found in the app changes what the move involves: read the assessment again.
  const factsAt: string = move.facts?.at ?? "";
  if (factsAt !== assessedFacts) {
    assessedFacts = factsAt;
    background(loadAssessment($));
  }
  const next = (move.steps ?? []).find((x: any) => x.state === "next" || x.state === "attention");
  // Read fresh each time: projects get paused or deleted in Supabase between two looks.
  if (next?.id === "create") {
    const choices = await cli($, ["move", "choices"]);
    if (choices.ok) {
      moveChoices = choices.data;
      const orgs: any[] = moveChoices.organizations ?? [];
      // Free first, never a paid organization unless the builder picks it: it costs money.
      if (!orgs.some((o) => o.slug === moveOrg)) {
        moveOrg =
          (
            orgs.find((o) => o.plan === "free" && (o.freeLeft ?? 0) > 0) ??
            orgs.find((o) => o.plan === "free") ??
            orgs[0]
          )?.slug ?? "";
      }
      moveRegion ||= moveChoices.region?.code ?? moveChoices.regions?.[0]?.code ?? "";
    } else {
      moveError = {
        message: choices.error?.message ?? "Couldn't read your Supabase account.",
        ...(choices.error?.hint ? { hint: choices.error.hint } : {}),
      };
    }
  }
  if (next?.id === "site") {
    const teams = await cli($, ["move", "teams"]);
    if (teams.ok) {
      moveTeams = teams.data.accounts ?? [];
      if (!moveTeams?.some((t) => t.slug === moveTeam)) moveTeam = moveTeams?.[0]?.slug ?? "";
    }
  }
  await loadSettings($);
  // What keeps a step open: read only while it does.
  if ((move.vaultLeft ?? []).length > 0) {
    const vault = await cli($, ["move", "vault"]);
    moveVault = vault.ok ? vault.data : null;
  } else moveVault = null;
  if (["freeze", "final-export", "final-copy"].includes(next?.id)) {
    const plan = await cli($, ["move", "pause"]);
    pausePlan = plan.ok ? plan.data : null;
  }
  if ((move.secretsLeft ?? []).length > 0) {
    const secrets = await cli($, ["move", "secrets"]);
    moveSecrets = secrets.ok ? secrets.data : null;
  } else moveSecrets = null;
}

/** Run one step of the move, its progress drawn in the panel as it goes. */
async function moveStep($: EngineInterface, args: string[], input?: string): Promise<Result> {
  if (moveRun) return { type: "result", ok: false };
  moveRun = { title: "Starting" };
  moveError = null;
  $.ui.invalidate("ui.render");
  let buffer = "";
  let result: Result | undefined;
  try {
    for await (const chunk of $.process.spawn({
      argv: argv($, ["move", ...args]),
      cwd,
      ...(input !== undefined ? { input } : {}),
    })) {
      if (chunk.stream !== "stdout") continue;
      buffer += chunk.text;
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
        if (!line.startsWith("{")) continue;
        try {
          const event = JSON.parse(line) as Step | Result;
          if (event.type === "step") {
            moveRun = { title: event.title, ...(event.detail ? { detail: event.detail } : {}) };
            $.ui.invalidate("ui.render");
          } else if (event.type === "result") result = event;
        } catch {
          // not an event
        }
      }
    }
  } catch (error) {
    note($, `move ${args[0]}: ${String(error)}`);
  }
  moveRun = null;
  const done = result ?? {
    type: "result" as const,
    ok: false,
    error: { code: "unknown", message: "Clodable stopped before finishing that step." },
  };
  if (!done.ok) {
    moveError = {
      message: done.error?.message ?? "That step didn't finish.",
      ...(done.error?.hint ? { hint: done.error.hint } : {}),
    };
    note($, `move ${args[0]}: ${done.error?.code} ${done.error?.details ?? ""}`.slice(0, 400));
  }
  await loadMove($);
  return done;
}

/** How Claude runs a move step: Clodable's own command line, next to this plugin. */
function moveCommand($: EngineInterface, args: string[]): string {
  return `node "${$.plugin.root}/cli/clodable.mjs" move ${args.join(" ")}`;
}

/** The request that creates the new backend, in the builder's words, with the choices made. */
function createRequest(
  $: EngineInterface,
  org: any,
  choices: any,
  slug: string,
  region: string,
): string {
  const where = (choices?.regions ?? []).find((r: any) => r.code === region)?.name;
  return `Moving off Lovable: create my new backend${org ? ` in my Supabase organization “${org.name}”` : ""}${where ? `, in ${where}` : ""}. Run \`${moveCommand($, ["create", ...(slug ? ["--org", slug] : []), ...(region ? ["--region", region] : [])])}\`, then tell me how it went.`;
}

/** Hand a step of the move to Claude, as the builder's own request in this conversation. */
async function pilot($: EngineInterface, text: string) {
  if (isPiloting() || moveRun) return;
  piloting = { at: Date.now() };
  moveError = null;
  $.ui.invalidate("ui.render");
  background($.prompt.submit({ text, asUser: true }));
}

/** Careful or in one go: the builder's choice, recorded directly (nothing for Claude to do). */
async function chooseMethod($: EngineInterface, method: "careful" | "quick") {
  if (choosingMethod) return;
  choosingMethod = method;
  moveError = null;
  $.ui.invalidate("ui.render");
  const result = await cli($, ["move", "method", method]);
  if (!result.ok) {
    moveError = {
      message: result.error?.message ?? "That didn't work.",
      ...(result.error?.hint ? { hint: result.error.hint } : {}),
    };
  }
  await loadMove($);
  choosingMethod = null;
  $.ui.invalidate("ui.render");
}

/** The Supabase account, for Claude's database changes on an app already on its own Supabase. */
async function connectDatabase($: EngineInterface, token: string) {
  const text = token.trim();
  if (!text) return;
  const result = await cli($, ["move", "connect"], 60_000, text);
  if (!result.ok) $.ui.toast(result.error?.message ?? "Supabase didn't accept that token.");
  await refreshStatus($);
}

/** The builder says they signed in on the new site: look again, and say so if nothing is seen. */
async function checkSignIn($: EngineInterface) {
  moveRun = { title: "Looking for your sign-in" };
  moveError = null;
  $.ui.invalidate("ui.render");
  await readMove($).catch(() => {});
  moveRun = null;
  if (move?.signIn?.needed && !move.signIn.at) {
    moveError = {
      message: "Clodable doesn't see a sign-in on your new site yet.",
      hint: "Sign in there (not on Lovable), then press it again.",
    };
  }
  $.ui.invalidate("ui.render");
}

/** A value typed in the panel (a token, a key) goes to the CLI's stdin, then the field clears. */
async function moveWith($: EngineInterface, args: string[], value: string) {
  const text = value.trim();
  if (!text) return;
  if (
    ["connect", "secret", "vault-secret", "netlify", "setting", "resend", "ai", "google"].includes(
      args[0]!,
    )
  ) {
    moveError = null;
    moveRun = {
      title:
        args[0] === "connect"
          ? "Connecting to Supabase"
          : args[0] === "netlify"
            ? "Connecting to Netlify"
            : args[0] === "resend"
              ? "Connecting to Resend"
              : "Saving it",
    };
    $.ui.invalidate("ui.render");
    const result = await cli($, ["move", ...args], 60_000, text);
    moveRun = null;
    if (!result.ok) {
      moveError = {
        message: result.error?.message ?? "That didn't work.",
        ...(result.error?.hint ? { hint: result.error.hint } : {}),
      };
    }
    await loadMove($);
    return;
  }
  await moveStep($, args, text);
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: "Clodable", focus: true, closeOnEscape: true });
  background(refreshChecks($));
  background(refreshStatus($));
  background(loadSettings($));
  // Opened again: where the move stands now, not when it was last looked at.
  if (move) background(loadMove($));
}

async function loadSettings($: EngineInterface) {
  const result = await cli($, ["settings"]);
  const next = result.ok ? result.data : null;
  if (same(next, appSettingsStatus)) return;
  appSettingsStatus = next;
  $.ui.invalidate("ui.render");
}

/** One setting, typed in the panel: to the CLI's stdin, for the preview and the site. */
async function saveSetting($: EngineInterface, name: string, value: string) {
  if (!value.trim()) return;
  // During the move, a setting can be what keeps its step open: say it's saving, then read where
  // the move stands, so the next step opens.
  const moving = move !== null;
  if (moving) {
    moveError = null;
    moveRun = { title: "Saving it" };
    $.ui.invalidate("ui.render");
  }
  const result = await cli($, ["setting", name], 60_000, value);
  if (moving) moveRun = null;
  if (!result.ok) $.ui.toast(result.error?.message ?? `Couldn't save ${name}.`);
  await loadSettings($);
  if (moving) await loadMove($);
}

const tailOf = (text: string) => text.trim().slice(-200);
const repliesKey = () => `replies:${cwd}`;

async function loadReplySaves($: EngineInterface) {
  const saved = await $.store.get(repliesKey()).catch(() => undefined);
  if (Array.isArray(saved)) replySaves = saved as ReplySave[];
}

async function rememberReply($: EngineInterface, answer: string, sha: string, subject: string) {
  const tail = tailOf(answer);
  if (!tail) return;
  replySaves = [{ tail, sha, subject }, ...replySaves.filter((r) => r.sha !== sha)].slice(0, 300);
  $.ui.invalidate("ui.render");
  await $.store.set(repliesKey(), replySaves).catch(() => {});
}

/** The save a reply block belongs to: its text ends that reply's answer. Oldest first. */
function saveForBlock(id: string, text: string): ReplySave | undefined {
  const known = blockSaves.get(id);
  if (known) return known;
  const tail = tailOf(text);
  if (!tail) return undefined;
  const taken = new Set([...blockSaves.values()].map((r) => r.sha));
  const match = [...replySaves]
    .reverse()
    .find((r) => !taken.has(r.sha) && (tail.length < 12 ? r.tail === tail : r.tail.endsWith(tail)));
  if (match) blockSaves.set(id, match);
  return match;
}

async function refreshVersions($: EngineInterface) {
  if (loadingVersions) return;
  loadingVersions = true;
  try {
    const result = await cli($, ["history"], 30_000);
    if (!result.ok) return;
    const pick = (c: any): Version => ({
      sha: String(c.sha),
      subject: String(c.subject ?? ""),
      date: String(c.date ?? ""),
      kind: c.kind ?? null,
    });
    const next = {
      draft: (result.data?.draft ?? []).map(pick),
      published: (result.data?.published ?? []).map(pick),
    };
    if (same(versions, next)) return;
    versions = next;
    $.ui.invalidate("ui.render");
  } finally {
    loadingVersions = false;
  }
}

/** Bring back an earlier version as a new save. Nothing is erased, and nothing goes live. */
async function restoreVersion($: EngineInterface, sha: string, subject: string) {
  if (turnActive) {
    $.ui.toast("Claude is still working. Restore once it's done.");
    return;
  }
  const a = await read($, activity);
  if (a.kind === "publishing" || a.kind === "undoing" || a.kind === "saving") return;
  let answer: string;
  try {
    answer = await $.ui.ask(
      `Go back to “${subject}”? Your current version stays in the history, so you can come back to it. Your live site and your data don't change.`,
      { options: ["Restore", "Cancel"], header: "Restore" },
    );
  } catch {
    return;
  }
  if (answer !== "Restore") return;
  await update<ClodableActivity>($, activity, (x) =>
    x.kind === "idle" || x.kind === "published" || x.kind === "undone" || x.kind === "failed"
      ? { kind: "saving", steps: [] }
      : x,
  );
  const result = await cli($, ["restore", sha]);
  await update<ClodableActivity>($, activity, (x) =>
    x.kind === "saving" ? { kind: "idle", steps: [] } : x,
  );
  $.ui.toast(
    result.ok
      ? "Restored. Publish when you're happy with it."
      : (result.error?.message ?? "That version couldn't be restored."),
  );
  await refreshStatus($);
}

/**
 * Lovable shows the app first, so Clodable starts its preview as the session opens, through
 * Desktop's own preview tools and the `app` entry the kit writes in .claude/launch.json. No
 * message goes to Claude. The tools connect as the session starts, so it tries a few times.
 */
async function startPreview($: EngineInterface, attempt = 0): Promise<void> {
  if (previewUrl || (attempt === 0 && previewAsked)) return;
  previewAsked = true;
  try {
    const result = await $.mcp.call("Claude_Browser", "preview_start", { name: "app" });
    const text = result.content.map((block) => block.text ?? "").join("\n");
    note($, `preview_start → ${result.isError ? "error" : "ok"}: ${text.slice(0, 300)}`);
    const port = result.isError ? undefined : previewPortIn(text);
    if (!port) return;
    previewUrl = `http://localhost:${port}`;
    $.ui.invalidate("ui.render");
  } catch (error) {
    note($, `preview_start attempt ${attempt + 1} failed: ${String(error).slice(0, 300)}`);
    if (attempt < 4) $.clock.after(2000, () => background(startPreview($, attempt + 1)));
  }
}

/**
 * The app's preview in Desktop's own Browser pane. A link would open another window, and Desktop
 * opens its pane only for a request in this conversation: Auto mode refuses Clodable's own call,
 * even for a press. So the press becomes the builder's request, and Claude opens it.
 */
function previewRequest(): string {
  return previewUrl
    ? `Open my app's preview here (${previewUrl}).`
    : "Start my app's preview and open it here.";
}

function askForPreview($: EngineInterface) {
  markActive($);
  background($.prompt.submit({ text: previewRequest(), asUser: true }));
}

/**
 * The move's last step. The panel turns to changing the app, and the conversation, where the
 * builder works from now on, opens the preview and says how.
 */
async function finishMove($: EngineInterface) {
  const result = await moveStep($, ["finished"]);
  if (!result.ok) return;
  await refreshStatus($);
  background(
    pilot(
      $,
      `Moving off Lovable: I've finished in Lovable. ${previewRequest()} Then tell me in a few lines how I change my app from now on.`,
    ),
  );
}

/** Preview tabs already labelled, as `tab@port`: the label lives in the page's own storage. */
const labelled = new Set<string>();

/**
 * Put this conversation's name on the page in one of its preview tabs. Desktop only lets it through
 * while it handles a preview tool call (a plugin's own call outside one is refused), so this runs
 * inside that call, retrying there briefly while the page loads.
 */
async function labelPreview($: EngineInterface, tabId: string, port: string): Promise<void> {
  const key = `${tabId}@${port}`;
  if (labelled.has(key)) return;
  labelled.add(key);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise<void>((done) => $.clock.after(700, done));
    try {
      const result = await $.mcp.call("Claude_Browser", "javascript_tool", {
        action: "javascript_exec",
        tabId,
        text: labelScript(me),
      });
      const text = result.content.map((block) => block.text ?? "").join("\n");
      note(
        $,
        `label preview tab ${tabId} → ${result.isError ? "error: " : ""}${text.slice(0, 160)}`,
      );
      if (!result.isError && text.includes("labelled")) return;
    } catch (error) {
      note($, `label preview tab ${tabId} refused: ${String(error).slice(0, 200)}`);
      break;
    }
  }
  labelled.delete(key);
}

/** Say this conversation is open, and when its person last used it. */
async function present($: EngineInterface, alive = Date.now()) {
  if (!cwd || inApp !== true) return;
  lastPresence = Date.now();
  await $.fs.write(
    `.clodable/local/session-${me}.json`,
    JSON.stringify({ id: me, alive, active: lastActive }),
  );
}

/** The person typed or pressed something here: the preview's requests come here now. */
function markActive($: EngineInterface) {
  lastActive = Date.now();
  background(present($));
}

/** Clodable's slash commands, each on its own: a name that's taken must not stop the others. */
async function registerCommands($: EngineInterface) {
  for (const command of [
    { name: "clodable", description: "Open Clodable: your draft, your live site, setup" },
    { name: "publish", description: "Put your draft live (checks first)" },
    { name: "undo-publish", description: "Put the previous version live again" },
  ]) {
    try {
      await $.command.register({ ...command, immediate: true });
    } catch (error) {
      $.ui.log(`Clodable couldn't add /${command.name}: ${String(error)}`, { to: "debug" });
    }
  }
}

/** Requests from the preview toolbar: Try to fix, Point & ask, and text edits to save. */
async function pollInbox($: EngineInterface) {
  if (!cwd || inApp !== true || polling) return;
  polling = true;
  try {
    if (Date.now() - lastPresence > 5000) await present($).catch(() => {});
    let entries: Array<{ name: string; kind: string }>;
    try {
      entries = await $.fs.list(".clodable/inbox");
    } catch {
      return;
    }
    if (!entries.some((e) => e.kind === "file" && e.name.endsWith(".json"))) return;
    // Every open conversation sees the request; only the one its person used last takes it.
    const claimed = await cli($, ["inbox", "--claim", me], 15_000);
    const items: any[] = claimed.ok && Array.isArray(claimed.data) ? claimed.data : [];
    for (const item of items) handleRequest($, item);
  } finally {
    polling = false;
  }
}

/** One request from the preview, now this conversation's to handle. */
function handleRequest($: EngineInterface, item: any) {
  if (item.kind === "fix") {
    const where = item.error?.source
      ? ` (around ${item.error.source.file}:${item.error.source.line})`
      : "";
    const consoleLines =
      Array.isArray(item.console) && item.console.length
        ? `\nRecent console errors:\n${item.console.slice(-4).join("\n")}`
        : "";
    background(
      $.prompt.submit({
        text: `From the preview: the page ${item.page?.path ?? ""} is broken${where}.\nError: ${item.error?.message ?? "unknown"}${item.error?.stack ? `\n${String(item.error.stack).slice(0, 1500)}` : ""}${consoleLines}\nPlease fix it, then check the page in the preview.`,
        asUser: true,
      }),
    );
  } else if (item.kind === "ask") {
    const where = item.source ? ` (${item.source.file}:${item.source.line})` : "";
    background(
      $.prompt.submit({
        text: `From the preview, about this ${item.element ?? "element"}${where} on ${item.page?.path ?? "the page"}:\n${item.request}`,
        asUser: true,
      }),
    );
  } else if (item.kind === "edit" && !turnActive) {
    background(
      saveNow(
        $,
        `Changed “${String(item.before).trim().slice(0, 30)}” to “${String(item.after).trim().slice(0, 30)}”`,
      ),
    );
  }
}

// ── Safety ──────────────────────────────────────────────────────────────────

const PUSH_OR_REWRITE =
  /\bgit\s+(push|reset\s+--hard|rebase|filter-branch|filter-repo|update-ref)\b|\bgh\s+pr\s+merge\b/;
const OUR_PUBLISH = /\bclodable\s+(publish|undo)\b/;
const LEAVE_DRAFT = /\bgit\s+(checkout|switch)\s+(-[-\w]+\s+)*(main|master)\b/;
/**
 * Clodable's private folder on this computer: the Supabase token, database passwords, and the
 * export with people's emails and password hashes. It never goes into a conversation.
 */
const PRIVATE_FOLDER =
  /Library\/Application Support\/clodable|\.config\/clodable|AppData[\\/]Roaming[\\/]clodable|clodable[\\/]secrets\.json/i;
const PRIVATE_FOLDER_DENY =
  "That folder holds Clodable's keys and the people's data from the Lovable export, so it stays out of the conversation. Use `clodable move status` or `clodable move diagnose` instead: they report what's safe to see.";
/** Move steps that take a secret: the builder types those in the Clodable panel, never in the chat. */
const SECRET_STEP =
  /clodable(?:\.mjs"?)?\s+move\s+(connect|secret|vault-secret|disconnect|forget|netlify|setting|resend|ai|google)\b|clodable(?:\.mjs"?)?\s+move\s+files\b.*--private/;

/**
 * Clodable's database commands (`npx clodable db query|run|apply …`, or the plugin's own CLI), with
 * what they act on. `single`: one command and one quoted argument, nothing else for the shell.
 */
function dbCommandIn(
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

/** Claude's own runs of the move's steps, exactly as the panel's requests spell them. */
function isMoveStep($: EngineInterface, command: string): boolean {
  const root = $.plugin.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^node "${root}/cli/clodable\\.mjs" move (status|check|facts|choices|create|export|copy|verify|diagnose|files|functions|secrets|preview|teams|site|settings|emails|pause|golive|domain|services|app-emails)( --?[\\w-]+| [\\w.:@-]+)*$`,
  ).test(command);
}

/**
 * Claude records what it found in the app with a quoted heredoc: inert JSON, nothing in it runs. A
 * line equal to the delimiter would end it early and run the rest, so none is allowed.
 */
function isFactsRecord($: EngineInterface, command: string): boolean {
  const root = $.plugin.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = command.match(
    new RegExp(
      `^node "${root}/cli/clodable\\.mjs" move facts --set <<'(\\w+)'\n([\\s\\S]*)\n(\\w+)$`,
    ),
  );
  if (!m || m[1] !== m[3]) return false;
  return !m[2]!.split("\n").some((line) => line === m[1]);
}

const SAFE_BASH = [
  /^(npm|pnpm|yarn|bun)\s+(install|i|ci|add)\b/,
  /^(npm|pnpm|yarn|bun)\s+run\s+(build|lint|test|typecheck|check)\b/,
  /^(npm|pnpm|yarn|bun)\s+(test|lint)\b/,
  /^npx\s+(tsc|eslint|prettier|vitest|clodable\s+(status|check|history|doctor))\b/,
  /^git\s+(status|diff|log|show|blame)\b/,
  /^(ls|pwd|cat|head|tail|wc|grep|rg)\b/,
];
const SUPABASE_READS = new Set([
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

function insideProject(path: unknown): boolean {
  // Windows paths use backslashes and drive letters; compare with forward slashes everywhere.
  const slash = (value: string) => value.replace(/\\/g, "/");
  const p = slash(String(path ?? ""));
  const root = slash(cwd).replace(/\/$/, "");
  if (!p || !root) return false;
  const absolute = /^([a-zA-Z]:)?\//.test(p) ? p : `${root}/${p}`;
  if (!absolute.toLowerCase().startsWith(`${root.toLowerCase()}/`) || absolute.includes("/../"))
    return false;
  return !/\/\.git\/|\/\.env(\.|$)|\/node_modules\//.test(absolute);
}

// ── Hooks ───────────────────────────────────────────────────────────────────

// Plain-language rows and a save after every reply are what Clodable is, so they aren't options: a
// developer who'd rather not turns the plugin off for themselves, with "clodable@clodable": false in
// the project's .claude/settings.local.json.
export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    cwd = e.cwd || (await $.session.cwd());
    inApp = (await $.fs.exists(".clodable/config.json").catch(() => false)) ? true : null;
    if (inApp) $.ui.invalidate("ui.render");
    // A conversation the person just opened is the one in front of them.
    lastActive = Date.now();
    background(present($));
    background(loadReplySaves($));
    firstStatus = refreshStatus($);
    background(firstStatus);
    // On Desktop, the app's preview opens with the session. The terminal has no preview pane. Desktop
    // may attach after this runs, so the bar starts it too the first time Desktop draws it.
    background(
      (async () => {
        const surfaces: readonly string[] = await $.session.surfaces().catch(() => []);
        note($, `session start: surfaces=${JSON.stringify(surfaces)}`);
        if (surfaces.includes("desktop") && (await isApp())) await startPreview($);
      })(),
    );
    $.clock.every(1500, () => background(pollInbox($)));
    $.clock.every(45_000, () => {
      if (inApp !== true) return;
      background(read($, activity).then((a) => (a.kind === "idle" ? refreshStatus($) : undefined)));
    });
    // Commands last: a name that's taken must not stop the rest of the setup.
    await registerCommands($);
    return next(e);
  });

  // /clear, /resume and /branch reset session state: load it again.
  on("classic.SessionStart", { source: ["clear", "resume", "fork"] }, async ($, e, next) => {
    background(refreshStatus($));
    return next(e);
  }).catch((_$, e, next) => next(e));

  on("command.run", { command: "clodable" }, async ($) => {
    await openPane($);
    return {};
  });

  on("command.run", { command: "publish" }, async ($) => {
    await openPane($);
    if (await isApp()) background(publishNow($));
    return {};
  });

  on("command.run", { command: "undo-publish" }, async ($) => {
    if (await isApp()) background(undoNow($));
    else await openPane($);
    return {};
  });

  // Remember what each turn was asked, so its save gets a meaningful name.
  on("turn.start", async ($, e, next) => {
    requests.set(e.turnId, e.text);
    turnActive = true;
    markActive($);
    // The first reply after a Fix it press is the one working on it.
    if (fixing && !fixing.turnId) fixing.turnId = e.turnId;
    if (piloting && !piloting.turnId) piloting.turnId = e.turnId;
    return next(e);
  });

  // Pressing Clodable's buttons, or Desktop showing this conversation, also means "here".
  on("ui.press", { plugin: "clodable" }, ($, e, next) => {
    markActive($);
    return next(e);
  });
  on("session.attach", ($, e, next) => {
    markActive($);
    // Desktop lists the commands it was told of when it attached: tell it again.
    background(registerCommands($));
    return next(e);
  });
  on("session.end", async ($, e, next) => {
    await present($, 0).catch(() => {});
    return next(e);
  });

  // Auto-save after every reply of the main conversation.
  on("turn.complete", async ($, e, next) => {
    const asked = requests.get(e.turnId);
    requests.delete(e.turnId);
    if (fixing?.turnId === e.turnId) {
      // Claude is done with it: the save below shows where things stand now.
      fixing = null;
      await update<ClodableActivity>($, activity, (x) =>
        x.kind === "failed" ? { kind: "idle", steps: [] } : x,
      );
      $.ui.invalidate("ui.render");
    }
    if (piloting?.turnId === e.turnId) {
      // Claude is done with that step: show where the move stands now.
      piloting = null;
      background(loadMove($));
      background(refreshStatus($));
      // What's worth a look may have changed with it ("Switch it" leaves nothing to switch).
      background(refreshChecks($));
      $.ui.invalidate("ui.render");
    }
    if (e.agentId === undefined) turnActive = false;
    if (e.agentId === undefined && !e.isAborted) {
      const answer = e.answer;
      const subject = saveMessage(asked ?? "");
      background(
        isApp().then(async (yes) => {
          if (!yes) return;
          const sha = await saveNow($, subject);
          // The code changed: so may what's worth a look, and the settings it reads.
          if (sha) {
            background(refreshChecks($));
            background(loadSettings($));
          }
          if (sha && answer) await rememberReply($, answer, sha, subject);
        }),
      );
    }
    return next(e);
  });

  // Guards: Claude never pushes, never publishes, never puts backend code live on its own.
  on("tool.call", { tool: "Bash" }, async (_$, e, next) => {
    const command = String((e as { command?: unknown }).command ?? "");
    if (PRIVATE_FOLDER.test(command)) return { deny: PRIVATE_FOLDER_DENY };
    if (!(await isApp())) return next(e);
    if (SECRET_STEP.test(command)) {
      return {
        deny: "This step takes a secret (a token, a key, a password), so the builder does it in the Clodable panel (Move off Lovable), never through the chat. Ask them to use the panel, then carry on.",
      };
    }
    if (OUR_PUBLISH.test(command)) {
      return {
        deny: "Publishing is the builder's decision. Ask them to click Publish in the Clodable bar above the message box.",
      };
    }
    if (PUSH_OR_REWRITE.test(command)) {
      return {
        deny: "Clodable saves and publishes for the builder: don't push, merge, reset or rewrite history. Just edit the files; their work is saved automatically after your reply.",
      };
    }
    if (LEAVE_DRAFT.test(command)) {
      return { deny: "Stay on the builder's draft branch. Clodable handles branches." };
    }
    return next(e);
  }).catch((_$, e, next) =>
    next.called
      ? next(e)
      : {
          deny: "Clodable couldn't check this command, so it was blocked for safety. Try a simpler command.",
        },
  );

  // Clodable's private folder stays out of every conversation, whatever tool asks.
  const keepOut = (e: unknown) => {
    const input = e as Record<string, unknown>;
    return [input.file_path, input.path, input.notebook_path].some((v) =>
      PRIVATE_FOLDER.test(String(v ?? "")),
    );
  };
  on("tool.call", { tool: "Read" }, async (_$, e, next) =>
    keepOut(e) ? { deny: PRIVATE_FOLDER_DENY } : next(e),
  );
  on("tool.call", { tool: "Edit" }, async (_$, e, next) =>
    keepOut(e) ? { deny: PRIVATE_FOLDER_DENY } : next(e),
  );
  on("tool.call", { tool: "Write" }, async (_$, e, next) =>
    keepOut(e) ? { deny: PRIVATE_FOLDER_DENY } : next(e),
  );

  // Any Supabase server: Clodable's own, or the claude.ai Supabase connector.
  on("tool.call", async ($, e, next) => {
    const tool = supabaseTool(e.tool);
    if (!tool || !(await isApp())) return next(e);
    // On Lovable Cloud, Lovable owns the database and backend: a change from here can't work, so
    // the refusal says why and what to do instead.
    const s = await read($, status);
    if (s?.ready && s.backend === "lovable-cloud") {
      const sql = String((e as { query?: unknown }).query ?? "");
      const writes =
        tool === "apply_migration" ||
        tool === "deploy_edge_function" ||
        (tool === "execute_sql" && sqlWrites(sql)) ||
        /^(create|delete|update|merge|reset|restore|pause)_/.test(tool);
      if (writes) {
        return {
          deny: "This app's database and backend run on Lovable Cloud, which Lovable owns, so they can't be changed from here. Tell the builder plainly, and offer two ways forward: make this change in Lovable, or first move the app to their own Supabase (Move off Lovable, in the Clodable panel).",
        };
      }
    }
    if (tool !== "deploy_edge_function") return next(e);
    const name = String((e as { name?: unknown }).name ?? "");
    if (deployable.includes(name)) {
      deployable = deployable.filter((n) => n !== name);
      return next(e);
    }
    return {
      deny: "Backend functions go live when the builder clicks Publish. Just edit the files in supabase/functions/.",
    };
  }).catch((_$, e, next) =>
    supabaseTool(e.tool) === "deploy_edge_function"
      ? { deny: "Backend functions go live when the builder clicks Publish." }
      : next(e),
  );

  // Whoever starts the preview, Clodable or Claude checking its work, the bar links to it, and a
  // new tab in this conversation's preview pane gets its name.
  on(
    "tool.call",
    {
      tool: [
        "mcp__Claude_Browser__preview_start",
        "mcp__Claude_Browser__preview_list",
        "mcp__Claude_Browser__tabs_create",
      ],
    },
    async ($, e, next) => {
      const out = await next(e);
      if (inApp !== true) return out;
      const text = JSON.stringify(out);
      const port = previewPortIn(text);
      if (
        port &&
        e.tool !== "mcp__Claude_Browser__tabs_create" &&
        previewUrl !== `http://localhost:${port}`
      ) {
        previewUrl = `http://localhost:${port}`;
        $.ui.invalidate("ui.render");
      }
      const tab = e.tool === "mcp__Claude_Browser__preview_list" ? undefined : previewTabIn(text);
      const tabPort = port ?? previewUrl?.split(":").pop();
      if (tab && tabPort) await labelPreview($, tab, tabPort);
      return out;
    },
  ).catch((_$, e, next) => next(e));

  // Permissions: quiet for safe work, always explicit before touching live data.
  on("tool.check", async ($, e, next) => {
    const verdict = await next(e);
    if (verdict.decision === "deny" || !(await isApp())) return verdict;
    // Starting the app's own preview (its entry in .claude/launch.json) is always fine. Allowing it
    // here also means Auto mode's classifier isn't asked about Clodable's own call, which no request
    // of Claude's explains, and which it would refuse.
    const input = (e.input ?? {}) as Record<string, unknown>;
    const local =
      input.url === undefined ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(String(input.url));
    if (
      (e.tool === "mcp__Claude_Browser__preview_start" && local) ||
      e.tool === "mcp__Claude_Browser__preview_list"
    )
      return { ...verdict, decision: "allow" };
    // Labelling this conversation's preview pane: this exact script and nothing else.
    if (
      e.tool === "mcp__Claude_Browser__javascript_tool" &&
      input.action === "javascript_exec" &&
      LABEL_SCRIPT.test(String(input.text ?? ""))
    )
      return { ...verdict, decision: "allow" };
    if (
      e.tool === "Bash" &&
      (isMoveStep($, String(input.command ?? "").trim()) ||
        isFactsRecord($, String(input.command ?? "").trim()))
    )
      return { ...verdict, decision: "allow" };
    // The app's database through Clodable: reading is quiet, every change is the builder's to allow.
    const db = e.tool === "Bash" ? dbCommandIn(String(input.command ?? "").trim()) : undefined;
    if ((db?.action === "query" && db.single) || db?.action === "check")
      return { ...verdict, decision: "allow" };
    if (db && db.action !== "query") {
      const sql = db.action === "apply" ? await $.fs.read(db.arg).catch(() => "") : db.arg;
      if (e.tool_use_id) {
        $.ui.notice(
          e.tool_use_id,
          sqlIsDestructive(sql)
            ? "This changes your live database and can't be undone."
            : "This changes your live database right away. Your site keeps working.",
        );
      }
      return { ...verdict, decision: "ask" };
    }
    const tool = supabaseTool(e.tool);
    if (tool) {
      if (
        tool === "apply_migration" ||
        (tool === "execute_sql" && sqlWrites(String(input.query ?? input.sql ?? "")))
      ) {
        const sql = String(input.query ?? input.sql ?? "");
        if (e.tool_use_id) {
          $.ui.notice(
            e.tool_use_id,
            sqlIsDestructive(sql)
              ? "This changes your live database and can't be undone."
              : "This changes your live database right away. Your site keeps working.",
          );
        }
        return { ...verdict, decision: "ask" };
      }
      if (SUPABASE_READS.has(tool) || tool === "execute_sql")
        return { ...verdict, decision: "allow" };
      return verdict;
    }
    if (verdict.decision !== "ask") return verdict;
    if (["Edit", "Write", "MultiEdit"].includes(e.tool) && insideProject(input.file_path))
      return { ...verdict, decision: "allow" };
    if (["Read", "Glob", "Grep", "LS", "TodoWrite"].includes(e.tool))
      return { ...verdict, decision: "allow" };
    if (e.tool === "Bash") {
      const command = String(input.command ?? "").trim();
      if (!/[;&|`$<>]/.test(command) && SAFE_BASH.some((r) => r.test(command)))
        return { ...verdict, decision: "allow" };
    }
    return verdict;
  }).catch(() => ({ decision: "ask" as const }));

  // ── The bar above the prompt ─────────────────────────────────────────────
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const here = await read($, status);
    const invite = here !== null && !here.ready && here.reason === "not-a-repo" && emptyFolder;
    if (inApp !== true && !invite) return next(e);
    if (e.surface === "desktop" && inApp === true && !previewAsked) background(startPreview($));
    const { Box, Text, Button: drawButton, Link } = $.ui.resolve(e);
    const Button = heldButton(drawButton);
    const s = await read($, status);
    const a = await read($, activity);
    const now = Date.now();
    // The logo on Desktop. In the terminal the status dot alone says enough.
    const mark =
      e.surface === "desktop"
        ? $.ui.resolve(e).Svg({ source: LOGO, alt: "Clodable", width: 16, height: 16 })
        : null;
    const theirs = await next(e);
    const desktop = e.surface === "desktop";
    // What's true now on the left; what you can do on the right, the main action last.
    const bar = (left: unknown[], right: unknown[] = []) => (
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        columnGap={2}
        width="100%"
      >
        <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={1} minWidth={0}>
          {mark}
          {left as never}
        </Box>
        <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>
          {right as never}
        </Box>
      </Box>
    );
    // In the terminal, where there's no logo, a colored dot carries the state.
    const dot = (color: string) => (desktop ? null : <Text color={color}>●</Text>);
    const history = (
      <Button key="history" variant="secondary" onPress={() => background(openPane($))}>
        History
      </Button>
    );
    // On Desktop, in its own Browser pane; a link would open another window.
    const preview = !previewUrl ? null : desktop ? (
      <Button key="preview" variant="secondary" onPress={() => askForPreview($)}>
        Preview
      </Button>
    ) : (
      <Link key="preview" href={previewUrl} label="Preview ↗" />
    );
    // A button that can't be used isn't drawn (Desktop's buttons can't be disabled). While Claude
    // works on a fix, a quiet note takes its place, so nothing is asked twice.
    const fixButton = (key: string, conflict: boolean) =>
      isFixing() ? (
        <Text dimColor>{conflict ? "Claude is combining…" : "Claude is fixing…"}</Text>
      ) : (
        <Button key={key} variant="primary" onPress={() => background(fixIt($))}>
          {conflict ? "Let Claude combine them" : "Fix it"}
        </Button>
      );
    const site = (url: string) => (
      <Link href={url} label={`${url.replace(/^https?:\/\//, "")} ↗`} />
    );

    let ours: RenderElement;
    if (a.kind === "publishing" || a.kind === "undoing") {
      const running = [...a.steps].reverse().find((x) => x.state === "running");
      const last = a.steps[a.steps.length - 1];
      ours = bar(
        [
          <Text bold>{a.kind === "publishing" ? "Publishing" : "Undoing"}</Text>,
          <Text dimColor wrap="truncate-end">
            {running
              ? running.detail
                ? `${running.title} · ${running.detail}`
                : `${running.title}…`
              : last
                ? last.title
                : "Starting…"}
          </Text>,
        ],
        [
          <Button key="progress" variant="secondary" onPress={() => background(openPane($))}>
            See progress
          </Button>,
        ],
      );
    } else if ((a.kind === "published" || a.kind === "undone") && a.at && now - a.at < 120_000) {
      ours = bar(
        a.onLovable
          ? [
              dot("success"),
              <Text color="success" bold>
                {a.kind === "published" ? "Published on GitHub" : "Undone on GitHub"}
              </Text>,
              ...(a.site
                ? [
                    a.site.state === "failed" ? (
                      <Link
                        href={a.site.logUrl ?? a.site.url}
                        label="Netlify site didn't update ↗"
                      />
                    ) : (
                      <Link href={a.site.url} label="Netlify site ↗" />
                    ),
                  ]
                : []),
              <Link
                href={a.lovableUrl ?? "https://lovable.dev/projects"}
                label="Put it live in Lovable ↗"
              />,
            ]
          : [
              dot("success"),
              <Text color="success" bold>
                {a.kind === "published" ? "You're live" : "Undone. The previous version is live"}
              </Text>,
              a.url ? site(a.url) : null,
            ],
        a.kind === "published"
          ? [
              <Button key="undo" variant="secondary" onPress={() => background(undoNow($))}>
                Undo
              </Button>,
            ]
          : [],
      );
    } else if (a.kind === "failed" && a.error) {
      ours = bar(
        [
          <Box flexShrink={0}>
            <Text color={a.error.code === "conflict" ? "warning" : "error"} bold>
              {a.error.code === "secret-found" ? "Not saved" : "Not published"}
            </Text>
          </Box>,
          <Text wrap="truncate-end">{shortReason(a.error)}</Text>,
        ],
        [
          <Button key="why" variant="secondary" onPress={() => background(openPane($))}>
            See why
          </Button>,
          fixButton("fix", a.error.code === "conflict"),
        ],
      );
    } else if (a.kind === "saving") {
      ours = bar([<Text dimColor>Saving…</Text>], [history, preview]);
    } else if (!s) {
      ours = bar([<Text dimColor>Clodable is getting ready…</Text>]);
    } else if (!s.ready) {
      ours = bar(
        [
          <Text>
            {s.reason === "not-a-repo"
              ? "Bring your app into this folder to save and publish"
              : s.message}
          </Text>,
        ],
        [
          <Button key="setup" variant="primary" onPress={() => background(openPane($))}>
            Set up
          </Button>,
        ],
      );
    } else if (s.merging || s.conflicts.length > 0) {
      ours = bar(
        [
          <Box flexShrink={0}>
            <Text color="warning" bold>
              Not published
            </Text>
          </Box>,
          <Text wrap="truncate-end">{shortReason({ code: "conflict", message: "" })}</Text>,
        ],
        [fixButton("combine", true)],
      );
    } else if (s.unpublished.length > 0) {
      ours = bar(
        [
          dot("warning"),
          <Text>
            <Text bold>{plural(s.unpublished.length, "change")}</Text> not live yet
          </Text>,
        ],
        [
          history,
          preview,
          <Button key="publish" variant="primary" onPress={() => background(publishNow($))}>
            Publish
          </Button>,
        ],
      );
    } else {
      const url = s.lastPublish?.url ?? s.liveUrl;
      ours = bar(
        [
          dot("success"),
          // Lovable's hosting only shows what was last published in Lovable: say what's certain.
          <Text>{s.hosting === "lovable" ? "Everything is published" : "Everything is live"}</Text>,
          url ? site(url) : null,
        ],
        [history, preview],
      );
    }
    return (
      <Box flexDirection="column">
        {ours}
        {theirs}
      </Box>
    );
  });

  // ── The Clodable panel ──────────────────────────────────────────────────
  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const { Box, Text, Button: drawButton, Link, Code } = $.ui.resolve(e);
    const Button = heldButton(drawButton);
    const table = $.ui.resolve(e);
    const Select = "Select" in table ? table.Select : undefined;
    const Input = "Input" in table ? table.Input : undefined;
    const s = await read($, status);
    const a = await read($, activity);
    const doctor = await read($, checks);
    const now = Date.now();
    const section = (title: string) => <Text bold>{title}</Text>;
    const header = (
      <Box flexDirection="row" columnGap={1} alignItems="center">
        {e.surface === "desktop" ? (
          $.ui.resolve(e).Svg({ source: LOGO, alt: "Clodable", width: 24, height: 24 })
        ) : (
          <Text color="claude">●</Text>
        )}
        <Text bold>{s?.ready ? s.project : "Clodable"}</Text>
      </Box>
    );

    // Not set up yet: a guided, self-serve setup.
    if (!s?.ready) {
      const tools = doctor.filter((c) => ["node", "git", "gh", "github"].includes(c.id));
      const blocking = tools.filter((c) => c.status === "fail");
      const github = doctor.find((c) => c.id === "github");
      return (
        <Box flexDirection="column" rowGap={1} paddingX={1}>
          {header}
          <Text>Let's bring your app home. It takes a minute, once.</Text>
          {section("1 · Tools")}
          {tools.length === 0 ? <Text dimColor>Checking…</Text> : null}
          {tools.map((c) => (
            <Box flexDirection="column">
              <Text color={c.status === "ok" ? "success" : "error"}>
                {c.status === "ok" ? "✓" : "✕"} {c.label} {c.detail ? `· ${c.detail}` : ""}
              </Text>
              {c.status !== "ok" && c.fix ? <Text dimColor> {c.fix}</Text> : null}
            </Box>
          ))}
          {github && github.status !== "ok" ? (
            <Box flexDirection="column" rowGap={1}>
              <Button
                key="connect-github"
                variant="primary"
                onPress={() => background(connectGitHub($))}
              >
                Connect GitHub
              </Button>
              {deviceCode ? (
                <Box flexDirection="column">
                  <Text>
                    Your one-time code: <Text bold>{deviceCode}</Text>
                  </Text>
                  <Link
                    href="https://github.com/login/device"
                    label="Open github.com/login/device"
                  />
                  <Button key="copy-code" plain onPress={() => $.ui.copy({ text: deviceCode })}>
                    Copy the code
                  </Button>
                </Box>
              ) : null}
            </Box>
          ) : null}
          {section("2 · Your app")}
          {blocking.length > 0 ? (
            <Text dimColor>Once the tools above are ready, pick your app here.</Text>
          ) : s?.reason === "no-kit" ? (
            <Box flexDirection="column" rowGap={1}>
              <Text>This folder already holds an app. Clodable can set itself up right here.</Text>
              {settingUp ? (
                <Text dimColor>Setting up Clodable… it takes about a minute.</Text>
              ) : (
                <Button
                  key="set-up-here"
                  variant="primary"
                  onPress={() => background(setUpHere($))}
                >
                  Set up Clodable here
                </Button>
              )}
            </Box>
          ) : repoChoices.length > 0 && Select ? (
            <Box flexDirection="column" rowGap={1}>
              <Select
                key="repo"
                label="Your app on GitHub"
                options={repoChoices}
                value={chosenRepo || repoChoices[0]!.value}
                onSelect={(value) => {
                  chosenRepo = value;
                  $.ui.invalidate("ui.render");
                }}
              />
              {settingUp ? (
                <Text dimColor>Bringing in your app… a minute or two.</Text>
              ) : (
                <Button key="bring-in" variant="primary" onPress={() => background(bringIn($))}>
                  Bring it in
                </Button>
              )}
            </Box>
          ) : Input ? (
            <Box flexDirection="column" rowGap={1}>
              <Input
                key="repo-name"
                label="Your app's GitHub repository"
                placeholder="owner/name"
                value={chosenRepo}
                submitLabel="bring it in"
                onSubmit={(value) => {
                  chosenRepo = value.trim();
                  background(bringIn($));
                }}
              />
              <Button key="list-repos" plain onPress={() => background(loadRepos($))}>
                Show my repositories
              </Button>
            </Box>
          ) : (
            <Text dimColor>Open Clodable in Claude Desktop or the terminal to pick your app.</Text>
          )}
          <Text dimColor>
            {s?.reason === "no-kit"
              ? "Clodable adds a few plain files and saves them, with any changes in progress, to your draft on GitHub. Nothing goes live."
              : "Clodable copies your app from GitHub into this folder and adds a few plain files. Nothing goes live."}
          </Text>
        </Box>
      );
    }

    const steps = a.steps.length > 0 ? a.steps : [];
    if (versions === null) background(refreshVersions($));
    const desktop = e.surface === "desktop";
    const stepLine = (step: ClodableStep) => {
      const mark =
        step.state === "done"
          ? "✓"
          : step.state === "failed"
            ? "✕"
            : step.state === "warning"
              ? "!"
              : step.state === "running"
                ? "◐"
                : "·";
      const color =
        step.state === "done"
          ? "success"
          : step.state === "failed"
            ? "error"
            : step.state === "warning"
              ? "warning"
              : undefined;
      return (
        <Text
          {...(color ? { color } : {})}
          dimColor={step.state === "skipped" || step.state === "pending"}
        >
          {mark} {step.title}
          {step.state === "running" ? "…" : ""}
          {step.detail ? `  · ${step.detail}` : ""}
        </Text>
      );
    };
    const busy = a.kind === "publishing" || a.kind === "undoing";
    const url = s.lastPublish?.url ?? s.liveUrl;
    const warnings = doctor.filter((c) => c.status === "warn" || c.status === "fail");
    const host = (link: string) => link.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // The app's state in one card: what's true now, and the next thing to do.
    const card = (
      title: unknown,
      subtitle: unknown,
      actions: unknown[] = [],
      below: unknown = null,
    ) => (
      <Box
        flexDirection="column"
        rowGap={1}
        borderStyle="round"
        borderColor="promptBorder"
        paddingX={2}
        paddingY={1}
      >
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
          <Box flexDirection="column" flexShrink={1}>
            {title as never}
            {subtitle as never}
          </Box>
          <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>
            {actions as never}
          </Box>
        </Box>
        {below as never}
      </Box>
    );

    let state: RenderElement;
    if (busy) {
      state = card(
        <Text bold>{a.kind === "publishing" ? "Publishing…" : "Undoing…"}</Text>,
        <Text dimColor>Your live site keeps working meanwhile.</Text>,
        [],
        <Box flexDirection="column">{steps.map(stepLine)}</Box>,
      );
    } else if (a.kind === "failed" && a.error) {
      state = card(
        <Text color="error" bold>
          {a.error.code === "secret-found" ? "Not saved" : "Not published"}
        </Text>,
        <Text>{a.error.message}</Text>,
        [
          a.error.details ? (
            <Button
              key="toggle-details"
              variant="secondary"
              onPress={() => {
                showDetails = !showDetails;
                $.ui.invalidate("ui.render");
              }}
            >
              {showDetails ? "Hide details" : "Details"}
            </Button>
          ) : null,
          isFixing() ? (
            <Text dimColor>
              {a.error.code === "conflict" ? "Claude is combining…" : "Claude is fixing…"}
            </Text>
          ) : (
            <Button key="fix" variant="primary" onPress={() => background(fixIt($))}>
              {a.error.code === "conflict" ? "Let Claude combine them" : "Fix it"}
            </Button>
          ),
        ],
        <Box flexDirection="column" rowGap={1}>
          {a.error.hint ? <Text dimColor>{a.error.hint}</Text> : null}
          {steps.length > 0 ? <Box flexDirection="column">{steps.map(stepLine)}</Box> : null}
          {showDetails && a.error.details ? (
            <Code source={a.error.details.slice(0, 6000)} wrap="wrap" />
          ) : null}
        </Box>,
      );
    } else if ((a.kind === "published" || a.kind === "undone") && a.at && now - a.at < 120_000) {
      state = card(
        <Text color="success" bold>
          {a.onLovable
            ? a.kind === "published"
              ? "Published on GitHub"
              : "Undone on GitHub"
            : a.kind === "published"
              ? "You're live"
              : "Undone. The previous version is live"}
        </Text>,
        a.onLovable ? (
          <Box flexDirection="column">
            <Text dimColor>
              Lovable hosts your site: in Lovable, click Publish, then Publish changes, to put it
              live.
            </Text>
            <Link href={a.lovableUrl ?? "https://lovable.dev/projects"} label="Open Lovable ↗" />
          </Box>
        ) : a.url ? (
          <Link href={a.url} label={`${host(a.url)} ↗`} />
        ) : null,
        a.kind === "published"
          ? [
              <Button key="undo" variant="secondary" onPress={() => background(undoNow($))}>
                Undo
              </Button>,
            ]
          : [],
      );
    } else if (s.merging || s.conflicts.length > 0) {
      state = card(
        <Text color="warning" bold>
          Your draft and the live site changed the same thing
        </Text>,
        <Text dimColor>Claude can combine them and keep both changes.</Text>,
        [
          isFixing() ? (
            <Text dimColor>Claude is combining…</Text>
          ) : (
            <Button key="combine" variant="primary" onPress={() => background(fixIt($))}>
              Let Claude combine them
            </Button>
          ),
        ],
      );
    } else if (s.unpublished.length > 0) {
      state = card(
        <Text bold>{plural(s.unpublished.length, "change")} not live yet</Text>,
        <Text dimColor>
          {s.lastPublish
            ? `Visitors still see the version you published ${ago(s.lastPublish.at, now)}.`
            : "Visitors see them once you publish."}
        </Text>,
        [
          !previewUrl ? null : e.surface === "desktop" ? (
            <Button key="preview" variant="secondary" onPress={() => askForPreview($)}>
              Preview
            </Button>
          ) : (
            <Link key="preview" href={previewUrl} label="Preview ↗" />
          ),
          <Button key="publish" variant="primary" onPress={() => background(publishNow($))}>
            Publish
          </Button>,
        ],
      );
    } else {
      state = card(
        <Text bold>Everything is live</Text>,
        <Text dimColor>
          {s.lastPublish
            ? `Published ${ago(s.lastPublish.at, now)}: “${s.lastPublish.title}”`
            : "Ask Claude for a change. It's saved here automatically."}
        </Text>,
        s.lastPublish
          ? [
              <Button key="undo" variant="secondary" onPress={() => background(undoNow($))}>
                Undo last publish
              </Button>,
            ]
          : [],
      );
    }

    // History: one line per version, newest first. The first is what the files hold now; the
    // newest publish is what visitors see. Restore shows on the line under the pointer.
    const pretty = (v: Version) => {
      const back = v.subject.match(/^Restored the version from (.+?)(?:: (.+))?$/);
      if (!back) return v.subject;
      return back[2] ? `Went back to “${back[2]}”` : `Went back to the version from ${back[1]}`;
    };
    const currentSha = versions?.draft[0]?.sha ?? versions?.published[0]?.sha;
    const liveSha = versions?.published[0]?.sha;
    const versionRow = (v: Version) => {
      const current = v.sha === currentSha;
      const live = v.sha === liveSha;
      const restore = (
        <Button
          key={`restore-${v.sha}`}
          {...(desktop ? { variant: "secondary" as const } : { plain: true as const })}
          onPress={() => background(restoreVersion($, v.sha, pretty(v)))}
        >
          Restore
        </Button>
      );
      return (
        <Box
          key={`version-${v.sha}`}
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          columnGap={2}
          paddingX={1}
          {...(desktop ? { hover: { backgroundColor: "#8080801f" } } : {})}
        >
          <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={1}>
            <Text wrap="truncate-end">{pretty(v)}</Text>
            {live ? (
              <Text color="success" bold>
                Live
              </Text>
            ) : null}
            {current ? <Text dimColor>Current</Text> : null}
          </Box>
          <Box flexDirection="row" columnGap={2} alignItems="center" flexShrink={0}>
            <Text dimColor>{ago(v.date, now)}</Text>
            <Box width={11} justifyContent="flex-end">
              {current ? null : desktop ? (
                <Box display="none" hover={{ display: "flex" }}>
                  {restore}
                </Box>
              ) : (
                restore
              )}
            </Box>
          </Box>
        </Box>
      );
    };
    // Two questions, once: where the data and the live site are decide what Clodable can do.
    const choice = (key: "backend" | "hosting", value: string, label: string) => (
      <Button
        key={`${key}-${value}`}
        variant="secondary"
        onPress={() => background(setWhere($, key, value))}
      >
        {label}
      </Button>
    );
    const question = (
      key: "backend" | "hosting",
      title: string,
      choices: Array<[string, string]>,
      hint: string,
    ) => (
      <Box key={`question-${key}`} flexDirection="column" rowGap={1}>
        <Text>{title}</Text>
        <Box flexDirection="row" columnGap={1} rowGap={1} flexWrap="wrap">
          {choices.map(([value, label]) => choice(key, value, label))}
        </Box>
        <Text dimColor>{hint}</Text>
      </Box>
    );
    const questions = [
      s.backend === "unknown"
        ? question(
            "backend",
            "Where does your app's data live?",
            [
              ["lovable-cloud", "On Lovable Cloud"],
              ["supabase", "In my own Supabase"],
              ["none", "No database"],
            ],
            "Not sure? If your project in Lovable has Cloud (Database, Users…), it's Lovable Cloud.",
          )
        : null,
      s.hosting === "unknown"
        ? question(
            "hosting",
            "Where is your site live?",
            [
              ["lovable", "On Lovable"],
              ["github", "Elsewhere (Netlify, Vercel…)"],
            ],
            "If you click Publish in Lovable to update your site, it's on Lovable.",
          )
        : null,
    ].filter(Boolean);

    // The move itself, one step at a time: every step listed, only the next one with its controls.
    const MOVE_MARK: Record<string, string> = { done: "✓", next: "●", later: "·", attention: "!" };
    const method: "careful" | "quick" | undefined = choosingMethod ?? move?.method;
    // Getting ready happens beside the live app; going live is the one moment it changes.
    const MOVE_STAGES = [
      {
        id: "backend",
        title: "Get ready: your new backend",
        about:
          "A working copy of your data, people and backend, on your own Supabase. Your live app stays on Lovable.",
        steps: ["connect", "create", "export", "copy", "files", "functions", "try"],
      },
      {
        id: "website",
        title: (move?.steps ?? []).some((x: any) => x.id === "services")
          ? "Get ready: your website, emails and services"
          : "Get ready: your website and emails",
        about:
          "Your site on your own Netlify, using the working copy. Your live app stays on Lovable.",
        steps: ["netlify", "site", "emails", "services", "google"],
      },
      {
        id: "golive",
        title: "Go live",
        about:
          method === "quick"
            ? "Your app moves over in one go, with your data as of your export."
            : "Your live app moves over. It pauses for a few minutes, so nothing people write is lost.",
        steps: ["freeze", "final-export", "final-copy", "golive", "domain", "lovable"],
      },
    ];
    const moveSteps: any[] = move?.steps ?? [];
    const nextStep = moveSteps.find((x) => x.state === "next" || x.state === "attention");
    const started = moveSteps.some((x) => x.id === "connect" && x.state === "done");
    // First, Claude reads the app's code: until it has, nothing else is decided.
    const factsNeeded = moveSteps.some((x) => x.id === "facts" && x.state !== "done");
    const orgs: any[] = moveChoices?.organizations ?? [];
    const org = orgs.find((o) => o.slug === moveOrg) ?? orgs[0];
    const VAULT_QUERY =
      "select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key';";
    const field = (key: string, placeholder: string, submit: string, use: (v: string) => void) =>
      Input ? (
        <Input
          key={key}
          placeholder={placeholder}
          submitLabel={submit}
          value=""
          onSubmit={(value: string) => use(value)}
        />
      ) : (
        <Text dimColor>Open this panel in Claude Desktop to paste it.</Text>
      );
    // The settings the app's server code reads, still to paste: for the preview, and the site.
    const settingsFields = (prefix: string, fromLovable: boolean) => {
      const st = appSettingsStatus;
      const missing = (st?.wanted ?? []).filter(
        (n) => !st?.local.includes(n) || (st.site !== undefined && !st.site.includes(n)),
      );
      if (missing.length === 0) return null;
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your app's server code reads {plural(missing.length, "setting")} (environment
            variables).
            {fromLovable ? " On Lovable they're listed in More → Cloud → Secrets." : ""} Paste each
            one here: it goes to your preview
            {st?.site ? " and to your site on Netlify" : ", and stays on this computer"}.
          </Text>
          {missing.map((name) => (
            <Box key={`${prefix}-row-${name}`} flexDirection="column">
              <Text bold>{name}</Text>
              {st?.site?.includes(name) ? (
                <Text dimColor>
                  Already on your site. Paste it again for your preview: Netlify keeps it secret.
                </Text>
              ) : null}
              {field(`${prefix}-${name}`, "Paste the value", "Save", (v) =>
                background(saveSetting($, name, v)),
              )}
            </Box>
          ))}
        </Box>
      );
    };
    const missingSecrets = ((move?.secretsLeft ?? []) as string[]).filter(
      (name) => !(moveSecrets?.set ?? []).includes(name),
    );
    const secretsBlock =
      missingSecrets.length > 0 ? (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your functions use {plural(missingSecrets.length, "secret key")}. Paste each value from
            the service it belongs to (Lovable doesn't show them). They go straight to Supabase.
          </Text>
          {missingSecrets.map((name) => (
            <Box key={`secret-${name}`} flexDirection="column">
              <Text bold>{name}</Text>
              {field(`move-secret-${name}`, "Paste the value", "Save", (v) =>
                background(moveWith($, ["secret", name], v)),
              )}
            </Box>
          ))}
        </Box>
      ) : null;
    // Going on without what's left of a step: a short question, then the way out.
    const goOnWithout = (key: string, what: "settings" | "secrets" | "vault", count: number) => (
      <Box flexDirection="row" columnGap={2} alignItems="center">
        <Text dimColor>{count === 1 ? "Don't have it yet?" : "Don't have them yet?"}</Text>
        <Button
          key={key}
          variant="secondary"
          onPress={() => background(moveStep($, [what, "--skip"]))}
        >
          {count === 1 ? "Go on without it" : "Go on without them"}
        </Button>
      </Box>
    );
    const tryBlock =
      move?.preview === "copy" ? (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            The preview shows your copy: sign in, click around, change things. Your live app is
            untouched.
          </Text>
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Button
              key="move-live"
              variant="secondary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Switch my preview back to my live data with \`${moveCommand($, ["preview", "live"])}\`.`,
                  ),
                )
              }
            >
              Back to live data
            </Button>
            {move?.home ? <Link href={move.home.dashboard} label="Open it in Supabase ↗" /> : null}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>
            The preview restarts on your new backend. Your live app is untouched.
          </Text>
          <Button
            key="move-try"
            variant="primary"
            onPress={() =>
              background(
                pilot(
                  $,
                  `Moving off Lovable: switch my preview to the copy with \`${moveCommand($, ["preview", "copy"])}\`. ${previewRequest()} Then check my app works on it.`,
                ),
              )
            }
          >
            Try my app on the copy
          </Button>
        </Box>
      );
    const copyable = (key: string, label: string, text: string) => (
      <Box key={key} flexDirection="row" columnGap={1} alignItems="center">
        <Text dimColor>{label}</Text>
        <Text>{text.length > 60 ? `${text.slice(0, 56)}…` : text}</Text>
        <Button key={`${key}-copy`} plain onPress={() => $.ui.copy({ text })}>
          Copy
        </Button>
      </Box>
    );
    const sqlBlock = (key: string, sql: string) => (
      <Box flexDirection="row" columnGap={1} alignItems="center">
        <Code source={sql} language="sql" />
        <Button key={`${key}-copy`} plain onPress={() => $.ui.copy({ text: sql })}>
          Copy
        </Button>
      </Box>
    );
    const undoBlock = pausePlan ? (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>Changed your mind? Run this in Lovable to undo the pause:</Text>
        {sqlBlock("move-undo", pausePlan.undo)}
      </Box>
    ) : null;
    const noEmails = (question: string) => (
      <Box flexDirection="column" rowGap={1} marginTop={1}>
        <Box flexDirection="row" columnGap={2} alignItems="center">
          <Text>{question}</Text>
          <Button
            key="move-no-emails"
            variant="secondary"
            onPress={() => background(moveStep($, ["emails", "--skip"]))}
          >
            Continue without emails
          </Button>
        </Box>
        <Text dimColor>
          New people then sign in without confirming their email, and nobody can reset a forgotten
          password. You can add emails later.
        </Text>
      </Box>
    );
    const publishedSinceLive = Boolean(
      move?.site?.liveAt && move.site.liveAt > (move.switch?.liveAt ?? ""),
    );
    const liveAddress: string =
      (s.liveUrl && !/lovable\.app/.test(s.liveUrl) ? s.liveUrl : undefined) ??
      move?.site?.url ??
      "your new address";
    // Larger than Supabase's free plan holds: said before copying, while upgrading is easy.
    const sizeOf = (bytes: number) =>
      bytes >= 1024 ** 3
        ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
        : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
    const planNote = (kind: "data" | "files") => {
      const plan = move?.plan as
        | { data: number; dataLimit: number; files: number; filesLimit: number }
        | undefined;
      if (!plan || plan[kind] <= plan[kind === "data" ? "dataLimit" : "filesLimit"]) return null;
      const limit = kind === "data" ? plan.dataLimit : plan.filesLimit;
      return (
        <Box flexDirection="column">
          <Text color="warning">
            Your {kind === "data" ? "data takes about" : "files take"} {sizeOf(plan[kind])}:
            Supabase's free plan holds {sizeOf(limit)}.
          </Text>
          <Text dimColor>
            Move your organization to Pro first (about $25 a month, in Supabase: Organization
            settings → Billing), or the copy stops when it's full.
          </Text>
        </Box>
      );
    };
    let moveControls: unknown = null;
    if (isPiloting()) {
      moveControls = <Text dimColor>Claude is on it, in the conversation.</Text>;
    } else if (moveRun) {
      moveControls = (
        <Text>
          ◐ {moveRun.title}…{moveRun.detail ? `  · ${moveRun.detail}` : ""}
        </Text>
      );
    } else if (nextStep?.id === "connect") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your data goes to Supabase, under your own account (free to start). Clodable needs an
            access token that can create your new backend and copy your data into it.
          </Text>
          <Box flexDirection="column">
            <Text>1. Open Supabase's token page.</Text>
            <Text>2. Click “Create legacy token”: the full-access kind.</Text>
            <Text>
              3. Name it Clodable, choose the longest expiry it offers, and generate it. Clodable
              uses it after the move too, for changes to your database.
            </Text>
            <Text>4. Paste it here. It stays on this computer.</Text>
          </Box>
          <Link
            href="https://supabase.com/dashboard/account/tokens"
            label="Open Supabase's token page ↗"
          />
          {field("move-token", "sbp_…", "Connect", (v) => background(moveWith($, ["connect"], v)))}
          {showPermissions ? (
            <Box flexDirection="column">
              <Text dimColor>
                A narrower token works too: choose Organization access, your organization, and these
                permissions.
              </Text>
              {((move?.tokenPermissions ?? []) as string[]).map((permission) => (
                <Text dimColor>· {permission}</Text>
              ))}
            </Box>
          ) : (
            <Button
              key="move-narrower"
              plain
              onPress={() => {
                showPermissions = true;
                $.ui.invalidate("ui.render");
              }}
            >
              Prefer a narrower token?
            </Button>
          )}
          <Text dimColor>Once the move is done, delete the token in Supabase.</Text>
        </Box>
      );
    } else if (nextStep?.id === "create") {
      moveControls =
        moveChoices === null ? (
          <Text dimColor>Looking at your Supabase account…</Text>
        ) : (
          <Box flexDirection="column" rowGap={1}>
            {orgs.length > 1 && Select ? (
              <Select
                key="move-org"
                label="Organization"
                options={orgs.map((o) => ({ value: o.slug, label: `${o.name} · ${o.cost}` }))}
                value={moveOrg}
                onSelect={(v: string) => {
                  moveOrg = v;
                  $.ui.invalidate("ui.render");
                }}
              />
            ) : null}
            {Select && (moveChoices.regions ?? []).length > 1 ? (
              <Box flexDirection="column">
                <Select
                  key="move-region"
                  label="Where it runs"
                  options={moveChoices.regions.map((r: any) => ({ value: r.code, label: r.name }))}
                  value={moveRegion}
                  onSelect={(v: string) => {
                    moveRegion = v;
                    $.ui.invalidate("ui.render");
                  }}
                />
                <Text dimColor>
                  Picked from where this computer is. Choose where most of your app's users are:
                  it's faster for them.
                </Text>
              </Box>
            ) : null}
            {org?.plan === "free" && org?.freeLeft === 0 ? (
              <Box flexDirection="column" rowGap={1}>
                <Text color="warning">
                  Supabase runs 2 free projects per person, counted across all your organizations,
                  and you already run{" "}
                  {((moveChoices.freeProjects ?? []) as any[])
                    .map((p) => `${p.name} (${p.organization})`)
                    .join(" and ") || "2"}
                  .
                </Text>
                <Text dimColor>
                  Pause one in Supabase (Project settings → Pause project), then check again. Or
                  pick an organization on a paid plan.
                </Text>
                {loadingMove ? (
                  <Text dimColor>Checking your Supabase account…</Text>
                ) : (
                  <Box flexDirection="row" columnGap={2} alignItems="center">
                    <Button
                      key="move-recheck"
                      variant="secondary"
                      onPress={() => background(loadMove($))}
                    >
                      Check again
                    </Button>
                    <Button
                      key="move-create-anyway"
                      plain
                      onPress={() =>
                        background(
                          pilot($, createRequest($, org, moveChoices, moveOrg, moveRegion)),
                        )
                      }
                    >
                      Try anyway
                    </Button>
                  </Box>
                )}
              </Box>
            ) : (
              <Box flexDirection="row" columnGap={2} alignItems="center">
                <Button
                  key="move-create"
                  variant="primary"
                  onPress={() =>
                    background(pilot($, createRequest($, org, moveChoices, moveOrg, moveRegion)))
                  }
                >
                  Create it
                </Button>
                <Text dimColor>{org?.cost ?? ""}</Text>
              </Box>
            )}
          </Box>
        );
    } else if (nextStep?.id === "export") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="column">
            <Text>1. In Lovable: More → Cloud → Overview → Advanced settings.</Text>
            <Text>
              2. Under Export project data, click Export data, then Export on the Database card,
              then Start export.
            </Text>
            <Text>
              3. Lovable emails you a download link (it's also in Cloud → Storage). Download the
              zip.
            </Text>
          </Box>
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Button
              key="move-export"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: I've downloaded my Lovable export. Read it with \`${moveCommand($, ["export"])}\` and tell me what's in it.`,
                  ),
                )
              }
            >
              I've downloaded it
            </Button>
            {s.lovableUrl ? <Link href={s.lovableUrl} label="Open Lovable ↗" /> : null}
          </Box>
          <Text dimColor>
            Clodable finds it in your Downloads. Lovable allows one export a day, while your backend
            is running.
          </Text>
        </Box>
      );
    } else if (
      nextStep?.id === "copy" &&
      nextStep.state !== "attention" &&
      (move?.vaultLeft ?? []).length > 0
    ) {
      // Copied: the database's encrypted secrets are the step's last part.
      const missing = ((move?.vaultLeft ?? []) as string[]).filter(
        (n) => !(moveVault?.set ?? []).includes(n),
      );
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your database keeps {plural(missing.length, "secret")} Lovable can't hand over (they're
            encrypted). In Lovable, open More → Cloud → SQL editor, run this, then paste each value
            here. It goes straight into your new backend.
          </Text>
          {moveVault?.query ? (
            sqlBlock("move-vault-query", moveVault.query)
          ) : (
            <Text dimColor>…</Text>
          )}
          {missing.map((name) => (
            <Box key={`vault-${name}`} flexDirection="column">
              <Text bold>{name}</Text>
              {field(`move-vault-${name}`, "Paste the value", "Save", (v) =>
                background(moveWith($, ["vault-secret", name], v)),
              )}
            </Box>
          ))}
          {goOnWithout("move-vault-skip", "vault", missing.length)}
        </Box>
      );
    } else if (nextStep?.id === "copy") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          {planNote("data")}
          {nextStep.state === "attention" ? (
            <Box flexDirection="column">
              {(move?.checks ?? []).map((c: any) => (
                <Text key={`check-${c.id}`} {...(c.ok ? {} : { color: "warning" })}>
                  {c.ok ? "✓" : "!"} {c.label}
                  {c.detail && !c.ok ? `  · ${c.detail}` : ""}
                </Text>
              ))}
            </Box>
          ) : (
            <Text dimColor>
              Your people, tables and settings go into your new backend. Your live app keeps running
              on Lovable meanwhile.
            </Text>
          )}
          <Button
            key="move-copy"
            variant="primary"
            onPress={() =>
              background(
                pilot(
                  $,
                  `Moving off Lovable: copy my data into my new backend with \`${moveCommand($, ["copy"])}\`, then make sure my app works on it.`,
                ),
              )
            }
          >
            {nextStep.state === "attention" ? "Copy again" : "Copy my data"}
          </Button>
        </Box>
      );
    } else if (nextStep?.id === "files") {
      const waiting: string[] = move?.files?.waiting ?? [];
      moveControls =
        waiting.length === 0 ? (
          <Box flexDirection="column" rowGap={1}>
            <Text dimColor>The images and documents people uploaded, copied as they are.</Text>
            {planNote("files")}
            {(move?.files?.tooBig ?? 0) > 0 ? (
              <Text color="warning">
                {plural(move.files.tooBig, "file")} are larger than your Supabase plan accepts.
              </Text>
            ) : null}
            <Button
              key="move-files"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: copy my uploaded files to my new backend with \`${moveCommand($, ["files"])}\`.`,
                  ),
                )
              }
            >
              {move?.files ? "Copy the rest" : "Copy my files"}
            </Button>
          </Box>
        ) : move?.vaultKey ? (
          <Box flexDirection="column" rowGap={1}>
            <Text>
              Your private folders ({waiting.join(", ")}) need Lovable Cloud's service key, to read
              them once.
            </Text>
            <Text dimColor>
              In Lovable, run this query (or ask Lovable's chat to run it), then paste the result
              here. It's used for this copy only and never saved.
            </Text>
            <Box flexDirection="row" columnGap={1} alignItems="center">
              <Code source={VAULT_QUERY} language="sql" />
              <Button key="copy-vault-query" plain onPress={() => $.ui.copy({ text: VAULT_QUERY })}>
                Copy
              </Button>
            </Box>
            {field("move-source-key", "eyJ…", "Copy them", (v) =>
              background(moveWith($, ["files", "--private"], v)),
            )}
          </Box>
        ) : (
          <Text>
            Your private folders ({waiting.join(", ")}) can't be copied on their own yet: download
            those files in Lovable (More → Cloud → Storage) and upload them in Supabase, or ask a
            developer.
          </Text>
        );
    } else if (
      nextStep?.id === "functions" &&
      nextStep.state !== "attention" &&
      (move?.secretsLeft ?? []).length > 0
    ) {
      // Deployed: the secrets they read are the step's last part.
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          {secretsBlock}
          {goOnWithout("move-secrets-skip", "secrets", missingSecrets.length)}
        </Box>
      );
    } else if (nextStep?.id === "functions") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>
            Your {plural(move?.functions ?? 0, "backend function")} go to your new backend, all
            together.
          </Text>
          <Button
            key="move-functions"
            variant="primary"
            onPress={() =>
              background(
                pilot(
                  $,
                  `Moving off Lovable: deploy my backend functions to my new backend with \`${moveCommand($, ["functions"])}\`.`,
                ),
              )
            }
          >
            {nextStep.state === "attention" ? "Deploy them again" : "Deploy my functions"}
          </Button>
        </Box>
      );
    } else if (nextStep?.id === "try") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          {settingsFields("move-setting", true)}
          {tryBlock}
        </Box>
      );
    } else if (nextStep?.id === "netlify") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your website moves to Netlify, under your own account (free to start). Each Publish will
            put it live there; your live app stays on Lovable until the switch.
          </Text>
          <Box flexDirection="column">
            <Text>1. Open Netlify's token page.</Text>
            <Text>2. Create a personal access token named Clodable.</Text>
            <Text>3. Paste it here. It stays on this computer.</Text>
          </Box>
          <Link
            href="https://app.netlify.com/user/applications#personal-access-tokens"
            label="Open Netlify's token page ↗"
          />
          {field("move-netlify-token", "Netlify token", "Connect", (v) =>
            background(moveWith($, ["netlify"], v)),
          )}
        </Box>
      );
    } else if (nextStep?.id === "site" && (move?.settingsLeft ?? []).length > 0) {
      // The site is there: the settings its server code reads are the step's last part.
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          {settingsFields("move-setting", true)}
          {goOnWithout("move-settings-skip", "settings", (move?.settingsLeft ?? []).length)}
        </Box>
      );
    } else if (nextStep?.id === "site") {
      const teams = moveTeams ?? [];
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>
            Clodable creates the site, points it at your new backend, and sets up Publish to put it
            live on Netlify through GitHub.
          </Text>
          {teams.length > 1 && Select ? (
            <Select
              key="move-team"
              label="Netlify team"
              options={teams.map((t) => ({ value: t.slug, label: t.name }))}
              value={moveTeam}
              onSelect={(v: string) => {
                moveTeam = v;
                $.ui.invalidate("ui.render");
              }}
            />
          ) : null}
          <Button
            key="move-site"
            variant="primary"
            onPress={() =>
              background(
                pilot(
                  $,
                  `Moving off Lovable: put my site on Netlify with \`${moveCommand($, ["site", ...(moveTeam ? ["--account", moveTeam] : [])])}\`, then tell me what's left before I can see it there.`,
                ),
              )
            }
          >
            Put my site on Netlify
          </Button>
        </Box>
      );
    } else if (nextStep?.id === "emails" && !move?.resend) {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Clodable sends your users' sign-up confirmations and password resets from your own
            domain (like yourapp.com), through your Resend account.
          </Text>
          <Box flexDirection="column">
            <Text>1. Sign in to Resend, or sign up (it's free to start).</Text>
            <Text>2. API Keys → Create API Key, with Full access.</Text>
            <Text>3. Paste the key here. It stays on this computer.</Text>
          </Box>
          <Link href="https://resend.com/api-keys" label="Open Resend's keys page ↗" />
          {field("move-resend-key", "re_…", "Connect", (v) =>
            background(moveWith($, ["resend"], v)),
          )}
          {noEmails("No domain of your own yet?")}
        </Box>
      );
    } else if (nextStep?.id === "emails" && !move?.emails) {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Which domain should your emails come from? One you own, like example.com: they'll come
            from no-reply@ that domain.
          </Text>
          {field("move-email-domain", "example.com", "Set it up", (v) => {
            const domain = v
              .trim()
              .toLowerCase()
              .replace(/^https?:\/\//, "")
              .replace(/^www\./, "")
              .replace(/\/.*$/, "");
            if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) {
              moveError = {
                message: `“${v.trim()}” isn't a domain name.`,
                hint: "Just the domain, like example.com.",
              };
              $.ui.invalidate("ui.render");
              return;
            }
            background(
              pilot(
                $,
                `Moving off Lovable: set up emails for my users from ${domain} with \`${moveCommand($, ["emails", "--domain", domain])}\`, then tell me what to do at my domain's provider.`,
              ),
            );
          })}
          {noEmails("No domain of your own yet?")}
        </Box>
      );
    } else if (nextStep?.id === "emails") {
      const records: any[] = move?.emails?.records ?? [];
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Add {records.length === 1 ? "this record" : `these ${records.length} records`} where you
            manage {move.emails.domain} (where you bought it: Namecheap, GoDaddy, Cloudflare…). They
            can take a few minutes to show, sometimes a few hours.
          </Text>
          {records.map((r, i) => (
            <Box key={`record-${i}`} flexDirection="column">
              <Text bold>
                {r.type}
                {r.priority !== undefined ? `  · priority ${r.priority}` : ""}
              </Text>
              {copyable(`record-${i}-name`, "Name ", r.name)}
              {copyable(`record-${i}-value`, "Value", r.value)}
            </Box>
          ))}
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Button
              key="move-emails-check"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: check whether ${move.emails.domain}'s email records are in place with \`${moveCommand($, ["emails"])}\`, and finish setting up my emails if they are.`,
                  ),
                )
              }
            >
              Check again
            </Button>
          </Box>
          {noEmails("Rather do this later?")}
        </Box>
      );
    } else if (nextStep?.id === "services") {
      const sv = move?.services as any;
      const emailsOn = Boolean(move?.emails?.connected);
      const providers = {
        openrouter: {
          label: "OpenRouter (the same models Lovable uses)",
          name: "OpenRouter",
          keys: "https://openrouter.ai/settings/keys",
        },
        gemini: {
          label: "Google Gemini",
          name: "Google Gemini",
          keys: "https://aistudio.google.com/apikey",
        },
        openai: { label: "OpenAI", name: "OpenAI", keys: "https://platform.openai.com/api-keys" },
      } as const;
      const chosen = providers[aiChoice];
      const fallback =
        "Keep Lovable's as the fallback when that key isn't set, so my app keeps working on Lovable until the switch.";
      let part: unknown = null;
      if (sv?.ai && !sv.aiSwitched && !sv.aiProvider) {
        part = (
          <Box flexDirection="column" rowGap={1}>
            <Text>
              Your app's AI features run on Lovable's AI, which stops when it leaves. Clodable moves
              them to an AI provider of your own.
            </Text>
            {Select ? (
              <Select
                key="move-ai-provider"
                label="Provider"
                options={Object.entries(providers).map(([value, p]) => ({ value, label: p.label }))}
                value={aiChoice}
                onSelect={(v: string) => {
                  aiChoice = v in providers ? (v as typeof aiChoice) : "openrouter";
                  $.ui.invalidate("ui.render");
                }}
              />
            ) : null}
            <Box flexDirection="column">
              <Text>1. Create a key on {chosen.name}.</Text>
              <Text>2. Paste it here. It goes to your preview, your site and your backend.</Text>
            </Box>
            <Link href={chosen.keys} label={`Open ${chosen.name}'s keys page ↗`} />
            {field("move-ai-key", "Paste the key", "Save", (v) =>
              background(moveWith($, ["ai", aiChoice], v)),
            )}
          </Box>
        );
      } else if (sv?.ai && !sv.aiSwitched) {
        const name = providers[sv.aiProvider as keyof typeof providers]?.name ?? sv.aiProvider;
        part = (
          <Box flexDirection="column" rowGap={1}>
            <Text>Your {name} key is saved. Claude now points your app's AI features at it.</Text>
            <Button
              key="move-ai-switch"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: switch my app's AI features from Lovable's AI to ${name}. Clodable saved AI_API_URL and AI_API_KEY for my preview, my site and my backend functions: make the code call \`\${AI_API_URL}/chat/completions\` with AI_API_KEY (the same OpenAI-style API). ${fallback} Deploy my backend functions with \`${moveCommand($, ["functions"])}\` if you changed any, then check it works in the preview.`,
                  ),
                )
              }
            >
              Switch my AI features
            </Button>
          </Box>
        );
      } else if (sv?.emails && !sv.emailsSwitched && emailsOn) {
        part = (
          <Box flexDirection="column" rowGap={1}>
            <Text>
              Your app sends its own emails through Lovable. Clodable gives it a Resend key of its
              own, sending from {move?.emails?.sender}, and Claude switches the sending.
            </Text>
            <Button
              key="move-app-emails"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: switch my app's own emails from Lovable to Resend. Run \`${moveCommand($, ["app-emails"])}\`: it gives my app RESEND_API_KEY and EMAIL_FROM. Then make the code send through Resend's API with them. ${fallback} Deploy my backend functions with \`${moveCommand($, ["functions"])}\`${sv.hook ? `, then turn on my own sign-in emails with \`${moveCommand($, ["emails", "--hook"])}\`` : ""}.`,
                  ),
                )
              }
            >
              Switch my emails
            </Button>
          </Box>
        );
      } else if (sv?.emails && !sv.emailsSwitched) {
        part = (
          <Text>
            Your app also sends its own emails through Lovable: they move with your emails, in the
            step above.
          </Text>
        );
      } else if (sv?.hook && emailsOn && !sv.hookOn) {
        part = (
          <Box flexDirection="column" rowGap={1}>
            <Text>
              Your app has its own sign-in emails (from Lovable). Clodable turns them on, so
              confirmations and password resets look like your app.
            </Text>
            <Button
              key="move-email-hook"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: turn on my app's own sign-in emails with \`${moveCommand($, ["emails", "--hook"])}\` (deploy my backend functions with \`${moveCommand($, ["functions"])}\` first if it asks).`,
                  ),
                )
              }
            >
              Turn on my sign-in emails
            </Button>
          </Box>
        );
      } else if ((sv?.connectors ?? []).length > 0) {
        const names: string[] = sv.connectors;
        part = (
          <Box flexDirection="column" rowGap={1}>
            <Text>
              Your app reaches {names.join(", ")} through Lovable's connectors, which stop when it
              leaves. Paste your own key for each: it goes to your preview and your site.
            </Text>
            {names.map((name) => {
              const setting = `${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
              return (
                <Box key={`connector-${name}`} flexDirection="column">
                  <Text bold>{name}</Text>
                  {field(`move-connector-${name}`, `Your ${name} key`, "Save", (v) =>
                    background(saveSetting($, setting, v)),
                  )}
                </Box>
              );
            })}
            <Button
              key="move-connectors"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: my app reaches ${names.join(", ")} through Lovable's connectors (connector-gateway.lovable.dev). Switch each to that service's own API, reading its key from ${names.map((n) => `${n.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`).join(", ")} (process.env on the server; tell me where to paste any that's missing). Check it works in the preview.`,
                  ),
                )
              }
            >
              Switch them
            </Button>
          </Box>
        );
      }
      const left: string[] = sv?.left ?? [];
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          {part as never}
          {left.length > 0 ? (
            <Box flexDirection="column" rowGap={1} marginTop={1}>
              <Box flexDirection="row" columnGap={2} alignItems="center">
                <Text>Rather not switch now?</Text>
                <Button
                  key="move-services-skip"
                  variant="secondary"
                  onPress={() => background(moveStep($, ["services", "--skip"]))}
                >
                  Go on without them
                </Button>
              </Box>
              <Text dimColor>
                Then {left.join(", ")} stop working when Lovable goes. Claude can switch them later.
              </Text>
            </Box>
          ) : null}
        </Box>
      );
    } else if (nextStep?.id === "google" && move?.google?.configured) {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Google sign-in is on in your new backend. Claude now switches your app's Google button
            to it.
          </Text>
          <Button
            key="move-google-switch"
            variant="primary"
            onPress={() =>
              background(
                pilot(
                  $,
                  "Moving off Lovable: my app signs in with Google through Lovable's broker (@lovable.dev/cloud-auth-js), which only works on Lovable. Clodable turned Google on in my new backend and set VITE_GOOGLE_SIGN_IN=supabase for my preview and my site. Make the Google button call supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }) when import.meta.env.VITE_GOOGLE_SIGN_IN is 'supabase', and keep Lovable's broker otherwise, so my app keeps working on Lovable until the switch. Check it in the preview.",
                ),
              )
            }
          >
            Switch my Google sign-in
          </Button>
        </Box>
      );
    } else if (nextStep?.id === "google") {
      const redirect = move?.google?.redirect as string | undefined;
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            People sign in to your app with Google. On your new backend that needs a Google client
            of your own: Clodable turns it on with it.
          </Text>
          <Box flexDirection="column">
            <Text>
              1. In Google Cloud: APIs & Services → Credentials → Create credentials → OAuth client
              ID → Web application.
            </Text>
            <Text>2. Under Authorized redirect URIs, add this address:</Text>
          </Box>
          {redirect ? copyable("move-google-redirect", "", redirect) : null}
          <Text>3. Paste the client ID, then its secret, here. The secret stays off the chat.</Text>
          <Link
            href="https://console.cloud.google.com/apis/credentials"
            label="Open Google Cloud's credentials ↗"
          />
          {googleClientId
            ? field("move-google-secret", "Client secret", "Turn it on", (v) =>
                background(moveWith($, ["google", googleClientId], v)),
              )
            : field("move-google-id", "…apps.googleusercontent.com", "Next", (v) => {
                const id = v.trim();
                if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) {
                  moveError = {
                    message: "That doesn't look like a Google client ID.",
                    hint: "It ends with .apps.googleusercontent.com.",
                  };
                } else {
                  googleClientId = id;
                  moveError = null;
                }
                $.ui.invalidate("ui.render");
              })}
          <Box flexDirection="row" columnGap={2} alignItems="center" marginTop={1}>
            <Text>Rather not now?</Text>
            <Button
              key="move-google-skip"
              variant="secondary"
              onPress={() => background(moveStep($, ["google", "--skip"]))}
            >
              Leave Google sign-in off
            </Button>
          </Box>
        </Box>
      );
    } else if (nextStep?.id === "freeze") {
      const last = move?.lastExport ? new Date(move.lastExport).getTime() : 0;
      const nextExport = last + 24 * 60 * 60_000;
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Now your live app moves over. It pauses for the few minutes this takes: people still see
            everything and can sign in; changes, new sign-ups and uploads wait until it runs on your
            new backend.
          </Text>
          {nextExport > now ? (
            <Text color="warning">
              Lovable allows one export a day: your next one is possible{" "}
              {new Date(nextExport).toDateString() === new Date(now).toDateString()
                ? "after"
                : "tomorrow after"}{" "}
              {new Date(nextExport).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
              Pause after that, so the pause stays short.
            </Text>
          ) : null}
          <Text>
            1. In Lovable, open More → Cloud → SQL editor, paste this and run it. It also stops your
            app's scheduled jobs there:
          </Text>
          {pausePlan ? sqlBlock("move-freeze", pausePlan.freeze) : <Text dimColor>…</Text>}
          <Text>2. Then tell Clodable.</Text>
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Button
              key="move-paused"
              variant="primary"
              onPress={() => background(moveStep($, ["paused"]))}
            >
              I've paused it
            </Button>
            {s.lovableUrl ? <Link href={s.lovableUrl} label="Open Lovable ↗" /> : null}
          </Box>
        </Box>
      );
    } else if (nextStep?.id === "final-export") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your live app is paused. Export your data once more: this export has everything people
            wrote until the pause.
          </Text>
          <Box flexDirection="column">
            <Text>1. In Lovable: More → Cloud → Overview → Advanced settings.</Text>
            <Text>
              2. Under Export project data, click Export data, then Export on the Database card,
              then Start export.
            </Text>
            <Text>3. Download the zip from the email Lovable sends.</Text>
          </Box>
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Button
              key="move-final-export"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: I've downloaded my final Lovable export, made after the pause. Read it with \`${moveCommand($, ["export"])}\` and tell me what's in it.`,
                  ),
                )
              }
            >
              I've downloaded it
            </Button>
            {s.lovableUrl ? <Link href={s.lovableUrl} label="Open Lovable ↗" /> : null}
          </Box>
          {undoBlock}
        </Box>
      );
    } else if (nextStep?.id === "final-copy") {
      const hasFiles = moveSteps.some((x) => x.id === "files");
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          {nextStep.state === "attention" ? (
            <Box flexDirection="column">
              {(move?.checks ?? []).map((c: any) => (
                <Text key={`check-${c.id}`} {...(c.ok ? {} : { color: "warning" })}>
                  {c.ok ? "✓" : "!"} {c.label}
                  {c.detail && !c.ok ? `  · ${c.detail}` : ""}
                </Text>
              ))}
            </Box>
          ) : (
            <Text dimColor>
              Your data as of the pause replaces the copy (what you tried on it goes), with your
              app's scheduled jobs. Your new backend then takes changes again.
            </Text>
          )}
          <Button
            key="move-final-copy"
            variant="primary"
            onPress={() =>
              background(
                pilot(
                  $,
                  `Moving off Lovable: copy my final export into my new backend for good with \`${moveCommand($, ["copy"])}\`${hasFiles ? `, then copy the files uploaded since with \`${moveCommand($, ["files"])}\`` : ""}, and make sure everything is there.`,
                ),
              )
            }
          >
            {nextStep.state === "attention" ? "Copy again" : "Copy it in for good"}
          </Button>
          {undoBlock}
        </Box>
      );
    } else if (nextStep?.id === "golive") {
      const emailsOn = Boolean(move?.emails?.connected);
      // Without emails, nobody can confirm one: that choice isn't offered.
      const people = !emailsOn && newPeople === "confirm" ? "open" : newPeople;
      const jobs = move?.lovableJobs as { count: number; stop: string } | undefined;
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text dimColor>
            Clodable points your app's files and its sign-in at your new backend and at{" "}
            {move?.site?.url ?? "your site"}. Then Publish puts it live.
          </Text>
          {Select ? (
            <Select
              key="move-new-people"
              label="New people"
              options={[
                ...(emailsOn
                  ? [{ value: "confirm", label: "Sign up, confirming their email" }]
                  : []),
                { value: "open", label: "Sign up straight away" },
                { value: "invite", label: "Only people you invite" },
              ]}
              value={people}
              onSelect={(v: string) => {
                newPeople = v === "invite" ? "invite" : v === "open" ? "open" : "confirm";
                $.ui.invalidate("ui.render");
              }}
            />
          ) : null}
          {(move?.stripeWebhooks ?? []).length > 0 ? (
            <Box flexDirection="column" rowGap={1}>
              <Text>
                Your payments: in Stripe → Developers → Webhooks, change your endpoint's address to
                your new backend when you go live (its signing secret stays the same):
              </Text>
              {(move.stripeWebhooks as Array<{ name: string; url: string }>).map((w, i) =>
                copyable(`move-stripe-${i}`, "", w.url),
              )}
            </Box>
          ) : null}
          {jobs ? (
            <Box flexDirection="column" rowGap={1}>
              <Text>
                Your app has {plural(jobs.count, "scheduled job")}: going live starts them here.
                First stop them in Lovable (More → Cloud → SQL editor), so they don't run twice:
              </Text>
              {sqlBlock("move-stop-jobs", jobs.stop)}
            </Box>
          ) : null}
          {move?.cronKey ? (
            <Text>
              Your scheduled jobs call your app with a key Lovable keeps. Once live, ask Claude to
              give them one of your own.
            </Text>
          ) : null}
          {method === "quick" ? (
            <Text dimColor>
              Your data is as of your export
              {move?.lastExport
                ? ` (${new Date(move.lastExport).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })})`
                : ""}
              . Anything written in your Lovable app since stays there.
            </Text>
          ) : null}

          <Button
            key="move-golive"
            variant="primary"
            onPress={() =>
              background(
                pilot(
                  $,
                  `Moving off Lovable: switch my app to its new backend and site with \`${moveCommand($, ["golive", "--sign-up", people === "invite" ? "no" : "yes", ...(emailsOn ? ["--confirm-email", people === "confirm" ? "yes" : "no"] : [])])}\`, then tell me what changed and how to put it live.`,
                ),
              )
            }
          >
            Go live
          </Button>
        </Box>
      );
    } else if (nextStep?.id === "domain" && !publishedSinceLive) {
      // Right after going live, one thing only: Publish puts it there.
      moveControls = (
        <Text>
          First, Publish (in the Clodable bar): it puts your app live at{" "}
          {move?.site?.url ?? "its new address"}.
        </Text>
      );
    } else if (nextStep?.id === "domain" && move?.domain) {
      const records: any[] = move.domain.records ?? [];
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Where you manage {move.domain.name} (where you bought it), replace the records that
            point to Lovable with {records.length === 1 ? "this one" : "these"}. They can take a few
            minutes to show, sometimes a few hours.
          </Text>
          {records.map((r, i) => (
            <Box key={`domain-record-${i}`} flexDirection="column">
              <Text bold>{r.type}</Text>
              {copyable(`domain-record-${i}-name`, "Name ", r.name)}
              {copyable(`domain-record-${i}-value`, "Value", r.value)}
            </Box>
          ))}
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Button
              key="move-domain-check"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: check whether ${move.domain.name} points to my new site with \`${moveCommand($, ["domain"])}\`, and tell me what's left if it doesn't.`,
                  ),
                )
              }
            >
              Check again
            </Button>
          </Box>
        </Box>
      );
    } else if (nextStep?.id === "domain") {
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your app is live at {move?.site ? new URL(move.site.url).host : "its new address"}. Does
            it have its own domain, like yourapp.com? Clodable moves it to your new site before
            Lovable goes.
          </Text>
          {field("move-domain", "yourapp.com", "Move it", (v) => {
            const domain = v
              .trim()
              .toLowerCase()
              .replace(/^https?:\/\//, "")
              .replace(/\/.*$/, "");
            if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) {
              moveError = {
                message: `“${v.trim()}” isn't a domain name.`,
                hint: "Just the domain, like yourapp.com.",
              };
              $.ui.invalidate("ui.render");
              return;
            }
            background(
              pilot(
                $,
                `Moving off Lovable: move my domain ${domain} to my new site with \`${moveCommand($, ["domain", domain])}\`, then tell me what to change at my domain's provider.`,
              ),
            );
          })}
          <Box flexDirection="row" columnGap={2} alignItems="center" marginTop={1}>
            <Text>No domain of its own?</Text>
            <Button
              key="move-domain-skip"
              variant="secondary"
              onPress={() => background(moveStep($, ["domain", "--skip"]))}
            >
              Keep this address
            </Button>
          </Box>
        </Box>
      );
    } else if (nextStep?.id === "lovable" && move?.signIn?.needed && !move.signIn.at) {
      // Proof first: the app works on its new home before its old one goes.
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Sign in on your new site with your own account and change something. Lovable's last
            steps show once Clodable sees you signed in there.
          </Text>
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Link href={liveAddress} label="Open your site ↗" />
            <Button
              key="move-signed-in"
              variant="secondary"
              onPress={() => background(checkSignIn($))}
            >
              I've signed in
            </Button>
          </Box>
        </Box>
      );
    } else if (nextStep?.id === "lovable") {
      const signedIn = move?.signIn?.at as string | undefined;
      const message = move?.signIn?.needed
        ? `We've moved ${s.project} to ${liveAddress}. Sign in with your usual email and password: nothing else changes.`
        : `We've moved ${s.project} to ${liveAddress}.`;
      moveControls = (
        <Box flexDirection="column" rowGap={1}>
          {signedIn ? (
            <Text color="success">✓ You signed in on your new site, {ago(signedIn, now)}.</Text>
          ) : null}
          <Text>Now finish in Lovable, in this order:</Text>
          <Box flexDirection="column">
            <Text>
              1. Unpublish your app (More → Settings → General → Unpublish project), so nobody keeps
              using its Lovable address.
            </Text>
            <Text>
              2. More → Settings → Git → GitHub → Disconnect, so Lovable stops changing your code.
            </Text>
            <Text>
              3. More → Cloud → Overview → Advanced settings → Remove Lovable Cloud. Tick both boxes
              and type your project's name. This deletes Lovable's copy of your data, for good.
            </Text>
          </Box>
          <Box flexDirection="row" columnGap={2} alignItems="center">
            <Button key="move-finished" variant="primary" onPress={() => background(finishMove($))}>
              I've done it
            </Button>
            {s.lovableUrl ? <Link href={s.lovableUrl} label="Open Lovable ↗" /> : null}
          </Box>
          <Box flexDirection="column" rowGap={1} marginTop={1}>
            <Text dimColor>A message for your users, if you'd like one:</Text>
            <Box flexDirection="row" columnGap={1} alignItems="center">
              <Text>{message}</Text>
              <Button
                key="move-users-message-copy"
                plain
                onPress={() => $.ui.copy({ text: message })}
              >
                Copy
              </Button>
            </Box>
          </Box>
        </Box>
      );
    } else if (move && moveSteps.length > 0) {
      moveControls = (
        <Text>
          Your app is off Lovable: it runs on your own Supabase and Netlify, and each Publish
          updates it.
        </Text>
      );
    }
    const moveErrorBlock = moveError ? (
      <Box flexDirection="column">
        <Text color="error">{moveError.message}</Text>
        {moveError.hint ? <Text dimColor>{moveError.hint}</Text> : null}
      </Box>
    ) : null;
    // What's left under a step once it's done: belongs there, not under the next step.
    // Steps after the one the builder is on read as later ones, done or not: they come next.
    const nextIndex = nextStep ? moveSteps.indexOf(nextStep) : moveSteps.length;
    const stepRow = (step: any) => {
      const ahead = moveSteps.indexOf(step) > nextIndex;
      const state = ahead ? "later" : step.state;
      return (
        <Box key={`step-${step.id}`} flexDirection="column" rowGap={1}>
          <Text
            {...(state === "attention"
              ? { color: "warning" }
              : state === "done"
                ? { color: "success" }
                : {})}
            dimColor={state === "later"}
            bold={step === nextStep}
          >
            {MOVE_MARK[state] ?? "·"} {step.title}
            {step.detail && state !== "later" ? `  · ${step.detail}` : ""}
          </Text>
          {step === nextStep ? (
            <Box flexDirection="column" rowGap={1} paddingLeft={2}>
              {moveErrorBlock}
              {moveControls as never}
            </Box>
          ) : null}
        </Box>
      );
    };
    const stages: Array<{ id: string; title: string; about: string; steps: any[] }> = [];
    for (const step of moveSteps) {
      if (step.id === "facts") continue;
      const stage = MOVE_STAGES.find((x) => x.steps.includes(step.id));
      const current = stages.at(-1);
      if (stage && current?.id !== stage.id) {
        stages.push({ id: stage.id, title: stage.title, about: stage.about, steps: [step] });
      } else if (current) current.steps.push(step);
      else stages.push({ id: "move", title: "", about: "", steps: [step] });
    }
    // The stage the builder is in; with nothing left, the last (all of them fold).
    const currentStage = nextStep
      ? stages.findIndex((x) => x.steps.includes(nextStep))
      : stages.length - 1;
    // The other way to move, offered where it changes something: before Go live starts.
    const switchStarted = Boolean(move?.switch?.frozenAt || move?.switch?.liveAt);
    const otherWay =
      method && !switchStarted && !isPiloting() && !moveRun ? (
        <Box flexDirection="row" columnGap={2} alignItems="center">
          <Text dimColor>{method === "quick" ? "People use your app?" : "Just a prototype?"}</Text>
          <Button
            key="move-other-way"
            variant="secondary"
            onPress={() => background(chooseMethod($, method === "quick" ? "careful" : "quick"))}
          >
            {method === "quick" ? "Move it carefully instead" : "Move it in one go instead"}
          </Button>
        </Box>
      ) : null;
    // Asked before the steps: it decides how the live app moves at the end.
    const methodQuestion = (
      <Box flexDirection="column" rowGap={2}>
        <Text bold>How should your app move?</Text>
        <Box flexDirection="column" rowGap={1}>
          <Button
            key="move-method-careful"
            variant="secondary"
            onPress={() => background(chooseMethod($, "careful"))}
          >
            Carefully
          </Button>
          <Text dimColor>
            For an app people use. You try a working copy first; at the end your live app pauses for
            a few minutes while the latest data comes over, so nothing is lost.
          </Text>
        </Box>
        <Box flexDirection="column" rowGap={1}>
          <Button
            key="move-method-quick"
            variant="secondary"
            onPress={() => background(chooseMethod($, "quick"))}
          >
            In one go
          </Button>
          <Text dimColor>
            For a prototype. One export, then your app goes live on your own accounts. Anything
            written in Lovable after your export stays there.
          </Text>
        </Box>
      </Box>
    );
    const stageDetail: Record<string, string | undefined> = {
      backend: move?.home?.name,
      website: move?.site?.url,
    };
    const factsBlock = (
      <Box flexDirection="column" rowGap={1}>
        <Text bold>First, Claude looks at your app</Text>
        <Text dimColor>
          It reads your app's code to see what it uses (AI, sign-in, emails, payments…), so each
          step fits your app. Nothing changes.
        </Text>
        {isPiloting() ? (
          <Text dimColor>Claude is looking at your app…</Text>
        ) : (
          <Box flexDirection="row">
            <Button
              key="move-facts"
              variant="primary"
              onPress={() =>
                background(
                  pilot(
                    $,
                    `Moving off Lovable: look at my app's code to see what it uses (AI, sign-in, emails, connected services, payments, scheduled jobs, uploads). Start from \`${moveCommand($, ["facts"])}\`, check each thing in the code, record what you found as the move skill says, then tell me in a few plain lines.`,
                  ),
                )
              }
            >
              Look at my app
            </Button>
          </Box>
        )}
      </Box>
    );
    const moveSection =
      move && factsNeeded ? (
        <Box flexDirection="column" rowGap={1}>
          {moveErrorBlock}
          {factsBlock}
        </Box>
      ) : move && !method ? (
        <Box flexDirection="column" rowGap={1}>
          {moveErrorBlock}
          {methodQuestion}
        </Box>
      ) : moveSteps.length > 0 ? (
        <Box flexDirection="column" rowGap={2}>
          {stages.map((stage, index) =>
            index > currentStage ? (
              // A stage still ahead: its name only, its steps folded until it comes.
              <Text key={`stage-${stage.id}`} dimColor>
                {stage.title}
              </Text>
            ) : stage.steps.every((x) => x.state === "done") ? (
              // A stage that's done: one line.
              <Text key={`stage-${stage.id}`} color="success">
                ✓ {stage.title}
                {stageDetail[stage.id] ? `  · ${stageDetail[stage.id]}` : ""}
              </Text>
            ) : (
              <Box key={`stage-${stage.id}`} flexDirection="column" rowGap={1}>
                {stage.title ? (
                  <Box flexDirection="column">
                    <Text bold>{stage.title}</Text>
                    <Text dimColor>{stage.about}</Text>
                  </Box>
                ) : null}
                {stage.id === "golive" ? otherWay : null}
                {stage.steps.map(stepRow)}
              </Box>
            ),
          )}
          {nextStep ? null : (
            <Box flexDirection="column" rowGap={1}>
              {moveErrorBlock}
              {moveControls as never}
            </Box>
          )}
        </Box>
      ) : (
        (moveErrorBlock ?? <Text dimColor>Looking at your app…</Text>)
      );

    // Still on Lovable Cloud, or not known yet: the panel is the move and its questions, nothing else.
    const who = { clodable: "Clodable", you: "You", help: "Help" } as const;
    const levels: Record<string, string> = {
      simple: "A simple move: Clodable does nearly everything, and you click a few buttons.",
      "some-steps": "A move with a few steps for you, each one guided.",
      "needs-help": "A move where some parts are best done with someone technical.",
    };
    const moveStage =
      s.backend === "unknown" ||
      s.hosting === "unknown" ||
      s.backend === "lovable-cloud" ||
      s.finishingMove;
    if (moveStage) {
      // Live on the new backend already, until the builder is done in Lovable: still the move.
      const moving = s.backend === "lovable-cloud" || s.finishingMove;
      const onCloud = moving || s.backend === "unknown";
      if (s.backend === "lovable-cloud" && !assessment && !assessing) {
        background(loadAssessment($));
      }
      if (moving && !move && !loadingMove && !moveError) background(loadMove($));
      return (
        <Box flexDirection="column" rowGap={2} paddingX={2} paddingY={1}>
          {header}
          {onCloud ? (
            <Box flexDirection="column" rowGap={1}>
              <Text bold>Move off Lovable</Text>
              <Text dimColor>
                Your data, your people and your backend come to your own Supabase, step by step.
                Your live app keeps running on Lovable until you switch.
              </Text>
            </Box>
          ) : null}
          {questions.length > 0 ? (
            <Box flexDirection="column" rowGap={2}>
              <Text bold>
                {questions.length === 2 ? "First, two quick questions" : "One quick question"}
              </Text>
              {questions as never}
            </Box>
          ) : null}
          {moving ? (
            <Box flexDirection="column" rowGap={2}>
              {assessment?.error ? (
                <Text color="error">Couldn't look at your app: {assessment.error}</Text>
              ) : assessment?.checked ? (
                <Text>{levels[assessment.level] ?? ""}</Text>
              ) : null}
              {assessment?.checked && !started && (assessment?.items ?? []).length > 0 ? (
                <Box flexDirection="column" rowGap={1}>
                  <Text bold>What moves</Text>
                  {(assessment.items as any[]).map((item) => (
                    <Box key={`moves-${item.id}`} flexDirection="column">
                      <Text>
                        <Text bold {...(item.by === "help" ? { color: "warning" } : {})}>
                          {item.label}
                        </Text>
                        <Text dimColor> · {who[item.by as keyof typeof who] ?? ""}</Text>
                      </Text>
                      <Text dimColor>{item.detail}</Text>
                    </Box>
                  ))}
                  {(assessment.notes ?? []).length > 0 ? (
                    <Box flexDirection="column">
                      <Text bold>Worth knowing</Text>
                      {(assessment.notes as string[]).map((note, i) => (
                        <Text key={`moves-note-${i}`} dimColor>
                          {note}
                        </Text>
                      ))}
                    </Box>
                  ) : null}
                  <Text dimColor>Something's not right? Tell Claude in the conversation.</Text>
                </Box>
              ) : null}
              {moveSection as never}
            </Box>
          ) : null}
        </Box>
      );
    }

    // Just moved off Lovable: from here, the app is changed in this conversation. Until the next
    // Publish, say so, with the preview one press away.
    const movedOff =
      s.movedAt && !(s.lastPublish && s.lastPublish.at > s.movedAt)
        ? card(
            <Text bold>Your app is off Lovable</Text>,
            <Box flexDirection="column" rowGap={1}>
              <Text dimColor>
                You change it here now: describe a change in the conversation and watch it in the
                preview. Publish puts it live{url ? ` at ${host(url)}` : ""}.
              </Text>
              <Text dimColor>
                Backups: Supabase's Pro plan keeps a copy of your data for each of the last 7 days;
                the free plan doesn't.
              </Text>
            </Box>,
            e.surface === "desktop" && previewUrl
              ? [
                  <Button key="moved-preview" variant="secondary" onPress={() => askForPreview($)}>
                    Show the preview
                  </Button>,
                ]
              : [],
          )
        : null;

    // On its own Supabase, with no connection here yet: Claude can't change the database.
    const databaseCard =
      s.backend === "supabase" && s.databaseConnected === false
        ? card(
            <Text bold>Let Claude change your database</Text>,
            <Box flexDirection="column" rowGap={1}>
              <Text dimColor>
                Connect your Supabase account once: Claude can then add tables and change data, as
                on Lovable, asking you before each change. The token stays on this computer.
              </Text>
              <Link
                href="https://supabase.com/dashboard/account/tokens"
                label="Create a token in Supabase ↗"
              />
              {Input ? (
                <Input
                  key="database-token"
                  placeholder="sbp_…"
                  submitLabel="Connect"
                  value=""
                  onSubmit={(value: string) => background(connectDatabase($, value))}
                />
              ) : null}
            </Box>,
          )
        : null;

    // The settings the app's server code reads, missing on this computer or on the site.
    const settingsBox = settingsFields("app-setting", s.backend === "lovable-cloud");
    const settingsCard = settingsBox
      ? card(<Text bold>Your app's settings</Text>, settingsBox as never)
      : null;
    if (appSettingsStatus === null && !settingsAsked) {
      settingsAsked = true;
      background(loadSettings($));
    }

    // On Lovable's hosting only: where the last click is.
    const lovableHosting =
      s.hosting === "lovable"
        ? card(
            <Text bold>Your site goes live from Lovable</Text>,
            <Text dimColor>
              After Publish here, click Publish, then Publish changes, in Lovable.
            </Text>,
          )
        : null;

    const draftRows = (versions?.draft ?? []).slice(0, 10);
    const publishedRows = (versions?.published ?? []).slice(0, Math.max(3, 12 - draftRows.length));
    const older =
      (versions?.draft.length ?? 0) -
      draftRows.length +
      (versions?.published.length ?? 0) -
      publishedRows.length;

    return (
      <Box flexDirection="column" rowGap={2} paddingX={2} paddingY={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          {header}
          {url ? <Link href={url} label={`${host(url)} ↗`} /> : null}
        </Box>

        {movedOff}

        {databaseCard}

        {settingsCard}

        {state}

        {lovableHosting}

        <Box flexDirection="column">
          {section("History")}
          {versions === null ? (
            <Text dimColor>Loading…</Text>
          ) : draftRows.length + publishedRows.length === 0 ? (
            <Text dimColor>No versions yet.</Text>
          ) : (
            <Box flexDirection="column">
              {draftRows.length > 0 ? <Text dimColor>Not live yet</Text> : null}
              {draftRows.map(versionRow)}
              {publishedRows.length > 0 ? <Text dimColor>Published</Text> : null}
              {publishedRows.map(versionRow)}
              {older > 0 ? <Text dimColor>and {plural(older, "older version")}</Text> : null}
            </Box>
          )}
        </Box>

        {warnings.length > 0 ? (
          <Box flexDirection="column">
            {section("Worth a look")}
            {warnings.map((c) => (
              <Box flexDirection="column">
                <Text color={c.status === "fail" ? "error" : "warning"}>
                  ! {c.label}
                  {c.detail ? ` · ${c.detail}` : ""}
                </Text>
                {c.id === "lovable-ai" && c.status === "warn" ? (
                  // Claude switches it; the key goes in the panel's settings once the code reads it.
                  <Box flexDirection="row" columnGap={2} alignItems="center">
                    <Text dimColor> {c.fix}</Text>
                    {isPiloting() ? null : (
                      <Button
                        key="worth-lovable-ai"
                        variant="secondary"
                        onPress={() =>
                          background(
                            pilot(
                              $,
                              "Switch my app's AI features off Lovable's AI to an AI provider of my own (OpenRouter, Google Gemini or OpenAI). Keep the provider's address and model in the code, read the key from a setting named AI_API_KEY that I'll paste in the Clodable panel, and tell me where to create the key.",
                            ),
                          )
                        }
                      >
                        Switch it
                      </Button>
                    )}
                  </Box>
                ) : c.fix ? (
                  <Text dimColor> {c.fix}</Text>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : null}

        <Box flexDirection="row" columnGap={1} alignItems="center">
          <Text dimColor>
            Saved to GitHub after every reply. Only Publish changes your live site.
          </Text>
          {s.pullRequest ? <Link href={s.pullRequest.url} label="Draft on GitHub ↗" /> : null}
        </Box>
      </Box>
    );
  });

  // ── Plain-language activity ─────────────────────────────────────────────
  on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
    if (!(await isApp())) return next(e);
    const row = describeTool(e.props);
    if (!row) return next(e);
    const { Box, Text } = $.ui.resolve(e);
    const mark = e.props.isRunning
      ? "◐"
      : e.props.isErrored
        ? "↻"
        : row.tone === "data"
          ? "◆"
          : row.tone === "work"
            ? "✓"
            : "·";
    const color = e.props.isErrored
      ? undefined
      : row.tone === "data"
        ? "warning"
        : row.tone === "work"
          ? "success"
          : undefined;
    return (
      <Box flexDirection="row" columnGap={1}>
        <Text {...(color ? { color } : {})} dimColor={row.tone === "look" || row.tone === "quiet"}>
          {mark}
        </Text>
        <Text dimColor={row.tone === "look" || row.tone === "quiet" || e.props.isErrored}>
          {e.props.isErrored ? `${row.text} didn't work, trying another way` : row.text}
        </Text>
      </Box>
    );
  });

  on("ui.render", { component: "ToolGroup" }, async ($, e, next) => {
    if (e.props.isExpanded || !(await isApp())) return next(e);
    const { Box, Text } = $.ui.resolve(e);
    return (
      <Box flexDirection="row" columnGap={1}>
        <Text dimColor>{e.props.isActive ? "◐" : "·"}</Text>
        <Text dimColor>{describeGroup(e.props.calls)}</Text>
      </Box>
    );
  });

  // Under each of Claude's replies that changed the app: it's saved, and Restore brings that
  // version back, like Lovable's history in the chat.
  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const engine = await next(e);
    if (inApp !== true) return engine;
    const save = saveForBlock(e.requestId, e.props.text);
    if (!save) return engine;
    const { Box, Text, Button: drawButton } = $.ui.resolve(e);
    const Button = heldButton(drawButton);
    const s = await read($, status);
    const current = s?.ready === true && s.unpublished[0]?.sha === save.sha;
    return (
      <Box flexDirection="column">
        {engine}
        <Box flexDirection="row" columnGap={2} alignItems="center">
          <Text dimColor>✓ Saved</Text>
          {current ? null : (
            <Button
              key={`restore-${save.sha}`}
              plain
              onPress={() => background(restoreVersion($, save.sha, save.subject))}
            >
              ↶ Restore this version
            </Button>
          )}
        </Box>
      </Box>
    );
  });

  // A little warmth while Claude works.
  on("ui.render", { component: "Spinner" }, async (_$, e, next) => {
    if (inApp === true && e.props.word === "Working")
      return next({ ...e, props: { ...e.props, word: "Shaping" } });
    return next(e);
  });

  // Questions about the database get a plain warning above them.
  on("ui.render", { component: "AskUserQuestion" }, async ($, e, next) => {
    if (!(await isApp())) return next(e);
    const questions = (e.props.questions ?? []) as Array<{ header?: string; question?: string }>;
    const engine = await next(e);
    // Clodable's own questions (Undo) already say what they do.
    if (questions.some((q) => ["Undo", "Restore", "Clodable"].includes(q.header ?? "")))
      return engine;
    const text = questions.map((q) => q.question ?? "").join(" ");
    const aboutData = /\b(database|live data|table|column|rows?|row-level|supabase)\b/i.test(text);
    const changing =
      /\b(add|change|delete|drop|remove|update|insert|rename|alter|create|wipe|reset)\b/i.test(
        text,
      );
    if (!aboutData || !changing) return engine;
    const { Box, Text } = $.ui.resolve(e);
    return (
      <Box flexDirection="column">
        <Text color="warning">
          ◆ This is about your live data. Visitors see the change right away.
        </Text>
        {engine}
      </Box>
    );
  });
};

// ── Setup helpers (top level, so they can use $) ─────────────────────────────

async function loadRepos($: EngineInterface) {
  const out = await $.process.run(
    ["gh", "repo", "list", "--limit", "50", "--json", "nameWithOwner,updatedAt", "--source"],
    { cwd, timeoutMs: 30_000 },
  );
  try {
    const list = JSON.parse(out.stdout) as Array<{ nameWithOwner: string }>;
    repoChoices = list.map((r) => ({ value: r.nameWithOwner, label: r.nameWithOwner }));
    chosenRepo = repoChoices[0]?.value ?? "";
  } catch {
    $.ui.toast("Couldn't list your repositories. Type the name instead.");
  }
  $.ui.invalidate("ui.render");
}

async function bringIn($: EngineInterface) {
  const repo = chosenRepo || repoChoices[0]?.value;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    $.ui.toast("Type your repository as owner/name, for example acme/website.");
    return;
  }
  if (settingUp) return;
  settingUp = true;
  $.ui.invalidate("ui.render");
  let result: Result;
  try {
    result = await cli($, ["setup", "--repo", repo, "--yes"], MAX_RUN_MS);
  } finally {
    settingUp = false;
    $.ui.invalidate("ui.render");
  }
  if (!result.ok) {
    $.ui.toast(result.error?.message ?? "Setup didn't finish.");
    return;
  }
  const root = String(result.data?.root ?? "");
  if (root && root !== cwd) {
    await $.ui
      .ask(
        `Your app is in ${root}. Open that folder in a new Claude session to start shaping it.`,
        ["Got it", "Later"],
      )
      .catch(() => "");
  } else {
    $.ui.toast("Your app is ready. Ask Claude for any change.");
  }
  await refreshStatus($);
  await refreshChecks($);
}

async function setUpHere($: EngineInterface) {
  if (settingUp) return;
  settingUp = true;
  $.ui.invalidate("ui.render");
  let result: Result;
  try {
    result = await cli($, ["setup", "--yes"], MAX_RUN_MS);
  } finally {
    settingUp = false;
    $.ui.invalidate("ui.render");
  }
  if (!result.ok) {
    $.ui.toast(result.error?.message ?? "Setup didn't finish.");
    return;
  }
  $.ui.toast("Your app is ready. Ask Claude for any change.");
  await refreshStatus($);
  await refreshChecks($);
}

async function connectGitHub($: EngineInterface) {
  deviceCode = "";
  $.ui.invalidate("ui.render");
  for await (const chunk of $.process.spawn({
    argv: ["gh", "auth", "login", "--web", "--git-protocol", "https", "--hostname", "github.com"],
    cwd,
    input: "\n",
  })) {
    const code = chunk.text.match(/one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
    if (code) {
      deviceCode = code[1]!;
      $.ui.invalidate("ui.render");
    }
  }
  deviceCode = "";
  await refreshChecks($);
  await refreshStatus($);
}
