// Clodable for Claude Desktop: the Publish bar above the prompt, the Clodable panel, plain-language
// activity rows, safety guards, auto-save, and the bridge from the preview toolbar to Claude.
//
// This file is the only Claude-specific part of Clodable. Every real action goes through the
// vendor-neutral `clodable` CLI, bundled next to this plugin in cli/clodable.mjs, which prints
// NDJSON events. Any other front end can drive the same commands.
import type {
  Elements,
  EngineInterface,
  Register,
  RenderChildren,
  RenderElement,
} from "claude-code";
import { atom, read, update } from "claude-code";
import type {
  ClodableActivity,
  ClodableAssessment,
  ClodableCheck,
  ClodableDnsRecord,
  ClodableMove,
  ClodableMoveChoices,
  ClodableMoveStep,
  ClodableNotReady,
  ClodableRequest,
  ClodableStatus,
  ClodableStep,
} from "../types/index.d.ts";
import { DONE_SHOWN_MS, doneSaid, justDone, savingNow, stoppedBy } from "./activity.ts";
import {
  eventReader,
  lastResult,
  notReady,
  problemOf,
  type Result,
  type Step,
  same,
  toStatus,
  toVersion,
  type Version,
} from "./cli.ts";
import {
  dbCommandIn,
  inPrivateFolder,
  insideProject,
  isFactsRecord,
  isMoveStep,
  LEAVE_DRAFT,
  moveCommandLine,
  OUR_PUBLISH,
  PRIVATE_FOLDER,
  PRIVATE_FOLDER_DENY,
  PUSH_OR_REWRITE,
  SECRET_STEP,
  SUPABASE_READS,
  safeCommand,
} from "./guards.ts";
import {
  AI_PROVIDERS,
  type AiProvider,
  connectorSetting,
  EXPORT_CLICKS,
  MOVE_LEVELS,
  MOVE_WHO,
  type MoveMethod,
  SERVICE_KEY_QUERY,
  STEP_MARK,
  sizeOf,
  stagesOf,
  typedDomain,
} from "./move.ts";
import {
  LABEL_SCRIPT,
  labelScript,
  previewPortIn,
  previewRequest,
  previewTabIn,
} from "./preview.ts";
import {
  ago,
  describeGroup,
  describeTool,
  doneTitle,
  fixRequest,
  hostOf,
  pageName,
  plural,
  pointedAt,
  saveMessage,
  shortReason,
  sqlIsDestructive,
  sqlWrites,
  stoppedTitle,
  supabaseTool,
  versionName,
} from "./words.ts";

const PANE = "clodable";
/**
 * What the panel shows: the app (History, Publish), or the move off Lovable. Unset, the move once
 * one has started, the app otherwise. /move-off-lovable asks for the move; History, for the app.
 */
let paneView: "app" | "move" | null = null;

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
/**
 * Undo or a Restore, waiting for the builder's yes, asked in Clodable's own buttons where they
 * pressed. Desktop's question (`$.ui.ask`) showed its "working" spinner until the work was done.
 */
let confirming:
  | { kind: "undo"; title: string }
  | { kind: "restore"; sha: string; name: string }
  | null = null;
let repoChoices: Array<{ value: string; label: string }> = [];
let chosenRepo = "";
let deviceCode = "";
const requests = new Map<string, string>();
/**
 * What Claude also needs about a request Clodable sends in the builder's name (the element and its
 * code, the error, the preview's address), by the builder's words. When that request's turn
 * starts, it joins the conversation as a row Claude reads and the builder doesn't see: their
 * message stays their own.
 */
const detailsFor = new Map<string, string>();
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
let assessment: ClodableAssessment | { error: string } | null = null;
let assessing = false;
/** When the facts the assessment was read with were recorded ("" before Claude looked). */
let assessedFacts = "";
/**
 * Where the move stands (`clodable move status`), the Supabase choices for the new backend, the
 * step running now, and its last problem. Keys and tokens typed in the panel go straight to the
 * CLI's stdin: never into this state, the chat or a log.
 */
let move: ClodableMove | null = null;
let moveChoices: ClodableMoveChoices | null = null;
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
let aiChoice: AiProvider = "openrouter";
/** Going live: who may create an account. "confirm" needs emails. */
let newPeople: "confirm" | "open" | "invite" = "confirm";
/** The way chosen a moment ago, shown at once while Clodable records it. */
let choosingMethod: MoveMethod | null = null;
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

/** The panel's history: saves not live yet, then recent publishes, newest first. Null until loaded. */
let versions: { draft: Version[]; sameAsLive: boolean; published: Version[] } | null = null;
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

/** Fire-and-forget background work: never an unhandled rejection (a module can unload mid-way). */
function background(work: Promise<unknown>): void {
  work.catch(() => {});
}

// ── The CLI, from this plugin's own folder ──────────────────────────────────

