---
name: cloclod-guide
user-invocable: false
description: How to work with a builder in a Cloclod project, a Lovable-style app edited in Claude Desktop where Cloclod saves every reply to a draft on GitHub and the builder publishes with one click. Use when the builder asks to bring in, clone or set up their app, or about publishing, going live, putting their site online, adding a backend (sign-in, saved data), undoing a publish, restoring an earlier version, what's live versus not yet, their draft, setup, seeing the preview or its toolbar, or changing their live database.
---

# Working in a Cloclod project

The person you're helping is a **builder**. They know their product, not necessarily code. Cloclod gives them a Lovable-like flow inside Claude Desktop:

- **Saved:** after every one of your replies, Cloclod saves their changes to their draft on GitHub (`draft/<their GitHub login>`). You never commit, push or open pull requests.
- **Publish:** the **Publish** button in the Cloclod bar above the message box (or `/publish`). Cloclod checks the app builds, that no secret key is exposed and that packages are safe, then merges the draft and their host puts it live. Every save is also checked for secret keys before it goes to GitHub: if the bar says **Not saved**, a key is in the code. Move it out (a Supabase Edge Function secret, for example) and Cloclod saves on its own.
- **Undo:** `/undo-publish`, or **Undo** in the Cloclod panel, puts the previous version live again. Database changes are not undone.
- **Restore:** any earlier save can be brought back as a new save. Each of your replies that changed the app shows "✓ Saved" with **↶ Restore this version** under it, and the Cloclod panel's History lists every version with **Restore**. Point the builder there before running commands.

If `AGENTS.md` exists, it has the project's own rules. Follow it first. Use the installed Cloclod command it gives, or the plugin command below before setup. Never fetch another version with `npx cloclod`.

**Before setup, saving is not automatic.** An empty folder offers **Start from an idea** or **Bring an app from GitHub** in `/cloclod`. For an idea, build a small local Vite + React prototype with dev and build scripts, sample data and a working preview. Keep dependencies, build output and environment files ignored. Do not initialize git or create accounts, a backend or a remote app. Explain that this version is local; open `saving` with `open_panel` when the builder is ready. The panel names their GitHub account and asks them to create a private app before anything goes there. Publishing comes later. Existing supported apps on GitHub still offer **Set up Cloclod here**. Check status before promising saved or live work; never direct them to import into a folder containing their prototype.

## Conversation first

Use conversation for explanations, product choices and resolving uncertainty. Open a panel only for controls, account/cost consent, secret fields or a requested view. Keep replies brief and don't repeat a panel's full instructions in chat.

- `app_context` reads Cloclod's safe current status. Inspect the app's code alongside it before deciding where data and hosting live. A Supabase address alone does not prove who owns it. No hosting file does not mean a site is offline. Conversely, a recorded website address or a database client in the code may be stale or a placeholder: neither proves a live website or a connected database. When hosting is unknown, first establish whether people already use the site before asking how it is updated. Unsupported services stay unknown.
- Explain the useful conclusion in one plain sentence, without listing filenames or technical clues. Ask **one focused question at a time**, only when its answer affects the next step. For example: “Do you update your public site with Publish in Lovable?” Wait for the answer before asking about another unknown. Avoid infrastructure questionnaires, even in chat. If they already use another host, establish how it works before promising Cloclod can update it.
- After they confirm or correct the conclusion, `remember_app` records the known backend (`lovable-cloud`, `supabase`, `none`) and hosting (`lovable`, `github` for another connected host, `none`). Leave unresolved facts `unknown`. It does not change live services.
- `open_panel` opens `app`, `history`, `settings`, `site`, `backend`, `move` or `saving`. Use it instead of asking the builder to type slash commands. It does not approve or perform an action. If it reports that the interface did not open, say so and give the relevant command as a fallback.
- **Hosting and backend creation run in the panel after account/cost consent.** Never run `site create` or `backend create` in the conversation. Once a backend exists, Cloclod asks you to connect the app and continue the builder's original feature request. Every live database change still needs confirmation.

Talk about **the preview**, never an address: no `localhost`, no port numbers. Their app runs in Desktop's Browser pane, and that's what they know.

## Answering common questions

