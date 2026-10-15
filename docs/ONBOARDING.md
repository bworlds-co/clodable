# Onboarding a client to Clodable

A playbook for you, or the client's developer, when helping a builder move from Lovable to Clodable.

**How long it takes:** 30–45 minutes for an app on its own Supabase. Plan a separate migration window for apps on Lovable Cloud or Lovable AI (step 7).

## 0. Before the call

Find out four things. `npx clodable doctor`, run later in the project, confirms most of them:

| Question | Why it matters |
|---|---|
| Is the database **Lovable Cloud**, or the client's own Supabase? | Lovable Cloud needs a migration first (step 7) |
| Does the app use **Lovable AI** (`LOVABLE_API_KEY`)? | Those calls stop working after leaving Lovable |
| Is the site **hosted by Lovable**, maybe on a custom domain? | They'll need a new host before the domain moves |
| Which **Claude plan** will they use? | Pro and Max are personal. A company's app needs Claude Team or Enterprise |

## 1. Get the code on GitHub (in Lovable)

In Lovable, connect the project to GitHub, in the client's own account or organization. Check that the repository has the latest version of the app.

## 2. Install, on the client's computer

Follow [Get started](../README.md#get-started) with them:
1. [Claude Desktop](https://claude.com/download), signed in with the right plan.
2. [Node.js](https://nodejs.org/en/download) and the [GitHub CLI](https://github.com/cli/cli/releases/latest) (`macOS_universal.pkg`). Clodable's setup checks each one and says what's missing. Git: macOS offers it in one click the first time it's needed.
3. Add Clodable, in Terminal. Claude Desktop doesn't include Claude Code's command line, and can't add a marketplace itself, so the line installs it first and calls it by its full path (a new Mac's Terminal doesn't search `~/.local/bin`):
   ```
   curl -fsSL https://claude.ai/install.sh | bash && ~/.local/bin/claude plugin install clodable --marketplace bworlds-co/clodable
   ```

## 3. Bring the app in

1. Create an empty folder, for example `~/Apps/<their app>`, and open it in Claude Desktop's **Code** tab.
2. Type `/clodable`. In the panel, connect GitHub if asked, pick the repository, and click **Bring it in**. In a terminal, `npx clodable setup` does the same.

Setup adds a few plain files to the project, merging them with anything already there:

| File | What it's for |
|---|---|
| `AGENTS.md` and `CLAUDE.md` | How Claude should work with a builder: plain words, careful with live data |
| `.claude/launch.json` | Starts the app in Desktop's preview, with the Clodable toolbar |
| `.claude/settings.json` | Turns the plugin on, plus safe permission defaults |
| `.mcp.json` | The official Supabase connection, scoped to this app's project |
| `.clodable/config.json` | The live branch, the live URL, and the checks |

## 4. The first preview

The preview starts by itself in Desktop. Show the builder three things:
- The toolbar at the bottom of their app: **Edit text**, **Point & ask**, and the phone and tablet sizes.
- The **Publish bar** above the message box. It says what's saved and what's live.
- That they can ask for anything in their own words, and every reply is saved.

## 5. Hosting and the first Publish

1. If Lovable hosts the app today, import the GitHub repository into the new host, with production branch `main`.
   - TanStack Start apps (Lovable's default since May 13, 2026) need a host that runs a server.
   - Classic Vite apps can be served as static files.
2. Copy the app's public environment variables to the host, for example `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Click **Publish** in Claude Desktop. This first publish only adds Clodable's files, so the site looks the same.
4. Record the live address: `npx clodable kit --live-url https://their-site.com --apply`, then publish again.
5. When the new host is verified, move the custom domain. Keep Lovable hosting live until then.

## 6. Disconnect Lovable's GitHub sync

In Lovable, open **More → Settings → Git → GitHub → Disconnect**. Otherwise Lovable keeps pushing straight to the live branch. Keep the Lovable project as a read-only archive.

## 7. Leaving Lovable Cloud or Lovable AI

The builder types `/move-off-lovable`, which opens the move in the Clodable panel (**Move off Lovable**); once it has started, the panel opens on it. Claude first looks at the app to see what it uses (AI, sign-in, emails, payments…), then guides each step: a working copy on their own Supabase to try, the site on Netlify, their own emails and AI key, then the switch, carefully (with a short pause) or in one go for a prototype. The live app stays on Lovable until then. Stay close for the parts the panel marks as best done with help.

## 8. Hand-off note for the builder

> **Your app now lives on your computer and on your GitHub. Here's all you need:**
> - **Ask for a change** in your own words. You'll see it in the preview right away, and it's saved automatically.
> - **Click Publish** when you're happy. Clodable checks everything, then your site updates.
> - **Changed your mind?** Click **Undo** in the Clodable bar.
> - **Something looks broken?** Click **Try to fix** on the page.
> - Changes to your database apply right away, and Claude always asks you first.

## Troubleshooting

| What you see | What to do |
|---|---|
| The preview doesn't start | Run `npx clodable doctor` in the project. It lists what's missing |
| "Your draft and the live site changed the same thing" | Click **Let Claude combine them** in the bar |
| "Published" but not "You're live" | The host isn't connected to GitHub deployments. Check the host's GitHub integration |
| "A secret key is saved in…" | Move the key to the host's or Supabase's secret settings, then publish again |
| Anything else | `CLODABLE_VERBOSE=1 npx clodable publish` shows the details for a developer |
