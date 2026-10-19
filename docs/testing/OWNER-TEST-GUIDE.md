# Try Clodable yourself

Updated October 20, 2026. Open Claude Desktop → **Code** and use the three numbered sessions below. No reinstall or new token is needed to begin.

## Your three starting points

| Session in Claude | Folder | What it covers |
|---|---|---|
| **01 · Start from an idea** | `/Users/manu/Clodable Tests/start-from-an-idea` | Nadia: the first experience, a local prototype, then saving |
| **02 · Edit, publish and undo — test app** | `/Users/manu/Clodable Tests/github-import-20261017` | Tom's everyday work; Sam's app after initial setup |
| **03 · Move off Lovable — Tiny Notes copy** | `/Users/manu/Clodable Tests/tiny-notes-wall` | Léa: inspecting and trying the existing migration copy |

Keep **Auto** permissions and the current default model. The two newly prepared sessions use Opus 5.5 Extra, as Desktop selected it. If you start a new session, choose **This computer** and the matching folder.

Clodable **0.3.0 is released and installed** in all three scenarios. The marketplace is pinned to `clodable--v0.3.0`; the installed plugin and all three local runtimes match that release. All three retained conversations have been reloaded. Describe changes in the conversation. Use the panel for controls and enter any requested secret there. **Open Clodable**, beside the composer, remains available when Desktop hides its status bar for a question card. Migration progress and email navigation were verified in retained and fresh Desktop conversations before release; reopening the current migration step was checked again with the released plugin. No reinstall is needed. Restart an already-running preview before the next test to load its updated runtime.

## 01 — Start from an idea

This session now contains the book-sharing prototype from your test. Continue shaping it here, or choose a new empty folder to repeat the first-use journey. In a fresh folder, type directly into Claude's normal message box—no command or panel first:

> Make a simple app for sharing books with my neighbours. I want to see which books are available and mark one as borrowed. Start with sample books.

Look for a working preview, a useful first design, and a brief explanation that this first version is local. Borrow a book, reload, and ask for a visual change. Claude should make ordinary design choices without an infrastructure questionnaire.

Optional next step:

> I want to keep this app and work on it again tomorrow.

Clodable should offer **Set up saving**, name your GitHub account and ask before creating a private app. Edit the name and use the single **Create private app** action. Hosting and a shared database are later choices. Browser-local sample data does not establish that neighbours share the same data.

You can stop after the local prototype. To try the GitHub-import entry instead, use another empty folder; do not import into the folder containing your prototype.

## 02 — Edit, publish and undo

This is the retained disposable test app. Hosting and its database are configured. Your review left a failed host update: the refreshed panel now identifies it and exposes **Publishing connection**. Repair that connection in the panel before publishing again. With no new edits, **Retry Publish** sends the saved version again; no incidental app edit is needed. You updated the real connection in your October 19 retest. The agent did not refresh it again: the new success/error screens were verified with isolated local services. After a successful update, the token form now disappears; use **Back to publishing** to return without publishing, or **Change connection** to reopen the form.

1. Ask: **“Show me my app, then make the home-page introduction warmer and easier to read.”** Check the preview and the saving indicator.
2. Open the small **Tools** entry in the preview and use **Edit text**. Then use **Point & ask** on a heading and ask for a visual change.
3. Ask: **“Show my previous versions.”** Expect History to open with a short acknowledgement. Try restoring one of your test changes.
4. Make another visible change, click **Publish**, and check the [test website](https://github-import-20261017.netlify.app).
5. Try **Undo** immediately after publication. Later, use the app's controls or ask how to undo the last publication. Reload the website to check the result.
6. Leave a short test note in the app and reload. The retained backend supports the existing visitor-notes feature.

Publishing here updates a disposable test website. Its preview and public site share the test database: restoring the app does not undo database edits.

This is the already-connected experience, **not a fresh run of Sam's initial hosting/backend creation**. Both free Supabase slots are occupied by this app and Tiny Notes. Repeating that entire journey needs a deliberate reset of a test resource first; nothing was reset during cleanup.

## 03 — Try the migration copy

The copy, account connections and progress are retained. Hosting is prepared but the new website is unpublished. The next unfinished stage is email setup, followed by the AI feature.

Start with:

> Where are we in the move? Explain what has been tested and what remains. Keep my live Lovable app unchanged.

The migration panel should open at its current step, including in this retained conversation. Asking “Let’s set up emails for my users next. I’ll give you my domain” should open the email controls immediately, before you supply a domain. Expect a short checkpoint that distinguishes earlier checks from checks performed now. **Open Clodable** also reopens the move if you close its panel.

Then:

> Let me try the existing copy. Reuse its signed-in preview if available. Do not copy the data again or publish.

Try the Wall, a disposable private note, an attachment, and deleting that note. The greeting is configured. **Summarize** still awaits AI setup; email delivery has not been verified. If Desktop opens a different preview address, you may need to sign in again yourself. The original copy preview was retained.

**Stop before Publish, pausing the live app, the final copy, domain changes or finishing in Lovable.** Publish is not a private migration check: it can affect the live Lovable app through the shared code. Email/provider setup and the live switch remain separate decisions.

## This week’s real migration

Use 0.3.0 for the full rehearsal. Choose the source app and destination before beginning; the retained Tiny Notes copy is already partway through a move. A fresh rehearsal must establish its own export and feature evidence rather than inherit those results. Both free test-org slots are occupied, so agree on the destination before creating or resetting anything.

Verify existing accounts, data, files, the app’s AI or other external services, email delivery and hosted behavior. Keep the live app running until the working copy has passed those checks. The final pause/export/copy, live switch and Lovable disconnection remain an explicit decision at that point. Releasing Clodable did not perform any of those steps.

## What a good conversation should feel like

Claude should explain outcomes in your app's words, make small changes directly, ask one useful question at a time when needed, and check changes in the preview. Panels should appear when you need controls or consent. Passing database checks should not be presented as proof that every app feature works.

## Cleanup and recovery

- **Two October 20 verification conversations are archived**, and their isolated local hosting fixture is in `~/Documents/Clodable Test Archive/2026-10-20/`. Your migration data and real account connections were unchanged.
- **Seven owner-review verification sessions were also archived** after the final checks. Your three numbered test sessions and unrelated conversations remain.
- **52 sessions archived in the earlier cleanup**, with history retained. Three unrelated sessions temporarily caught by a sidebar-grouping mistake were restored and verified. The earlier **H1 title SEO optimization** conversation was also restored and retained.
- **Ten local test folders archived** at `/Users/manu/Documents/Clodable Test Archive/2026-10-18`. Its `cleanup-manifest.json` records original locations. The two retained app folders keep their original paths.
- The later `owner-review-regression` local fixtures were archived separately at `/Users/manu/Documents/Clodable Test Archive/2026-10-18-owner-review`, with their own recovery manifest.
- `_runs` keeps screenshots and regression evidence; it is not a manual-test app. The original `~/Clodable Demo` also remains outside the three-scenario workspace.
- Five duplicate Tiny Notes preview servers were stopped. The original copy preview and the everyday app preview were kept.
- No cloud resource, remote repository, credential, live app or download was deleted or reset. Archived books/plants examples retain their test websites.
- Recover a conversation through **Search → Code → its title → Show archived → open it → Unarchive**.
- Recover a folder by moving it from the archive back to the original location in the manifest, with sessions using that folder closed first.

The full assessment is in [UX-REPORT.md](./UX-REPORT.md); the detailed evidence is in [FINDINGS.md](./FINDINGS.md).