function argv($: EngineInterface, args: string[]): string[] {
  return ["node", `${$.plugin.root}/cli/clodable.mjs`, ...args, "--json"];
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

/**
 * Run a long command, handing each step to `onStep` as it streams in. Then its result, if it gave
 * one, and what stopped it, if something did: each caller says that in its own words.
 */
async function streamCli(
  $: EngineInterface,
  args: string[],
  onStep: (step: Step) => unknown,
  input?: string,
): Promise<{ result?: Result; failure?: unknown }> {
  const read = eventReader();
  let result: Result | undefined;
  try {
    for await (const chunk of $.process.spawn({
      argv: argv($, args),
      cwd,
      ...(input !== undefined ? { input } : {}),
    })) {
      if (chunk.stream !== "stdout") continue;
      for (const event of read(chunk.text)) {
        if (event.type === "step") await onStep(event);
        else if (event.type === "result") result = event;
      }
    }
  } catch (failure) {
    return { ...(result ? { result } : {}), failure };
  }
  return result ? { result } : {};
}

/** Run a long command (publish, undo) and stream its steps into the activity state. */
async function flow(
  $: EngineInterface,
  args: string[],
  kind: "publishing" | "undoing",
): Promise<Result> {
  await update<ClodableActivity>($, activity, () => ({ kind, steps: [] }));
  const steps: ClodableStep[] = [];
  const { result, failure } = await streamCli($, args, async (event) => {
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
  });
  if (failure !== undefined) {
    return {
      type: "result",
      ok: false,
      error: {
        code: "unknown",
        message: "Clodable stopped unexpectedly.",
        details: String(failure),
      },
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
    : notReady(result.error);
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
  await update<ClodableActivity>($, activity, savingNow);
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
  confirming = null;
  const result = await flow($, ["publish"], "publishing");
  if (result.ok) {
    const data = result.data ?? {};
    const onLovable = data.deploy === "lovable";
    const at = Date.now();
    await update<ClodableActivity>($, activity, (x) => ({
      kind: "published",
      steps: x.steps,
      title: data.title,
      url: data.url ?? null,
      at,
      ...(onLovable ? { onLovable, lovableUrl: data.lovableUrl ?? null } : {}),
      ...(data.site ? { site: data.site } : {}),
    }));
    sayDoneUntil($, at);
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
    await update<ClodableActivity>($, activity, stoppedBy(result.error));
  }
  await refreshStatus($);
  // Moving off Lovable: a Publish moves the move on (the site is live there now).
  if (move) await loadMove($);
}

/**
 * "You're live" and "Undone" stay up for DONE_SHOWN_MS, then the bar is the usual one again, with
 * History. Nothing else redraws it then: the status refresh waits for an idle bar.
 */
function sayDoneUntil($: EngineInterface, at: number) {
  $.clock.after(DONE_SHOWN_MS, () => {
    background(update<ClodableActivity>($, activity, doneSaid(at)).then(() => refreshStatus($)));
  });
}

/** Undo the last publish asks first, in the bar and the panel. */
async function askUndo($: EngineInterface) {
  const a = await read($, activity);
  if (a.kind === "publishing" || a.kind === "undoing") return;
  const s = await read($, status);
  const title = s?.ready && s.lastPublish ? s.lastPublish.title : "your last publish";
  confirming = { kind: "undo", title };
  $.ui.invalidate("ui.render");
}

/** Restore a version asks first, on its line. */
async function askRestore($: EngineInterface, sha: string, name: string) {
  if (turnActive) {
    $.ui.toast("Claude is still working. Restore once it's done.");
    return;
  }
  const a = await read($, activity);
  if (a.kind === "publishing" || a.kind === "undoing" || a.kind === "saving") return;
  confirming = { kind: "restore", sha, name };
  $.ui.invalidate("ui.render");
}

/** The builder's answer to what was asked: nothing more is asked. */
function answered($: EngineInterface) {
  confirming = null;
  $.ui.invalidate("ui.render");
}

async function undoNow($: EngineInterface, title: string) {
  const result = await flow($, ["undo", "--yes"], "undoing");
  if (result.ok) {
    const onLovable = result.data?.deploy === "lovable";
    const at = Date.now();
    await update<ClodableActivity>($, activity, (x) => ({
      kind: "undone",
      steps: x.steps,
      title,
      url: result.data?.url ?? null,
      at,
      ...(onLovable ? { onLovable, lovableUrl: result.data?.lovableUrl ?? null } : {}),
    }));
    sayDoneUntil($, at);
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
    await update<ClodableActivity>($, activity, stoppedBy(result.error));
  }
  await refreshStatus($);
}

async function fixIt($: EngineInterface) {
  if (isFixing()) return;
  const a = await read($, activity);
  const s = await read($, status);
  const ask = a.error
    ? fixRequest(a.error)
    : s?.ready && (s.merging || s.conflicts.length > 0)
      ? fixRequest({ code: "conflict", message: "", files: s.conflicts })
      : undefined;
  if (!ask) return;
  fixing = { at: Date.now() };
  $.ui.invalidate("ui.render");
  background(askClaude($, ask.text, ask.details));
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
    moveError = problemOf(result.error, "Couldn't read the move.");
    return;
  }
  const progress: ClodableMove = result.data;
  move = progress;
  // What Claude found in the app changes what the move involves: read the assessment again.
  const factsAt = progress.facts?.at ?? "";
  if (factsAt !== assessedFacts) {
    assessedFacts = factsAt;
    background(loadAssessment($));
  }
  const next = (progress.steps ?? []).find((x) => x.state === "next" || x.state === "attention");
  // Read fresh each time: projects get paused or deleted in Supabase between two looks.
  if (next?.id === "create") {
    const choices = await cli($, ["move", "choices"]);
    if (choices.ok) {
      const offered: ClodableMoveChoices = choices.data;
      moveChoices = offered;
      const orgs = offered.organizations ?? [];
      // Free first, never a paid organization unless the builder picks it: it costs money.
      if (!orgs.some((o) => o.slug === moveOrg)) {
        moveOrg =
          (
            orgs.find((o) => o.plan === "free" && (o.freeLeft ?? 0) > 0) ??
            orgs.find((o) => o.plan === "free") ??
            orgs[0]
          )?.slug ?? "";
      }
      moveRegion ||= offered.region?.code ?? offered.regions?.[0]?.code ?? "";
    } else {
      moveError = problemOf(choices.error, "Couldn't read your Supabase account.");
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
  if ((progress.vaultLeft ?? []).length > 0) {
    const vault = await cli($, ["move", "vault"]);
    moveVault = vault.ok ? vault.data : null;
  } else moveVault = null;
  if (next && ["freeze", "final-export", "final-copy"].includes(next.id)) {
    const plan = await cli($, ["move", "pause"]);
    pausePlan = plan.ok ? plan.data : null;
  }
  if ((progress.secretsLeft ?? []).length > 0) {
    const secrets = await cli($, ["move", "secrets"]);
    moveSecrets = secrets.ok ? secrets.data : null;
  } else moveSecrets = null;
}

/** The move starts working on something: it says what, and the last problem goes. */
function startWork($: EngineInterface, title: string) {
  moveRun = { title };
  moveError = null;
  $.ui.invalidate("ui.render");
}

/** Run one step of the move, its progress drawn in the panel as it goes. */
async function moveStep($: EngineInterface, args: string[], input?: string): Promise<Result> {
  if (moveRun) return { type: "result", ok: false };
  startWork($, "Starting");
  const { result, failure } = await streamCli(
    $,
    ["move", ...args],
    (event) => {
      moveRun = { title: event.title, ...(event.detail ? { detail: event.detail } : {}) };
      $.ui.invalidate("ui.render");
    },
    input,
  );
  if (failure !== undefined) note($, `move ${args[0]}: ${String(failure)}`);
  moveRun = null;
  const done = result ?? {
    type: "result" as const,
    ok: false,
    error: { code: "unknown", message: "Clodable stopped before finishing that step." },
  };
  if (!done.ok) {
    moveError = problemOf(done.error, "That step didn't finish.");
    note($, `move ${args[0]}: ${done.error?.code} ${done.error?.details ?? ""}`.slice(0, 400));
  }
  await loadMove($);
  return done;
}

/** How Claude runs a move step: Clodable's own command line, next to this plugin. */
function moveCommand($: EngineInterface, args: string[]): string {
  return moveCommandLine($.plugin.root, args);
}

/**
 * A request Clodable sends in the builder's name: their words, and what Claude also needs (the
 * exact command, how to change the code), which reaches it beside the message, out of their sight.
 */
type Ask = { text: string; details?: string };

/** What Claude needs for a step of the move, said once for all of them. */
function stepDetails(...lines: string[]): string {
  return `From Clodable, for this step of the move: ${lines.join(" ")}`;
}

/** "Run `node …/clodable.mjs move copy`.": the step's own command, for Claude. */
function runStep($: EngineInterface, args: string[]): string {
  return `Run \`${moveCommand($, args)}\`.`;
}

/** The request that creates the new backend, in the builder's words, with the choices made. */
function createRequest(
  $: EngineInterface,
  org: { name: string } | undefined,
  choices: ClodableMoveChoices,
  slug: string,
  region: string,
): Ask {
  const where = (choices.regions ?? []).find((r) => r.code === region)?.name;
  return {
    text: `Moving off Lovable: create my new backend${org ? ` in my Supabase organization “${org.name}”` : ""}${where ? `, in ${where}` : ""}, then tell me how it went.`,
    details: stepDetails(
      runStep($, [
        "create",
        ...(slug ? ["--org", slug] : []),
        ...(region ? ["--region", region] : []),
      ]),
    ),
  };
}

/** Hand a step of the move to Claude, as the builder's own request in this conversation. */
async function pilot($: EngineInterface, ask: Ask) {
  if (isPiloting() || moveRun) return;
  piloting = { at: Date.now() };
  moveError = null;
  $.ui.invalidate("ui.render");
  if (ask.details !== undefined) detailsFor.set(ask.text, ask.details);
  background($.prompt.submit({ text: ask.text, asUser: true }));
}

/** Careful or in one go: the builder's choice, recorded directly (nothing for Claude to do). */
async function chooseMethod($: EngineInterface, method: MoveMethod) {
  if (choosingMethod) return;
  choosingMethod = method;
  moveError = null;
  $.ui.invalidate("ui.render");
  const result = await cli($, ["move", "method", method]);
  if (!result.ok) {
    moveError = problemOf(result.error, "That didn't work.");
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
  startWork($, "Looking for your sign-in");
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
    const connecting: Record<string, string> = {
      connect: "Connecting to Supabase",
      netlify: "Connecting to Netlify",
      resend: "Connecting to Resend",
    };
    startWork($, connecting[args[0]!] ?? "Saving it");
    const result = await cli($, ["move", ...args], 60_000, text);
    moveRun = null;
    if (!result.ok) moveError = problemOf(result.error, "That didn't work.");
    await loadMove($);
    return;
  }
  await moveStep($, args, text);
}

async function openPane($: EngineInterface, view: "app" | "move" | null = "app") {
  paneView = view;
  $.ui.invalidate("ui.render");
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
  if (moving) startWork($, "Saving it");
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
    const next = {
      draft: (result.data?.draft ?? []).map(toVersion),
      sameAsLive: result.data?.sameAsLive === true,
      published: (result.data?.published ?? []).map(toVersion),
    };
    if (same(versions, next)) return;
    versions = next;
    $.ui.invalidate("ui.render");
  } finally {
    loadingVersions = false;
  }
}

/** Bring back an earlier version as a new save. Nothing is erased, and nothing goes live. */
async function restoreNow($: EngineInterface, sha: string) {
  if (turnActive) {
    $.ui.toast("Claude is still working. Restore once it's done.");
    return;
  }
  const a = await read($, activity);
  if (a.kind === "publishing" || a.kind === "undoing" || a.kind === "saving") return;
  await update<ClodableActivity>($, activity, savingNow);
  const result = await cli($, ["restore", sha]);
  await update<ClodableActivity>($, activity, (x) =>
    x.kind === "saving" ? { kind: "idle", steps: [] } : x,
  );
  $.ui.toast(
    !result.ok
      ? (result.error?.message ?? "That version couldn't be restored.")
      : result.data?.saved === false
        ? "Your app already looks like this version. Nothing changed."
        : "Restored. Publish when you're happy with it.",
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

function askForPreview($: EngineInterface) {
  markActive($);
  background(askClaude($, "Show me my app's preview.", previewRequest(previewUrl)));
}

/** A request in the builder's words, with what Claude also needs beside it, out of their sight. */
async function askClaude($: EngineInterface, text: string, details: string) {
  detailsFor.set(text, details);
  background($.prompt.submit({ text, asUser: true }));
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
    pilot($, {
      text: "Moving off Lovable: I've finished in Lovable. Show me my app's preview, then tell me in a few lines how I change my app from now on.",
      details: stepDetails(previewRequest(previewUrl)),
    }),
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

/**
 * Clodable's slash commands, each on its own: a name that's taken must not stop the others. Our
 * skills' names are taken too (Claude Code refuses `/x` when a skill is `x`): the build checks.
 */
async function registerCommands($: EngineInterface) {
  for (const command of [
    { name: "clodable", description: "Open Clodable: your draft, your live site, setup" },
    { name: "publish", description: "Put your draft live (checks first)" },
    { name: "undo-publish", description: "Put the previous version live again" },
    { name: "move-off-lovable", description: "Move your app off Lovable, step by step" },
  ]) {
    try {
      await $.command.register({ ...command, immediate: true });
    } catch (error) {
      $.ui.log(`Clodable couldn't add /${command.name}: ${String(error)}`, { to: "debug" });
    }
  }
}

/** Before Claude changes the live database: what it means, beside the request to allow it. */
function liveDataNotice($: EngineInterface, toolUseId: string | undefined, sql: string) {
  if (!toolUseId) return;
  $.ui.notice(
    toolUseId,
    sqlIsDestructive(sql)
      ? "This changes your live database and can't be undone."
      : "This changes your live database right away. Your site keeps working.",
  );
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
    const items: ClodableRequest[] = claimed.ok && Array.isArray(claimed.data) ? claimed.data : [];
    for (const item of items) handleRequest($, item);
  } finally {
    polling = false;
  }
}

/** One request from the preview, now this conversation's to handle. */
function handleRequest($: EngineInterface, item: ClodableRequest) {
  if (item.kind === "fix") {
    const where = item.error?.source
      ? ` (around ${item.error.source.file}:${item.error.source.line})`
      : "";
    const consoleLines =
      Array.isArray(item.console) && item.console.length
        ? `\nRecent console errors:\n${item.console.slice(-4).join("\n")}`
        : "";
    background(
      askClaude(
        $,
        `Fix ${pageName(item.page?.path)}: it's broken in the preview.`,
        `From the preview's Try to fix: the page ${item.page?.path ?? ""} is broken${where}.\nError: ${item.error?.message ?? "unknown"}${item.error?.stack ? `\n${String(item.error.stack).slice(0, 1500)}` : ""}${consoleLines}\nFix it, then check the page in the preview.`,
      ),
    );
  } else if (item.kind === "ask") {
    const where = item.source ? ` (${item.source.file}:${item.source.line})` : "";
    background(
      askClaude(
        $,
        `About ${pointedAt(item.element)}: ${item.request}`,
        `From the preview's Point & ask: the builder pointed at ${item.element ?? "an element"}${where} on ${item.page?.path ?? "the page"}. Their request is their message.`,
      ),
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
    await openPane($, null);
    return {};
  });

  on("command.run", { command: "move-off-lovable" }, async ($) => {
    await openPane($, "move");
    return {};
  });

  on("command.run", { command: "publish" }, async ($) => {
    await openPane($);
    if (await isApp()) background(publishNow($));
    return {};
  });

  on("command.run", { command: "undo-publish" }, async ($) => {
    if (await isApp()) await askUndo($);
    else await openPane($);
    return {};
  });

  // Remember what each turn was asked, so its save gets a meaningful name.
  on("turn.start", async ($, e, next) => {
    requests.set(e.turnId, e.text);
    // A request Clodable sent in the builder's name: its details, for Claude only.
    const details = detailsFor.get(e.text);
    if (details !== undefined) {
      detailsFor.delete(e.text);
      await $.session
        .append({ message: { type: "user", content: [{ type: "text", text: details }] } })
        .catch(() => {});
    }
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
  on("tool.call", { tool: "Read" }, async (_$, e, next) =>
    inPrivateFolder(e) ? { deny: PRIVATE_FOLDER_DENY } : next(e),
  );
  on("tool.call", { tool: "Edit" }, async (_$, e, next) =>
    inPrivateFolder(e) ? { deny: PRIVATE_FOLDER_DENY } : next(e),
  );
  on("tool.call", { tool: "Write" }, async (_$, e, next) =>
    inPrivateFolder(e) ? { deny: PRIVATE_FOLDER_DENY } : next(e),
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
      (isMoveStep($.plugin.root, String(input.command ?? "").trim()) ||
        isFactsRecord($.plugin.root, String(input.command ?? "").trim()))
    )
      return { ...verdict, decision: "allow" };
    // The app's database through Clodable: reading is quiet, every change is the builder's to allow.
    const db = e.tool === "Bash" ? dbCommandIn(String(input.command ?? "").trim()) : undefined;
    if ((db?.action === "query" && db.single) || db?.action === "check")
      return { ...verdict, decision: "allow" };
    if (db && db.action !== "query") {
      const sql = db.action === "apply" ? await $.fs.read(db.arg).catch(() => "") : db.arg;
      liveDataNotice($, e.tool_use_id, sql);
      return { ...verdict, decision: "ask" };
    }
    const tool = supabaseTool(e.tool);
    if (tool) {
      if (
        tool === "apply_migration" ||
        (tool === "execute_sql" && sqlWrites(String(input.query ?? input.sql ?? "")))
      ) {
        const sql = String(input.query ?? input.sql ?? "");
        liveDataNotice($, e.tool_use_id, sql);
        return { ...verdict, decision: "ask" };
      }
      if (SUPABASE_READS.has(tool) || tool === "execute_sql")
        return { ...verdict, decision: "allow" };
      return verdict;
    }
    if (verdict.decision !== "ask") return verdict;
    if (["Edit", "Write", "MultiEdit"].includes(e.tool) && insideProject(input.file_path, cwd))
      return { ...verdict, decision: "allow" };
    if (["Read", "Glob", "Grep", "LS", "TodoWrite"].includes(e.tool))
      return { ...verdict, decision: "allow" };
    if (e.tool === "Bash" && safeCommand(String(input.command ?? "").trim()))
      return { ...verdict, decision: "allow" };
    return verdict;
  }).catch(() => ({ decision: "ask" as const }));

  // ── The bar above the prompt ─────────────────────────────────────────────
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const s = await read($, status);
    const invite = s !== null && !s.ready && s.reason === "not-a-repo" && emptyFolder;
    if (inApp !== true && !invite) return next(e);
    const desktop = e.surface === "desktop";
    if (desktop && inApp === true && !previewAsked) background(startPreview($));
    const { Box, Text, Button, Link } = $.ui.resolve(e);
    const ui: BarUi = { Box, Text, Button: heldButton(Button), Link };
    const a = await read($, activity);
    const now = Date.now();
    // The logo on Desktop. In the terminal the status dot alone says enough.
    const mark = desktop
      ? $.ui.resolve(e).Svg({ source: LOGO, alt: "Clodable", width: 16, height: 16 })
      : null;
    const theirs = await next(e);
    const { left, right = [] } = barSides($, ui, s, a, now, desktop);
    return (
      <Box flexDirection="column">
        <Box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          columnGap={2}
          width="100%"
        >
          <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={1} minWidth={0}>
            {mark}
            {left}
          </Box>
          <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>
            {right}
          </Box>
        </Box>
        {theirs}
      </Box>
    );
  });

  // ── The Clodable panel ──────────────────────────────────────────────────
  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const table = $.ui.resolve(e);
    const ui: PaneUi = {
      Box: table.Box,
      Text: table.Text,
      Button: heldButton(table.Button),
      Link: table.Link,
      Code: table.Code,
      ...("Select" in table ? { Select: table.Select } : {}),
      ...("Input" in table ? { Input: table.Input } : {}),
    };
    const { Box, Text, Link } = ui;
    const s = await read($, status);
    const a = await read($, activity);
    const doctor = await read($, checks);
    const now = Date.now();
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
      return setupPane($, ui, header, s, doctor);
    }

    if (versions === null) background(refreshVersions($));
    const desktop = e.surface === "desktop";

    const view = paneView ?? (s.movingOffLovable || s.finishingMove ? "move" : "app");
    if (view === "move") return movePane($, ui, header, s, now);

    if (appSettingsStatus === null && !settingsAsked) {
      settingsAsked = true;
      background(loadSettings($));
    }
    const url = s.lastPublish?.url ?? s.liveUrl;
    return (
      <Box flexDirection="column" rowGap={2} paddingX={2} paddingY={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          {header}
          {url ? siteLink(ui, url) : null}
        </Box>
        {appQuestions($, ui, s)}
        {movedOffCard($, ui, s, desktop)}
        {databaseCard($, ui, s)}
        {settingsCard($, ui, s)}
        {stateCard($, ui, s, a, now, desktop)}
        {lovableHostingCard(ui, s)}
        {moveLine($, ui, s)}
        {historySection($, ui, desktop, now)}
        {warningsSection($, ui, doctor)}
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
          {current ? null : confirming?.kind === "restore" && confirming.sha === save.sha ? (
            restoreQuestion($, { Box, Text, Button }, save.sha, confirming.name)
          ) : (
            <Button
              key={`restore-${save.sha}`}
              plain
              onPress={() => background(askRestore($, save.sha, save.subject))}
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

// ── The bar's pieces (top level, so they can use $) ─────────────────────────

/** What the bar draws with: the surface's own pieces, its buttons held across redraws. */
type BarUi = Pick<PaneUi, "Box" | "Text" | "Button" | "Link">;

/** The bar's two sides: what's true now on the left; what you can do on the right, the main action last. */
type BarSides = { left: RenderChildren[]; right?: RenderChildren[] };

/** What the bar says now, from the activity first (it's what just happened), then the status. */
function barSides(
  $: EngineInterface,
  ui: BarUi,
  s: ClodableStatus | ClodableNotReady | null,
  a: ClodableActivity,
  now: number,
  desktop: boolean,
): BarSides {
  const { Box, Text, Button, Link } = ui;
  // In the terminal, where there's no logo, a colored dot carries the state.
  const dot = (color: string) => (desktop ? null : <Text color={color}>●</Text>);
  const history = (
    <Button key="history" variant="secondary" onPress={() => background(openPane($))}>
      History
    </Button>
  );
  const preview = previewButton($, ui, desktop);
  const busy = a.kind === "publishing" || a.kind === "undoing";

  if (confirming?.kind === "undo" && !busy) {
    return {
      left: [
        <Box flexShrink={0}>
          <Text bold>Undo “{confirming.title}”?</Text>
        </Box>,
        <Text dimColor wrap="truncate-end">
          {UNDO_MEANS}
        </Text>,
      ],
      right: undoAnswers($, ui),
    };
  }
  if (busy) {
    const running = [...a.steps].reverse().find((x) => x.state === "running");
    const last = a.steps[a.steps.length - 1];
    return {
      left: [
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
      right: [
        <Button key="progress" variant="secondary" onPress={() => background(openPane($))}>
          See progress
        </Button>,
      ],
    };
  }
  if (justDone(a, now)) {
    const undo =
      a.kind === "published"
        ? [
            <Button key="undo" variant="secondary" onPress={() => background(askUndo($))}>
              Undo
            </Button>,
          ]
        : [];
    if (!a.onLovable) {
      return {
        left: [
          dot("success"),
          <Text color="success" bold>
            {doneTitle(a.kind, false)}
          </Text>,
          a.url ? siteLink(ui, a.url) : null,
        ],
        right: undo,
      };
    }
    return {
      left: [
        dot("success"),
        <Text color="success" bold>
          {doneTitle(a.kind, true)}
        </Text>,
        a.site ? (
          a.site.state === "failed" ? (
            <Link href={a.site.logUrl ?? a.site.url} label="Netlify site didn't update ↗" />
          ) : (
            <Link href={a.site.url} label="Netlify site ↗" />
          )
        ) : null,
        <Link
          href={a.lovableUrl ?? "https://lovable.dev/projects"}
          label="Put it live in Lovable ↗"
        />,
      ],
      right: undo,
    };
  }
  if (a.kind === "failed" && a.error) {
    return {
      left: [
        <Box flexShrink={0}>
          <Text color={a.error.code === "conflict" ? "warning" : "error"} bold>
            {stoppedTitle(a.error.code)}
          </Text>
        </Box>,
        <Text wrap="truncate-end">{shortReason(a.error)}</Text>,
      ],
      right: [
        <Button key="why" variant="secondary" onPress={() => background(openPane($))}>
          See why
        </Button>,
        fixButton($, ui, "fix", a.error.code === "conflict"),
      ],
    };
  }
  if (a.kind === "saving")
    return { left: [<Text dimColor>Saving…</Text>], right: [history, preview] };
  if (!s) return { left: [<Text dimColor>Clodable is getting ready…</Text>] };
  if (!s.ready) {
    return {
      left: [
        <Text>
          {s.reason === "not-a-repo"
            ? "Bring your app into this folder to save and publish"
            : s.message}
        </Text>,
      ],
      right: [
        <Button key="setup" variant="primary" onPress={() => background(openPane($))}>
          Set up
        </Button>,
      ],
    };
  }
  if (s.merging || s.conflicts.length > 0) {
    return {
      left: [
        <Box flexShrink={0}>
          <Text color="warning" bold>
            Not published
          </Text>
        </Box>,
        <Text wrap="truncate-end">{shortReason({ code: "conflict", message: "" })}</Text>,
      ],
      right: [fixButton($, ui, "combine", true)],
    };
  }
  if (s.unpublished.length > 0) {
    return {
      left: [
        dot("warning"),
        <Text>
          <Text bold>{plural(s.unpublished.length, "change")}</Text> not live yet
        </Text>,
      ],
      right: [
        history,
        preview,
        <Button key="publish" variant="primary" onPress={() => background(publishNow($))}>
          Publish
        </Button>,
      ],
    };
  }
  const url = s.lastPublish?.url ?? s.liveUrl;
  return {
    left: [
      dot("success"),
      // Lovable's hosting only shows what was last published in Lovable: say what's certain.
      <Text>{s.hosting === "lovable" ? "Everything is published" : "Everything is live"}</Text>,
      url ? siteLink(ui, url) : null,
    ],
    right: [history, preview],
  };
}

// ── The panel's pieces (top level, so they can use $) ──────────────────────────

/**
 * What the panel draws with: every surface's Box, Text, Button (held, see heldButton), Link and
 * Code, with Input and Select where the surface has them.
 */
type PaneUi = Pick<Elements["terminal"], "Box" | "Text" | "Button" | "Link" | "Code"> &
  Partial<Pick<Elements["terminal"], "Input" | "Select">>;

/** A section's title in the panel. */
function section(ui: PaneUi, title: string) {
  const { Text } = ui;
  return <Text bold>{title}</Text>;
}

/** The app's state in one card: what's true now, and the next thing to do. */
function card(
  ui: PaneUi,
  title: RenderChildren,
  subtitle: RenderChildren,
  actions: RenderChildren[] = [],
  below: RenderChildren = null,
) {
  const { Box } = ui;
  return (
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
          {title}
          {subtitle}
        </Box>
        <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>
          {actions}
        </Box>
      </Box>
      {below}
    </Box>
  );
}

/** One step of a publish or an undo, as it went. */
function stepLine(ui: PaneUi, step: ClodableStep) {
  const { Text } = ui;
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
}

/** Somewhere to paste a value (a token, a key, a setting): it goes to `use`, never the chat. */
function field(
  ui: PaneUi,
  key: string,
  placeholder: string,
  submit: string,
  use: (v: string) => void,
) {
  const { Text, Input } = ui;
  return Input ? (
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
}

/** A value to copy elsewhere (a DNS record, an address), shortened when it's long. */
function copyable($: EngineInterface, ui: PaneUi, key: string, label: string, text: string) {
  const { Box, Text, Button } = ui;
  return (
    <Box key={key} flexDirection="row" columnGap={1} alignItems="center">
      <Text dimColor>{label}</Text>
      <Text>{text.length > 60 ? `${text.slice(0, 56)}…` : text}</Text>
      <Button key={`${key}-copy`} plain onPress={() => $.ui.copy({ text })}>
        Copy
      </Button>
    </Box>
  );
}

/** SQL for the builder to run in Lovable, with its Copy button. */
function sqlBlock($: EngineInterface, ui: PaneUi, key: string, sql: string) {
  const { Box, Button, Code } = ui;
  return (
    <Box flexDirection="row" columnGap={1} alignItems="center">
      <Code source={sql} language="sql" />
      <Button key={`${key}-copy`} plain onPress={() => $.ui.copy({ text: sql })}>
        Copy
      </Button>
    </Box>
  );
}

/** Not set up yet: a guided, self-serve setup, tools first, then the app. */
function setupPane(
  $: EngineInterface,
  ui: PaneUi,
  header: RenderElement,
  s: ClodableNotReady | null,
  doctor: ClodableCheck[],
) {
  const { Box, Text, Button, Link, Select, Input } = ui;
  const tools = doctor.filter((c) => ["node", "git", "gh", "github"].includes(c.id));
  const blocking = tools.filter((c) => c.status === "fail");
  const github = doctor.find((c) => c.id === "github");
  return (
    <Box flexDirection="column" rowGap={1} paddingX={1}>
      {header}
      <Text>Let's bring your app home. It takes a minute, once.</Text>
      {section(ui, "1 · Tools")}
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
              <Link href="https://github.com/login/device" label="Open github.com/login/device" />
              <Button key="copy-code" plain onPress={() => $.ui.copy({ text: deviceCode })}>
                Copy the code
              </Button>
            </Box>
          ) : null}
        </Box>
      ) : null}
      {section(ui, "2 · Your app")}
      {blocking.length > 0 ? (
        <Text dimColor>Once the tools above are ready, pick your app here.</Text>
      ) : s?.reason === "no-kit" ? (
        <Box flexDirection="column" rowGap={1}>
          <Text>This folder already holds an app. Clodable can set itself up right here.</Text>
          {settingUp ? (
            <Text dimColor>Setting up Clodable… it takes about a minute.</Text>
          ) : (
            <Button key="set-up-here" variant="primary" onPress={() => background(setUpHere($))}>
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

/** The app's state in one card: what's true now, and the next thing to do. */
function stateCard(
  $: EngineInterface,
  ui: PaneUi,
  s: ClodableStatus,
  a: ClodableActivity,
  now: number,
  desktop: boolean,
): RenderElement {
  const { Box, Text, Button, Link, Code } = ui;
  const steps = <Box flexDirection="column">{a.steps.map((step) => stepLine(ui, step))}</Box>;
  if (confirming?.kind === "undo" && a.kind !== "publishing" && a.kind !== "undoing") {
    return card(
      ui,
      <Text bold>Undo “{confirming.title}”?</Text>,
      <Text dimColor>{UNDO_MEANS}</Text>,
      undoAnswers($, ui),
    );
  }
  if (a.kind === "publishing" || a.kind === "undoing") {
    return card(
      ui,
      <Text bold>{a.kind === "publishing" ? "Publishing…" : "Undoing…"}</Text>,
      <Text dimColor>Your live site keeps working meanwhile.</Text>,
      [],
      steps,
    );
  }
  if (a.kind === "failed" && a.error) {
    const error = a.error;
    return card(
      ui,
      <Text color="error" bold>
        {stoppedTitle(error.code)}
      </Text>,
      <Text>{error.message}</Text>,
      [
        error.details ? (
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
        fixButton($, ui, "fix", error.code === "conflict"),
      ],
      <Box flexDirection="column" rowGap={1}>
        {error.hint ? <Text dimColor>{error.hint}</Text> : null}
        {a.steps.length > 0 ? steps : null}
        {showDetails && error.details ? (
          <Code source={error.details.slice(0, 6000)} wrap="wrap" />
        ) : null}
      </Box>,
    );
  }
  if (justDone(a, now)) {
    return card(
      ui,
      <Text color="success" bold>
        {doneTitle(a.kind, Boolean(a.onLovable))}
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
        siteLink(ui, a.url)
      ) : null,
      a.kind === "published"
        ? [
            <Button key="undo" variant="secondary" onPress={() => background(askUndo($))}>
              Undo
            </Button>,
          ]
        : [],
    );
  }
  if (s.merging || s.conflicts.length > 0) {
    return card(
      ui,
      <Text color="warning" bold>
        Your draft and the live site changed the same thing
      </Text>,
      <Text dimColor>Claude can combine them and keep both changes.</Text>,
      [fixButton($, ui, "combine", true)],
    );
  }
  if (s.unpublished.length > 0) {
    return card(
      ui,
      <Text bold>{plural(s.unpublished.length, "change")} not live yet</Text>,
      <Text dimColor>
        {s.lastPublish
          ? `Visitors still see the version you published ${ago(s.lastPublish.at, now)}.`
          : "Visitors see them once you publish."}
      </Text>,
      [
        previewButton($, ui, desktop),
        <Button key="publish" variant="primary" onPress={() => background(publishNow($))}>
          Publish
        </Button>,
      ],
    );
  }
  return card(
    ui,
    <Text bold>Everything is live</Text>,
    <Text dimColor>
      {s.lastPublish
        ? `Published ${ago(s.lastPublish.at, now)}: “${s.lastPublish.title}”`
        : "Ask Claude for a change. It's saved here automatically."}
    </Text>,
    s.lastPublish
      ? [
          <Button key="undo" variant="secondary" onPress={() => background(askUndo($))}>
            Undo last publish
          </Button>,
        ]
      : [],
  );
}

/** "Fix it", or while Claude works on it, a quiet note in its place, so nothing is asked twice. */
function fixButton(
  $: EngineInterface,
  ui: Pick<PaneUi, "Text" | "Button">,
  key: string,
  conflict: boolean,
) {
  const { Text, Button } = ui;
  // A button that can't be used isn't drawn: Desktop's buttons can't be disabled.
  if (isFixing()) {
    return <Text dimColor>{conflict ? "Claude is combining…" : "Claude is fixing…"}</Text>;
  }
  return (
    <Button key={key} variant="primary" onPress={() => background(fixIt($))}>
      {conflict ? "Let Claude combine them" : "Fix it"}
    </Button>
  );
}

/** The preview, once there is one. On Desktop, in its own Browser pane: a link opens a window. */
function previewButton($: EngineInterface, ui: Pick<PaneUi, "Button" | "Link">, desktop: boolean) {
  const { Button, Link } = ui;
  if (!previewUrl) return null;
  return desktop ? (
    <Button key="preview" variant="secondary" onPress={() => askForPreview($)}>
      Preview
    </Button>
  ) : (
    <Link key="preview" href={previewUrl} label="Preview ↗" />
  );
}

/** The live site, by its address. */
function siteLink(ui: Pick<PaneUi, "Link">, url: string) {
  const { Link } = ui;
  return <Link href={url} label={`${hostOf(url)} ↗`} />;
}

/** Just moved off Lovable: from here, the app changes in this conversation. Until the next Publish. */
function movedOffCard($: EngineInterface, ui: PaneUi, s: ClodableStatus, desktop: boolean) {
  const { Box, Text, Button } = ui;
  if (!s.movedAt || (s.lastPublish && s.lastPublish.at > s.movedAt)) return null;
  const url = s.lastPublish?.url ?? s.liveUrl;
  return card(
    ui,
    <Text bold>Your app is off Lovable</Text>,
    <Box flexDirection="column" rowGap={1}>
      <Text dimColor>
        You change it here now: describe a change in the conversation and watch it in the preview.
        Publish puts it live{url ? ` at ${hostOf(url)}` : ""}.
      </Text>
      <Text dimColor>
        Backups: Supabase's Pro plan keeps a copy of your data for each of the last 7 days; the free
        plan doesn't.
      </Text>
    </Box>,
    desktop && previewUrl
      ? [
          <Button key="moved-preview" variant="secondary" onPress={() => askForPreview($)}>
            Show the preview
          </Button>,
        ]
      : [],
  );
}

/** On its own Supabase, with no connection here yet: Claude can't change the database. */
function databaseCard($: EngineInterface, ui: PaneUi, s: ClodableStatus) {
  const { Box, Text, Link, Input } = ui;
  if (s.backend !== "supabase" || s.databaseConnected !== false) return null;
  return card(
    ui,
    <Text bold>Let Claude change your database</Text>,
    <Box flexDirection="column" rowGap={1}>
      <Text dimColor>
        Connect your Supabase account once: Claude can then add tables and change data, as on
        Lovable, asking you before each change. The token stays on this computer.
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
  );
}

/** The settings the app's server code reads, missing on this computer or on the site. */
function settingsCard($: EngineInterface, ui: PaneUi, s: ClodableStatus) {
  const { Text } = ui;
  const fields = settingsFields($, ui, "app-setting", s.backend === "lovable-cloud");
  return fields ? card(ui, <Text bold>Your app's settings</Text>, fields) : null;
}

/**
 * Where the data and the live site are, asked in the app's view only for an app made with Lovable:
 * there they decide what Clodable can do (change the database, the last click after Publish).
 */
function appQuestions($: EngineInterface, ui: PaneUi, s: ClodableStatus) {
  const { Box, Text } = ui;
  if (!s.madeWithLovable) return null;
  const questions = whereQuestions($, ui, s);
  if (questions.length === 0) return null;
  return (
    <Box flexDirection="column" rowGap={2}>
      <Text bold>{questions.length === 2 ? "Two quick questions" : "One quick question"}</Text>
      {questions}
    </Box>
  );
}

/** On Lovable Cloud: one quiet line to the move, never more until the builder asks. */
function moveLine($: EngineInterface, ui: PaneUi, s: ClodableStatus) {
  const { Box, Text, Button } = ui;
  if (s.backend !== "lovable-cloud" && !s.movingOffLovable) return null;
  return (
    <Box flexDirection="row" columnGap={2} alignItems="center">
      <Text dimColor>Your data is on Lovable Cloud.</Text>
      <Button
        key="open-move"
        plain
        onPress={() => {
          paneView = "move";
          $.ui.invalidate("ui.render");
        }}
      >
        {s.movingOffLovable ? "Continue moving off Lovable" : "Move off Lovable"}
      </Button>
    </Box>
  );
}

/** On Lovable's hosting only: where the last click is. */
function lovableHostingCard(ui: PaneUi, s: ClodableStatus) {
  const { Text } = ui;
  if (s.hosting !== "lovable") return null;
  return card(
    ui,
    <Text bold>Your site goes live from Lovable</Text>,
    <Text dimColor>After Publish here, click Publish, then Publish changes, in Lovable.</Text>,
  );
}

/** Every version, newest first: what's not live yet, then what was published. */
function historySection($: EngineInterface, ui: PaneUi, desktop: boolean, now: number) {
  const { Box, Text } = ui;
  const draftRows = (versions?.draft ?? []).slice(0, 10);
  const publishedRows = (versions?.published ?? []).slice(0, Math.max(3, 12 - draftRows.length));
  const older =
    (versions?.draft.length ?? 0) -
    draftRows.length +
    (versions?.published.length ?? 0) -
    publishedRows.length;
  return (
    <Box flexDirection="column">
      {section(ui, "History")}
      {versions === null ? (
        <Text dimColor>Loading…</Text>
      ) : draftRows.length + publishedRows.length === 0 ? (
        <Text dimColor>No versions yet.</Text>
      ) : (
        <Box flexDirection="column">
          {draftRows.length > 0 ? (
            // Saves that cancel out aren't waiting: the live site already looks like this.
            <Text dimColor>{versions.sameAsLive ? "Since your last publish" : "Not live yet"}</Text>
          ) : null}
          {draftRows.map((v) => versionRow($, ui, v, desktop, now))}
          {publishedRows.length > 0 ? <Text dimColor>Published</Text> : null}
          {publishedRows.map((v) => versionRow($, ui, v, desktop, now))}
          {older > 0 ? <Text dimColor>and {plural(older, "older version")}</Text> : null}
        </Box>
      )}
    </Box>
  );
}

/** What `clodable doctor` found worth a look, each with its fix. */
function warningsSection($: EngineInterface, ui: PaneUi, doctor: ClodableCheck[]) {
  const { Box, Text, Button } = ui;
  const warnings = doctor.filter((c) => c.status === "warn" || c.status === "fail");
  if (warnings.length === 0) return null;
  return (
    <Box flexDirection="column">
      {section(ui, "Worth a look")}
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
                      pilot($, {
                        text: "Switch my app's AI features off Lovable's AI to an AI provider of my own (OpenRouter, Google Gemini or OpenAI), and tell me where to create the key.",
                        details:
                          "From Clodable: keep the provider's address and model in the code, and read the key from a setting named AI_API_KEY, which the builder pastes in the Clodable panel.",
                      }),
                    )
                  }
                >
                  Switch it
                </Button>
              )}
            </Box>
          ) : c.fix && /`[^`]+`/.test(c.fix) ? (
            // A command is Claude's to run: the builder gets the button, Claude gets the command.
            <Box flexDirection="row">
              <Button
                key={`worth-fix-${c.id}`}
                plain
                onPress={() =>
                  background(
                    askClaude(
                      $,
                      `Fix “${c.label}”, as Clodable's check suggests.`,
                      `Clodable's check “${c.label}” (${c.id}) found: ${c.detail ?? "a problem"}. Its fix: ${c.fix}. Do it if it's safe here; if it needs the builder, say what to do in plain words, with no commands.`,
                    ),
                  )
                }
              >
                Let Claude fix it
              </Button>
            </Box>
          ) : c.fix ? (
            <Text dimColor> {c.fix}</Text>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

/**
 * One line of history. The newest saved version is what the files hold now ("Current"); the
 * newest publish is what visitors see ("Live"). Restore shows on the line under the pointer.
 */
function versionRow($: EngineInterface, ui: PaneUi, v: Version, desktop: boolean, now: number) {
  const { Box, Text, Button } = ui;
  const current = v.sha === (versions?.draft[0]?.sha ?? versions?.published[0]?.sha);
  const live = v.sha === versions?.published[0]?.sha;
  const name = versionName(v.subject);
  const restore = (
    <Button
      key={`restore-${v.sha}`}
      {...(desktop ? { variant: "secondary" as const } : { plain: true as const })}
      onPress={() => background(askRestore($, v.sha, name))}
    >
      Restore
    </Button>
  );
  if (confirming?.kind === "restore" && confirming.sha === v.sha) {
    return (
      <Box key={`version-${v.sha}`} flexDirection="column" rowGap={1} paddingX={1}>
        <Text bold>{name}</Text>
        {restoreQuestion($, ui, v.sha, name)}
      </Box>
    );
  }
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
        <Text wrap="truncate-end">{name}</Text>
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
}

/** What Undo does, said before the builder says yes. */
const UNDO_MEANS =
  "The previous version goes live again. Changes to your database stay as they are.";

/** Undo's answers, wherever it's asked: keep the version live, or put the previous one back. */
function undoAnswers($: EngineInterface, ui: Pick<PaneUi, "Button">) {
  const { Button } = ui;
  const title = confirming?.kind === "undo" ? confirming.title : "your last publish";
  return [
    <Button key="undo-keep" variant="secondary" onPress={() => answered($)}>
      Keep it live
    </Button>,
    <Button
      key="undo-confirm"
      variant="primary"
      onPress={() => {
        answered($);
        background(undoNow($, title));
      }}
    >
      Undo it
    </Button>,
  ];
}

/** "Go back to …?", asked where Restore was pressed: on a version's line, or under a reply. */
function restoreQuestion(
  $: EngineInterface,
  ui: Pick<PaneUi, "Box" | "Text" | "Button">,
  sha: string,
  name: string,
) {
  const { Box, Text, Button } = ui;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Go back to “{name}”? Your current version stays in the history, so you can come back to it.
        Your live site and your data don't change.
      </Text>
      <Box flexDirection="row" columnGap={1} alignItems="center">
        <Button key={`restore-cancel-${sha}`} variant="secondary" onPress={() => answered($)}>
          Cancel
        </Button>
        <Button
          key={`restore-confirm-${sha}`}
          variant="primary"
          onPress={() => {
            answered($);
            background(restoreNow($, sha));
          }}
        >
          Restore
        </Button>
      </Box>
    </Box>
  );
}

/** Two questions, asked once: where the data and the live site are decide what Clodable can do. */
function whereQuestions($: EngineInterface, ui: PaneUi, s: ClodableStatus): RenderElement[] {
  const questions: RenderElement[] = [];
  if (s.backend === "unknown") {
    questions.push(
      whereQuestion(
        $,
        ui,
        "backend",
        "Where does your app's data live?",
        [
          ["lovable-cloud", "On Lovable Cloud"],
          ["supabase", "In my own Supabase"],
          ["none", "No database"],
        ],
        "Not sure? If your project in Lovable has Cloud (Database, Users…), it's Lovable Cloud.",
      ),
    );
  }
  if (s.hosting === "unknown") {
    questions.push(
      whereQuestion(
        $,
        ui,
        "hosting",
        "Where is your site live?",
        [
          ["lovable", "On Lovable"],
          ["github", "Elsewhere (Netlify, Vercel…)"],
        ],
        "If you click Publish in Lovable to update your site, it's on Lovable.",
      ),
    );
  }
  return questions;
}

function whereQuestion(
  $: EngineInterface,
  ui: PaneUi,
  key: "backend" | "hosting",
  title: string,
  choices: Array<[value: string, label: string]>,
  hint: string,
) {
  const { Box, Text, Button } = ui;
  return (
    <Box key={`question-${key}`} flexDirection="column" rowGap={1}>
      <Text>{title}</Text>
      <Box flexDirection="row" columnGap={1} rowGap={1} flexWrap="wrap">
        {choices.map(([value, label]) => (
          <Button
            key={`${key}-${value}`}
            variant="secondary"
            onPress={() => background(setWhere($, key, value))}
          >
            {label}
          </Button>
        ))}
      </Box>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}

// ── The move off Lovable (top level, so they can use $) ─────────────────────

/** The move off Lovable and the questions it needs, with the way back to the app. */
function movePane(
  $: EngineInterface,
  ui: PaneUi,
  header: RenderElement,
  s: ClodableStatus,
  now: number,
) {
  const { Box, Text, Button } = ui;
  // Live on the new backend already, until the builder is done in Lovable: still the move.
  const moving = s.backend === "lovable-cloud" || s.finishingMove;
  if (s.backend === "lovable-cloud" && !assessment && !assessing) background(loadAssessment($));
  if (moving && !move && !loadingMove && !moveError) background(loadMove($));
  const questions = whereQuestions($, ui, s);
  // Known not to be on Lovable Cloud: nothing to move.
  const elsewhere = !moving && s.backend !== "unknown";
  return (
    <Box flexDirection="column" rowGap={2} paddingX={2} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        {header}
        <Button
          key="back-to-app"
          plain
          onPress={() => {
            paneView = "app";
            $.ui.invalidate("ui.render");
          }}
        >
          Back to your app
        </Button>
      </Box>
      <Box flexDirection="column" rowGap={1}>
        <Text bold>Move off Lovable</Text>
        <Text dimColor>
          {s.movedAt && elsewhere
            ? "Your app is off Lovable: it runs on your own Supabase and Netlify, and each Publish updates it."
            : elsewhere
              ? "Moving off Lovable is for apps whose data is on Lovable Cloud. Yours isn't: there's nothing to move."
              : "Your data, your people and your backend come to your own Supabase, step by step. Your live app keeps running on Lovable until you switch."}
        </Text>
      </Box>
      {questions.length > 0 ? (
        <Box flexDirection="column" rowGap={2}>
          <Text bold>
            {questions.length === 2 ? "First, two quick questions" : "One quick question"}
          </Text>
          {questions}
        </Box>
      ) : null}
      {moving ? (
        <Box flexDirection="column" rowGap={2}>
          {whatMoves(ui)}
          {moveSection($, ui, s, now)}
        </Box>
      ) : null}
    </Box>
  );
}

/** What the move involves for this app, as Clodable's look at it found: until it starts. */
function whatMoves(ui: PaneUi) {
  const { Box, Text } = ui;
  if (assessment && "error" in assessment) {
    return <Text color="error">Couldn't look at your app: {assessment.error}</Text>;
  }
  if (!assessment?.checked) return null;
  const started = (move?.steps ?? []).some((x) => x.id === "connect" && x.state === "done");
  const items = assessment.items ?? [];
  const notes: string[] = assessment.notes ?? [];
  return (
    <Box flexDirection="column" rowGap={2}>
      <Text>{MOVE_LEVELS[assessment.level] ?? ""}</Text>
      {!started && items.length > 0 ? (
        <Box flexDirection="column" rowGap={1}>
          <Text bold>What moves</Text>
          {items.map((item) => (
            <Box key={`moves-${item.id}`} flexDirection="column">
              <Text>
                <Text bold {...(item.by === "help" ? { color: "warning" } : {})}>
                  {item.label}
                </Text>
                <Text dimColor> · {MOVE_WHO[item.by] ?? ""}</Text>
              </Text>
              <Text dimColor>{item.detail}</Text>
            </Box>
          ))}
          {notes.length > 0 ? (
            <Box flexDirection="column">
              <Text bold>Worth knowing</Text>
              {notes.map((note, i) => (
                <Text key={`moves-note-${i}`} dimColor>
                  {note}
                </Text>
              ))}
            </Box>
          ) : null}
          <Text dimColor>Something's not right? Tell Claude in the conversation.</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** The move itself, one step at a time: every step listed, only the current one with its controls. */
function moveSection($: EngineInterface, ui: PaneUi, s: ClodableStatus, now: number) {
  const { Box, Text } = ui;
  const steps = move?.steps ?? [];
  const method = moveMethod();
  const problem = moveProblem(ui);
  // First, Claude reads the app's code: until it has, nothing else is decided.
  if (move && steps.some((x) => x.id === "facts" && x.state !== "done")) {
    return (
      <Box flexDirection="column" rowGap={1}>
        {problem}
        {firstLook($, ui)}
      </Box>
    );
  }
  // Asked before the steps: it decides how the live app moves at the end.
  if (move && !method) {
    return (
      <Box flexDirection="column" rowGap={1}>
        {problem}
        {methodQuestion($, ui)}
      </Box>
    );
  }
  if (steps.length === 0) return problem ?? <Text dimColor>Looking at your app…</Text>;

  const current = steps.find((x) => x.state === "next" || x.state === "attention");
  const here = (
    <Box flexDirection="column" rowGap={1} {...(current ? { paddingLeft: 2 } : {})}>
      {problem}
      {moveControlsFor($, { ui, s, now }, current)}
    </Box>
  );
  const stages = stagesOf(steps, method);
  // The stage the builder is in; with nothing left, the last (all of them fold).
  const at = current ? stages.findIndex((x) => x.steps.includes(current)) : stages.length - 1;
  // Steps after the one the builder is on read as later ones, done or not: they come next.
  const currentIndex = current ? steps.indexOf(current) : steps.length;
  const detail: Record<string, string | undefined> = {
    backend: move?.home?.name,
    website: move?.site?.url,
  };
  return (
    <Box flexDirection="column" rowGap={2}>
      {stages.map((stage, index) =>
        index > at ? (
          // A stage still ahead: its name only, its steps folded until it comes.
          <Text key={`stage-${stage.id}`} dimColor>
            {stage.title}
          </Text>
        ) : stage.steps.every((x) => x.state === "done") ? (
          // A stage that's done: one line.
          <Text key={`stage-${stage.id}`} color="success">
            ✓ {stage.title}
            {detail[stage.id] ? `  · ${detail[stage.id]}` : ""}
          </Text>
        ) : (
          <Box key={`stage-${stage.id}`} flexDirection="column" rowGap={1}>
            {stage.title ? (
              <Box flexDirection="column">
                <Text bold>{stage.title}</Text>
                <Text dimColor>{stage.about}</Text>
              </Box>
            ) : null}
            {stage.id === "golive" ? otherWay($, ui, method) : null}
            {stage.steps.map((step) =>
              stepRow(
                ui,
                step,
                steps.indexOf(step) > currentIndex ? "later" : step.state,
                step === current ? here : null,
              ),
            )}
          </Box>
        ),
      )}
      {current ? null : here}
    </Box>
  );
}

/** One step of the move: its mark and title, and under the current one, what to do now. */
function stepRow(ui: PaneUi, step: ClodableMoveStep, state: string, under: RenderElement | null) {
  const { Box, Text } = ui;
  return (
    <Box key={`step-${step.id}`} flexDirection="column" rowGap={1}>
      <Text
        {...(state === "attention"
          ? { color: "warning" }
          : state === "done"
            ? { color: "success" }
            : {})}
        dimColor={state === "later"}
        bold={under !== null}
      >
        {STEP_MARK[state] ?? "·"} {step.title}
        {step.detail && state !== "later" ? `  · ${step.detail}` : ""}
      </Text>
      {under}
    </Box>
  );
}

/** What went wrong in the move, and what to do about it. */
function moveProblem(ui: PaneUi) {
  const { Box, Text } = ui;
  if (!moveError) return null;
  return (
    <Box flexDirection="column">
      <Text color="error">{moveError.message}</Text>
      {moveError.hint ? <Text dimColor>{moveError.hint}</Text> : null}
    </Box>
  );
}

/** Before anything else: Claude reads the app's code, so each step fits the app. */
function firstLook($: EngineInterface, ui: PaneUi) {
  const { Box, Text } = ui;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text bold>First, Claude looks at your app</Text>
      <Text dimColor>
        It reads your app's code to see what it uses (AI, sign-in, emails, payments…), so each step
        fits your app. Nothing changes.
      </Text>
      {isPiloting() ? (
        <Text dimColor>Claude is looking at your app…</Text>
      ) : (
        <Box flexDirection="row">
          {pilotButton($, ui, "move-facts", "Look at my app", {
            text: "Moving off Lovable: look at my app's code to see what it uses (AI, sign-in, emails, connected services, payments, scheduled jobs, uploads), then tell me in a few plain lines.",
            details: stepDetails(
              `Start from \`${moveCommand($, ["facts"])}\`, check each thing in the code, and record what you found as the move skill says.`,
            ),
          })}
        </Box>
      )}
    </Box>
  );
}

/** How the app moves, asked before the steps: it decides how the live app moves at the end. */
function methodQuestion($: EngineInterface, ui: PaneUi) {
  const { Box, Text, Button } = ui;
  return (
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
          For an app people use. You try a working copy first; at the end your live app pauses for a
          few minutes while the latest data comes over, so nothing is lost.
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
}

/** The other way to move, offered where it changes something: before going live starts. */
function otherWay($: EngineInterface, ui: PaneUi, method: MoveMethod | undefined) {
  const { Box, Text, Button } = ui;
  const switchStarted = Boolean(move?.switch?.frozenAt || move?.switch?.liveAt);
  if (!method || switchStarted || isPiloting() || moveRun) return null;
  return (
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
  );
}

// ── The move off Lovable, one function per step (top level, so they can use $) ──

/** What the move's steps draw with, besides the module's own state. */
type MoveView = { ui: PaneUi; s: ClodableStatus; now: number };
/** …and the step they draw. */
type StepView = MoveView & { step: ClodableMoveStep };

/** How the app moves: as chosen in the panel a moment ago, or as the move recorded it. */
function moveMethod(): MoveMethod | undefined {
  return choosingMethod ?? move?.method;
}

/** The controls under the move's current step; with no step left, where the move ended. */
function moveControlsFor(
  $: EngineInterface,
  view: MoveView,
  step: ClodableMoveStep | undefined,
): RenderElement | null {
  const { Text } = view.ui;
  if (isPiloting()) return <Text dimColor>Claude is on it, in the conversation.</Text>;
  if (moveRun) {
    return (
      <Text>
        ◐ {moveRun.title}…{moveRun.detail ? `  · ${moveRun.detail}` : ""}
      </Text>
    );
  }
  if (!step) {
    return (move?.steps ?? []).length > 0 ? (
      <Text>
        Your app is off Lovable: it runs on your own Supabase and Netlify, and each Publish updates
        it.
      </Text>
    ) : null;
  }
  const here: StepView = { ...view, step };
  switch (step.id) {
    case "connect":
      return connectStep($, here);
    case "create":
      return createStep($, here);
    case "export":
      return exportStep($, here);
    case "copy":
      return copyStep($, here);
    case "files":
      return filesStep($, here);
    case "functions":
      return functionsStep($, here);
    case "try":
      return tryStep($, here);
    case "netlify":
      return netlifyStep($, here);
    case "site":
      return siteStep($, here);
    case "emails":
      return emailsStep($, here);
    case "services":
      return servicesStep($, here);
    case "google":
      return googleStep($, here);
    case "freeze":
      return freezeStep($, here);
    case "final-export":
      return finalExportStep($, here);
    case "final-copy":
      return finalCopyStep($, here);
    case "golive":
      return goLiveStep($, here);
    case "domain":
      return domainStep($, here);
    case "lovable":
      return lovableStep($, here);
    default:
      return null;
  }
}

/** Supabase: an access token that can create the new backend and copy the data into it. */
function connectStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Button, Link } = ui;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your data goes to Supabase, under your own account (free to start). Clodable needs an access
        token that can create your new backend and copy your data into it.
      </Text>
      {numbered(ui, [
        "Open Supabase's token page.",
        "Click “Create legacy token”: the full-access kind.",
        "Name it Clodable, choose the longest expiry it offers, and generate it. Clodable uses it after the move too, for changes to your database.",
        "Paste it here. It stays on this computer.",
      ])}
      <Link
        href="https://supabase.com/dashboard/account/tokens"
        label="Open Supabase's token page ↗"
      />
      {field(ui, "move-token", "sbp_…", "Connect", (value) =>
        background(moveWith($, ["connect"], value)),
      )}
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
}

/** Supabase: where the new backend goes (organization, region), then Claude creates it. */
function createStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Button, Select } = ui;
  if (moveChoices === null) return <Text dimColor>Looking at your Supabase account…</Text>;
  const orgs = moveChoices.organizations ?? [];
  const org = orgs.find((o) => o.slug === moveOrg) ?? orgs[0];
  const request = createRequest($, org, moveChoices, moveOrg, moveRegion);
  return (
    <Box flexDirection="column" rowGap={1}>
      {orgs.length > 1 && Select ? (
        <Select
          key="move-org"
          label="Organization"
          options={orgs.map((o) => ({ value: o.slug, label: `${o.name} · ${o.cost}` }))}
          value={moveOrg}
          onSelect={(value: string) => {
            moveOrg = value;
            $.ui.invalidate("ui.render");
          }}
        />
      ) : null}
      {Select && (moveChoices.regions ?? []).length > 1 ? (
        <Box flexDirection="column">
          <Select
            key="move-region"
            label="Where it runs"
            options={moveChoices.regions.map((r) => ({ value: r.code, label: r.name }))}
            value={moveRegion}
            onSelect={(value: string) => {
              moveRegion = value;
              $.ui.invalidate("ui.render");
            }}
          />
          <Text dimColor>
            Picked from where this computer is. Choose where most of your app's users are: it's
            faster for them.
          </Text>
        </Box>
      ) : null}
      {org?.plan === "free" && org?.freeLeft === 0 ? (
        <Box flexDirection="column" rowGap={1}>
          <Text color="warning">
            Supabase runs 2 free projects per person, counted across all your organizations, and you
            already run{" "}
            {(moveChoices.freeProjects ?? [])
              .map((p) => `${p.name} (${p.organization})`)
              .join(" and ") || "2"}
            .
          </Text>
          <Text dimColor>
            Pause one in Supabase (Project settings → Pause project), then check again. Or pick an
            organization on a paid plan.
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
              <Button key="move-create-anyway" plain onPress={() => background(pilot($, request))}>
                Try anyway
              </Button>
            </Box>
          )}
        </Box>
      ) : (
        <Box flexDirection="row" columnGap={2} alignItems="center">
          {pilotButton($, ui, "move-create", "Create it", request)}
          <Text dimColor>{org?.cost ?? ""}</Text>
        </Box>
      )}
    </Box>
  );
}

/** Lovable: the data export, which Claude reads once the builder has downloaded it. */
function exportStep($: EngineInterface, { ui, s }: StepView) {
  const { Box, Text } = ui;
  return (
    <Box flexDirection="column" rowGap={1}>
      {numbered(ui, [
        ...EXPORT_CLICKS,
        "Lovable emails you a download link (it's also in Cloud → Storage). Download the zip.",
      ])}
      <Box flexDirection="row" columnGap={2} alignItems="center">
        {pilotButton($, ui, "move-export", "I've downloaded it", {
          text: "Moving off Lovable: I've downloaded my Lovable export. Read it and tell me what's in it.",
          details: stepDetails(`Read it with \`${moveCommand($, ["export"])}\`.`),
        })}
        {openLovable(ui, s)}
      </Box>
      <Text dimColor>
        Clodable finds it in your Downloads. Lovable allows one export a day, while your backend is
        running.
      </Text>
    </Box>
  );
}

/** The data copy. Once it's in, the database's encrypted secrets are the step's last part. */
function copyStep($: EngineInterface, { ui, step }: StepView) {
  const { Box, Text } = ui;
  const again = step.state === "attention";
  if (!again && (move?.vaultLeft ?? []).length > 0) return vaultSecrets($, ui);
  return (
    <Box flexDirection="column" rowGap={1}>
      {planNote(ui, "data")}
      {again ? (
        copyChecks(ui)
      ) : (
        <Text dimColor>
          Your people, tables and settings go into your new backend. Your live app keeps running on
          Lovable meanwhile.
        </Text>
      )}
      {pilotButton($, ui, "move-copy", again ? "Copy again" : "Copy my data", {
        text: "Moving off Lovable: copy my data into my new backend, then make sure my app works on it.",
        details: stepDetails(runStep($, ["copy"])),
      })}
    </Box>
  );
}

/** The database's encrypted secrets, which Lovable can't hand over: pasted one by one. */
function vaultSecrets($: EngineInterface, ui: PaneUi) {
  const { Box, Text } = ui;
  const missing = ((move?.vaultLeft ?? []) as string[]).filter(
    (name) => !(moveVault?.set ?? []).includes(name),
  );
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your database keeps {plural(missing.length, "secret")} Lovable can't hand over (they're
        encrypted). In Lovable, open More → Cloud → SQL editor, run this, then paste each value
        here. It goes straight into your new backend.
      </Text>
      {moveVault?.query ? (
        sqlBlock($, ui, "move-vault-query", moveVault.query)
      ) : (
        <Text dimColor>…</Text>
      )}
      {missing.map((name) =>
        pasteField(ui, `move-vault-${name}`, name, (value) =>
          background(moveWith($, ["vault-secret", name], value)),
        ),
      )}
      {goOnWithout($, ui, "move-vault-skip", "vault", missing.length)}
    </Box>
  );
}

/** The uploaded files, copied as they are; private folders need Lovable Cloud's key once. */
function filesStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text } = ui;
  const waiting = move?.files?.waiting ?? [];
  const tooBig = move?.files?.tooBig ?? 0;
  if (waiting.length === 0) {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>The images and documents people uploaded, copied as they are.</Text>
        {planNote(ui, "files")}
        {tooBig > 0 ? (
          <Text color="warning">
            {plural(tooBig, "file")} {tooBig === 1 ? "is" : "are"} larger than your Supabase plan
            accepts.
          </Text>
        ) : null}
        {pilotButton($, ui, "move-files", move?.files ? "Copy the rest" : "Copy my files", {
          text: "Moving off Lovable: copy my uploaded files to my new backend.",
          details: stepDetails(runStep($, ["files"])),
        })}
      </Box>
    );
  }
  if (!move?.vaultKey) {
    return (
      <Text>
        Your private folders ({waiting.join(", ")}) can't be copied on their own yet: download those
        files in Lovable (More → Cloud → Storage) and upload them in Supabase, or ask a developer.
      </Text>
    );
  }
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your private folders ({waiting.join(", ")}) need Lovable Cloud's service key, to read them
        once.
      </Text>
      <Text dimColor>
        In Lovable, run this query (or ask Lovable's chat to run it), then paste the result here.
        It's used for this copy only and never saved.
      </Text>
      {sqlBlock($, ui, "move-service-key-query", SERVICE_KEY_QUERY)}
      {field(ui, "move-source-key", "eyJ…", "Copy them", (value) =>
        background(moveWith($, ["files", "--private"], value)),
      )}
    </Box>
  );
}

