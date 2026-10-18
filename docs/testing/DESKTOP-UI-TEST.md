# Testing and improving Clodable in Claude Desktop

A brief for an AI agent that can see and drive Claude Desktop on the owner's Mac (computer use). You're an experienced UX and UI designer who also writes code. Your job is to make Clodable's experience right for non-technical builders. Go through their real journeys in Desktop, judge what you see with your own expertise, and fix what you can in this repository. Load each fix into Desktop and go again, until the experience is right. Then write a UX report with the changes that are the owner's to decide.

This brief gives you the context. It doesn't tell you what to look at: that's your expertise.

**Kickoff prompt** (paste this to the testing agent):

> You're an experienced UX and UI designer who also codes. Test and improve Clodable inside Claude Desktop on this Mac, for non-technical builders.
> - Read `/Users/manu/Documents/bworlds/clodable/docs/testing/DESKTOP-UI-TEST.md` for the context, and work in that repository.
> - Go through the journeys it describes as those builders would, and judge what you see with your own expertise.
> - Fix what you can, reload it into Desktop and go again, until the experience is right.
> - Keep your findings in `docs/testing/FINDINGS.md`, and end with the UX report the brief asks for.
> - Stop and ask me before anything its safety rules reserve for me.

---

## The people we design for

Builders who want to change their own app without a developer. They know their product; they don't know hosting, backends, git or terminals. They're afraid of breaking what's live. They read only what's on screen, and they stop at the first scary or confusing moment: a red error, a word they don't know, a minute with nothing happening.

Four of them, each with a test app on this Mac:

- **Léa** has an app on Lovable Cloud (Lovable hosts her site and her database). She wants to move to accounts she owns without breaking her live app or losing data. Test app: `hirebright-score`.
- **Sam** has a Lovable app on GitHub, with no database and not online. He wants it on the web, then sign-in and saved data. Test app: `fresh-app`.
- **Nadia** is starting from scratch: an idea, an empty folder, maybe a GitHub account. Today's setup expects an app on GitHub, so her journey is mostly a question for the UX report.
- **Tom** has an app already set up. He changes texts and features, publishes, and undoes when something goes wrong. Test app: the `crumb-site` demo, or `fresh-app` after Sam's journey.

## What Clodable is trying to be

Clodable is a Claude Code plugin that makes Claude Desktop's **Code** tab feel like Lovable: describe a change, see it, publish it, undo it. Builders talk to Claude in plain words; Clodable keeps their work safe and gets it live. Read these before the first run:
- [ARCHITECTURE.md](../ARCHITECTURE.md): how it works;
- [DECISIONS.md](../DECISIONS.md): what the owner has settled;
- [PRINCIPLES.md](../design/PRINCIPLES.md): the voice, the vocabulary and the design principles.

