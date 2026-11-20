# Onboarding a client to Clodable

A playbook for you, or the client's developer, when helping a builder move from Lovable to Clodable.

**How long it takes:** 30–45 minutes for an app on its own Supabase. Plan a separate migration window for apps on Lovable Cloud or Lovable AI (step 7).

## 0. Before the call

Find out four things. Once the app is in, Claude confirms where its data and its site live from the code, and asks the builder one question at a time where the code can't tell. The Clodable panel's **Settings** then shows them under **Your app's setup**:

| Question | Why it matters |
|---|---|
| Is the database **Lovable Cloud**, or the client's own Supabase? | Lovable Cloud needs the move off Lovable (step 7) |
| Does the app use **Lovable AI** (`LOVABLE_API_KEY`)? | Those calls stop working after leaving Lovable: the move switches them to the builder's own key |
| Is the site **hosted by Lovable**, maybe on a custom domain? | Each Publish then ends in Lovable. The move puts the site on Netlify, and the domain follows after going live (steps 5 and 7) |
| Which **Claude plan** will they use? | Pro and Max are personal. A company's app needs Claude Team or Enterprise |

## 1. Get the code on GitHub (in Lovable)

In Lovable, connect the project to GitHub, in the client's own account or organization. Check that the repository has the latest version of the app.

## 2. Install, on the client's computer