/** The backend functions, deployed together. Then the secret keys they read. */
function functionsStep($: EngineInterface, { ui, step }: StepView) {
  const { Box, Text } = ui;
  const again = step.state === "attention";
  if (!again && (move?.secretsLeft ?? []).length > 0) {
    const missing = ((move?.secretsLeft ?? []) as string[]).filter(
      (name) => !(moveSecrets?.set ?? []).includes(name),
    );
    return (
      <Box flexDirection="column" rowGap={1}>
        {missing.length > 0 ? (
          <Text>
            Your functions use {plural(missing.length, "secret key")}. Paste each value from the
            service it belongs to (Lovable doesn't show them). They go straight to Supabase.
          </Text>
        ) : null}
        {missing.map((name) =>
          pasteField(ui, `move-secret-${name}`, name, (value) =>
            background(moveWith($, ["secret", name], value)),
          ),
        )}
        {goOnWithout($, ui, "move-secrets-skip", "secrets", missing.length)}
      </Box>
    );
  }
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text dimColor>
        Your {plural(move?.functions ?? 0, "backend function")} go to your new backend, all
        together.
      </Text>
      {pilotButton($, ui, "move-functions", again ? "Deploy them again" : "Deploy my functions", {
        text: "Moving off Lovable: deploy my backend functions to my new backend.",
        details: stepDetails(runStep($, ["functions"])),
      })}
    </Box>
  );
}

