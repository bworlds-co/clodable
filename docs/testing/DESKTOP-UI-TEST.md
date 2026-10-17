# Clodable in Claude Desktop: the full test, for an AI that sees the screen

This is the test plan for an AI agent that can see and drive Claude Desktop on the owner's Mac (computer use). The agent works in a loop:

1. Run the flows below the way a non-technical builder would.
2. After every step, judge the moment with the [UX lens](#91-the-ux-lens-after-every-step): too much or too little shown, and the right place for it (panel, conversation, bar, preview or a toast).
3. Record what it sees.
4. Fix what's wrong in this repository.
5. Load the fix into Desktop and run the flows again.
6. Stop when the [definition of done](#11-definition-of-done) is met.

Then it writes a [UX report](#95-the-ux-report) on how the experience should be shaped for each use case.

**Kickoff prompt** (paste this to the testing agent):

> You are testing Clodable inside Claude Desktop on this Mac. Read `/Users/manu/Documents/bworlds/clodable/docs/testing/DESKTOP-UI-TEST.md` and follow it from start to end. Work in that repository.
> - Run the scenarios as a non-technical builder would.
> - After every step, apply the plan's UX lens: whether the screen showed too much or too little, and whether that moment belongs in Clodable's panel, the conversation, the bar, the preview or a toast. Note it in the run sheet.
> - Record every finding in `docs/testing/FINDINGS.md`.
> - Fix what you can in this repository, following `CLAUDE.md`, and reload the fix into Desktop. Repeat until the definition of done is met.
> - Then write the UX report the plan describes.
> - Before anything the plan's safety rules reserve for me, stop and ask.

---

## Contents

1. [Who we test for](#1-who-we-test-for)
2. [The product in one page](#2-the-product-in-one-page)
3. [The test environment](#3-the-test-environment)
4. [Safety rules](#4-safety-rules)
5. [Seeing and driving Desktop](#5-seeing-and-driving-desktop)
6. [Testing unreleased code](#6-testing-unreleased-code)
7. [Resetting between runs](#7-resetting-between-runs)
8. [The scenarios](#8-the-scenarios)
9. [The UX review, at every step](#9-the-ux-review-at-every-step)
10. [The fix loop](#10-the-fix-loop)
11. [Definition of done](#11-definition-of-done)
12. [Known issues at handoff](#12-known-issues-at-handoff)
13. [Appendix: what the builder sees](#13-appendix-what-the-builder-sees)

---

## 1. Who we test for

Builders who want to change their own app without a developer. They know their product. They don't know hosting, backends, git or terminals, and they're afraid of breaking what's live. Judge every screen through the eyes of these four people:

| Persona | Starting point | What they want | Test app |
|---|---|---|---|
| **Léa, leaving Lovable** | An app on Lovable Cloud (Lovable hosts the site and the database) | Move to accounts she owns, without breaking her live app or losing data | `hirebright-score` |
| **Sam, Lovable app, nothing else** | A Lovable app on GitHub with no database and not online | Put it online and add a backend (sign-in, saved data) | `fresh-app` |
| **Nadia, starting from scratch** | An idea and an empty folder. Maybe a GitHub account, no app | Get an app she can change and publish | an empty folder |
| **Tom, the updater** | An app already set up with Clodable | Change texts, layouts and features, publish, undo when something goes wrong | `crumb-site` (demo) or `fresh-app` after Sam's run |

Two things about them shape every judgment:

- They read only the words on screen. A step that needs knowledge they don't have is a failure, even if it "works".
- They stop at the first scary or confusing moment. A red error, a git word or a silent minute counts as a stop.

## 2. The product in one page

Clodable is a Claude Code plugin. Builders use it in Claude Desktop's **Code** tab, where they talk to Claude in plain words. Read [ARCHITECTURE.md](../ARCHITECTURE.md), [DECISIONS.md](../DECISIONS.md) and [PRINCIPLES.md](../design/PRINCIPLES.md) before the first run.

- **The bar** sits above the message box, in apps Clodable set up. It shows where things stand ("2 changes not live yet", "Everything is live") with **History**, **Preview** and **Publish**.
- **The panel** ("Clodable", docked on the right) opens with `/clodable`.
  - It shows the setup until the app is set up.
  - Then the app: History, Worth a look, where the site and data live, the app's settings.
  - It also runs the move off Lovable (`/move-off-lovable`).
- **The preview** is Desktop's Browser pane, running the app. Clodable's **toolbar** sits inside the page: **Edit text** (⌥⇧E), **Point & ask** (⌥⇧A), Hide (⌥⇧H). An error overlay offers **Try to fix**.
- **Saved:** after every reply, Clodable saves the builder's changes to their draft on GitHub.
- **Publish:** the builder's button. It checks the app (build, leaked keys, risky packages), then puts the draft live.
- **Commands:** `/clodable`, `/publish`, `/undo-publish`, `/move-off-lovable`.
- **Judgment in Claude, mechanics in the CLI** (DECISIONS Q1). Some panel buttons hand Claude a request in the builder's words, with instructions beside it that the builder doesn't see.

**Vocabulary rule:** builders never see *commit, push, branch, merge, pull request, deploy, CI, production, main, migration, schema*. They see *Saved, Publish, Live, Undo, Restore, your draft, your database*. This covers the panel, the bar, the toolbar, toasts and Claude's replies in these flows.

## 3. The test environment

**Machine:** the owner's Mac, Claude Desktop with the Code tab. Desktop runs its own Claude Code engine (version in `~/Library/Application Support/Claude/claude-code/`).

**Product repository:** `/Users/manu/Documents/bworlds/clodable` (GitHub `bworlds-co/clodable`).

**Where Desktop loads Clodable from:** `~/.claude/plugins/cache/clodable/clodable/0.2.2/`. It's a copy: see [§6](#6-testing-unreleased-code).

**Accounts already connected on this Mac.** Don't create new tokens; Clodable already holds them.

| Service | Account | Use for tests |
|---|---|---|
| GitHub | `@emmanuelvulk` (GitHub CLI signed in) | Repos below only |
| Netlify | Team `emmanuel-acqvas8` ("Vulk") | Create and delete **test sites only** (names starting with the test app's name, e.g. `fresh-app-…`) |
| Supabase | Organization **test-org** (`vuhauwchbncatqwkvelx`) | Create and delete **projects in test-org only**. The free plan allows 2 active projects per organization |

**Test apps:**

| Folder | GitHub | State | Throwaway? |
|---|---|---|---|
| `~/Clodable Tests/fresh-app` | `bworlds-co/clodable-launch-test` (private) | Made with Lovable (Vite + React), no database, not online | **Yes.** Reset freely ([§7](#7-resetting-between-runs)). Never delete the repo |
| `~/Clodable Demo/crumb-site` | A stand-in GitHub on this Mac (`~/Clodable Demo/.github-fake/crumb-site.git`) | Set up; fake Supabase and live address | **Yes.** Rebuild with `pnpm tsx scripts/demo-workspace.mts`. Publishing can't be checked on a real live site |
| `~/Clodable Tests/hirebright-score` | `vulk-corp/hirebright-score` | Set up; on Lovable Cloud and Lovable hosting | **No.** A real Lovable project. Only the steps the owner approves ([§8 S7](#s7-moving-off-lovable-léa)) |
| `~/Clodable Tests/tiny-notes-wall` | `vulk-corp/tiny-notes-wall` | A Lovable app, not set up | Ask the owner before using it |
| An empty folder you create, e.g. `~/Clodable Tests/scratch-<n>` | none | Empty | **Yes.** Delete when done |

**Where to look when something's off:**

| What | Where |
|---|---|
| What Clodable tried in an app | `<app>/.clodable/local/clodable.log` (only in set-up apps) |
| Desktop's engines, spares, plugins and preview servers | `~/Library/Logs/Claude/main.log` |
| Everything Claude saw and did, including Clodable's hidden rows, tool calls and permission denials | `~/.claude/projects/<folder path with / and spaces as ->/<session>.jsonl` |
| Where an app stands | In the app folder: `node ~/.claude/plugins/cache/clodable/clodable/0.2.2/cli/clodable.mjs status --json` (also `doctor`, `history`) |
| GitHub | `gh pr list`, `gh api repos/<repo>/branches`, `gh secret list`, `gh run list` with `--repo <repo>` |

## 4. Safety rules

These hold in every run, in every loop iteration.

**Never, without the owner's explicit OK each time:**
- Delete or rename a repository, or anything in `vulk-corp`.
- Touch a Netlify site or Supabase project the test didn't create, or any Supabase organization but test-org.
- Run any step of the move off Lovable that changes Léa's live app: pausing it, the final export, going live, the domain, finishing in Lovable.
- Publish to npm, tag a release or change the marketplace.
- Sign out of GitHub, Netlify or Supabase, or create new tokens.
- Spend money: a paid Supabase project, a paid Netlify feature.

**Never at all:**
- Type, paste, print or log a key or token anywhere but the field Clodable's panel shows for it. That means never in the chat, a terminal command or a findings note.
- Read Clodable's secret store (`~/Library/Application Support/clodable`). Clodable's guard refuses commands that name it.
- Stop or use the owner's other local Supabase stack `bworlds-api` (ports 54321–54323). `scripts/e2e-move.mts` uses its own ports, 55320–55329.
- Push to `main` of this repository except through a reviewed pull request ([§10](#10-the-fix-loop)).

**Before deleting anything in the cloud, check its name.** Read it from the app's `.clodable/config.json` or the API, and compare its name and team or organization with what you expect. Use the pattern in [§7](#7-resetting-between-runs).

**Stop and ask** when an action would reach beyond these lists, when a dialog asks for credentials or payment, or when you're unsure whether something is live.

## 5. Seeing and driving Desktop

**Layout of the Code tab:**
- **Left sidebar:** folders and their conversations. A **+** next to a folder starts a new conversation there.
- **Centre:** the conversation, with the message box at the bottom.
  - **Bottom left:** the permission mode (e.g. "Auto").
  - **Bottom right:** the model (e.g. "Sonnet 5.5").
  - Clodable's bar sits just above the message box.
- **Top right:** Desktop's **Environment** card (folder, repository, branch). It's Desktop's, not Clodable's.
- **Right dock:** the **Clodable** panel, closed with ×. **Browser** (the preview) opens with the globe icon or ⌘⇧B.

**Where you run:** outside the conversation you're testing.
- Ideally, run from Claude Code in Terminal with computer use, in this repository.
- If you run as a Desktop conversation yourself, you switch away from it each time you open the test conversation. Your own conversation keeps running, but don't type into it while you test.

**How to work:**
- Take a screenshot after every action, and before judging. While a step shows "…" or "◐", wait and check every 2–5 seconds; don't click.
- Time every wait from the click to the next visible change. The builder notices anything over 2 seconds without feedback (PRINCIPLES 6).
- Read the words on screen as the builder would. Then check the logs and the transcript for the cause. The screen is the truth for the experience, the logs for the root cause.
- Start a **new conversation** after loading new plugin code, and for each scenario. Old conversations keep the old code and their own state.
- Use the builder's default setup: **Auto** permission mode and Desktop's default model. Run S3 and S4 once more in **Ask** mode (Desktop asks before each command), since builders meet both.
- If Desktop shows a system dialog you didn't expect, take a screenshot and stop.

## 6. Testing unreleased code

The plugin code under test is the repo's `plugin/` folder. After changing it:

```bash
pnpm build      # also rebuilds plugin/cli/clodable.mjs, the CLI the plugin runs
rsync -a --delete --exclude node_modules --exclude .in_use plugin/ ~/.claude/plugins/cache/clodable/clodable/0.2.2/
```

Then start a new conversation. Check that the copy has your change: `grep` for a new string in `~/.claude/plugins/cache/clodable/clodable/0.2.2/hooks/register.tsx`.

Two parts of a session **don't** use that copy:

- **The preview** runs `npx clodable dev`, which is the version on npm (0.2.2 today). To test changes to the preview, the toolbar or `clodable dev`, point the app's preview at the repo's build. Edit the `app` entry in the app's `.claude/launch.json`:
  ```json
  { "name": "app", "runtimeExecutable": "node", "runtimeArgs": ["/Users/manu/Documents/bworlds/clodable/packages/cli/dist/clodable.mjs", "dev"], "port": 8080, "autoPort": true }
  ```
  Clodable keeps an entry like this when it re-plans the app's files. Clodable saves the edit to the test app's draft; that's fine for test apps. The demo `crumb-site` already runs the repo's build.
- **Claude's own `npx clodable …` commands** come from the app's AGENTS.md and the guide skill (status, history, restore, database commands). They use the npm version too, and `npx` ignores a `clodable` placed on the PATH. A fix to those commands can't be seen in Desktop until it's released. Note such findings as "needs release to verify". That gap is itself a finding to weigh ([§12](#12-known-issues-at-handoff), K3).

Before Desktop, run the automated checks: `pnpm test`, `pnpm test:plugin`, and the scripts in `CLAUDE.md` (`e2e-edit`, `e2e-errors`, `e2e-move`). They're faster and catch regressions.

## 7. Resetting between runs

Reset everything a run created, so the next run starts where a real builder would. Do it in this order.

**1. Close the app's conversations** in Desktop. Open conversations keep writing Clodable's presence files for a few seconds after a reset.

**2. Cloud resources the run created.** Read them from `<app>/.clodable/config.json` first (`netlify.siteId`/`name`/`account`, `supabase.projectRef`).

Delete them with a name check, using Clodable's stored tokens inside a script that never prints them:

```ts
// pnpm tsx <script>.mts — run from the repository folder
import { NETLIFY_TOKEN, readSecret, SUPABASE_TOKEN } from "./packages/core/src/index.ts";
const netlify = await readSecret(NETLIFY_TOKEN);
const site = await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}`, {
  headers: { authorization: `Bearer ${netlify}` },
}).then((r) => r.json());
if (site.name === EXPECTED_NAME && site.account_slug === "emmanuel-acqvas8") {
  await fetch(`https://api.netlify.com/api/v1/sites/${SITE_ID}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${netlify}` },
  });
}
// Supabase: GET https://api.supabase.com/v1/projects/<ref>, check name and
// organization_slug === "vuhauwchbncatqwkvelx", then DELETE the same URL with the Supabase token.
```

**3. GitHub** (`fresh-app`'s repo is `bworlds-co/clodable-launch-test`):

```bash
R=bworlds-co/clodable-launch-test
gh pr list --repo $R --state open                             # check what's there first
gh pr close <n> --repo $R --delete-branch                     # each open draft pull request
gh secret list --repo $R                                      # NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID come from "Put my site online"
gh secret delete NETLIFY_AUTH_TOKEN --repo $R
gh secret delete NETLIFY_SITE_ID --repo $R
gh api repos/$R/branches --jq '.[].name'                      # only main should be left
```

**4. The folder:**
1. Stop its preview: kill processes whose working directory is the app folder (`lsof -a -p <pid> -d cwd`).
2. Then:
   ```bash
   git checkout main && git branch -D draft/emmanuelvulk && git fetch --prune origin
   rm -rf .clodable node_modules
   ```
3. Watch for a minute that `.clodable/` doesn't come back. If it does, an open conversation is still writing: close it and remove `.clodable/` again.

**5. Check:**
- `git status` is clean on `main`, equal to `origin/main`.
- `clodable status --json` answers `not-set-up`.
- Nothing is left in Netlify or Supabase.

**Demo app:** `pnpm tsx scripts/demo-workspace.mts` rebuilds `crumb-site` from scratch.

## 8. The scenarios

Each step has an **Expect** line: what the builder should see and roughly how long it takes. A step passes when what's on screen matches, the words follow the vocabulary rule, and every wait over 2 s shows progress. Record every difference as a finding ([§10](#10-the-fix-loop)), even when the flow still completes.

**After every step, whether it passed or not, apply the [UX lens](#91-the-ux-lens-after-every-step)** and write one line in the run sheet ([§10](#10-the-fix-loop)). Some steps also carry a **Reflect** line: a question that moment raises in particular. Answer it there too.

### S0. Installing Clodable (only when testing a released version)

1. In Desktop: **Customize › Plugins › Add › Add marketplace › Add from a repository**, enter `bworlds-co/clodable`.
   **Expect:** the marketplace is added.
2. **Discover**, then **Add** next to Clodable.
   **Expect:** Clodable shows as added, with its version.
3. Open an empty folder in the Code tab, type `/clodable`.
   **Expect:** the panel opens on the setup.
   Desktop may also say "/clodable isn't a command here." That's known and external (K6): record it only if the panel doesn't open.

### S1. Setting up an app that's already in the folder (Sam)

**Start:** `fresh-app` reset; new conversation in it; Auto mode.

1. Type `/clodable`.
   **Expect:** the panel says "Let's bring your app home. It takes a minute, once."
   - **1 · Tools**, with ✓ Node.js · version, ✓ Git, ✓ GitHub CLI, ✓ GitHub account · @emmanuelvulk. These read "Checking…" for at most a few seconds, never for good.
   - **2 · Your app**: "This folder already holds an app. Clodable can set itself up right here." with **Set up Clodable here**, and a line saying nothing goes live.
   **Reflect:**
   - When every tool is ✓, does Sam need to see the tools at all, or only when one is missing?
   - Is "Let's bring your app home" clear when the app is already in the folder?
2. Press **Set up Clodable here**.
   **Expect:** the button gives way to steps, each on one line, appearing as they run:
   - ✓ Your tools are ready
   - ✓ Added Clodable's files
   - ◐ Installing your app's packages… · a minute or two
   - ✓ Saved to your draft on GitHub
   Then the toast "Your app is ready. Ask Claude for any change.", all within about 3 minutes. No step stays silent over 10 s.
   **Reflect:**
   - Are these the steps Sam cares about, at the right grain?
   - Does "draft" mean anything to him yet?
   - The toast says "Ask Claude": does he know where, and what to ask first?
3. **Expect:** the panel turns to the app, asking two questions:
   - "Where does your app's data live?": On Lovable Cloud / In my own Supabase / No database yet
   - "Where is your site live?": On Lovable / Elsewhere (Netlify, Vercel…) / Not online yet
   Each has a one-line hint. Judge whether Sam could answer without help.
   **Reflect:**
   - Panel or conversation? Two fixed choices fit the panel. Would Claude asking in the conversation, after looking at the app's code, do better?
   - Could Clodable find the answers itself and ask only to confirm?
4. Answer **No database yet** and **Not online yet**.
   **Expect:** each answer shows as chosen at once. The panel then shows the site as not online, with **Put my site online**, and a quiet line for adding a backend.
5. **Expect, unprompted:** the bar appears ("Everything is saved" or "N changes not live yet") with History and Preview. The preview opens in Desktop's Browser pane with the app and Clodable's toolbar.
   **Reflect:**
   - The panel, the bar, the preview and the conversation are all on screen now. Does Sam know which one to look at next?
   - Does the panel still need to be open, or has it done its job?
6. Check the transcript: Claude received the app's AGENTS.md as a hidden row right after setup ("Clodable just set itself up in this folder…").

### S2. Bringing an app in from GitHub (Sam or Nadia)

**Start:** a new empty folder; new conversation in it.

1. `/clodable`.
   **Expect:** tools as in S1. **2 · Your app** asks for the app's GitHub repository (owner/name), with **Show my repositories**.
2. **Show my repositories**, pick `bworlds-co/clodable-launch-test`, **Bring it in**.
   **Expect:** steps as in S1, including "Brought in bworlds-co/clodable-launch-test". The app lands **in this folder**, because it was empty.
3. Repeat in a folder that already holds an unrelated file.
   **Expect:** the app is brought into a subfolder, and Clodable says to open that folder in a new session. Judge this moment for a non-technical builder.
   **Reflect:**
   - Typing "owner/name" is a developer's habit. Is the repository list enough?
   - Would asking Claude "bring in my app called …" in the conversation be more natural?

Delete these folders afterwards. The repo's draft gets the same reset as in [§7](#7-resetting-between-runs).

### S3. Putting the site online, then Publish (Sam)

**Start:** after S1, same or new conversation.

1. In the panel, press **Put my site online**.
   **Expect:**
   - If Netlify isn't connected: a "Netlify token" field with a link to Netlify's token page. Connecting is the owner's step; record how it reads.
   - Then **Netlify team**, then **Put my site online** again.
2. **Expect:** the conversation shows the builder's request, "Put my site online, then tell me what's left before people can see it."
   - Claude runs Clodable's site command **without** a "Failed" step, a permission denial or a question.
   - Within about 1 minute, Claude answers in plain words: the site's address, that it goes online when they press **Publish**, and anything left to paste.
   - The answer has no git words and no file list.

   **Reflect:**
   - **The hand-off.** A panel button just wrote a message in Sam's name in the conversation, and Claude did the work there. Is that hand-off clear to him, or surprising?
   - **Where it should run.** The work is mechanical (create a site, copy settings). Would it be better run by the panel with its own steps, leaving the conversation for questions (K1, K2)? What does the conversation add here that the panel can't?
3. **Expect:** the panel and bar say the site is ready to go online, with **Publish**.
4. Press **Publish**.
   **Expect:**
   - Within 100 ms, a short story of steps (checks, going live).
   - Then "You're live" with the address, for about 10 seconds; the bar's Undo shows only during those 10 s (the owner's choice).
   - Then the usual bar, "Everything is live".

   **Reflect:**
   - Publish sits in the bar and in the panel: is that duplication useful or noise?
   - Do the progress steps say enough to trust it, or too much to read?
5. Open the address in a browser.
   **Expect:** the app loads and matches the preview.
6. Check:
   - `gh run list --repo bworlds-co/clodable-launch-test` shows the Netlify workflow succeeding on `main`.
   - The Netlify site exists in team `emmanuel-acqvas8`.
7. Repeat steps 1–2 in **Ask** mode. **Expect:** at most one plain confirmation, with no scary wording.

### S4. Adding a backend, then a feature that saves data (Sam)

**Start:** after S3.

1. In the panel, the quiet "No database yet" line, then **Add a backend**.
   **Expect:**
   - The Supabase token field if not connected (the owner's step).
   - **Supabase organization**: pick **test-org**. Check the panel says how many free projects are left.
   **Reflect:**
   - "Organization", "region" and "token" are new words for Sam. Which of them could Clodable choose for him, with a way to change it?
   - Is "Add a backend" the right word for what he wants ("let people sign in", "save things")?
2. **Expect:** the request "Add a backend to my app in my Supabase organization “test-org”, then tell me what it lets me do." appears.
   - Claude runs Clodable's backend command with no denial. It takes about 2 minutes; judge what the builder sees meanwhile.
   - The plain answer says what a backend lets them add (sign-in, saving data, uploads). It doesn't build a feature yet.
3. Ask Claude: **"Let visitors leave a note on the home page, and show the latest notes."**
   **Expect:**
   - Claude asks before changing the live database, with Clodable's plain notice ("This changes your live database…").
   - After yes, the preview shows a working notes box.
   - The reply has no "migration", "schema" or "table" jargon unless explained.
   **Reflect:**
   - The question about the live database comes through Desktop's permission prompt, with Clodable's line under it. Is that the right place for a decision about live data, or should it be the panel's own question?
   - Does Sam understand what "yes" changes?
4. Leave a note in the preview.
   **Expect:** it appears in the list. "Worth a look" in the panel stays empty, or names a plain risk.
5. **Publish**, then leave a note on the live site.
   **Expect:** the note appears there too: same database (DECISIONS: the app's database is the live one).
6. Check: the Supabase project exists in test-org; people can't read other people's private data unless the feature means them to.

### S5. Everyday changes (Tom)

**Start:** `crumb-site` (demo) or `fresh-app` after S3.

1. Ask Claude: **"Make the headline warmer."**
   **Expect:**
   - The preview updates.
   - "✓ Saved" sits under Claude's reply.
   - The bar says "1 change not live yet".
   - History lists the save under a short name ("Make the headline warmer").
   **Reflect:** "Saved" shows in three places: under the reply, in the bar and in History. Is that reassuring or too much? Which one would Tom miss if it went?
2. Toolbar **Edit text** (⌥⇧E): click a paragraph, change a word, Enter.
   **Expect:** the change shows in place and is saved as "Changed “…” to “…”". A text that can't be edited in place says so and offers **Ask Claude**.
3. Toolbar **Point & ask** (⌥⇧A): click a button, type "make this bigger".
   **Expect:** the conversation shows "About the button “…”: make this bigger". Claude knows which element without the builder explaining.
4. Break a page: `scripts/e2e-errors.mts` shows how, or ask Claude for a change you know is broken.
   **Expect:**
   - The preview's error overlay names the problem plainly, with **Try to fix**.
   - The request reads "Fix the /… page: it's broken in the preview."
   - After Claude's fix, the page works.
5. **History**, then **Restore** on an earlier version, then confirm.
   **Expect:** the question appears where it can be seen, without scrolling (K5). Then "Restored. Publish when you're happy with it."
   **Reflect:**
   - Tom can also ask Claude "go back to how it was this morning", the conversational way. Try that too.
   - Which way finds the right version faster, and which feels safer? Should one of them lead to the other?
6. **Publish**, then in the 10 s **Undo**, then confirm.
   **Expect:** "Undone. The previous version is live again." The live site shows the previous version.
7. Publish with nothing new.
   **Expect:** nothing to publish; the bar says everything is live.

### S6. When things stop (Tom)

1. **A secret key in the code.** Ask Claude to put an obviously fake but key-shaped string in a source file: a made-up test key, never a real one.
   **Expect:**
   - The save stops; the bar says **Not saved** with a plain reason and **Fix it**.
   - Claude moves it out; Clodable saves on its own.
   - Nothing reached GitHub in between: check the draft.
2. **A build that fails.** Ask for a change that breaks the build, then **Publish**.
   **Expect:**
   - "Not published", with the reason in one line and **Fix it**.
   - After Claude's fix, Publish works.
3. **A conflict.** Change a line on `main` on GitHub (`gh api` on the test repo), change the same line in the draft through Claude, then **Publish**.
   **Expect:** "The live site changed the same text" with **Let Claude combine them**. After it, Publish works.
4. **Every stop:** the words say what happened, then what to do. There's one primary button, and no stack trace unless "details" is opened.
   **Reflect:**
   - Where does Tom look first when something stops: the bar, the panel or the conversation? Is the stop shown there?
   - **Fix it** hands the problem to Claude in the conversation. Is that the right place to watch it get fixed?

### S7. Moving off Lovable (Léa)

**Start:** `hirebright-score`, new conversation, `/move-off-lovable`. Read the move's stages in [ARCHITECTURE.md](../ARCHITECTURE.md) ("Apps still on Lovable").

- **Free to run:** the stages up to and including **Try my app on the copy**. They work on a copy, in test-org, and don't touch the live app. That covers:
  - Look at my app
  - connect Supabase and create the new backend in **test-org**
  - copying data, people and files
  - functions
  - trying the app on the copy
- **Needs the owner:**
  - downloading Lovable's export, which happens in Lovable, signed in
  - anything with the app's domain or emails
  - every step of the switch (pause, final export, go live, finishing in Lovable)
  Stop and ask before each.
- **Judge at each stage:**
  - Does Léa know what will happen to her live app?
  - Does she know how long it takes, and what she must do outside Claude?
  - Does the panel show only what matters now (done steps on one line, leftovers keeping their step open)?
  - Is the "Carefully" versus "In one go" choice understandable?
- **Reflect at each step:**
  - Many of the move's buttons hand the step to Claude in the conversation, then the panel waits. Does Léa always know who is doing what (she, Clodable or Claude) and where to look for the result?
  - Is the long wizard better as one panel, or as separate moments?
- **Afterwards:** delete the test-org project the run created (name-checked).

### S8. Starting from scratch (Nadia)

**Start:** a new empty folder, new conversation.

1. `/clodable`. Follow the screen as Nadia would: she has a GitHub account but no app and no repository.
2. Record where she gets stuck, and what she would need to type or know.

Today's setup expects an app on GitHub, so this is mostly a UX finding. Then ask Claude in the conversation "I want to make a booking page for my yoga classes" and see where that leads with Clodable present. Don't build a workaround in the product; recommend in the UX report.

**Reflect:**
- For Nadia, should the start be conversational (she describes her idea, Claude builds), with the panel appearing only once there's something to save and publish?
- What's the least she must understand before her first change?

### S9. Conversations and sessions

1. **A new conversation in a set-up app.**
   **Expect:** the bar shows within a few seconds, and the preview opens by itself. Check `.clodable/local/clodable.log` for "the session moved from …/spares/… to …": Desktop pre-starts engines in a spare folder.
2. **Two conversations open on the same app.** Use Point & ask in the preview.
   **Expect:** the request goes to the conversation used last, only once.
3. **`/clear`**, then an old conversation resumed.
   **Expect:** the bar and panel show the current state.
4. **Close the panel** (×), then `/clodable` again.
   **Expect:** it reopens where it was.

## 9. The UX review, at every step

Judge the experience at two scales: every single step (§9.1–9.3), and each whole journey (§9.4). The answers feed the run sheet, the findings and the UX report (§9.5).

### 9.1 The UX lens, after every step

Take the screenshot of the moment the step ends. Ask these six questions as the persona, then write one line in the run sheet.

1. **Too much?**
   - Anything on screen the builder doesn't need right now?
   - More than one primary action?
   - The same fact said in several places?
   - Text they won't read, or details for developers in plain view?
   - A choice Clodable could have made for them?
2. **Too little?**
   - Is it clear what just happened, what's happening now, and what to do next?
   - Any wait without progress?
   - A result without its consequence ("Your site is ready", but is it live)?
   - An error without a way forward?
   - A word they can't know?
3. **Right place?** Is each thing on the surface that fits it ([§9.2](#92-which-surface-fits-which-moment))? Watch for:
   - A form or a choice being done in the conversation.
   - An explanation squeezed into the panel.
   - Status buried in a reply.
   - A panel button writing a message in the builder's name that surprises them.
   - The builder made to switch surfaces mid-task.
4. **Feedback in time?** Acknowledged within 100 ms, progress for anything over 2 s, and a clear end state.
5. **Words?** The vocabulary rule, the builder's own words (pages, buttons, "my site"), and nothing about how Clodable works inside.
6. **Safe to act?** Before an action that touches the live site or live data, does the builder know what will happen and whether it can be undone?

Write the line like this, `ok` where nothing's wrong:

```
S3.2 · much: ok · little: no "it isn't live yet" until the end · place: mechanical work in the conversation → panel? · time: 38 s, steps shown · words: ok · safety: ok
```

A "too much", "too little" or "wrong place" with a real cost for the builder is also a finding (category UX), with a one-line proposal. A pattern that repeats across steps goes in the UX report.

### 9.2 Which surface fits which moment

Clodable works through five surfaces. Use this guide to judge "right place". When you go against it, say why.

| Surface | Fits | Doesn't fit |
|---|---|---|
| **Conversation** (Claude) | Judgment: reading the app's code, changing it, explaining what happened in the builder's context, open questions, anything said in their own words | Forms, fixed choices, keys and tokens, long-running mechanics with no judgment, status the builder must find again later |
| **Panel** (Clodable, docked) | State and places to come back to (History, settings, where the site and data live); fixed choices; forms, including tokens, which never go in the chat; multi-step setups with visible progress; mechanics run directly (as Publish) | Explanations that depend on the app's code; open questions; anything needing a back-and-forth |
| **Bar** (above the message box) | One glance: saved, live, what's not live yet, something stopped. The one primary action (Publish) and the way into the panel | Anything needing more than one line or one decision |
| **Preview and toolbar** | Acting on the app itself: pointing at a part of a page, editing its text, seeing a page broken and fixing it | Account, hosting or data decisions |
| **Toast** | A confirmation the builder can miss without harm ("Saved", "Restored") | Anything they must act on, or must find again |

Weigh these for each step that crosses surfaces:
- **Who works:** Claude (needs judgment) or Clodable (mechanics)?
- **Where the builder looks while it happens,** and whether that's where the result appears.
- **What a model's judgment costs:** cost, time, variability, and permission prompts (K1). What does it add?

### 9.3 What Desktop allows

Know these limits before recommending a change: a proposal that ignores them can't be built.

- The panel and the bar draw from a small set of parts: boxes, text, buttons, links, code, selects, inputs, small images. The bar is a single line.
- Clodable can't open Desktop's preview pane on its own in Auto mode. That's why **Preview** asks Claude in the conversation.
- Clodable can't hide or reword Desktop's own interface: its sidebar, Environment card, permission prompts, the message box's placeholder, "/x isn't a command here".
- Commands Clodable runs itself (setup, Publish) go through without permission prompts. Commands Claude runs pass Desktop's permission mode, and Auto mode's safety check unless Clodable's guard allows them (K1).
- A conversation that started before setup didn't read the app's AGENTS.md. Clodable now hands it over after setup (#41).
- Desktop's own question dialogs show a working spinner until the work ends, so Clodable asks its confirmations in its own buttons.

### 9.4 After each journey

After each full pass, and in depth at the end, step back from the steps and judge the experience as a whole for each persona.

**Measure, per persona journey:**
- Screens visited and clicks.
- Decisions asked of the builder, and how many they could answer from the screen alone.
- Words they had to know.
- Waits over 2 s, with and without feedback.
- Moments of doubt (where a real person might stop or ask someone).
- Total time.

**Questions to answer, with evidence (screenshots, counts, timings):**
1. **Does one panel do too much?** `/clodable` serves first-time setup, the everyday "my app" home and part of the move. Would separate entry points serve each use case better, or would they fragment it? Options to weigh include:
   - a setup wizard that disappears once done
   - a "my app" home
   - the move as its own place (it already has `/move-off-lovable`)
   - settings and connections in one place
   - History on its own (`/history`)
2. **"Online" means two things.** "Put my site online" creates the site, but it goes online only at Publish. Could the first Publish create the site instead, or is the button worth renaming? (See K2.)
3. **The two setup questions.** Can the builder answer "Where does your app's data live?" and "Where is your site live?" alone? What could Clodable detect instead of asking?
4. **Tokens and accounts.** Connecting Netlify and Supabase asks the builder to create a token on another site. Is that understandable? What would make it a one-click sign-in?
5. **Commands.** Which slash commands would a non-technical builder ever type? Should more actions be buttons, or fewer?
6. **The conversation as the interface.** When a panel button sends a request in the builder's name, does Claude's reply read like help for that person? Look at prefixes such as "Moving off Lovable:", and at hidden instructions leaking into the reply.
7. **Starting from scratch** (S8). What's the shortest honest path for Nadia?
8. **Desktop around Clodable.** What in Desktop's own interface confuses the builder? Examples: the Environment card's repository and branch, permission modes, Desktop's "/x isn't a command here". That's external, but it shapes the experience and can shape onboarding copy.

### 9.5 The UX report

Deliver `docs/testing/UX-REPORT.md`:
- **A journey map per persona.** Each step's surface and UX line from the run sheet, with the moments of doubt marked.
- **The ten issues that hurt non-technical builders most,** ranked.
- **A surface map.** For each moment of each journey: where it happens today and where it should, with the reason from §9.2. List separately the moves from conversation to panel and the reverse.
- **Proposals:** which panels or commands to split, merge or rename, and what to show less or more. Each comes with a simple text mockup, the evidence, the effort, and the DECISIONS entry it would change.

Proposals that change a recorded decision, the brand (logo, mascot, palette are the owner's) or the product's scope are recommendations only: don't build them.

## 10. The fix loop

**Keep a run sheet** per pass, in `~/Clodable Tests/_runs/<run>/run-sheet.md`: one row per step, with its UX line from [§9.1](#91-the-ux-lens-after-every-step).

```
| Step | Pass | Time | Surface | UX line | Findings |
|------|------|------|---------|---------|----------|
| S1.2 | yes  | 2m40 | panel   | much: ok · little: no "what's a draft" · place: ok · time: steps shown · words: "draft" unexplained · safety: ok | F-7 |
```

**Record every finding** in `docs/testing/FINDINGS.md`, one entry each:

```
### F-<n> · <short title> · <S1|S2|S3|External> · <open|fixed|wontfix|needs owner>
- Persona / scenario / step: …
- Seen: what was on screen (screenshot: <path>) and how long it took
- Expected: …
- Cause: what the logs and transcript show (file:line when known)
- Fix: PR #… / Retest: pass on run <n>
```

Keep screenshots outside the repository, in `~/Clodable Tests/_runs/<run>/`.

**Severity:**
- **S1, blocker:** a persona can't finish, risks data or a key, or breaks the live site.
- **S2, major:** finishes, but with a scary or false moment. Examples: a red failure the builder didn't cause, a git word, a wrong claim ("nothing was saved"), a silent wait over 10 s, a question they can't answer.
- **S3, polish:** wording, layout, a short delay.
- **UX:** too much, too little, or the wrong surface ([§9.1](#91-the-ux-lens-after-every-step)). Rate its cost for the builder as S1–S3 too.
  - A UX finding that removes noise or adds missing feedback within one surface is yours to fix.
  - One that moves work between the panel and the conversation, or splits or merges panels and commands, is a recommendation ([§9.5](#95-the-ux-report)).
- **External:** Desktop or Claude Code, outside Clodable. Record it; don't work around it unless the workaround is small and invisible.

**What to fix yourself:** S1–S3 findings whose fix stays within the product's recorded decisions: wording, missing progress, wrong instructions to Claude, guards, bugs. Follow `CLAUDE.md`. In particular:
- builders never see git words;
- the NDJSON event contract changes only compatibly, with `packages/cli/test/cli.test.ts` updated;
- the toolbar stays in shadow DOM;
- mods spell every `$` call in full.

**What to recommend instead:** anything that changes a decision in DECISIONS.md, splits or merges panels or commands, or changes the brand. Put it in the UX report.

**For each fix:**
1. Branch from `main`. Write the change and a test that fails without it.
2. Run `pnpm lint:fix && pnpm typecheck && pnpm test && pnpm test:plugin`.
3. Open one pull request per fix, saying what was seen, why it happened, and how you checked.
4. Merge after CI passes; this is how the owner works today. They can change this to "open pull requests only" by saying so.
5. `pnpm build`, then the `rsync` in [§6](#6-testing-unreleased-code). Start a new conversation.
6. Re-run the failing step first, then the whole scenario.

When a finding's cause is how Claude reads Clodable's instructions, check the change against the same model before relying on it. Replay the conversation's shape headless (`claude -p --input-format stream-json`), as done for K1 and K2's predecessors. Model behaviour varies: run it more than once.

## 11. Definition of done

The loop ends when all of these hold:

- [ ] S1–S6 and S9 pass end to end, twice in a row, from a reset start, in Auto mode with Desktop's default model. S3 and S4 also pass in Ask mode.
- [ ] S7 passes up to the owner's gate, and S0 on the next release.
- [ ] No open S1 or S2 finding. Every S3 is fixed or marked "needs owner" with a reason.
- [ ] No forbidden word on any Clodable surface, or in Claude's replies during the flows.
- [ ] Every wait over 2 s shows what's happening, and Publish's progress shows within 100 ms of the click.
- [ ] No red error or "Failed" the builder didn't cause. Every stop has a plain way forward.
- [ ] Rough time budgets hold on this Mac:
  - setup ≤ 3 min, including packages
  - site created ≤ 1 min
  - Publish ≤ 3 min
  - backend ≤ 3 min
- [ ] After every Publish and Undo, the live site matches what the panel says.
- [ ] A reset leaves nothing behind: no Netlify sites, Supabase projects, GitHub secrets, branches or open pull requests from the test.
- [ ] Every step of the last two passes has a UX line, and every **Reflect** question is answered.
- [ ] No open UX finding of S1 or S2 cost within one surface. The rest are in the UX report.
- [ ] `docs/testing/UX-REPORT.md` is written, with its surface map, and `docs/testing/FINDINGS.md` is up to date.

## 12. Known issues at handoff

Found in the owner's Desktop runs on 2026-10-15 to 17. Start here.

- **K1 · S1 · "Put my site online" can be blocked in Auto mode.**
  - *Seen:* Claude ran the given command with `cd "<app folder>" &&` in front of it.
  - *Cause:* the plugin allows Claude's run only when it's exactly as given (`isOnlineStep` in `plugin/hooks/guards.ts`; the move's `isMoveStep` is the same). The decision then fell to Auto mode's safety check, which denied it as "Data Exfiltration": the command sends the app's settings to Netlify. Transcript `~/.claude/projects/-Users-manu-Clodable-Tests-fresh-app/551e7ddc-….jsonl`, 2026-10-17 14:18:52 UTC. Claude then told the builder "blocked by a permission check", with nothing they could do. In the run before, Claude ran the command exactly as given, and it went through.
  - *Directions:*
    - accept a leading `cd` into the session's own folder;
    - tell Claude it's already in the app's folder;
    - or let the panel run `site create` and `backend create` itself, as it runs Publish, and involve Claude only for what needs judgment. That last one changes DECISIONS Q17's flow, so ask the owner.
- **K2 · S2 · "Put my site online" reads like Publish.** Claude's first words were "I can't publish for you: that's the Publish button…". The request's words collide with AGENTS.md's "Publish is the builder's decision", and the site doesn't go online until Publish anyway. Look at the button's and the request's wording.
- **K3 · S2 · Two Clodable versions in one session.**
  - The panel runs the plugin's own CLI. Claude's `npx clodable …` commands, and the preview's `npx clodable dev`, run whatever version npm serves. On a builder's Mac these can differ, and `npx` needs the network the first time.
  - Weigh having the guide skill and AGENTS.md use the plugin's own CLI (skills can name `${CLAUDE_PLUGIN_ROOT}`). AGENTS.md must also work without the plugin.
- **K4 · S3 · Claude guessed a path.** Its first command was `cd /Users/manu/Clodable/Tests/fresh-app`, with the space dropped. Claude doesn't need `cd`; see K1.
- **K5 · S3, deferred by the owner:**
  - Restore's question can open below the visible part of the panel.
  - A save name runs past its first sentence when it ends with a quote mark.
- **K6 · External · Desktop's message box.** Desktop says "/clodable isn't a command here." when `/clodable` is a new conversation's very first message, although Claude Code runs it and the panel opens. A Claude Code feedback draft exists. Desktop's own git words (the Environment card's branch) can't be changed from Clodable either.
- **K7 · External · Skill descriptions.** On a Mac with many skills, Claude Code drops descriptions from its skill list, ranked by use. Clodable's guide skill can then appear as a bare name, and Claude may guess skill names. Fixed for the panel's requests: they now say "nothing to load first".
- **K8 · Test-only.** After a reset, open conversations rewrite `.clodable/local/session-*.json` for a few seconds. Close them first ([§7](#7-resetting-between-runs)).

Already fixed, worth re-checking each run:
- the spare-folder move: "the session moved from …/spares/…" (#39);
- setup progress (#40);
- the app's rules handed to the conversation after setup, and the panel's commands run as given (#41);
- short save names for the panel's requests (#42).

**Decisions not to re-open in code** (DECISIONS.md and the owner's choices):
- Claude-first (Q1).
- The bar's Undo only during the 10 s "You're live".
- Done messages for about 10 s.
- The app's database is the live one.
- The brand (logo, mascot, palette).
- Calm, typographic design with no AI clichés (ribbons, sparkles, icon-in-circle badges).

## 13. Appendix: what the builder sees

**The bar:**
- Status: "Clodable is getting ready…", "N changes not live yet", "Everything is live", "Everything is saved" (not online yet), "Saving…", "Publishing…", "You're live", "Not published", "Not saved".
- Buttons: History, Preview, Publish, Undo (10 s after a publish), Put it online, See why, Set up.

**The panel:**

| Moment | What it shows |
|---|---|
| Setup | "Let's bring your app home…"; **1 · Tools** with Install Git and Check again when needed, and Connect GitHub with a one-time code; **2 · Your app** with **Set up Clodable here**, or the repository field, **Show my repositories** and **Bring it in** |
| The app | The two questions; the site card ("Not online yet" with **Put my site online**, or the site with **Publish**); "No database yet" with **Add a backend**; **History** with Restore; **Worth a look**; **Your app's settings** |
| Connecting | "Netlify token" or the Supabase token, with "Paste it here. It stays on this computer." and a link to the token page; **Netlify team**; **Supabase organization** |
| The move | Stages with one step open at a time: Look at my app, Create it, I've downloaded it, Try my app on the copy, Put my site on Netlify, Switch my AI features, Switch my emails, Switch them, Switch my Google sign-in, Go live, Check again |

**The preview's toolbar:** device sizes, Rotate, **Edit text** (⌥⇧E), **Point & ask** (⌥⇧A), Hide (⌥⇧H). The error overlay has **Try to fix**, Show details and Dismiss.

**Requests the panel sends in the builder's name**, with hidden instructions for Claude beside them:
- "Put my site online, then tell me what's left before people can see it."
- "Add a backend to my app in my Supabase organization “…”, then tell me what it lets me do."
- "Show me my app's preview."
- Fix it's requests.
- "Moving off Lovable: …" for each step of the move.
