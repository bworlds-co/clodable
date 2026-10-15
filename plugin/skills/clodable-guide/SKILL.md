---
name: clodable-guide
user-invocable: false
description: How to work with a builder in a Clodable project, a Lovable-style app edited in Claude Desktop where Clodable saves every reply to a draft on GitHub and the builder publishes with one click. Use when the builder asks about publishing, going live, putting their site online, adding a backend (sign-in, saved data), undoing a publish, restoring an earlier version, what's live versus not yet, their draft, setup, seeing the preview or its toolbar, or changing their live database.
---

# Working in a Clodable project

The person you're helping is a **builder**. They know their product, not necessarily code. Clodable gives them a Lovable-like flow inside Claude Desktop:

- **Saved:** after every one of your replies, Clodable saves their changes to their draft on GitHub (`draft/<their GitHub login>`). You never commit, push or open pull requests.
- **Publish:** the **Publish** button in the Clodable bar above the message box (or `/publish`). Clodable checks the app builds, that no secret key is exposed and that packages are safe, then merges the draft and their host puts it live. Every save is also checked for secret keys before it goes to GitHub: if the bar says **Not saved**, a key is in the code. Move it out (a Supabase Edge Function secret, for example) and Clodable saves on its own.
- **Undo:** `/undo-publish`, or **Undo** in the Clodable panel, puts the previous version live again. Database changes are not undone.
- **Restore:** any earlier save can be brought back as a new save. Each of your replies that changed the app shows "✓ Saved" with **↶ Restore this version** under it, and the Clodable panel's History lists every version with **Restore**. Point the builder there before running commands.

If `AGENTS.md` exists, it has the project's own rules. Follow it first.

Talk about **the preview**, never an address: no `localhost`, no port numbers. Their app runs in Desktop's Browser pane, and that's what they know.

## Answering common questions

| They ask | You do |
|---|---|
| "Publish it", "put it live", "deploy" | Tell them to click **Publish** in the Clodable bar, or type `/publish`. Don't run `clodable publish` yourself: going live is their decision. |
| "Is it live?", "what's not live yet?" | Run `npx clodable status --json` and answer in one or two plain sentences. |
| "Undo that" (after a publish) | Explain that `/undo-publish` puts the previous version back, and that database changes stay. |
| "Go back to how it was this morning" | Run `npx clodable history --json`, find the save, and ask which one before restoring with `npx clodable restore <sha>`. |
| "Publishing failed", "Fix what stopped my publish" (from **Fix it**: the reason, files and build output reach you beside the message) | Fix the cause and check the app builds (`npm run build`). The other **Fix it** requests ("Move the secret key out of my code…", "Combine my draft with the changes on the live site…") come the same way, with what to do. |
| "Set it up", "connect my app" | Point them to `/clodable`, which has a guided setup. |
| "Show me my app's preview" (Clodable gives you its address beside the message), "show me the preview" | Open Desktop's Browser pane at that address: `preview_start` with `{"url": "http://localhost:…"}`. With `{"name": "app"}` it only starts the server, or reuses a running one and opens nothing. Then say it's open, in one line. If the pane is hidden, ⌘⇧B (Ctrl+Shift+B on Windows) or the globe icon brings it back: only they can. |
| "Add a column", "add some test data", "fix that record" (their own Supabase) | As on Lovable, through Clodable: `npx clodable db query "select …"` to look, a migration in `supabase/migrations/` applied with `npx clodable db apply <file>` for the tables, `npx clodable db run "…"` for the data. Say what will change in one sentence and wait for a yes first. No key needed: never ask for one. |
| A feature is empty in the preview, or you add code reading `process.env.X` | Its value is one of the app's settings. Run `npx clodable settings` to see which are missing here or on their site, and tell them to paste the value in the Clodable panel (**Your app's settings**). The preview restarts with it. Never ask for the value in the chat. |
| "Leave Lovable", "move off Lovable Cloud" | Ask them to type `/move-off-lovable`: it opens the move in the Clodable panel. Each step they press comes to you, and the `clodable-move` skill says how to run it. |
| "Put my site online" (from the panel: the command reaches you beside the message), "how do people see my app?" | When it comes from the panel, run the command given, then tell them their site's address and that it goes online when they press **Publish**. Asked in the chat, with no site yet: ask them to type `/clodable`; the panel's **Put your site online** connects their own Netlify (a token they paste there, never in the chat). |
| "Add a backend" (from the panel, with the command beside), or a feature that needs sign-in or saved data when the app has none | From the panel: run the command (it takes about 2 minutes), add the Supabase client if the app has none, and say what it lets them add. Asked in the chat: say in one sentence that the app needs a backend first, and ask them to click **Add a backend** in the Clodable panel (`/clodable`). Don't set one up any other way. |

## The preview toolbar

At the bottom of their app's preview there's a small Clodable toolbar. It exists only in development, and visitors never see it. It offers:
- **Edit text:** they change words in place and Clodable writes the change to the code. No action is needed from you.
- **Point & ask:** messages like "About the heading “Bread worth waking up for”: make it warmer" come from it. What they pointed at (the element, its file and line) reaches you beside the message. Treat it as the builder's request.
- **Try to fix:** when a page crashes, they can send it to you: "Fix the /menu page: it's broken in the preview", with the error, its file and line and the console beside the message. Fix the cause, then check the page in the preview.

Never remove the toolbar or edit `.clodable/` files, except `.clodable/config.json` when asked.

## Their database is live

The preview uses their real data. Before any database change:
1. Say what will change in one plain sentence and ask for a yes.
2. Prefer additive changes. The live site runs the previous code until the next Publish, so it must keep working.
3. Save each schema change as a migration file in `supabase/migrations/`.
4. Afterwards, run Supabase's security advisors and fix row-level security issues.

Edge functions in `supabase/functions/` go live at Publish. Don't deploy them yourself unless Clodable asks you to right after a Publish.
