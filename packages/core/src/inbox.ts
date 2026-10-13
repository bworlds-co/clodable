import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeJsonFile } from "./places.js";

/**
 * The inbox: how the preview toolbar (which must stay vendor-neutral) hands work to whatever
 * front end drives the agent. Each item is one small JSON file under `.clodable/inbox/`.
 * Front ends delete the items they handle.
 */

export const INBOX_DIR = ".clodable/inbox";

export interface PageRef {
  url: string;
  path: string;
  title?: string;
}

export interface SourceRef {
  file: string;
  line: number;
  column?: number;
  /** The element's tag, e.g. "h1", or a component name. */
  element?: string;
}

export type InboxItem = (
  | {
      kind: "fix";
      id: string;
      createdAt: string;
      page: PageRef;
      error: {
        message: string;
        stack?: string;
        source?: SourceRef;
        kind: "runtime" | "build" | "promise";
      };
      /** The last few console errors before the crash, for context. */
      console?: string[];
    }
  | {
      kind: "edit";
      id: string;
      createdAt: string;
      page: PageRef;
      source: SourceRef;
      before: string;
      after: string;
    }
  | {
      kind: "ask";
      id: string;
      createdAt: string;
      page: PageRef;
      source?: SourceRef;
      /** What the builder typed about the element. */
      request: string;
      /** A short description of the element: tag, text, classes. */
      element?: string;
    }
) & {
  /** The conversation whose preview pane sent it, when that pane was labelled (see claimInbox). */
  conversation?: string;
};

export type NewInboxItem = InboxItem extends infer T
  ? T extends InboxItem
    ? Omit<T, "id" | "createdAt">
    : never
  : never;

const Page = z.object({ url: z.string(), path: z.string(), title: z.string().optional() });
const Source = z.object({
  file: z.string(),
  line: z.number().int(),
  column: z.number().int().optional(),
  element: z.string().optional(),
});
const ToolbarRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fix"),
    page: Page,
    error: z.object({
      message: z.string(),
      stack: z.string().optional(),
      source: Source.optional(),
      kind: z.enum(["runtime", "build", "promise"]),
    }),
    console: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("ask"),
    page: Page,
    source: Source.optional(),
    request: z.string().min(1),
    element: z.string().optional(),
  }),
]);

/**
 * What the preview toolbar posts (Try to fix, Point & ask), checked: the toolbar runs inside the
 * app's page, so the front end only ever reads the fields it expects. Anything else is undefined.
 */
export function toolbarRequest(body: unknown): NewInboxItem | undefined {
  const parsed = ToolbarRequest.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

/** The page a toolbar request came from, checked. */
export function toolbarPage(value: unknown): PageRef | undefined {
  const parsed = Page.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function writeInbox(root: string, item: NewInboxItem): Promise<InboxItem> {
  const createdAt = new Date().toISOString();
  const id = `${item.kind}-${createdAt.replace(/[-:.TZ]/g, "")}-${randomBytes(3).toString("hex")}`;
  const full = { ...item, id, createdAt } as InboxItem;
  // Readers take only `.json` files, so they never see one being written.
  await writeJsonFile(join(root, INBOX_DIR, `${id}.json`), full);
  return full;
}

export async function readInbox(root: string): Promise<InboxItem[]> {
  const dir = join(root, INBOX_DIR);
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  const items: InboxItem[] = [];
  for (const name of names) {
    try {
      items.push(JSON.parse(await readFile(join(dir, name), "utf8")) as InboxItem);
    } catch {
      // A malformed item is dropped so it can't block the queue.
      await rm(join(dir, name), { force: true });
    }
  }
  return items;
}

export async function ackInbox(root: string, id: string): Promise<void> {
  if (!/^[\w-]+$/.test(id)) return;
  await rm(join(root, INBOX_DIR, `${id}.json`), { force: true });
}

/**
 * Several conversations can be open on the same app (Desktop keeps older ones running), and they
 * all see this inbox. Each one says it's there with a small file, `.clodable/local/session-<id>.json`
 * holding `{ id, alive, active }` (epoch ms): `alive` every few seconds, `active` when its person
 * last typed or pressed something in it. The preview's requests go to the live one used last.
 */
export const PRESENCE_DIR = ".clodable/local";
const LIVE_MS = 20_000;
const GONE_MS = 24 * 60 * 60_000;

export interface Presence {
  id: string;
  alive: number;
  active: number;
}

/** The conversations open on the app right now, by id. Ones gone for a day are tidied away. */
async function livePresences(root: string, now: number): Promise<Map<string, Presence>> {
  const live = new Map<string, Presence>();
  const dir = join(root, PRESENCE_DIR);
  if (!existsSync(dir)) return live;
  for (const name of await readdir(dir)) {
    if (!/^session-[\w-]+\.json$/.test(name)) continue;
    let presence: Presence;
    try {
      presence = JSON.parse(await readFile(join(dir, name), "utf8")) as Presence;
    } catch {
      continue;
    }
    if (now - presence.alive > GONE_MS) await rm(join(dir, name), { force: true });
    else if (now - presence.alive <= LIVE_MS) live.set(presence.id, presence);
  }
  return live;
}

function usedLast(live: Map<string, Presence>): string | undefined {
  let owner: Presence | undefined;
  for (const presence of live.values()) {
    if (
      !owner ||
      presence.active > owner.active ||
      (presence.active === owner.active && presence.id > owner.id)
    ) {
      owner = presence;
    }
  }
  return owner?.id;
}

/** The conversation that takes requests from a preview that didn't say whose it is. */
export async function inboxOwner(root: string, now = Date.now()): Promise<string | undefined> {
  return usedLast(await livePresences(root, now));
}

/**
 * Take the waiting requests that are this conversation's. A request from a labelled preview pane
 * belongs to that pane's conversation while it's open; any other goes to the live conversation
 * used last; with no conversation saying it's there, to whoever asks. Each request goes to
 * exactly one taker: claiming renames the file, and only one rename can win.
 */
export async function claimInbox(root: string, session: string): Promise<InboxItem[]> {
  if (!/^[\w-]+$/.test(session)) return [];
  const dir = join(root, INBOX_DIR);
  if (!existsSync(dir)) return [];
  const live = await livePresences(root, Date.now());
  const owner = usedLast(live);
  const items: InboxItem[] = [];
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".json")).sort()) {
    const path = join(dir, name);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch {
      continue; // Another conversation took it meanwhile.
    }
    let item: InboxItem;
    try {
      item = JSON.parse(text) as InboxItem;
    } catch {
      await rm(path, { force: true }); // A malformed request can't be anyone's: drop it.
      continue;
    }
    const mine =
      item.conversation && live.has(item.conversation)
        ? item.conversation === session
        : !owner || owner === session;
    if (!mine) continue;
    const claimed = join(dir, `.${name}.${session}.claimed`);
    try {
      await rename(path, claimed);
    } catch {
      continue;
    }
    items.push(item);
    await rm(claimed, { force: true });
  }
  return items;
}
