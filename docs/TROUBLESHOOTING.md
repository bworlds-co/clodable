# Troubleshooting

For builders who use Clodable in Claude Desktop, and for the people helping them.

Look for the words you see on screen (⌘F on this page), then follow the steps. A heading in quotes is exactly what Clodable or Claude Desktop says; the others describe what you see. *For a developer* lines are for whoever helps you with the technical side.

Two things hold whatever happens. Your live site only changes when you press **Publish** (changes to your database are the one exception, and Claude asks you first). And **History**, in the Clodable panel, can bring back any earlier version with **Restore**.

Clodable shows itself in two places:
- **The Clodable bar**, above the message box: what's saved, what isn't live yet, and **Publish**.
- **The Clodable panel**, on the right: your app, **History** and **Settings**. Type `/clodable` to open it, or ask Claude to open it.

Not on this page? [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new): the words on screen, what you pressed just before, and a screenshot if you can. Never include a key, a token or a password.

[Setting up](#setting-up) · [Saving](#saving) · [Publishing and Undo](#publishing-and-undo) · [The preview](#the-preview) · [Moving off Lovable](#moving-off-lovable) · [Claude Desktop's own quirks](#claude-desktops-own-quirks) · [Anything else](#anything-else)

## Setting up

### “Clodable isn't set up in this project.”

- **When:** Claude tells you, in a folder that holds an app Clodable hasn't been set up in. The panel says “This folder already holds an app. Clodable can set itself up right here.”
- **Why:** Clodable only acts in apps it was set up in, so your other projects stay exactly as they are.
- **What to do:** type `/clodable` to open the Clodable panel. If your app is on GitHub, press **Set up Clodable here**. If it isn't yet, press **Set up saving**: the panel names your GitHub account and creates a private app there.
- **Check:** the Clodable bar appears above the message box, and the panel shows your app's name at the top.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Your files are on this computer. Clodable isn't saving them yet.”

- **When:** Claude made a first version of your idea in this folder, or the folder holds files that aren't on GitHub. Claude may say “This folder isn't connected to GitHub yet.”
- **Why:** Clodable saves your work to your GitHub account, and this folder isn't connected to it yet. Your files are safe on this computer.
- **What to do:** type `/clodable` to open the Clodable panel and press **Set up saving**. The panel names your GitHub account and asks before creating a private app there. Nothing goes on the web until you publish. In an empty folder, the panel offers **Start from an idea** or **Bring an app from GitHub** instead.
- **Check:** the Clodable bar appears, and Claude's next reply that changes your app shows **✓ Saved**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “✕ Git”

- **When:** setting up, the panel's **1 · Tools** shows ✕ next to Git.
- **Why:** this Mac doesn't have Git yet. Clodable needs it to keep each version of your app.
- **What to do:** press **Install Git**. Apple's installer opens in its own window: follow it, then press **Check again**.
- **Check:** the panel shows ✓ Git.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “✕ GitHub account”

- **When:** setting up, the panel's **1 · Tools** shows ✕ next to GitHub account.
- **Why:** Clodable isn't signed in to your GitHub account on this computer yet.
- **What to do:** press **Connect GitHub**. The panel shows a one-time code: press **Copy the code**, open **github.com/login/device**, paste the code and approve. You can ignore the Terminal command written under ✕ GitHub account: the button does the same.
- **Check:** the panel shows ✓ GitHub account, with your GitHub name.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Clodable's settings file can't be read.”

- **When:** Clodable opens your app and can't read its settings file, `.clodable/config.json`. A close cousin: “Clodable's settings file has a value it doesn't understand.”
- **Why:** the file has a typo or a value Clodable doesn't know, and Clodable stops rather than guess.
- **What to do:** ask Claude to check `.clodable/config.json` and fix it.
- **Check:** the Clodable bar shows where your app stands again, such as “Everything is live”.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

## Saving

Clodable saves your changes to your draft on GitHub after each of Claude's replies.

### “Not saved” · “A secret key is in …”

- **When:** right after one of Claude's replies, in the Clodable bar. The panel names the file.
- **Why:** every save is checked for secret keys before it leaves your computer, and this one holds a key. A key in your app's files would reach GitHub and your visitors' browsers. Nothing went to GitHub.
- **What to do:** press **Fix it**. Claude moves the key out of the code, to a safe place on the server, and Clodable saves on its own. If that key was ever shared or published before, replace it with the service it belongs to.
- **Check:** the bar no longer says **Not saved**, and the reply shows **✓ Saved**.
- *For a developer:* when the key sits in an earlier save made outside Clodable and not sent yet, the panel says so: that save has to be taken back by hand.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Couldn't save: Saving needs to know who you are.”

- **When:** after one of Claude's replies, in a short message that passes.
- **Why:** each save carries your name, which Clodable takes from your GitHub account, and it can't reach that account right now. Your changes stay on this computer meanwhile.
- **What to do:** connect your GitHub account in the Clodable panel, as below for “Clodable isn't connected to your GitHub account.”
- **Check:** Claude's next reply that changes your app shows **✓ Saved**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Clodable isn't connected to your GitHub account.”

- **When:** you press **Publish**, or Clodable checks your app, and the GitHub sign-in on this computer is missing or no longer works.
- **Why:** Clodable saves and publishes through your GitHub account, and has to be signed in to it.
- **What to do:** type `/clodable` to open the Clodable panel and connect your GitHub account there:
  - while setting up, press **Connect GitHub** and enter the one-time code at **github.com/login/device**;
  - in an app that's already set up, the panel lists **GitHub account** in red: press **Review 1 check** under it (the number can differ), then **Let Claude fix it**, and follow what Claude says.
- **Check:** the panel no longer lists GitHub account, then **Publish** goes through.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Saved on this computer. It goes to GitHub once it's checked for secret keys.”

- **When:** after a reply, when Clodable couldn't run its secret-key check, most often because the computer is offline the first time Clodable fetches it. At Publish, the same thing reads “Couldn't check your changes for secret keys, so nothing was sent.”
- **Why:** nothing leaves your computer unchecked. Your saves wait here until the check runs.
- **What to do:** check your internet connection. The next save checks and sends everything that waited.
- **Check:** after Claude's next reply, the message doesn't come back, and the panel's **Settings** shows no “Secret-key check” under **Worth a look**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “GitHub didn't accept your changes.”

- **When:** a save sends your work to GitHub, and GitHub refuses it. At Publish it reads “GitHub didn't accept the update.”
- **Why:** the GitHub account connected on this computer may not be allowed to change this app on GitHub.
- **What to do:** check that your GitHub account can make changes to the app: if someone else owns it on GitHub, ask them to give your account write access.
- **Check:** Claude's next reply shows **✓ Saved**, or **Publish** goes through.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

## Publishing and Undo

When Publish stops, the bar says **Not published** and a few words of why. **See why** opens the whole story in the panel. Whatever the reason, nothing went live and your live site keeps working.

When Lovable hosts your site, a Publish that goes through ends at **Published on GitHub** rather than **You're live**: see below.

### “Not published” · “A page doesn't build”

- **When:** you press **Publish** and Clodable's check finds a mistake that stops your app from building. The panel names the file and line, for example “A page doesn't build (src/pages/Pricing.tsx, line 12)”, or says “Your app doesn't build”.
- **Why:** a page that doesn't build would break your live site, so Clodable stops first.
- **What to do:** press **Fix it**. Claude gets the error, the file and what the check printed, and fixes the cause. Then press **Publish** again.
- **Check:** Publish's steps show “It builds”, and the bar says **You're live**.
- *For a developer:* **Details** in the panel shows the build's output.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Not published” · “The live site changed the same text”

- **When:** you press **Publish**, and since your draft started, the live site got a change to the same lines: someone else's Publish, a change made in Lovable, or a developer's. The panel says “Your draft and the live site both changed the same thing.”
- **Why:** both versions changed the same words, and Clodable won't choose for you. Your preview is unchanged.
- **What to do:** press **Let Claude combine them**. Claude compares both versions without changing your files, keeps the changes that fit together, and asks you which to keep where both changed the same thing. Then press **Publish** again.
- **Check:** the bar no longer says **Not published**, and after **Publish** your site shows the version you chose.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Not published” · “A secret key is saved in …”

- **When:** you press **Publish**, and the check of the version about to go live finds a secret key in a file.
- **Why:** a key in your app's files would reach your visitors' browsers.
- **What to do:** press **Fix it**: Claude moves the key out of the code. If the key has been on GitHub or shared, replace it with the service it belongs to. Then press **Publish** again.
- **Check:** Publish's steps show “No secret keys exposed”, and the bar says **You're live**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Not published” · “1 package has a critical security issue”

- **When:** you press **Publish**, and a package your app uses has a known critical security problem. With several: “3 packages have a critical security issue”.
- **Why:** Clodable doesn't put a known critical problem live. A less serious known issue is only a note.
- **What to do:** press **Fix it**: Claude sees which package it is and fixes it. Then press **Publish** again.
- **Check:** Publish goes past the checks, and the bar says **You're live**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Your project's own checks didn't pass”

- **When:** you press **Publish** in a project where a developer added checks of their own on GitHub, and one failed. The panel names it. If it says “Your project's checks are taking too long.” instead, press **Publish** again in a few minutes.
- **Why:** Clodable waits for your project's own checks, and stops when one fails.
- **What to do:** press **Fix it**: Claude looks at the failing check and fixes it. Then press **Publish** again.
- **Check:** Publish goes past the checks, and the bar says **You're live**.
- *For a developer:* these are the CI checks on the draft's pull request.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Your changes are published on GitHub, but your host couldn't put them live.”

- **When:** after **Publish**, your host (Netlify, Vercel…) tried to put the new version live, and failed.
- **Why:** something in the host's build or settings went wrong. Your previous version is still live.
- **What to do:** press **Fix it**: Claude reads the host's report and fixes the cause. Then press **Publish** again.
- **Check:** the bar says **You're live**, and your site shows the change.
- *For a developer:* **Details** links to the host's log. On a site Clodable set up on Netlify, the build is the `clodable-netlify.yml` GitHub Actions workflow.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Your changes are saved on this computer, but GitHub can't be reached to publish them.”

- **When:** you press **Publish** while this computer is offline, or while GitHub doesn't answer. Elsewhere it reads “GitHub can't be reached right now.”
- **Why:** Publish goes through GitHub. Your changes are safe on this computer.
- **What to do:** check your internet connection, then press **Publish** again.
- **Check:** Publish goes past “Saving your latest changes”, and the bar says **You're live**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “GitHub didn't publish your draft.”

- **When:** you press **Publish**, and GitHub refuses to put your draft live.
- **Why:** your app on GitHub has a rule that asks for something first, such as a review. A developer usually sets these rules; Clodable needs none of them.
- **What to do:** in the panel's **Settings**, open **Draft on GitHub** to see what it asks for. If someone else manages your app on GitHub, ask them.
- **Check:** press **Publish** again: the bar says **You're live**.
- *For a developer:* GitHub refused the squash-merge of the draft's pull request, usually because of branch protection or required reviews on the live branch.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Published on GitHub” · “Not on the web yet”

- **When:** right after **Publish**, when no host put your app on the web.
- **Why:** your new version is saved as the live one on GitHub, but Clodable didn't see a host publish it: an app needs hosting to be on the web.
- **What to do:** if your site didn't change, or you don't have one yet, press **Set up hosting**. Connect Netlify (free to start) and choose your team, and Clodable creates your site. Then press **Publish**: that's what makes it public.
- **Check:** the bar says **You're live** with your site's address. Open it to see your app.
- *For a developer:* Clodable follows the host's GitHub deployment. A host that deploys from GitHub without reporting a deployment there looks like no host: check its GitHub integration.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Published on GitHub” · “Put it live in Lovable”

- **When:** after **Publish**, for an app whose site Lovable hosts.
- **Why:** Lovable only puts live what's published in Lovable. Your changes reached Lovable through GitHub.
- **What to do:** click **Put it live in Lovable** (or open your project in Lovable), click **Publish**, then **Publish changes**.
- **Check:** your live site shows the change.
- *For a developer:* Lovable's GitHub link brings the live branch into the Lovable project, so it stays on until the very end of a move off Lovable.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Newer changes on your live site touch the same lines, so this can't be undone automatically.”

- **When:** you press **Undo** on a publish, and something published since changed the same lines.
- **Why:** undoing it on its own would also undo or break the newer change, so Clodable stops. Your live site is unchanged.
- **What to do:** ask Claude to undo it by hand: it can see exactly what changed. Then press **Publish**.
- **Check:** after **Publish**, your live site no longer has the change you wanted undone.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

## The preview

### “Your app can’t load” · “This page can’t load” · “Something broke on this page”

- **When:** in the preview beside the conversation, after a change: a mistake in the code stops the app or a page.
- **Why:** the code has a mistake, such as a file it refers to that doesn't exist. **Show details** says where.
- **What to do:** press **Try to fix**. Claude gets the error, the page and the place in the code, and fixes it. The card says “Claude is fixing it…” meanwhile.
- **Check:** the preview updates by itself, and the page works.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### Clodable's tools cover part of your app

- **When:** in the preview, Clodable's toolbar sits over a button or link of your app.
- **Why:** the toolbar floats over the bottom of the page. In a short preview, such as when Claude Desktop splits its height between panes, it starts folded as a small **Tools** button, and opens when you press it.
- **What to do:** hide the tools with the toolbar's last button, or ⌥⇧H. A small Clodable mark stays in the corner (it reads **Copy · Tools** while the preview uses a copy of your data): press it, or ⌥⇧H again, to bring the tools back.
- **Check:** the button or link of your app can be pressed.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

## Moving off Lovable

The move runs in the Clodable panel, one step at a time, and Claude runs each step in the conversation. Your live app keeps running on Lovable until you go live. Paste keys and tokens in the panel, never in the conversation.

### “Supabase runs 2 free projects per person”

- **When:** creating your new backend. The panel goes on: “counted across all your organizations, and you already run …”. When adding a backend outside the move, it reads “Your Supabase account already runs its 2 free projects”.
- **Why:** Supabase's free plan allows 2 active projects per person, across every organization you belong to.
- **What to do:** pause a project you don't use in Supabase (Project settings → Pause project), then check again in the panel. Or pick an organization on a paid plan: the panel shows what a project costs there before you create anything.
- **Check:** the panel shows the cost for your organization and lets you create your backend.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### Lovable's “Start export” comes back without a download

- **When:** in Lovable (More → Cloud → Advanced settings → Export data), you press **Start export**. It says it's exporting, shows **Start export** again, and nothing downloads.
- **Why:** Lovable refused the export. In our tests, Lovable said the database was too large to export; that doesn't tell how large it really is.
- **What to do:** contact Lovable to get your database export. If they send you a file (a `.dump` or `.backup`, or a zip holding one), save it on this computer and tell Claude where it is: Clodable reads it. An older export can rehearse the copy, but the final copy needs a fresh one.
- **Check:** the export step reads the file and says what it holds: tables, people and files.
- *For a developer:* the browser console shows `api_error_database_too_large_for_export`.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Clodable couldn't match an export in Downloads to this app.”

- **When:** the export step looks in your Downloads folder and finds no export it can tie to this app.
- **Why:** Clodable matches the export's name to your Lovable project, so it never copies another app's data by mistake.
- **What to do:** download this app's export from Lovable again, or tell Claude the name and place of the file (a `.zip`, `.backup` or `.dump`).
- **Check:** the export step says what it read: tables, people and files.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “That export is labelled for a different Lovable app.”

- **When:** the file you pointed to is named for another of your Lovable apps.
- **Why:** Clodable won't copy one app's data into another. Your saved copy hasn't changed.
- **What to do:** download this app's export, or tell Claude where you saved the right file. Don't rename another app's export to get past this.
- **Check:** the export step says what it read: tables, people and files.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “That export was made before the pause: it would miss what people wrote since.”

- **When:** going live carefully, after you paused your live app, Clodable reads an export made before the pause.
- **Why:** that export would lose what people wrote after it. Either the zip in Downloads is the old one, or the pause didn't run.
- **What to do:** check the pause ran in Lovable (its SQL editor says so), export again, download the new zip, then press the step again. Lovable allows one export a day: the panel says when the next one is possible.
- **Check:** the final copy starts.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### The export has 0 people

- **When:** the export step says your export holds 0 people, though people sign in to your app.
- **Why:** this export contains no accounts. That alone doesn't say why.
- **What to do:** compare the export's date with when people last signed up, and talk it through with Claude before you go on: use this export, or ask Lovable for another.
- **Check:** the export you go on with shows the number of people you expect.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### Pages are empty on the copy: “Could not find the table … in the schema cache”

- **When:** you try your app on the copy (the toolbar says **Copy**) and pages show no data.
- **Why:** the copy loads with some of the database's automatic actions turned off, so its list of tables wasn't refreshed.
- **What to do:** ask Claude to check your new backend. Clodable's check fixes this, on the copy only.
- **Check:** reload the preview: your data shows.
- *For a developer:* `move diagnose --fix` asks the API to reload its schema cache.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### Sign-up says “Check your email”, then nothing works

- **When:** on the copy, a new sign-up asks to confirm by email, and then nothing works.
- **Why:** new Supabase projects ask for email confirmation, and their links go to an address that isn't your preview.
- **What to do:** ask Claude to check your new backend. Clodable's check lets the preview sign people in on the copy.
- **Check:** sign up again in the preview: you're signed in.
- *For a developer:* the confirmation links point to `localhost:3000`; `move diagnose --fix` changes the copy's sign-in settings only.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### A feature is empty on the copy

- **When:** trying your app on the copy, a feature that works on Lovable shows nothing: a greeting, AI summaries.
- **Why:** its server code reads one of your app's settings, and those values live in Lovable's hosting, not in your data.
- **What to do:** paste each value where the Clodable panel asks for it: in **Try your app on the copy**, **Put your site on Netlify**, or **Your app's settings**. The preview restarts with it.
- **Check:** the feature shows in the preview.
- *For a developer:* the code reads `process.env.X`; values are kept on this computer and set on the Netlify site, never in the project.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### Your app's AI features call Lovable's AI

- **When:** Claude found AI features in your app. During the move, the step **Switch off Lovable's services** handles them. Once you're off Lovable, the panel's **Settings** lists **Lovable AI** under **Worth a look**.
- **Why:** Lovable's AI only works for apps on Lovable.
- **What to do:** in the move, pick a provider (OpenRouter, Google Gemini or OpenAI) and paste your key in the panel; Claude points the code at it. Once you're off Lovable, press **Switch it** next to Lovable AI.
- **Check:** use the AI feature in the preview: it answers.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Your private folders (…) need Lovable Cloud's service key, to read them once.”

- **When:** the move's files step, when your app keeps some uploaded files in private folders.
- **Why:** private files can only be read with Lovable Cloud's own key.
- **What to do:** follow the panel: run the query it shows in Lovable (or ask Lovable's chat to run it), then paste the result in the panel, not in the conversation. It's used for this copy only and never saved.
- **Check:** the files step finishes and says how many files it copied.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### `role "sandbox_exec" does not exist`

- **When:** among the notes after copying your data.
- **Why:** it's a role of Lovable's own, which your new backend doesn't need.
- **What to do:** nothing: it's harmless.
- **Check:** the copy's checks pass.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “… waiting for its records”

- **When:** the move's emails step or domain step, after you added the records the panel shows at your domain's provider (where you bought the domain).
- **Why:** new records can take a few minutes to show, sometimes a few hours, or one was entered differently.
- **What to do:** compare each record at your provider with the panel's (each has a Copy button). The usual slips: the name typed with the domain repeated (`send.example.com.example.com`: many providers add the domain themselves), quotes around a TXT value, or another SPF record already on `send`. Give it an hour, then press **Check again**.
- **Check:** the step says “Your emails are ready”, or your domain shows your new site.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “This app is moving to a new home: try again in a few minutes.”

- **When:** during the pause, someone tries to sign up, or to change their password or email, on your live app.
- **Why:** the pause holds these on purpose, so nothing is lost while your data moves. Signing in still works.
- **What to do:** nothing: finish the final copy and go live. Only if you decide not to switch, undo the pause in Lovable with the line the panel shows.
- **Check:** after you go live, sign-ups work on your new site.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Supabase isn't connected on this computer yet.”

- **When:** a step of the move, or a change Claude makes to your database, needs your Supabase account. It can also read “Supabase isn't connected on this computer.” or “Supabase didn't accept your access token.”
- **Why:** Clodable reaches your Supabase account with an access token kept only on this computer. It's missing, or Supabase no longer accepts it (expired or deleted).
- **What to do:** connect Supabase again in the Clodable panel (**Reconnect your database account**, or the move's first step). Create a token in Supabase (Account → Access Tokens → Generate new token) and paste it in the panel. Keep that token as long as you want Claude to change your database: deleting it means connecting again.
- **Check:** the panel no longer asks you to connect, and the step goes on.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Your new backend isn't available to this Supabase account.”

- **When:** the move checks the backend it created earlier, and the Supabase account connected here can't see it.
- **Why:** it may have been removed, or your access may have changed. That alone doesn't mean it's deleted, paused or empty. Your live app hasn't changed.
- **What to do:** open Supabase and check you're in the right account, and that the project is still listed. If you connected another account, connect the right one in the panel. Clodable doesn't create a replacement on its own: if the project is gone, ask for help before going on.
- **Check:** ask Claude to check your new backend: it says “Your new backend is running”.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Your new backend is paused.”

- **When:** a step of the move, or Claude's check of your new backend.
- **Why:** Supabase has paused the project.
- **What to do:** open it in Supabase and restore it, then press the step again. Your live app hasn't changed.
- **Check:** ask Claude to check your new backend: it says “Your new backend is running”.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

## Claude Desktop's own quirks

*Last checked: 2026-10-18, Claude Desktop 2.42304.0.*

These come from Claude Desktop itself, so Clodable can't change them. Here's how to get past each.

### “/clodable isn't a command here.”

- **When:** you type `/clodable` as the first message of a new conversation.
- **Why:** the message comes from Claude Desktop's own handling of commands, not from Clodable. The panel opens anyway, and may show setup for a moment before your app.
- **What to do:** look at the right side: the Clodable panel is there. If it isn't, ask Claude to open Clodable.
- **Check:** the panel shows your app's name, or “What would you like to make?” in an empty folder.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Failed to add marketplace.”

- **When:** adding Clodable in **Customize › Plugins**, when Clodable was already added from a different address.
- **Why:** Claude Desktop refuses a second address for the same marketplace, and its screen only shows this short message.
- **What to do:** remove the Clodable marketplace that's already there (Customize › Plugins), then add `bworlds-co/clodable` again.
- **Check:** Clodable shows under **Discover**, with **Add**.
- *For a developer:* Claude Desktop's log (`~/Library/Logs/Claude/main.log`) gives the reason: the new source doesn't match the one already declared. In Terminal, `claude plugin marketplace remove clodable` removes it.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### Searching Discover doesn't find Clodable

- **When:** after adding the marketplace, you search for Clodable in **Discover**, and it isn't listed.
- **Why:** in our tests, Discover's search didn't list Clodable even once its marketplace was added.
- **What to do:** filter **Source** to clodable instead of searching.
- **Check:** Clodable is listed, with **Add**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### Claude Desktop asks permission to run a command

- **When:** in Claude Desktop's **Manual** mode, Claude wants to run commands around a step, for example to look at your app before setting something up.
- **Why:** these questions are Claude Desktop's. Clodable's own buttons (setting up, Publish, creating your hosting or your backend) run without them; the questions come from extra commands Claude chose to run. A question can describe a command that only reads as one that changes something.
- **What to do:** before you answer, you can ask Claude, in plain words, what the command does. In **Auto** mode, Clodable's own steps went through without these questions in our tests.
- **Check:** the step finishes, and the panel shows it done.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### A button that asks you to confirm does nothing in the preview

- **When:** in the preview, you press a button that should first ask you to confirm, such as Delete, and nothing happens.
- **Why:** Claude Desktop's preview cancels the browser's own confirmation box without showing it. A usual browser shows it, so your visitors aren't affected.
- **What to do:** ask Claude to show that confirmation inside your app instead of the browser's box.
- **Check:** press the button again in the preview: your app asks, and the action goes through when you confirm.
- *For a developer:* in Desktop's Browser pane, `window.confirm` returns `false` at once.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

### “Fix merge conflicts”

- **When:** Claude Desktop suggests it while nothing conflicts in your app.
- **Why:** it's Claude Desktop's own suggestion, not Clodable's.
- **What to do:** you can leave it. When your draft and the live site really changed the same thing, the Clodable bar says so: **Not published** · “The live site changed the same text”, with **Let Claude combine them**.
- **Check:** the Clodable bar doesn't say **Not published**.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

## Anything else

### “Something unexpected went wrong.”

- **When:** anywhere, when Clodable meets something it can't explain in plain words.
- **Why:** an unexpected problem. The details are for a developer.
- **What to do:** try again. If it happens again, open **Details** in the panel if it's there, copy what it shows, and send it with your report below.
- **Check:** what you were doing finishes.
- **Still stuck?** [Tell us what happened](https://github.com/bworlds-co/clodable/issues/new).

---

**Keeping this page true.** Every entry comes from Clodable's own messages (the codes in `packages/core/src/errors.ts` and the messages that use them, `plugin/hooks/words.ts`, the panel in `plugin/hooks/register.tsx`, the preview's `packages/preview/src/client/errors.ts`), the move's known issues (`plugin/skills/clodable-move/SKILL.md`), or failures seen in Claude Desktop ([FINDINGS](testing/FINDINGS.md), [UX report](testing/UX-REPORT.md)). When a message changes, change its entry; check Claude Desktop's quirks again on a new Desktop version and update the date above.
