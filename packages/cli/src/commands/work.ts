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
import { tr } from "../i18n.js";
import { ash, celadon, clay, label, link, ochre } from "../ui.js";

const plural = (n: number, word: "change" | "file" | "newer publish") => {
  const forms = {
    change: ["{count} change", "{count} changes"],
    file: ["{count} file", "{count} files"],
    "newer publish": ["{count} newer publish", "{count} newer publishes"],
  } as const;
  return tr(forms[word][n === 1 ? 0 : 1], { count: n });
};

function renderSave(ctx: Context, result: SaveResult) {
  const { out } = ctx;
  if (!result.saved && result.pushed) {
    out.line(tr("{0} Everything is already saved", { "0": celadon("✓") }));
  } else if (result.unscanned && !result.offline) {
    out.line(
      tr("{0} Saved on this computer. It goes to GitHub once it's been checked for secret keys.", {
        "0": ochre("!"),
      }),
    );
    out.line(ash(`  ${result.unscanned}`));
  } else if (result.offline || !result.pushed) {
    out.line(
      tr("{0} Saved on this computer. It goes up to GitHub when you're back online.", {
        "0": ochre("!"),
      }),
    );
  } else {
    out.line(
      tr("{0} Saved {1}", {
        "0": celadon("✓"),
        "1": ash(
          `· ${tr("{changes} not live yet", { changes: plural(result.unpublished, "change") })}`,
        ),
      }),
    );
  }
  for (const note of result.notes ?? [])
    out.line(tr("{0} Worth a look: {1}", { "0": ochre("!"), "1": note }));
  if (result.conflicts?.length) {
    out.line(
      tr("{0} Your draft also changed on another computer, and both changed the same thing.", {
        "0": ochre("!"),
      }),
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
          ? ash(tr("nothing waiting to go live"))
          : tr("{changes} not live yet", { changes: clay(plural(s.unpublished.length, "change")) });
      out.line(`${label(tr("Draft"))}${draftLine}`);
      for (const commit of s.unpublished.slice(0, 5)) {
        out.line(`${label("")}${ash("·")} ${commit.subject} ${ash(formatRelative(commit.date))}`);
      }
      if (s.unpublished.length > 5)
        out.line(
          `${label("")}${ash(tr("… and {count} more", { count: s.unpublished.length - 5 }))}`,
        );
      if (s.unsaved > 0)
        out.line(
          tr("{0}{1} changed since the last save", {
            "0": label(tr("Unsaved")),
            "1": plural(s.unsaved, "file"),
          }),
        );
      if (s.conflicts.length > 0) {
        out.line(
          `${label(tr("Attention"))}${ochre(tr("Combining with the live site:"))} ${s.conflicts.join(", ")}`,
        );
      }
      if (s.behindLive > 0) {
        out.line(
          tr("{0}{1}, brought in when you publish", {
            "0": label(tr("Live site")),
            "1": plural(s.behindLive, "newer publish"),
          }),
        );
      }
      const live = s.lastPublish
        ? `${s.lastPublish.url ? `${link(s.lastPublish.url)} ${ash("·")} ` : ""}${ash(tr("published {when}", { when: formatRelative(s.lastPublish.at) }))}`
        : s.project.liveUrl
          ? link(s.project.liveUrl)
          : ash(tr("not published with Clodable yet"));
      out.line(`${label(tr("Live"))}${live}`);
      if (s.pullRequest) out.line(`${label(tr("On GitHub"))}${link(s.pullRequest.url)}`);
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
      out.header(tr("history"));
      out.line(pc.bold(tr("Your draft")));
      if (h.draft.length === 0) out.line(ash(tr("  Nothing waiting to go live.")));
      else if (h.sameAsLive) out.line(ash(tr("  Same as your live site: nothing to publish.")));
      for (const c of h.draft) {
        out.line(
          `  ${clay("●")} ${c.subject} ${ash(`· ${formatRelative(c.date)} · ${c.sha.slice(0, 7)}`)}`,
        );
      }
      out.line();
      out.line(pc.bold(tr("Published")));
      for (const c of h.published) {
        const mark = c.kind === "undo" ? ochre("↺") : celadon("●");
        out.line(
          `  ${mark} ${c.subject} ${ash(`· ${formatRelative(c.date)} · ${c.sha.slice(0, 7)}`)}`,
        );
      }
      out.line();
      out.line(ash(tr("Bring back any version:  clodable restore <code>")));
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
        ctx.out.line(
          tr("{0} Your app already looks like this version: nothing changed", {
            "0": celadon("✓"),
          }),
        );
        return;
      }
      ctx.out.line(
        tr("{0} Restored {1}", {
          "0": celadon("✓"),
          "1": ash(tr("· saved as a new version, nothing was erased")),
        }),
      );
      if (!result.pushed) ctx.out.line(ash(tr("  It goes up to GitHub when you're back online.")));
    },
  );
}

const describeItem = (item: InboxItem) =>
  item.kind === "fix"
    ? tr("Fix: {message}", { message: item.error.message })
    : item.kind === "edit"
      ? tr("Edited text on {path}", { path: item.page.path })
      : tr("Request on {path}: {request}", { path: item.page.path, request: item.request });

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
      if (items.length === 0) ctx.out.line(ash(tr("The inbox is empty.")));
      for (const item of items) ctx.out.line(`${clay("●")} ${describeItem(item)} ${ash(item.id)}`);
    },
  );
}