/** The preview on the copy: the builder tries the app on its new backend. */
function tryStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Link } = ui;
  const onCopy =
    move?.preview === "copy" ? (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          The preview shows your copy: sign in, click around, change things. Your live app is
          untouched.
        </Text>
        <Box flexDirection="row" columnGap={2} alignItems="center">
          {pilotButton(
            $,
            ui,
            "move-live",
            "Back to live data",
            {
              text: "Switch my preview back to my live data.",
              details: stepDetails(runStep($, ["preview", "live"])),
            },
            "secondary",
          )}
          {move?.home ? <Link href={move.home.dashboard} label="Open it in Supabase ↗" /> : null}
        </Box>
      </Box>
    ) : (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>The preview restarts on your new backend. Your live app is untouched.</Text>
        {pilotButton($, ui, "move-try", "Try my app on the copy", {
          text: "Moving off Lovable: switch my preview to the copy, then check my app works on it.",
          details: stepDetails(runStep($, ["preview", "copy"]), previewRequest(previewUrl)),
        })}
      </Box>
    );
  return (
    <Box flexDirection="column" rowGap={1}>
      {settingsFields($, ui, "move-setting", true)}
      {onCopy}
    </Box>
  );
}

/** Netlify: a token, so each Publish puts the site live there. */
function netlifyStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Link } = ui;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your website moves to Netlify, under your own account (free to start). Each Publish will put
        it live there; your live app stays on Lovable until the switch.
      </Text>
      {numbered(ui, [
        "Open Netlify's token page.",
        "Create a personal access token named Clodable.",
        "Paste it here. It stays on this computer.",
      ])}
      <Link
        href="https://app.netlify.com/user/applications#personal-access-tokens"
        label="Open Netlify's token page ↗"
      />
      {field(ui, "move-netlify-token", "Netlify token", "Connect", (value) =>
        background(moveWith($, ["netlify"], value)),
      )}
    </Box>
  );
}