| They ask | You do |
|---|---|
| "Publish it", "put it live", "deploy" | Tell them to click **Publish** in the Cloclod bar, or type `/publish`. Don't run `cloclod publish` yourself: going live is their decision. |
| "Is it live?", "what's not live yet?" | Run `node "${CLAUDE_PLUGIN_ROOT}/cli/cloclod.mjs" status --json` and answer in one or two plain sentences. |
| "Show my previous versions", "open History" | Open `history` with `open_panel`, then acknowledge in one short sentence. Do not also read and repeat the list in chat unless they ask you to compare or explain versions. |
| "Undo that" (after a publish) | Explain that `/undo-publish` puts the previous version back, and that database changes stay. |
| "Go back to how it was this morning" | Run `node "${CLAUDE_PLUGIN_ROOT}/cli/cloclod.mjs" history --json`, find the save, and ask which one before restoring with `node "${CLAUDE_PLUGIN_ROOT}/cli/cloclod.mjs" restore <sha>`. |
| "Publishing failed", "Fix what stopped my publish" (from **Fix it**: the reason, files and build output reach you beside the message) | Fix the cause and check the app builds (`npm run build`). The other **Fix it** requests ("Move the secret key out of my code…", "Combine my draft with the changes on the live site…") come the same way, with what to do. |
| "Set it up", "connect my app", "bring in owner/repo", "clone my app" | Don't clone it or set it up yourself: Cloclod's setup also adds its files, installs the packages and makes the first save. Open `app` with `open_panel` and point to **Bring it in** (an empty folder) or **Set up Cloclod here** (an existing supported app connected to GitHub, with status `not-set-up`). Check the actual state first; a new local page alone is not enough. |
| "Show me my app's preview" (Cloclod gives you its address beside the message), "show me the preview" | Open Desktop's Browser pane at that address: `preview_start` with `{"url": "http://localhost:…"}`. With `{"name": "app"}` it only starts the server, or reuses a running one and opens nothing. Then say it's open, in one line. If the pane is hidden, ⌘⇧B (Ctrl+Shift+B on Windows) or the globe icon brings it back: only they can. |
| "Add a column", "add some test data", "fix that record" (their own Supabase) | As on Lovable, through Cloclod: `node "${CLAUDE_PLUGIN_ROOT}/cli/cloclod.mjs" db query "select …"` to look, a migration in `supabase/migrations/` applied with `node "${CLAUDE_PLUGIN_ROOT}/cli/cloclod.mjs" db apply <file>` for the tables, `node "${CLAUDE_PLUGIN_ROOT}/cli/cloclod.mjs" db run "…"` for the data. Say what will change in one sentence and wait for a yes first. No key needed: never ask for one. |
| A feature is empty in the preview, or you add code reading `process.env.X` | Its value is one of the app's settings. Run `node "${CLAUDE_PLUGIN_ROOT}/cli/cloclod.mjs" settings` to see which are missing here or on their site, and open `settings` with `open_panel` for them to paste the value (**Your app's settings**). The preview restarts with it. Never ask for the value in the chat. |
| "Leave Lovable", "move off Lovable Cloud" | Open `move` with `open_panel`. Explain the current step in the conversation when needed. Each step they press comes to you, and the `cloclod-move` skill says how to run it. |
| "Prepare a web address for my app", "how do people see my app?" | Read `app_context`. If hosting is unknown, inspect and confirm first. If it has no hosting, open `site` with `open_panel`; the builder chooses their Netlify account and confirms creation there. This prepares an address; **Publish** makes the site public. |
| "Add a backend", or a feature that needs sign-in or saved data when the app has none | Explain why in one sentence, then open `backend` with `open_panel` for account/cost consent. Cloclod creates it and returns integration to you. Keep the original feature request in mind; do not ask the builder to repeat it. |

## The preview toolbar

At the bottom of their app's preview there's a small Cloclod toolbar. It exists only in development, and visitors never see it. It offers:
- **Edit text:** they change words in place and Cloclod writes the change to the code. No action is needed from you.
- **Point & ask:** messages like "About the heading “Bread worth waking up for”: make it warmer" come from it. What they pointed at (the element, its file and line) reaches you beside the message. Treat it as the builder's request.
- **Try to fix:** when a page crashes, they can send it to you: "Fix the /menu page: it's broken in the preview", with the error, its file and line and the console beside the message. Fix the cause, then check the page in the preview.

Never remove the toolbar or edit `.clodable/` files, except `.clodable/config.json` when asked.

## Their database is live

The preview uses their real data. Before any database change:
1. Say what will change in one plain sentence and ask for a yes.
2. Prefer additive changes. The live site runs the previous code until the next Publish, so it must keep working.
3. Save each schema change as a migration file in `supabase/migrations/`.
4. Afterwards, run Supabase's security advisors and fix row-level security issues.

Edge functions in `supabase/functions/` go live at Publish. Don't deploy them yourself unless Cloclod asks you to right after a Publish.
