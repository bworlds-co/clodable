import {
  ackInbox,
  claimInbox,
  formatRelative,
  history,
  type InboxItem,
  readInbox,
  restore,
  type SaveResult,
  save,
  status,
} from "@clodable/core";
import pc from "picocolors";
import { type Context, run } from "../context.js";
import { ash, celadon, clay, label, link, ochre } from "../ui.js";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function renderSave(ctx: Context, result: SaveResult) {
  const { out } = ctx;
  if (!result.saved && result.pushed) {
    out.line(`${celadon("✓")} Everything is already saved`);
  } else if (result.unscanned && !result.offline) {
    out.line(
      `${ochre("!")} Saved on this computer. It goes to GitHub once it's been checked for secret keys.`,
    );
    out.line(ash(`  ${result.unscanned}`));
  } else if (result.offline || !result.pushed) {
    out.line(`${ochre("!")} Saved on this computer. It goes up to GitHub when you're back online.`);
  } else {
    out.line(
      `${celadon("✓")} Saved ${ash(`· ${plural(result.unpublished, "change")} not live yet`)}`,
    );
  }
  for (const note of result.notes ?? []) out.line(`${ochre("!")} Worth a look: ${note}`);
  if (result.conflicts?.length) {
    out.line(
      `${ochre("!")} Your draft also changed on another computer, and both changed the same thing.`,
    );
    out.line(ash(`  ${result.conflicts.join(", ")}`));
  }
}

export async function saveCommand(ctx: Context, options: { message?: string }) {
  await run(
    ctx,
    async () => save(await ctx.workspace(), options.message ? { message: options.message } : {}),
    (result) => renderSave(ctx, result),
  );
}

export async function statusCommand(ctx: Context, options: { fetch?: boolean }) {
  await run(
    ctx,
    async () => status(await ctx.workspace(), { fetch: Boolean(options.fetch) }),
    (s) => {
      const { out } = ctx;
      out.header(`${s.project.name}`);
      const draftLine =
        s.unpublished.length === 0
          ? ash("nothing waiting to go live")
          : `${clay(plural(s.unpublished.length, "change"))} not live yet`;
      out.line(`${label("Draft")}${draftLine}`);
      for (const commit of s.unpublished.slice(0, 5)) {
        out.line(`${label("")}${ash("·")} ${commit.subject} ${ash(formatRelative(commit.date))}`);
      }
      if (s.unpublished.length > 5)
        out.line(`${label("")}${ash(`… and ${s.unpublished.length - 5} more`)}`);
      if (s.unsaved > 0)
        out.line(`${label("Unsaved")}${plural(s.unsaved, "file")} changed since the last save`);
      if (s.conflicts.length > 0) {
        out.line(
          `${label("Attention")}${ochre("Combining with the live site:")} ${s.conflicts.join(", ")}`,
        );
      }
      if (s.behindLive > 0) {
        out.line(
          `${label("Live site")}${plural(s.behindLive, "newer publish")}, brought in when you publish`,
        );
      }
      const live = s.lastPublish
        ? `${s.lastPublish.url ? `${link(s.lastPublish.url)} ${ash("·")} ` : ""}${ash(`published ${formatRelative(s.lastPublish.at)}`)}`
        : s.project.liveUrl
          ? link(s.project.liveUrl)
          : ash("not published with Clodable yet");
      out.line(`${label("Live")}${live}`);
      if (s.pullRequest) out.line(`${label("On GitHub")}${link(s.pullRequest.url)}`);
      out.line();
    },
  );
}

export async function historyCommand(ctx: Context, options: { limit?: number }) {
  await run(
    ctx,
    async () => history(await ctx.workspace(), options.limit ? { limit: options.limit } : {}),
    (h) => {
      const { out } = ctx;
      out.header("history");
      out.line(pc.bold("Your draft"));
      if (h.draft.length === 0) out.line(ash("  Nothing waiting to go live."));
      else if (h.sameAsLive) out.line(ash("  Same as your live site: nothing to publish."));
      for (const c of h.draft) {
        out.line(
          `  ${clay("●")} ${c.subject} ${ash(`· ${formatRelative(c.date)} · ${c.sha.slice(0, 7)}`)}`,
        );
      }
      out.line();
      out.line(pc.bold("Published"));
      for (const c of h.published) {
        const mark = c.kind === "undo" ? ochre("↺") : celadon("●");
        out.line(
          `  ${mark} ${c.subject} ${ash(`· ${formatRelative(c.date)} · ${c.sha.slice(0, 7)}`)}`,
        );
      }
      out.line();
      out.line(ash("Bring back any version:  clodable restore <code>"));
      out.line();
    },
  );
}

export async function restoreCommand(ctx: Context, sha: string) {
  await run(
    ctx,
    async () => restore(await ctx.workspace(), sha),
    (result) => {
      if (!result.saved) {
        ctx.out.line(`${celadon("✓")} Your app already looks like this version: nothing changed`);
        return;
      }
      ctx.out.line(
        `${celadon("✓")} Restored ${ash(`· saved as a new version, nothing was erased`)}`,
      );
      if (!result.pushed) ctx.out.line(ash("  It goes up to GitHub when you're back online."));
    },
  );
}

const describeItem = (item: InboxItem) =>
  item.kind === "fix"
    ? `Fix: ${item.error.message}`
    : item.kind === "edit"
      ? `Edited text on ${item.page.path}`
      : `Request on ${item.page.path}: ${item.request}`;

export async function inboxCommand(ctx: Context, options: { ack?: string; claim?: string }) {
  await run(
    ctx,
    async () => {
      const ws = await ctx.workspace();
      if (options.claim) return claimInbox(ws.root, options.claim);
      if (options.ack) await ackInbox(ws.root, options.ack);
      return readInbox(ws.root);
    },
    (items) => {
      if (items.length === 0) ctx.out.line(ash("The inbox is empty."));
      for (const item of items) ctx.out.line(`${clay("●")} ${describeItem(item)} ${ash(item.id)}`);
    },
  );
}
