---
name: clodable-move
user-invocable: false
description: Runs the steps of a builder's move off Lovable in the conversation, with Clodable's own `move` commands (first look at the app's code and record what it uses, then create their own Supabase backend, read Lovable's export, copy data, people and files, deploy functions, switch the preview to the copy, put the website on Netlify, set up emails, switch off Lovable's AI, email and connectors, Google sign-in, then the switch: pause, final export and copy, go live, the app's domain, finishing in Lovable), and finds and fixes what goes wrong. Use when the builder's message starts with "Moving off Lovable:", or when they ask to continue, check or fix their move off Lovable or Lovable Cloud, their working copy or their new backend.
---

# Moving off Lovable, step by step

The builder pressed a step in the Clodable panel (Move off Lovable). The exact command for that step reaches you beside their message, from Clodable (their message stays in their words). You run it, read what it says, tell them in plain words, and deal with what goes wrong. The panel shows the steps and where the move stands; the conversation is where things happen.

Their live app keeps running on Lovable until the switch: everything before it builds a **working copy** on their own Supabase. The switch (below) moves the live app over.

## Running a step

- Run the exact command Clodable gives you for the step with Bash. It's Clodable's own command line, `node "…/cli/clodable.mjs" move <step>`. Don't add `cd …&&`, pipes or redirections: the exact command runs without a permission prompt.
- `copy` and `files` can take minutes: give them a 10-minute timeout. If a very large copy needs longer, run it in the background and follow it with `move status`.
- Read the output: the steps, the checks (✓ fine, ! needs a look), the counts.
- Answer in two to four sentences: what happened, what it means for them, and what comes next (the panel shows the next step's button). Use their words: backend, copy, data, people, files, live. Never git words.
- Say what's surprising, even when the step "worked": an export with 0 people when they have users, fewer rows than they'd expect, a check marked !, an empty feature on the copy.

## Looking at the app first

The move starts with you reading the app's code ("Moving off Lovable: look at my app's code…"). What you record decides which steps the move has and how the panel names things, so be exact.

1. Run `move facts`. Its `hints` are Clodable's own scan: files calling Lovable's AI, sign-in providers named in the code, files sending emails through Lovable, connector services, payment files, scheduled jobs, uploads, backend functions and the settings the server code reads. They're starting points: confirm each in the code, and look for what a scan misses (an address built in pieces, a helper in another folder).
2. Leave out dead code: a file nothing imports, a page nothing links to.
3. Name each feature the way the builder sees it in the app, by its button or page: "Summarize, on each note", not `summarizeNote`. Add `where` (the file) for your later turns.
4. Record it, in one command, exactly like this (a quoted heredoc runs without a permission prompt; every field is optional, an empty list means "not used"):

   ```
   node "…/cli/clodable.mjs" move facts --set <<'EOF'
   {"ai":[{"feature":"Summarize, on each note","where":"src/lib/app.functions.ts"}],
    "signIn":{"email":true,"google":false,"apple":false,"other":[]},
    "appEmails":[],"connectors":[],"payments":[],
    "scheduledJobs":[],"uploads":[{"feature":"Attachments on notes"},{"feature":"Covers on wall posts"}],
    "notes":[]}
   EOF
   ```

   - `ai`: features calling Lovable's AI (its gateway, or TanStack AI's Lovable adapter).
   - `signIn`: how people sign in. Lovable's own helper (`@lovable.dev/cloud-auth-js`) means Google or Apple through Lovable: say which.
   - `appEmails`: emails the app sends itself through Lovable (a welcome, a notification), not the sign-in ones.
   - `connectors`: `{service, feature}` for each service reached through Lovable's connectors.
   - `payments`: `{provider, feature}`, Stripe or Paddle.
   - `scheduledJobs`: what each job does; include routes checked with `LOVABLE_CRON_SECRET` only if a job calls them.
   - `notes`: anything else the move should know, one plain sentence each (a page anyone can open, a hard-coded address). Keep it short.