/** The site on Netlify. Once it's there, the settings its server code reads are the last part. */
function siteStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Select } = ui;
  const settingsLeft: string[] = move?.settingsLeft ?? [];
  if (settingsLeft.length > 0) {
    return (
      <Box flexDirection="column" rowGap={1}>
        {settingsFields($, ui, "move-setting", true)}
        {goOnWithout($, ui, "move-settings-skip", "settings", settingsLeft.length)}
      </Box>
    );
  }
  const teams = moveTeams ?? [];
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text dimColor>
        Clodable creates the site, points it at your new backend, and sets up Publish to put it live
        on Netlify through GitHub.
      </Text>
      {teams.length > 1 && Select ? (
        <Select
          key="move-team"
          label="Netlify team"
          options={teams.map((t) => ({ value: t.slug, label: t.name }))}
          value={moveTeam}
          onSelect={(value: string) => {
            moveTeam = value;
            $.ui.invalidate("ui.render");
          }}
        />
      ) : null}
      {pilotButton($, ui, "move-site", "Put my site on Netlify", {
        text: "Moving off Lovable: put my site on Netlify, then tell me what's left before I can see it there.",
        details: stepDetails(runStep($, ["site", ...(moveTeam ? ["--account", moveTeam] : [])])),
      })}
    </Box>
  );
}