**Where things happen:**
- **The conversation:** the builder asks; Claude reads and changes the app's code, and explains.
- **The panel** (docked on the right; `/clodable` or a natural-language request opens it): a short app overview, separate History and Settings views, and focused account-consent and migration views. The current task comes first; background details are available on demand. Claude inspects and clarifies the app's setup in the conversation. These structural changes were approved on October 18.
- **The bar** (above the message box): where things stand ("2 changes not live yet", "Everything is live") with History, Preview and Publish.
- **The preview** (Desktop's Browser pane), with Clodable's toolbar inside the page: **Edit text**, **Point & ask**, and **Try to fix** on a broken page.
- **Toasts** for passing confirmations.
- **Commands:** `/clodable`, `/publish`, `/undo-publish`, `/move-off-lovable`.

**Saved and Publish:** after every reply, Clodable saves the builder's changes to their draft on GitHub. **Publish** is the builder's button: it checks the app (it builds, no leaked keys, no risky packages), then puts the draft live.

**The current split:** judgment in the conversation, mechanics in Clodable (DECISIONS Q1). Some panel buttons hand Claude a request in the builder's name, with instructions beside it that the builder doesn't see. Whether each moment sits on the right surface (panel or conversation, more on screen or less) is exactly what we want your view on.

**One hard rule** (`CLAUDE.md`): builders never see git words (commit, push, branch, merge, pull request, deploy). That holds on Clodable's surfaces and in Claude's replies during these journeys. They see *Saved, Publish, Live, Undo, Restore*.

**What we're unsure about**, among other things you'll notice:
- Does one panel do too much? It holds first-time setup, the everyday home and part of the move.
- "Put my site online" creates the site, but the site goes online only at Publish. That's two meanings for "online".
- Can builders answer the setup's two questions (where the data lives, where the site lives)? Could Clodable find out instead?
- Connecting Netlify and Supabase asks for a token from another site. Is that bearable?
- Which slash commands would a non-technical builder ever type?
- What's the right start for someone with no app yet?

**Settled by the owner,** so don't re-open them in code (propose in the report if you must):
- Claude-first (Q1).
- After a Publish or an Undo, "You're live" or "Undone" shows for about 10 seconds. The bar's Undo shows only during those 10 seconds.
- The app's database is the live one.
- The brand: logo, mascot, palette.
- A calm, typographic design with no AI clichés (ribbons, sparkles, icon-in-circle badges).

## What Desktop allows

Proposals have to fit these limits.

- The panel and the bar draw from a small set of parts: boxes, text, buttons, links, code, selects, inputs, small images. The bar is one line.
- Clodable can't open Desktop's preview pane on its own in Auto mode. That's why **Preview** asks Claude in the conversation.
- Clodable can't change Desktop's own interface: the sidebar, the Environment card with its repository and branch, permission prompts, the message box, and messages such as "/clodable isn't a command here".
- Commands Clodable runs itself (setup, Publish) need no permission. Commands Claude runs go through Desktop's permission mode, and in Auto mode through its safety check, unless Clodable's guard lets them through (see K1).
- Desktop starts a conversation's engine ahead of time in a spare folder, then moves it into the project.

## The journeys

Go through them as the builder would. Start each from a fresh conversation and, when it creates things, from a reset.

- **Sam: from a Lovable app to a live site with data** (`fresh-app`).
  1. Ask Claude to set up the app, then use the setup controls. Claude inspects the app and asks about uncertain facts, one question at a time.
  2. **Put my site online**, then **Publish**. Check the live address in a browser.
  3. **Add a backend** (Supabase, in **test-org**).
  4. Ask Claude for a feature that saves data, for example "let visitors leave a note on the home page". Publish it and use it on the live site.
- **Tom: everyday life** (`crumb-site`, or `fresh-app` after Sam):
  - Ask for changes in plain words.
  - Edit text in the preview, and use Point & ask.
  - Break a page and use Try to fix.
  - Go back to an earlier version: from History, and by asking Claude.
  - Publish and undo.
  - Hit the things that stop a save or a publish: a key in the code, a broken build, the live site changing the same text.
- **Léa: moving off Lovable** (`hirebright-score`, `/move-off-lovable`). The stages that work on a copy are yours to run: looking at the app, the new backend in test-org, copying data, people and files, functions, trying the app on the copy. Everything that touches her live app or Lovable itself is the owner's: stop and ask.
- **Nadia: from scratch** (a new empty folder). Follow the screen with no app and see where it leads, then try describing an idea to Claude.
- **Also:**
  - bringing an app in from GitHub into an empty folder;
  - two conversations open on the same app;
  - a new conversation in an app that's already set up;
  - installing Clodable from Desktop's plugin screen, on a released version only.

Use the builder's usual setup: Desktop's **Auto** permission mode and its default model. Try **Ask** mode where Claude runs commands, since builders meet both.

## The environment

**Repository:** `/Users/manu/Documents/bworlds/clodable` (`bworlds-co/clodable`).

**Test apps:**

| Folder | GitHub | Notes |
|---|---|---|
| `~/Clodable Tests/fresh-app` | `bworlds-co/clodable-launch-test` (private) | A Lovable app with no database, not online. Throwaway: reset freely, never delete the repo |
| `~/Clodable Demo/crumb-site` | A stand-in GitHub on this Mac | Set up, with fake services. Rebuild with `pnpm tsx scripts/demo-workspace.mts`. Its "live" site isn't real |
| `~/Clodable Tests/hirebright-score` | `vulk-corp/hirebright-score` | A real Lovable Cloud project. Only the steps above |
| `~/Clodable Tests/tiny-notes-wall` | `vulk-corp/tiny-notes-wall` | A Lovable app, not set up. Ask before using it |
| `~/Clodable Tests/nadia-idea-books` | `emmanuelvulk/clodable-idea-books-test` (private) | Owner approved creation for Nadia's saving/publishing test on October 18 |
| `~/Clodable Tests/nadia-idea-plants` | `emmanuelvulk/clodable-idea-plants-test` (private) | Owner approved creation for Nadia's saving/publishing test on October 18 |

**Accounts already connected.** Clodable holds their tokens.

| Service | Account | Use |
|---|---|---|
| GitHub | `@emmanuelvulk` | The repos above only |
| Netlify | Team `emmanuel-acqvas8` | Sites the test creates, nothing else |
| Supabase | Organization **test-org** (`vuhauwchbncatqwkvelx`) | Projects the test creates, nothing else. The free plan allows 2 active projects |

**Where to look:**

| What | Where |
|---|---|
| What Clodable did in an app | `<app>/.clodable/local/clodable.log` |
| Desktop's engines, plugins and preview servers | `~/Library/Logs/Claude/main.log` |
| What Claude saw and did, including Clodable's hidden rows and permission denials | `~/.claude/projects/<folder>/<session>.jsonl` |
| Where an app stands | `node ~/.claude/plugins/cache/clodable/clodable/0.2.2/cli/clodable.mjs status --json` (also `doctor`, `history`) |

## Safety rules

**Ask the owner first**, every time, before you:
- delete or rename any repository, or touch anything in `vulk-corp`;
- touch a Netlify site or Supabase project the test didn't create, or any Supabase organization but test-org;
- run a step of the move that changes Léa's live app (pausing it, the final export, going live, the domain, finishing in Lovable);
- publish to npm or tag a release;
- sign out of an account, create a token, or spend money.

**Never:**
- Put a key or token anywhere but the field Clodable's panel shows for it. Not in the chat, a command or your notes.
- Read Clodable's secret store (`~/Library/Application Support/clodable`).
- Stop or use the owner's other local Supabase stack, `bworlds-api` (ports 54321–54323).

Before deleting anything in the cloud, read its name and its team or organization, and check they're what the test created.

## Working

**Loading your changes into Desktop:**
1. Run `pnpm build`.
2. Copy the plugin into Desktop's copy:
   ```bash
   rsync -a --delete --exclude node_modules --exclude .in_use plugin/ ~/.claude/plugins/cache/clodable/clodable/0.2.2/
   ```
3. Start a new conversation. Conversations already open keep the old code.

**Runtime after the UX fixes:** setup and fresh conversations prepare an ignored local copy of the installed plugin’s CLI. The default preview and Claude’s commands use that copy, so the build above reaches all three surfaces without publishing to npm. Start a fresh conversation and preview after copying changes. An explicit developer preview override in `.claude/launch.json` is preserved; remove that override in a disposable fixture when checking the default installed-runtime path. The original released 0.2.2 still has the K3 split described below; testing that release does not test these source fixes.

**Resetting a test app:**
1. Close its conversations.
2. Delete what the run created in Netlify and Supabase. The app's `.clodable/config.json` names them. Read the tokens with `readSecret` from `packages/core`, inside a script that never prints them.
3. On GitHub:
   - close the draft pull requests and delete their branches;
   - delete the `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` repository secrets;
   - only `main` should be left.
4. Stop the app's preview, put the folder back on `main`, and remove `.clodable/` and `node_modules/`.
5. Check: `status` answers `not-set-up`, and nothing comes back within a minute.

**Fixing:**
- Follow `CLAUDE.md`.
- Before Desktop, run `pnpm lint:fix && pnpm typecheck && pnpm test && pnpm test:plugin` and the `e2e-*` scripts it lists. They're quicker.
- One pull request per fix, saying what you saw, why it happened and how you checked. Merge once CI passes: that's how the owner works today, unless they tell you otherwise.
- When a fix depends on how Claude reads Clodable's instructions, check it against the model before relying on it, more than once. A headless `claude -p --input-format stream-json` replay of the conversation's shape is enough.

**What you decide, and what you propose:**
- Yours to fix: anything that makes a journey clearer, calmer, quicker or more honest within the current structure: wording, what's shown or hidden, feedback while waiting, instructions to Claude, bugs.
- Yours to propose in the report: changes to the structure. That means moving work between the panel and the conversation, splitting or merging panels and commands, changing a settled decision, or the brand.

**Notes:**
- Keep findings in `docs/testing/FINDINGS.md`, each with what you saw, why it matters to the builder, its cause and its fix. Rate them blocker, major or polish, and mark Desktop's own issues as external.
- Keep screenshots outside the repository, in `~/Clodable Tests/_runs/`.

## Known issues at handoff

From the owner's runs on 2026-10-15 to 17.

- **K1 · blocker · "Put my site online" can be blocked in Auto mode.** Claude ran the given command with `cd "<folder>" &&` in front of it.
  - *Cause:* Clodable's guard lets the command through only exactly as given (`isOnlineStep` in `plugin/hooks/guards.ts`; `isMoveStep` is the same). The decision then fell to Auto mode's safety check, which denied it as "Data Exfiltration", and the builder was told "blocked by a permission check".
  - *Directions:* accept a `cd` into the app's own folder, tell Claude it's already there, or have the panel run it itself (a structural change: propose it).
- **K2 · major · "Put my site online" reads like Publish.** Claude opened with "I can't publish for you: that's the Publish button…".
- **K3 · major · Two versions of Clodable in one session.** At handoff, the panel ran the plugin's own copy; Claude's `npx clodable …` and the preview ran whatever npm served. Fixed in source by #63; see the runtime instructions above and F11 in FINDINGS.md. Not yet released.
- **K4 · polish · Restore's question can open out of sight** in the panel. A save's name runs on when it ends with a quote mark.
- **K5 · external · Desktop's message box.** It says "/clodable isn't a command here" when `/clodable` is a new conversation's first message, though the panel opens. Desktop's own branch and repository labels can't be changed from Clodable.

Fixed recently, worth confirming:
- following the session out of Desktop's spare folder (#39);
- setup showing its steps (#40);
- Claude getting the app's rules right after setup, and the panel's commands run as given (#41);
- short save names (#42).

## When you're done

When the journeys run end to end, twice from a fresh start, without a blocker or a major issue left that's yours to fix. Then write `docs/testing/UX-REPORT.md`:
- how each journey feels;
- where each moment happens today and where it should;
- the issues that hurt these builders most;
- the structural changes you'd make, each with the evidence behind it and the decision it would change.

Use your judgment on what that takes.