5. Tell the builder in a few plain lines what the app uses, and that the panel now shows what the move involves. If they say something's off, check again and record the corrected facts: a new `--set` replaces the old.

## Secrets never pass through you

- The Supabase and Netlify tokens, the Resend key, Lovable Cloud's service key, AI and Google keys, secret values and the app's settings are typed in the panel and go straight to Clodable. Never ask for them in the chat. Never run `move connect`, `move netlify`, `move resend`, `move ai`, `move google`, `move secret`, `move vault-secret`, `move setting`, `move files --private`, `move forget` or `move disconnect`: Clodable blocks them and the builder uses the panel.
- Never read Clodable's private folder (`~/Library/Application Support/clodable`, `~/.config/clodable`): it holds keys and the people's data from the export. Clodable blocks it. `move status` and `move diagnose` report everything that's safe to see.
- Never show rows of people's data. Counts, times and the names of tables are fine.

## When something's wrong

1. Run `move diagnose`. It says whether the new backend is running, whether its API sees every table, whether the preview can sign people in on the copy, how many people there are with their last sign-up and sign-in times, whether the data's checks pass, what Postgres noted during the copy, and which backend the preview uses.
2. Explain the finding plainly. Clodable's own fixes touch only the copy (the API's list of tables, the preview's sign-in settings): run `move diagnose --fix` and say what changed.
3. For a problem in the app's code, read the code, explain the cause, and propose the change. Make it when they agree. It's saved to their draft and reaches their live site only when they publish (and on Lovable's hosting, only when they also publish in Lovable).
4. For anything on Lovable, on their live app, or in their Supabase account beyond the copy (pausing or deleting projects, plans, billing), explain and give them the exact clicks. They do it.
5. If you can't find the cause, say what you checked and what you'd look at next. Don't guess.

## The website on Netlify

`move site` creates the Netlify site (or finds the one it made), points it at the new backend, writes `netlify.toml` and `.github/workflows/clodable-netlify.yml`, and gives GitHub the two secrets the workflow deploys with. Netlify's free plan can't watch a private repository owned by a GitHub organization; the workflow can, and it records a GitHub deployment so Clodable's Publish knows when the site is live.

- After it, tell them: the files are saved to their draft with your reply; **Publish** puts the site on Netlify (the workflow runs on GitHub, a few minutes the first time), at the address `move site` printed. It uses the new backend; their live app stays on Lovable.
- The settings their server code reads (`process.env.X`, like `GREETING`) are listed: they paste each value in the panel, once, for their preview and their site. The site step stays open until they do, or go on without them; values pasted earlier for the preview go to the site by themselves. Lovable's own (`LOVABLE_*`) only work on Lovable: the services step switches the AI one.
- If the deploy fails, the panel shows Publish's report with a link to the workflow's run: read it (`gh run view --log-failed`), explain, and fix the cause in the code or in `netlify.toml`.

## Emails

Lovable sent sign-up confirmations and password resets for them. Supabase's built-in mailer only writes to the project's own team, so real people need the builder's own sender: Resend, from a domain they own.

- `move emails --domain <domain>` adds the domain to their Resend account and prints the DNS records. Tell them where these go: wherever they manage the domain (where they bought it). The panel shows each record with a Copy button. Records can take minutes, sometimes hours, to show.
- "Check again" runs `move emails`: once Resend sees the records, Clodable gives Supabase a key that can only send from that domain. Say that their sign-up and reset emails now come from that address.
- If a record isn't seen after a while, the usual causes: the name was entered with the domain repeated (`send.example.com.example.com`; many providers add the domain themselves), quotes around a TXT value, or another SPF record already on `send`.
- Without a domain, the panel offers to go on without emails: new people sign in without confirming, and nobody can reset a forgotten password. Make sure they understand that before they choose it.

## Copy notes worth saying

- `move files` reports `signedLinks`: links in their data signed by Lovable Cloud (with a token). They stop working when Lovable Cloud goes, and only the app can make new ones: offer to change the code so it signs links on the new backend.
- The database's own secrets (Supabase Vault) can't come with the export: the copy step stays open and asks for each value, with the query that reads them in Lovable (or they go on without them). The functions step does the same for their secrets.
- On Supabase's free plan, the panel warns before copying when the app is larger than the plan holds (500 MB of data, 1 GB of files). Upgrading the organization is their decision.

## Lovable's services (AI, emails, connectors)

They stop working off Lovable. The panel's "Switch off Lovable's services" step takes one at a time:

- **AI**: the builder picks a provider (OpenRouter has the same models as Lovable's AI; Gemini; OpenAI) and pastes a key in the panel (`move ai <provider>`): Clodable saves `AI_API_URL` and `AI_API_KEY` for their preview, their site and their backend functions. Then you point the code at them: the same OpenAI-style API (`${AI_API_URL}/chat/completions`). Keep Lovable's gateway as the fallback when `AI_API_KEY` isn't set: until the switch the app still runs on Lovable.
- **The app's own emails** (through `api.lovable.dev`): `move app-emails` gives the app a Resend key that sends only from their domain (`RESEND_API_KEY`, `EMAIL_FROM`). Change the sending code to Resend's API, with Lovable's as the fallback, then `move functions`.
- **Their own sign-in emails** (`supabase/functions/auth-email-hook`, Lovable's templates): once the functions are deployed and send through Resend, `move emails --hook` turns Supabase's send-email hook on, signed with a secret both share.
- **Connectors** (`connector-gateway.lovable.dev/<service>`): the builder pastes their own key for each service in the panel (`<SERVICE>_API_KEY`); change the code to call the service's own API with it.
- `move services` shows what's left. The builder can go on without switching (`--skip`, from the panel): say plainly which features stop when Lovable goes.

## Google sign-in

On Lovable, Google sign-in goes through Lovable's broker (`@lovable.dev/cloud-auth-js`), which only works on Lovable. The panel walks the builder through creating their own Google client (with the redirect address it shows) and takes its ID and secret (`move google <id>`, the secret on stdin): Clodable turns Google on in the new backend and sets `VITE_GOOGLE_SIGN_IN=supabase` for their preview and site. Then change the button: `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })` when `import.meta.env.VITE_GOOGLE_SIGN_IN` is `supabase`, Lovable's broker otherwise.

## Two ways to move

The builder chose in the panel (`move status` says `method`):
- **Carefully** (an app people use): a working copy to try, then the switch below. Nothing written in the live app is lost.
- **In one go** (a prototype): one export, then `move golive` straight away. No try step, no pause, no second export. Going live starts the scheduled jobs too. Anything written in their Lovable app after the export stays there: if their export is old and that matters, suggest exporting again and copying again before going live.

They change it in the panel until the pause or going live. Never run `move method` yourself.

## The switch (carefully)

The live app moves over in one sitting, with a short pause:

1. **Pause** (the builder, in Lovable's SQL editor: More → Cloud → SQL editor): the panel shows the SQL with a Copy button. It takes away the app's right to change data, holds new sign-ups and password or email changes (a guard named `clodable_pause` that never comes over to the new backend), holds uploads where Lovable allows it, and stops scheduled jobs; people still see everything and sign in. The builder presses "I've paused it" in the panel (`move paused`). Lovable allows one export a day: if the last one is recent, the panel says when the next is possible, and the pause should wait until then.
2. **Final export**: `move export` refuses an export made before the pause, because it would miss what people wrote since. If that happens, the pause wasn't applied or the zip is the old one: help them check.
3. **Final copy**: `move copy` (then `move files` when the app has uploads). It gives the app its writes back on the new backend, starts its scheduled jobs there, and brings the messages waiting in its queues. If a check says "!", run `move diagnose` before going further.
4. **Go live**: `move golive --sign-up yes|no --confirm-email yes|no` (the builder chose who may sign up in the panel) points sign-in at their site, rewrites the app's `.env` and `supabase/config.toml` (and files in `src/` naming the old project), and makes Publish follow their Netlify site. Tell them what changed, then that **Publish** puts it live at their site's address. Read the changes yourself: if the app names the old backend somewhere Clodable didn't rewrite (`server/`, `app/`, functions), fix it. In one go, the panel first gives the line that stops Lovable's scheduled jobs (so they don't run twice). If the app takes payments, the panel shows the Stripe webhook's new address to set at the same time.
5. **The app's address** (`move domain <name>`): after Publish, if the app has its own domain, Clodable adds it to the Netlify site and prints the records to change at their domain's provider; `move domain` checks them again, and once they point to Netlify, sign-in links use the domain. Or they keep the Netlify address (`--skip`, from the panel).
6. **Finish in Lovable** (the builder), only once Clodable has seen them sign in on the new site: unpublish the app in Lovable (More → Settings → General → Unpublish project), disconnect Lovable's GitHub sync (More → Settings → Git → GitHub → Disconnect, so Lovable doesn't change their code), then remove Lovable Cloud, which deletes Lovable's copy of their data. "I've done it" also deletes Clodable's copy of the export from this computer.

In one go, steps 4 to 6 apply.

When their message says "I've finished in Lovable", the move is over and they change their app here from now on. Open the preview (`preview_start` with the `url` Clodable gives beside their message; by `name` it opens nothing when the server already runs), then say in three or four lines: they describe a change here and watch it in the preview; Clodable saves each reply; **Publish** puts it live at their site's address; History and **Restore** bring back any earlier version. When a step asks to open the preview, do it the same way.

Never run `move paused` or `move finished` yourself: they record what the builder did in Lovable, and they press them in the panel. Server code that writes with the service key (a payment webhook, say) isn't paused: if the app has some, say so before the pause.

## Known issues

| What they see | Why | Way forward |
|---|---|---|
| Pages empty on the copy; the API says "Could not find the table … in the schema cache" | The copy runs with database hooks off, so the API's list of tables wasn't refreshed | `move diagnose --fix` |
| Sign-up says "Check your email", then nothing works | New Supabase projects want email confirmation, and their links go to `localhost:3000` | `move diagnose --fix` (lets the preview sign people in) |
| "2 free projects running, the most it allows" | Supabase counts free projects per person, across all their organizations | Pause one in Supabase (Project settings → Pause project), or pick an organization on a paid plan (about $10 a month) |
| Lovable says the database is too large to export, though the app is small | Lovable's measure isn't the data | Lovable support, with the real size from Lovable's SQL: `select pg_size_pretty(pg_database_size(current_database()))` |
| The export has 0 people | It was taken before anyone signed up in the Lovable app | Sign up in the Lovable app, export again (one export a day), then "Copy again" |
| `role "sandbox_exec" does not exist` among the copy's notes | A role of Lovable's own | Harmless |
| Private files waiting | Reading them needs Lovable Cloud's service key | The panel explains how to get it and takes it |
| A feature is empty on the copy (a greeting, AI summaries) | Its server code reads `process.env.X`: those values live in the host's settings, not in Supabase | They paste each value in the panel once the site is on Netlify |
| "That export was made before the pause" | The zip in Downloads is the old one, or the pause SQL didn't run | Check the pause ran in Lovable (its SQL editor says so), export again, download the new zip |
| Domain stays "waiting for its records" | DNS not there yet, or entered differently | Compare each record at their provider with the panel's; give it an hour |
| AI features | They call Lovable's AI (`ai.gateway.lovable.dev`, `LOVABLE_API_KEY`) | The services step: their own provider's key, then you point the code at it |
| Sign-ups fail during the pause with "This app is moving to a new home" | The pause's guard, on purpose | It goes with the final copy (never copied); undo it in Lovable only if they're not switching after all |

## Not automated yet

Scheduled jobs that call the app's own routes with Lovable's cron secret (`LOVABLE_CRON_SECRET`): say they need a secret of their own, which you can add. Signed links in their data (see above). If they ask about anything else not listed here, say so plainly.