/** Sign-up and password emails from the builder's own domain: a Resend key, a domain, records. */
function emailsStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Link } = ui;
  if (!move?.resend) {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Clodable sends your users' sign-up confirmations and password resets from your own domain
          (like yourapp.com), through your Resend account.
        </Text>
        {numbered(ui, [
          "Sign in to Resend, or sign up (it's free to start).",
          "API Keys → Create API Key, with Full access.",
          "Paste the key here. It stays on this computer.",
        ])}
        <Link href="https://resend.com/api-keys" label="Open Resend's keys page ↗" />
        {field(ui, "move-resend-key", "re_…", "Connect", (value) =>
          background(moveWith($, ["resend"], value)),
        )}
        {noEmails($, ui, "No domain of your own yet?")}
      </Box>
    );
  }
  if (!move.emails) {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Which domain should your emails come from? One you own, like example.com: they'll come
          from no-reply@ that domain.
        </Text>
        {domainField($, ui, "move-email-domain", "example.com", "Set it up", true, (domain) =>
          background(
            pilot($, {
              text: `Moving off Lovable: set up emails for my users from ${domain}, then tell me what to do at my domain's provider.`,
              details: stepDetails(runStep($, ["emails", "--domain", domain])),
            }),
          ),
        )}
        {noEmails($, ui, "No domain of your own yet?")}
      </Box>
    );
  }
  const records = move.emails.records ?? [];
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Add {records.length === 1 ? "this record" : `these ${records.length} records`} where you
        manage {move.emails.domain} (where you bought it: Namecheap, GoDaddy, Cloudflare…). They can
        take a few minutes to show, sometimes a few hours.
      </Text>
      {dnsRecords($, ui, "record", records)}
      <Box flexDirection="row" columnGap={2} alignItems="center">
        {pilotButton($, ui, "move-emails-check", "Check again", {
          text: `Moving off Lovable: check whether ${move.emails.domain}'s email records are in place, and finish setting up my emails if they are.`,
          details: stepDetails(runStep($, ["emails"])),
        })}
      </Box>
      {noEmails($, ui, "Rather do this later?")}
    </Box>
  );
}