Follow [Get started](../README.md#get-started) with them:
1. [Claude Desktop](https://claude.com/download), signed in with the right plan.
2. Nothing else to install by hand: Clodable fetches Node.js and the GitHub CLI the first time when the Mac has none (pinned releases, checked), and its setup has an **Install Git** button that opens Apple's installer.
3. Add Clodable in Claude Desktop: **Customize › Plugins › Add › Add marketplace › Add from a repository**, enter `bworlds-co/clodable`, then, under **Discover**, click **Add** next to Clodable. If searching Discover doesn't show it, filter **Source** to clodable. (In Terminal, `claude plugin install clodable --marketplace bworlds-co/clodable` does the same.)

## 3. Bring the app in

1. Create an empty folder, for example `~/Apps/<their app>`, and open it in Claude Desktop's **Code** tab.
2. Type `/clodable` and choose **Bring an app from GitHub**. Connect GitHub if the panel asks (a one-time code at github.com/login/device), pick the repository or paste its GitHub address, and click **Bring it in**. On a new conversation's first message, Claude Desktop may answer “/clodable isn't a command here.” The panel opens anyway ([TROUBLESHOOTING](TROUBLESHOOTING.md#claude-desktops-own-quirks)).
3. Claude then looks at the app and asks, one question at a time, what the code can't tell about where its data lives and how its site goes live.

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
- The toolbar at the bottom of their app, folded as **Tools** until they press it: **Edit text**, **Point & ask**, and the phone and tablet sizes.
- The **Publish bar** above the message box. It says what's saved and what's live. When Claude Desktop hides it for a question, **Open Clodable**, beside the message box, opens the panel.
- That they can ask for anything in their own words, and every reply is saved.

## 5. Hosting and the first Publish

What the panel offers depends on where the site lives:
- **Not online yet:** the panel offers **Set up hosting**. The builder connects their own Netlify (free to start) and picks the team, and Clodable creates the site with the backend's address and the app's settings. That only prepares the address: the first **Publish** puts the site on the web, and the bar then says **You're live**.
- **On a host that deploys from GitHub** (Vercel, Netlify, Cloudflare…): nothing to set up. **Publish** updates `main`, the host puts it live, and Clodable waits for the host's GitHub deployment before the bar says **You're live**. If it says **Published on GitHub** · **Not on the web yet** instead, the host doesn't report its deployments to GitHub: check its GitHub integration.
- **Hosted by Lovable:** Publish ends at **Published on GitHub**, and the builder then clicks **Publish**, then **Publish changes**, in Lovable (the bar links there). Leaving Lovable's hosting is part of the move off Lovable Cloud (step 7): its **Prepare your website** step prepares the new site on Netlify beside the live one, without putting it online, and the domain moves after going live. Keep Lovable's hosting until then. The panel's move starts from Lovable Cloud, so an app already on its own Supabase keeps Lovable's hosting for now ([DECISIONS](DECISIONS.md) Q5e).

On an app that's already live, the first **Publish** only adds Clodable's files, so the site looks the same.

## 6. Leave Lovable's GitHub link on until the end

While the app still runs on Lovable (its hosting or Lovable Cloud), keep Lovable's link to GitHub. It carries what the builder publishes here into Lovable, so **Publish → Publish changes** there puts it live, and it brings changes made in Lovable back. The move turns it off at the very end (step 7), after a sign-in on the new site and before Lovable Cloud is removed, and the panel gives the exact clicks.

An app that's already off Lovable doesn't need it. If Lovable still sends changes, the panel's **Settings** lists it under **Worth a look** (“Lovable still pushes changes straight to your live site”), with the clicks: **More → Settings → Git → GitHub → Disconnect**. Keep the Lovable project as a read-only archive.

## 7. Moving off Lovable Cloud

The builder asks Claude to move off Lovable, presses **Move off Lovable** in the panel, or types `/move-off-lovable`. The panel's move is the one path, for developers and agencies too ([DECISIONS](DECISIONS.md) Q5e). Each step the builder presses, or asks for in their own words, goes to Claude, which runs Clodable's command, explains and fixes what goes wrong. Keys and tokens go in the panel, never in the chat.

1. **Look at your app:** Claude reads the code and records what it uses (AI, sign-in, emails, payments, scheduled jobs, uploads). The panel then shows what the move involves, and which parts are best done with help.
2. **How to move:** carefully, for an app people use (a working copy to try, then a short pause), or in one go, for a prototype.
3. **Get ready, beside the live app:** connect Supabase, create the new backend, export from Lovable, copy the data, people, files and functions, and try the app on the copy. Then the website on Netlify (prepared, not online yet), emails from the builder's own Resend account and domain, and their own AI key and Google sign-in where the app uses them.
4. **Go live:** carefully, the live app pauses while a last export is copied in. Clodable then points the app at its new home, **Publish** puts it live, and the app's domain follows.
5. **Finish in Lovable,** once a sign-in on the new site is seen: unpublish the app, turn off Lovable's GitHub link, then remove Lovable Cloud. The panel gives the exact clicks.

The live app keeps running on Lovable until step 4. Before then, **Publish** isn't a private test of the copy: it updates the app's shared code, which Lovable's GitHub link can carry to the live app. Stay close for the parts the panel marks as best done with help.

An app that's already off Lovable but still calls Lovable's AI: the panel's **Settings** lists **Lovable AI** under **Worth a look**, and **Switch it** asks Claude to move those features to the builder's own key.

## 8. Hand-off note for the builder

> **Your app now lives on your computer and on your GitHub. Here's all you need:**
> - **Ask for a change** in your own words. You'll see it in the preview right away, and it's saved automatically.
> - **Click Publish** when you're happy. Clodable checks everything, then your site updates.
> - **Changed your mind?** Click **Undo** right after publishing, or later **Undo last publish** in the Clodable panel's **History**, where **Restore** brings back any earlier version.
> - **Something looks broken?** Click **Try to fix** on the page.
> - Changes to your database apply right away, and Claude always asks you first.

## Troubleshooting

[TROUBLESHOOTING.md](TROUBLESHOOTING.md) lists what builders see on screen and what to do, message by message. The most common:

| What you see | What to do |
|---|---|
| The preview doesn't start | Ask Claude: “Show me my app's preview.” If it still doesn't start, ask Claude to run Clodable's check: it lists what's missing |
| “Your draft and the live site both changed the same thing.” | Click **Let Claude combine them**. Claude compares both versions and asks before choosing between them |
| “Published on GitHub” and “Not on the web yet” | No host put the site on the web. If the site didn't change, click **Set up hosting**. If it has its own host, check that the host reports its deployments to GitHub |
| “A secret key is in …” or “A secret key is saved in …” | Click **Fix it**: Claude moves the key out of the code. If the key was ever shared, replace it with its provider |
| “Latest publish didn't go live” | The host failed after Publish, and the previous version is still live. Click **Fix it**, or reconnect the host under **Publishing connection**, then **Retry Publish**: it sends the same version again, with no new change |
| Anything else | See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). For a developer, **Details** under a stopped Publish shows the raw output |
