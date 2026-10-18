# Try Clodable yourself

Prepared October 18, 2026. Open Claude Desktop → **Code** and use the three numbered sessions below. No reinstall or new token is needed to begin.

## Your three starting points

| Session in Claude | Folder | What it covers |
|---|---|---|
| **01 · Start from an idea** | `/Users/manu/Clodable Tests/start-from-an-idea` | Nadia: the first experience, a local prototype, then saving |
| **02 · Edit, publish and undo — test app** | `/Users/manu/Clodable Tests/github-import-20261017` | Tom's everyday work; Sam's app after initial setup |
| **03 · Move off Lovable — Tiny Notes copy** | `/Users/manu/Clodable Tests/tiny-notes-wall` | Léa: inspecting and trying the existing migration copy |

Keep **Auto** permissions and the current default model. The two newly prepared sessions use Opus 5.5 Extra, as Desktop selected it. If you start a new session, choose **This computer** and the matching folder.

The installed Clodable build contains the UX fixes. It still carries the `0.2.2` label; reinstalling the released version would not test all these fixes. Describe changes in the conversation. Use the panel for controls and enter any requested secret there.

## 01 — Start from an idea

The folder is empty. Type directly into Claude's normal message box—no command or panel first:

> Make a simple app for sharing books with my neighbours. I want to see which books are available and mark one as borrowed. Start with sample books.

Look for a working preview, a useful first design, and a brief explanation that this first version is local. Borrow a book, reload, and ask for a visual change. Claude should make ordinary design choices without an infrastructure questionnaire.

Optional next step:

> I want to keep this app and work on it again tomorrow.

Clodable should offer **Set up saving**, name your GitHub account and ask before creating a private app. Hosting and a shared database are later choices. Browser-local sample data does not establish that neighbours share the same data.

You can stop after the local prototype. To try the GitHub-import entry instead, use another empty folder; do not import into the folder containing your prototype.

## 02 — Edit, publish and undo

This is the retained disposable test app. Hosting and its database are already connected. The fresh session opened with **Everything is live**, and its preview now uses the installed Clodable runtime.

1. Ask: **“Show me my app, then make the home-page introduction warmer and easier to read.”** Check the preview and the saving indicator.
2. Use **Edit text** in the preview. Then use **Point & ask** on a heading and ask for a visual change.
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

Then:

> Let me try the existing copy. Reuse its signed-in preview if available. Do not copy the data again or publish.

Try the Wall, a disposable private note, an attachment, and deleting that note. The greeting is configured. **Summarize** still awaits AI setup; email delivery has not been verified. If Desktop opens a different preview address, you may need to sign in again yourself. The original copy preview was retained.

**Stop before Publish, pausing the live app, the final copy, domain changes or finishing in Lovable.** Publish is not a private migration check: it can affect the live Lovable app through the shared code. Email/provider setup and the live switch remain separate decisions.

## What a good conversation should feel like

Claude should explain outcomes in your app's words, make small changes directly, ask one useful question at a time when needed, and check changes in the preview. Panels should appear when you need controls or consent. Passing database checks should not be presented as proof that every app feature works.

## Cleanup and recovery

- **52 sessions archived**, with history retained. Three unrelated sessions temporarily caught by a sidebar-grouping mistake were restored and verified. The earlier **H1 title SEO optimization** conversation was also restored and retained.
- **Ten local test folders archived** at `/Users/manu/Documents/Clodable Test Archive/2026-10-18`. Its `cleanup-manifest.json` records original locations. The two retained app folders keep their original paths.
- `_runs` keeps screenshots and regression evidence; it is not a manual-test app. The original `~/Clodable Demo` also remains outside the three-scenario workspace.
- Five duplicate Tiny Notes preview servers were stopped. The original copy preview and the everyday app preview were kept.
- No cloud resource, remote repository, credential, live app or download was deleted or reset. Archived books/plants examples retain their test websites.
- Recover a conversation through **Search → Code → its title → Show archived → open it → Unarchive**.
- Recover a folder by moving it from the archive back to the original location in the manifest, with sessions using that folder closed first.

The full assessment is in [UX-REPORT.md](./UX-REPORT.md); the detailed evidence is in [FINDINGS.md](./FINDINGS.md).