/** Said in each request that switches a service: the app keeps working on Lovable until the end. */
const KEEP_LOVABLE_WORKING =
  "Keep Lovable's as the fallback when that key isn't set, so the app keeps working on Lovable until the switch.";

/** The services the app reaches through Lovable (AI, its own emails, connectors), one at a time. */
function servicesStep($: EngineInterface, { ui }: StepView) {
  const { Box } = ui;
  const left: string[] = move?.services?.left ?? [];
  return (
    <Box flexDirection="column" rowGap={1}>
      {serviceToSwitch($, ui)}
      {left.length > 0
        ? skipRow($, ui, {
            key: "move-services-skip",
            part: "services",
            question: "Rather not switch now?",
            label: "Go on without them",
            cost: `Then ${left.join(", ")} stop working when Lovable goes. Claude can switch them later.`,
          })
        : null}
    </Box>
  );
}

/** The next service to switch off Lovable, with what the builder does for it. */
function serviceToSwitch($: EngineInterface, ui: PaneUi): RenderElement | null {
  const { Box, Text, Link, Select } = ui;
  const sv = move?.services;
  const emailsOn = Boolean(move?.emails?.connected);
  if (sv?.ai && !sv.aiSwitched && !sv.aiProvider) {
    const chosen = AI_PROVIDERS[aiChoice];
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Your app's AI features run on Lovable's AI, which stops when it leaves. Clodable moves
          them to an AI provider of your own.
        </Text>
        {Select ? (
          <Select
            key="move-ai-provider"
            label="Provider"
            options={Object.entries(AI_PROVIDERS).map(([value, p]) => ({ value, label: p.label }))}
            value={aiChoice}
            onSelect={(value: string) => {
              aiChoice = value in AI_PROVIDERS ? (value as AiProvider) : "openrouter";
              $.ui.invalidate("ui.render");
            }}
          />
        ) : null}
        {numbered(ui, [
          `Create a key on ${chosen.name}.`,
          "Paste it here. It goes to your preview, your site and your backend.",
        ])}
        <Link href={chosen.keys} label={`Open ${chosen.name}'s keys page ↗`} />
        {field(ui, "move-ai-key", "Paste the key", "Save", (value) =>
          background(moveWith($, ["ai", aiChoice], value)),
        )}
      </Box>
    );
  }
  if (sv?.ai && !sv.aiSwitched) {
    const name = AI_PROVIDERS[sv.aiProvider as AiProvider]?.name ?? sv.aiProvider;
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>Your {name} key is saved. Claude now points your app's AI features at it.</Text>
        {pilotButton($, ui, "move-ai-switch", "Switch my AI features", {
          text: `Moving off Lovable: switch my app's AI features from Lovable's AI to ${name}, then check it works in the preview.`,
          details: stepDetails(
            `Clodable saved AI_API_URL and AI_API_KEY for the preview, the site and the backend functions: make the code call \`\${AI_API_URL}/chat/completions\` with AI_API_KEY (the same OpenAI-style API).`,
            KEEP_LOVABLE_WORKING,
            `Deploy the backend functions with \`${moveCommand($, ["functions"])}\` if you changed any.`,
          ),
        })}
      </Box>
    );
  }
  if (sv?.emails && !sv.emailsSwitched && emailsOn) {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Your app sends its own emails through Lovable. Clodable gives it a Resend key of its own,
          sending from {move?.emails?.sender}, and Claude switches the sending.
        </Text>
        {pilotButton($, ui, "move-app-emails", "Switch my emails", {
          text: `Moving off Lovable: switch my app's own emails from Lovable to Resend${sv.hook ? ", then turn on my own sign-in emails" : ""}.`,
          details: stepDetails(
            `Run \`${moveCommand($, ["app-emails"])}\`: it gives the app RESEND_API_KEY and EMAIL_FROM. Then make the code send through Resend's API with them.`,
            KEEP_LOVABLE_WORKING,
            `Deploy the backend functions with \`${moveCommand($, ["functions"])}\`${sv.hook ? `, then turn on the app's own sign-in emails with \`${moveCommand($, ["emails", "--hook"])}\`` : ""}.`,
          ),
        })}
      </Box>
    );
  }
  if (sv?.emails && !sv.emailsSwitched) {
    return (
      <Text>
        Your app also sends its own emails through Lovable: they move with your emails, in the step
        above.
      </Text>
    );
  }
  if (sv?.hook && emailsOn && !sv.hookOn) {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Your app has its own sign-in emails (from Lovable). Clodable turns them on, so
          confirmations and password resets look like your app.
        </Text>
        {pilotButton($, ui, "move-email-hook", "Turn on my sign-in emails", {
          text: "Moving off Lovable: turn on my app's own sign-in emails.",
          details: stepDetails(
            `Run \`${moveCommand($, ["emails", "--hook"])}\` (deploy the backend functions with \`${moveCommand($, ["functions"])}\` first if it asks).`,
          ),
        })}
      </Box>
    );
  }
  const names: string[] = sv?.connectors ?? [];
  if (names.length === 0) return null;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your app reaches {names.join(", ")} through Lovable's connectors, which stop when it leaves.
        Paste your own key for each: it goes to your preview and your site.
      </Text>
      {names.map((name) =>
        pasteField(
          ui,
          `move-connector-${name}`,
          name,
          (value) => background(saveSetting($, connectorSetting(name), value)),
          { placeholder: `Your ${name} key` },
        ),
      )}
      {pilotButton($, ui, "move-connectors", "Switch them", {
        text: `Moving off Lovable: switch ${names.join(", ")} from Lovable's connectors to their own services, then check it works in the preview.`,
        details: stepDetails(
          `The app reaches them through Lovable's connectors (connector-gateway.lovable.dev). Switch each to that service's own API, reading its key from ${names.map(connectorSetting).join(", ")} (process.env on the server); tell the builder where to paste any that's missing.`,
        ),
      })}
    </Box>
  );
}

/** Google sign-in: a Google client of the builder's own, then Claude switches the button. */
function googleStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Link } = ui;
  if (move?.google?.configured) {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Google sign-in is on in your new backend. Claude now switches your app's Google button to
          it.
        </Text>
        {pilotButton($, ui, "move-google-switch", "Switch my Google sign-in", {
          text: "Moving off Lovable: switch my Google sign-in to my new backend, then check it in the preview.",
          details: stepDetails(
            "The app signs in with Google through Lovable's broker (@lovable.dev/cloud-auth-js), which only works on Lovable. Clodable turned Google on in the new backend and set VITE_GOOGLE_SIGN_IN=supabase for the preview and the site. Make the Google button call supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }) when import.meta.env.VITE_GOOGLE_SIGN_IN is 'supabase', and keep Lovable's broker otherwise, so the app keeps working on Lovable until the switch.",
          ),
        })}
      </Box>
    );
  }
  const redirect = move?.google?.redirect as string | undefined;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        People sign in to your app with Google. On your new backend that needs a Google client of
        your own: Clodable turns it on with it.
      </Text>
      {numbered(ui, [
        "In Google Cloud: APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.",
        "Under Authorized redirect URIs, add this address:",
      ])}
      {redirect ? copyable($, ui, "move-google-redirect", "", redirect) : null}
      <Text>3. Paste the client ID, then its secret, here. The secret stays off the chat.</Text>
      <Link
        href="https://console.cloud.google.com/apis/credentials"
        label="Open Google Cloud's credentials ↗"
      />
      {googleClientId
        ? field(ui, "move-google-secret", "Client secret", "Turn it on", (value) =>
            background(moveWith($, ["google", googleClientId], value)),
          )
        : field(ui, "move-google-id", "…apps.googleusercontent.com", "Next", (value) => {
            const id = value.trim();
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
      {skipRow($, ui, {
        key: "move-google-skip",
        part: "google",
        question: "Rather not now?",
        label: "Leave Google sign-in off",
      })}
    </Box>
  );
}

/** Going live, part one: the live app pauses, by SQL the builder runs in Lovable. */
function freezeStep($: EngineInterface, { ui, s, now }: StepView) {
  const { Box, Text, Button } = ui;
  const last = move?.lastExport ? new Date(move.lastExport).getTime() : 0;
  const nextExport = last + 24 * 60 * 60_000;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Now your live app moves over. It pauses for the few minutes this takes: people still see
        everything and can sign in; changes, new sign-ups and uploads wait until it runs on your new
        backend.
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
      {pausePlan ? sqlBlock($, ui, "move-freeze", pausePlan.freeze) : <Text dimColor>…</Text>}
      <Text>2. Then tell Clodable.</Text>
      <Box flexDirection="row" columnGap={2} alignItems="center">
        <Button
          key="move-paused"
          variant="primary"
          onPress={() => background(moveStep($, ["paused"]))}
        >
          I've paused it
        </Button>
        {openLovable(ui, s)}
      </Box>
    </Box>
  );
}

/** Going live, part two: the last export, with everything written until the pause. */
function finalExportStep($: EngineInterface, { ui, s }: StepView) {
  const { Box, Text } = ui;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your live app is paused. Export your data once more: this export has everything people wrote
        until the pause.
      </Text>
      {numbered(ui, [...EXPORT_CLICKS, "Download the zip from the email Lovable sends."])}
      <Box flexDirection="row" columnGap={2} alignItems="center">
        {pilotButton($, ui, "move-final-export", "I've downloaded it", {
          text: "Moving off Lovable: I've downloaded my final Lovable export, made after the pause. Read it and tell me what's in it.",
          details: stepDetails(`Read it with \`${moveCommand($, ["export"])}\`.`),
        })}
        {openLovable(ui, s)}
      </Box>
      {undoPause($, ui)}
    </Box>
  );
}

/** Going live, part three: the last export replaces the copy, for good. */
function finalCopyStep($: EngineInterface, { ui, step }: StepView) {
  const { Box, Text } = ui;
  const again = step.state === "attention";
  const hasFiles = (move?.steps ?? []).some((x) => x.id === "files");
  return (
    <Box flexDirection="column" rowGap={1}>
      {again ? (
        copyChecks(ui)
      ) : (
        <Text dimColor>
          Your data as of the pause replaces the copy (what you tried on it goes), with your app's
          scheduled jobs. Your new backend then takes changes again.
        </Text>
      )}
      {pilotButton($, ui, "move-final-copy", again ? "Copy again" : "Copy it in for good", {
        text: `Moving off Lovable: copy my final export into my new backend for good${hasFiles ? ", then copy the files uploaded since" : ""}, and make sure everything is there.`,
        details: stepDetails(
          runStep($, ["copy"]),
          ...(hasFiles ? [`Then the files: \`${moveCommand($, ["files"])}\`.`] : []),
        ),
      })}
      {undoPause($, ui)}
    </Box>
  );
}

/** Going live: who may sign up, what to change elsewhere (payments, scheduled jobs), then go. */
function goLiveStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text, Select } = ui;
  const emailsOn = Boolean(move?.emails?.connected);
  // Without emails, nobody can confirm one: that choice isn't offered.
  const people = !emailsOn && newPeople === "confirm" ? "open" : newPeople;
  const jobs = move?.lovableJobs as { count: number; stop: string } | undefined;
  const webhooks: Array<{ name: string; url: string }> = move?.stripeWebhooks ?? [];
  return (
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
            ...(emailsOn ? [{ value: "confirm", label: "Sign up, confirming their email" }] : []),
            { value: "open", label: "Sign up straight away" },
            { value: "invite", label: "Only people you invite" },
          ]}
          value={people}
          onSelect={(value: string) => {
            newPeople = value === "invite" ? "invite" : value === "open" ? "open" : "confirm";
            $.ui.invalidate("ui.render");
          }}
        />
      ) : null}
      {webhooks.length > 0 ? (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your payments: in Stripe → Developers → Webhooks, change your endpoint's address to your
            new backend when you go live (its signing secret stays the same):
          </Text>
          {webhooks.map((w, i) => copyable($, ui, `move-stripe-${i}`, "", w.url))}
        </Box>
      ) : null}
      {jobs ? (
        <Box flexDirection="column" rowGap={1}>
          <Text>
            Your app has {plural(jobs.count, "scheduled job")}: going live starts them here. First
            stop them in Lovable (More → Cloud → SQL editor), so they don't run twice:
          </Text>
          {sqlBlock($, ui, "move-stop-jobs", jobs.stop)}
        </Box>
      ) : null}
      {move?.cronKey ? (
        <Text>
          Your scheduled jobs call your app with a key Lovable keeps. Once live, ask Claude to give
          them one of your own.
        </Text>
      ) : null}
      {moveMethod() === "quick" ? (
        <Text dimColor>
          Your data is as of your export
          {move?.lastExport
            ? ` (${new Date(move.lastExport).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })})`
            : ""}
          . Anything written in your Lovable app since stays there.
        </Text>
      ) : null}
      {pilotButton($, ui, "move-golive", "Go live", {
        text: "Moving off Lovable: switch my app to its new backend and site, then tell me what changed and how to put it live.",
        details: stepDetails(
          runStep($, [
            "golive",
            "--sign-up",
            people === "invite" ? "no" : "yes",
            ...(emailsOn ? ["--confirm-email", people === "confirm" ? "yes" : "no"] : []),
          ]),
        ),
      })}
    </Box>
  );
}

/** The app's own domain, moved to the new site once a Publish has put it there. */
function domainStep($: EngineInterface, { ui }: StepView) {
  const { Box, Text } = ui;
  const publishedSinceLive = Boolean(
    move?.site?.liveAt && move.site.liveAt > (move.switch?.liveAt ?? ""),
  );
  if (!publishedSinceLive) {
    // Right after going live, one thing only: Publish puts it there.
    return (
      <Text>
        First, Publish (in the Clodable bar): it puts your app live at{" "}
        {move?.site?.url ?? "its new address"}.
      </Text>
    );
  }
  if (move?.domain) {
    const records = move.domain.records ?? [];
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Where you manage {move.domain.name} (where you bought it), replace the records that point
          to Lovable with {records.length === 1 ? "this one" : "these"}. They can take a few minutes
          to show, sometimes a few hours.
        </Text>
        {dnsRecords($, ui, "domain-record", records)}
        <Box flexDirection="row" columnGap={2} alignItems="center">
          {pilotButton($, ui, "move-domain-check", "Check again", {
            text: `Moving off Lovable: check whether ${move.domain.name} points to my new site, and tell me what's left if it doesn't.`,
            details: stepDetails(runStep($, ["domain"])),
          })}
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your app is live at {move?.site ? new URL(move.site.url).host : "its new address"}. Does it
        have its own domain, like yourapp.com? Clodable moves it to your new site before Lovable
        goes.
      </Text>
      {domainField($, ui, "move-domain", "yourapp.com", "Move it", false, (domain) =>
        background(
          pilot($, {
            text: `Moving off Lovable: move my domain ${domain} to my new site, then tell me what to change at my domain's provider.`,
            details: stepDetails(runStep($, ["domain", domain])),
          }),
        ),
      )}
      {skipRow($, ui, {
        key: "move-domain-skip",
        part: "domain",
        question: "No domain of its own?",
        label: "Keep this address",
      })}
    </Box>
  );
}

/** The last clicks in Lovable, once the builder has signed in on the new site. */
function lovableStep($: EngineInterface, { ui, s, now }: StepView) {
  const { Box, Text, Button, Link } = ui;
  const liveAddress: string =
    (s.liveUrl && !/lovable\.app/.test(s.liveUrl) ? s.liveUrl : undefined) ??
    move?.site?.url ??
    "your new address";
  if (move?.signIn?.needed && !move.signIn.at) {
    // Proof first: the app works on its new home before its old one goes.
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Sign in on your new site with your own account and change something. Lovable's last steps
          show once Clodable sees you signed in there.
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
  }
  const signedIn = move?.signIn?.at as string | undefined;
  const message = move?.signIn?.needed
    ? `We've moved ${s.project} to ${liveAddress}. Sign in with your usual email and password: nothing else changes.`
    : `We've moved ${s.project} to ${liveAddress}.`;
  return (
    <Box flexDirection="column" rowGap={1}>
      {signedIn ? (
        <Text color="success">✓ You signed in on your new site, {ago(signedIn, now)}.</Text>
      ) : null}
      <Text>Now finish in Lovable, in this order:</Text>
      {numbered(ui, [
        "Unpublish your app (More → Settings → General → Unpublish project), so nobody keeps using its Lovable address.",
        "More → Settings → Git → GitHub → Disconnect, so Lovable stops changing your code.",
        "More → Cloud → Overview → Advanced settings → Remove Lovable Cloud. Tick both boxes and type your project's name. This deletes Lovable's copy of your data, for good.",
      ])}
      <Box flexDirection="row" columnGap={2} alignItems="center">
        <Button key="move-finished" variant="primary" onPress={() => background(finishMove($))}>
          I've done it
        </Button>
        {openLovable(ui, s)}
      </Box>
      <Box flexDirection="column" rowGap={1} marginTop={1}>
        <Text dimColor>A message for your users, if you'd like one:</Text>
        <Box flexDirection="row" columnGap={1} alignItems="center">
          <Text>{message}</Text>
          <Button key="move-users-message-copy" plain onPress={() => $.ui.copy({ text: message })}>
            Copy
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

// The move's shared pieces.

/** A button that hands a part of the move to Claude, as the builder's request. */
function pilotButton(
  $: EngineInterface,
  ui: PaneUi,
  key: string,
  label: string,
  request: Ask,
  variant: "primary" | "secondary" = "primary",
) {
  const { Button } = ui;
  return (
    <Button key={key} variant={variant} onPress={() => background(pilot($, request))}>
      {label}
    </Button>
  );
}

/** Clicks for the builder to make elsewhere, numbered. */
function numbered(ui: PaneUi, lines: string[]) {
  const { Box, Text } = ui;
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text>{`${i + 1}. ${line}`}</Text>
      ))}
    </Box>
  );
}

/** The project in Lovable, when its address is known. */
function openLovable(ui: PaneUi, s: ClodableStatus) {
  const { Link } = ui;
  return s.lovableUrl ? <Link href={s.lovableUrl} label="Open Lovable ↗" /> : null;
}

/** A value only the builder has (a secret key, a setting), pasted under its name. */
function pasteField(
  ui: PaneUi,
  key: string,
  name: string,
  save: (value: string) => void,
  { placeholder = "Paste the value", note }: { placeholder?: string; note?: string } = {},
) {
  const { Box, Text } = ui;
  return (
    <Box key={`${key}-row`} flexDirection="column">
      <Text bold>{name}</Text>
      {note ? <Text dimColor>{note}</Text> : null}
      {field(ui, key, placeholder, "Save", save)}
    </Box>
  );
}

/** A field for a domain the builder owns. Anything else typed says so, in place. */
function domainField(
  $: EngineInterface,
  ui: PaneUi,
  key: string,
  example: string,
  submit: string,
  bare: boolean,
  use: (domain: string) => void,
) {
  return field(ui, key, example, submit, (value) => {
    const domain = typedDomain(value, { bare });
    if (domain) {
      use(domain);
      return;
    }
    moveError = {
      message: `“${value.trim()}” isn't a domain name.`,
      hint: `Just the domain, like ${example}.`,
    };
    $.ui.invalidate("ui.render");
  });
}

/** DNS records to add at the domain's provider, each part with its Copy button. */
function dnsRecords($: EngineInterface, ui: PaneUi, key: string, records: ClodableDnsRecord[]) {
  const { Box, Text } = ui;
  return records.map((r, i) => (
    <Box key={`${key}-${i}`} flexDirection="column">
      <Text bold>
        {r.type}
        {r.priority !== undefined ? `  · priority ${r.priority}` : ""}
      </Text>
      {copyable($, ui, `${key}-${i}-name`, "Name ", r.name)}
      {copyable($, ui, `${key}-${i}-value`, "Value", r.value)}
    </Box>
  ));
}

/** The way past a part of the move the builder can't or won't do now, and what it costs. */
function skipRow(
  $: EngineInterface,
  ui: PaneUi,
  way: { key: string; part: string; question: string; label: string; cost?: string },
) {
  const { Box, Text, Button } = ui;
  return (
    <Box flexDirection="column" rowGap={1} marginTop={1}>
      <Box flexDirection="row" columnGap={2} alignItems="center">
        <Text>{way.question}</Text>
        <Button
          key={way.key}
          variant="secondary"
          onPress={() => background(moveStep($, [way.part, "--skip"]))}
        >
          {way.label}
        </Button>
      </Box>
      {way.cost ? <Text dimColor>{way.cost}</Text> : null}
    </Box>
  );
}

/** Going on without what's left of a step: the values the builder doesn't have yet. */
function goOnWithout(
  $: EngineInterface,
  ui: PaneUi,
  key: string,
  part: "settings" | "secrets" | "vault",
  count: number,
) {
  return skipRow($, ui, {
    key,
    part,
    question: count === 1 ? "Don't have it yet?" : "Don't have them yet?",
    label: count === 1 ? "Go on without it" : "Go on without them",
  });
}

/** Going on without emails of the app's own, and what that costs its users. */
function noEmails($: EngineInterface, ui: PaneUi, question: string) {
  return skipRow($, ui, {
    key: "move-no-emails",
    part: "emails",
    question,
    label: "Continue without emails",
    cost: "New people then sign in without confirming their email, and nobody can reset a forgotten password. You can add emails later.",
  });
}

/** What the copy's checks found, one line each. */
function copyChecks(ui: PaneUi) {
  const { Box, Text } = ui;
  return (
    <Box flexDirection="column">
      {(move?.checks ?? []).map((c) => (
        <Text key={`check-${c.id}`} {...(c.ok ? {} : { color: "warning" })}>
          {c.ok ? "✓" : "!"} {c.label}
          {c.detail && !c.ok ? `  · ${c.detail}` : ""}
        </Text>
      ))}
    </Box>
  );
}

/** Larger than Supabase's free plan holds: said before copying, while upgrading is easy. */
function planNote(ui: PaneUi, kind: "data" | "files") {
  const { Box, Text } = ui;
  const plan = move?.plan as
    | { data: number; dataLimit: number; files: number; filesLimit: number }
    | undefined;
  if (!plan) return null;
  const limit = kind === "data" ? plan.dataLimit : plan.filesLimit;
  if (plan[kind] <= limit) return null;
  return (
    <Box flexDirection="column">
      <Text color="warning">
        Your {kind === "data" ? "data takes about" : "files take"} {sizeOf(plan[kind])}: Supabase's
        free plan holds {sizeOf(limit)}.
      </Text>
      <Text dimColor>
        Move your organization to Pro first (about $25 a month, in Supabase: Organization settings →
        Billing), or the copy stops when it's full.
      </Text>
    </Box>
  );
}

/** While the live app is paused: the SQL that undoes the pause, should the builder change their mind. */
function undoPause($: EngineInterface, ui: PaneUi) {
  const { Box, Text } = ui;
  if (!pausePlan) return null;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text dimColor>Changed your mind? Run this in Lovable to undo the pause:</Text>
      {sqlBlock($, ui, "move-undo", pausePlan.undo)}
    </Box>
  );
}

/** The settings the app's server code reads, still to paste: for the preview, and the site. */
function settingsFields($: EngineInterface, ui: PaneUi, key: string, fromLovable: boolean) {
  const { Box, Text } = ui;
  const st = appSettingsStatus;
  const missing = (st?.wanted ?? []).filter(
    (name) => !st?.local.includes(name) || (st.site !== undefined && !st.site.includes(name)),
  );
  if (missing.length === 0) return null;
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>
        Your app's server code reads {plural(missing.length, "setting")} (environment variables).
        {fromLovable ? " On Lovable they're listed in More → Cloud → Secrets." : ""} Paste each one
        here: it goes to your preview
        {st?.site ? " and to your site on Netlify" : ", and stays on this computer"}.
      </Text>
      {missing.map((name) =>
        pasteField(ui, `${key}-${name}`, name, (value) => background(saveSetting($, name, value)), {
          ...(st?.site?.includes(name)
            ? {
                note: "Already on your site. Paste it again for your preview: Netlify keeps it secret.",
              }
            : {}),
        }),
      )}
    </Box>
  );
}

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

/**
 * `clodable setup` from the panel: its button gives way to a note meanwhile, and a setup that
 * didn't finish says why. Its result when it did.
 */
async function runSetup($: EngineInterface, args: string[]): Promise<Result | undefined> {
  if (settingUp) return undefined;
  settingUp = true;
  $.ui.invalidate("ui.render");
  let result: Result;
  try {
    result = await cli($, ["setup", ...args, "--yes"], MAX_RUN_MS);
  } finally {
    settingUp = false;
    $.ui.invalidate("ui.render");
  }
  if (!result.ok) {
    $.ui.toast(result.error?.message ?? "Setup didn't finish.");
    return undefined;
  }
  return result;
}

async function bringIn($: EngineInterface) {
  const repo = chosenRepo || repoChoices[0]?.value;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    $.ui.toast("Type your repository as owner/name, for example acme/website.");
    return;
  }
  const result = await runSetup($, ["--repo", repo]);
  if (!result) return;
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
  if (!(await runSetup($, []))) return;
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
