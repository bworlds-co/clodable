# Clodable architecture

Clodable turns Claude Desktop's Code tab into a calm, Lovable-style place to shape an app, then publish it.

The guiding rule is **judgment in Claude, mechanics in the CLI** ([DECISIONS](DECISIONS.md) Q1). Claude reads the app, names what it uses and changes the code, through the panel's requests and the skills. Keys, API calls, the move's state and the checks live in `@clodable/core`, behind the `clodable` CLI, and the Claude mod draws them and asks Claude.

```
┌──────────────────────────── Claude Desktop · Code tab ────────────────────────────┐
│  chat (Claude)            │  Browser pane: the client's app, running locally      │
│                           │  ┌─────────────────────────────────────────────────┐  │
│  plugin/ (the only        │  │ the app + @clodable/preview toolbar (dev only)  │  │
│  Claude-specific part):   │  │ inline text edits · device sizes · "Try to fix" │  │
│  • publish band + pane    │  └───────────────────────┬─────────────────────────┘  │
│  • friendly tool rows     │                          │ writes .clodable/inbox/*.json │
│  • guards + auto-save     │◀─────────────────────────┘ (read by any front end)    │
└───────────┬───────────────┴───────────────────────────────────────────────────────┘
            │ spawns  `clodable <command> --json`  (NDJSON events on stdout)
            ▼
┌────────────────────────── clodable CLI ─── @clodable/core ────────────────────────┐
│ save · status · publish · undo · restore · history · check · dev · setup · doctor │
│ git ─ GitHub (via `gh`) ─ checks (build, packages, leaked keys) ─ repo kit        │
└───────────┬──────────────────────────────┬─────────────────────────────────────────┘
            ▼                              ▼
   GitHub: draft/<you> + pull request ──Publish──▶ main ──▶ host deploys = LIVE
```

## Packages

| Path | Name | What it is | Depends on |
|---|---|---|---|
| `packages/core` | `@clodable/core` | The logic: config, git, GitHub adapter, checks, the draft and publish flows, the repo kit, the inbox, and the event protocol | `tinyexec`, `zod` |
| `packages/cli` | `clodable` | Command-line front end over core. Prints a pretty view for people and NDJSON (`--json`) for programs | core, `cac`, `@clack/prompts`, `picocolors` |
| `packages/preview` | `@clodable/preview` | A dev-only Vite plugin: source tagger, text-edit endpoint, device frames, error capture, and the toolbar UI | `@babel/parser`, `magic-string`, design |
| `packages/design` | `@clodable/design` | Design tokens (TS + CSS), icons, and the logo | none |
| `plugin/` | Claude Code plugin | The mod (a thin UI), skills, and the manifest. It ships a bundled copy of the CLI in `plugin/cli/` | CLI bundle |
| `examples/` | none | Faithful Lovable-generated apps (classic Vite SPA and TanStack Start), used for development and tests | none |

## The branch model: GitHub Flow, hidden

| What the builder sees | What actually happens |
|---|---|
| **Saved** (after every Claude reply or text edit) | A commit on `draft/<github-login>` is pushed. At the first save, a normal pull request opens, titled with the builder's request |
| **N changes not live yet** | Commits on the draft branch that `main` doesn't have yet |
| **Publish** | 1) Save. 2) Merge `origin/main` into the draft (Claude resolves any overlaps). 3) Local checks. 4) Push. 5) Wait for the client's own CI checks, if any. 6) Squash-merge the PR. 7) Wait for the host's GitHub deployment. 8) Start a fresh draft from `main`. |
| **Live** | `main` deployed by the host (Vercel, Netlify, Cloudflare, or the client's own CI) |
| **Undo publish** | Revert the last publish commit. It goes live through the same Publish path |
| **Restore this version** | A new commit that brings back the files from an earlier save. History is never rewritten |

- `main` always equals what's live. Only Publish and developers' own pull requests touch it. The mod blocks Claude from pushing to `main`.
- No reviews or rules are required, so the free GitHub plan works. Clients with a paid plan can add branch rules on top.
- **The database is the exception.** Changes are confirmed by the builder and applied immediately, because the preview runs on live data. Each change is also saved as a migration file in the draft. Claude makes additive changes first, so the live app keeps working until the next Publish.
- Supabase edge functions go live **at Publish**, never when Claude edits them. The mod denies direct deploys. Publish deploys the changed ones through Supabase's API with the token on this computer (a move connects it), or else with the Supabase CLI; it fetches the merge first, to see what it changed.

## Protocols

### CLI events (NDJSON)

With `--json`, every CLI command prints one JSON object per line. The last line is always `{"type":"result", ...}`. Progress events let any front end draw the same story:

```json
{"type":"step","id":"checks","state":"running","title":"Checking it builds"}
{"type":"step","id":"checks","state":"done","title":"It builds"}
{"type":"result","ok":true,"live":{"url":"https://acme.com","publishedAt":"2026-10-10T17:04:00Z"}}
```

The schema lives in `packages/core/src/events.ts` and is the contract between the CLI and every front end.

### The inbox (`.clodable/inbox/`)

The preview toolbar runs inside the app's page, so it can't talk to Claude directly. It writes small JSON files that the Claude mod reads:

| File | Written when | The Claude mod reacts by |
|---|---|---|
| `fix-*.json` | The builder presses **Try to fix** on a page that broke or can’t load | `$.prompt.submit` with the error, the page and the source location |
| `edit-*.json` | An inline text edit was written to source | Running `clodable save` (debounced) |
| `ask-*.json` | The builder picked an element and typed a request | `$.prompt.submit` with the request and the element's file and line |

The inbox is git-ignored.

**Several conversations can be open on the same app.** Desktop keeps older conversations running, and they all see the inbox, while each has its own preview pane. So a request must go back to the conversation whose pane it came from:
- **Labelled panes.** When a conversation opens its preview, the Claude mod runs one fixed script in its pane through Desktop's `javascript_tool`. The script stores the conversation's id in the tab's `sessionStorage` (`clodable:conversation`), which survives reloads. Permissions allow exactly that script and nothing else. The toolbar adds `conversation` to every request, and that conversation takes it while it's open.
- **Presence.** Each front end says it's there: `.clodable/local/session-<id>.json` holds `{ id, alive, active }` (epoch ms). `alive` is refreshed every few seconds, and `active` is when its person last typed, pressed a Clodable button, or opened it.
- **Fallback.** A request without a label, or whose conversation has closed, goes to the live conversation used last (`inboxOwner`). With no `session-*.json` around (an older front end), any claimer gets it.
- **One taker.** `clodable inbox --claim <id>` hands a conversation its requests. Claiming renames the file, and only one rename can win.

## Apps still on Lovable

`.clodable/config.json` records two facts that setup asks once (the panel asks apps set up before): `backend` (`lovable-cloud`, `supabase` or `none`) and `hosting` (`lovable`, `github` or `none`, not online yet). `clodable config <key> <value>` changes one and refreshes the files that depend on it.
- **Lovable Cloud:** Lovable owns the database and backend. AGENTS.md tells Claude it can't change them from here, the mod refuses Supabase writes with that reason, `.mcp.json` gets no Supabase server, and Publish skips backend functions.
- **Lovable hosting:** Lovable only puts live what was published in Lovable. Publish ends at "Published on GitHub" (`deploy: "lovable"`, with `lovableUrl`), and the bar points to Lovable for the last click.
- **Moving off Lovable:** `clodable move check` reads the code and says what the move involves, who does each part (`clodable`, `you`, `help`), and how hard it is overall (`simple`, `some-steps`, `needs-help`). The guided move itself is built in steps; see DECISIONS Q5.

### The move, step 2: a working copy on the builder's own Supabase

`packages/core/src/move/` runs it; `clodable move <step>` exposes each step (NDJSON steps `move:*`), and the panel's Move off Lovable view draws them one at a time. `/move-off-lovable` opens that view; `/clodable` opens it too once the move has started (`movingOffLovable` in `clodable status`), and the app's view otherwise, where an app on Lovable Cloud gets one quiet line to the move. **Claude pilots the steps:** a step's button sends the builder's request into the conversation ("Moving off Lovable: …" with the exact command), Claude runs it, reports, and investigates with `move diagnose` (safe facts only; `--fix` applies Clodable's own fixes on the copy). The `clodable-move` skill is its playbook. Steps that take a secret (connect, private files' key, function secrets) stay in the panel and go to the CLI on stdin; the plugin blocks Claude from running them and from reading Clodable's private folder. Nothing here touches the live app: Lovable keeps serving it until the switch (step 3, below).

What the panel shows comes from `move status` alone. Only the step the builder is on is open; a done step is one line, and steps after the current one read as later. A step stays open while something of it is left, named in the status: `vaultLeft` (the database's encrypted secrets, in the copy step), `secretsLeft` (the functions' secrets), `settingsLeft` (the app's settings the site doesn't have). `move vault|secrets|settings --skip` goes on without them. The other way to move (carefully, or in one go) is offered at Go live, where it changes something.

| Step | CLI | What happens |
|---|---|---|
| Look at the app | `move facts`, `move facts --set` (JSON on stdin) | First, before the method question. `move facts` gives Claude Clodable's scan as hints (files calling Lovable's AI, sign-in providers, Lovable's email API, connectors, payments, jobs, uploads, functions, settings); Claude confirms each in the code and records what the app uses, named as the builder sees it (`facts` in move.json, checked against a schema). The facts decide which steps exist (Lovable's services, Google sign-in, the jobs' key) and what `move check` says ("What moves", with Claude's notes); the scan still checks when each switch is done. The plugin lets Claude run both, a quoted heredoc only. |
| Connect | `move connect` (token on stdin) | A Supabase access token, checked against the Management API, kept in this computer's secret store. |
| Create | `move choices`, `move create --org --region` | A new project in the builder's organization; free-project limit and cost said up front; a generated database password, kept locally; waits until healthy. |
| Export | `move export [--file]` | Lovable's export zip (found in Downloads), unzipped into the protected folder; a summary of counts and names. |
| Copy | `move copy` | `pg_restore` piped into `psql`, in passes, then fixes, then the checks. |
| Files | `move files [--private]` | Public buckets download as they are; private ones need Lovable Cloud's service key (stdin, used once). Owners and links in the data follow. |
| Functions | `move functions`, `move secrets [--skip]`, `move secret <NAME>` | Every function deployed together with its shared files; secret values on stdin, straight to Supabase. |
| Try | `move preview copy\|live` | The dev server points the app at the copy (env and a source transform, no file changes) and restarts by itself; the toolbar says "Copy". |
| Netlify | `move netlify` (token on stdin), `move teams` | A Netlify access token, checked and kept on this computer. |
| Site | `move site [--account]`, `move settings [--skip]`, `move setting <NAME>` | A Netlify site pointed at the new backend, with the settings already pasted on this computer; `netlify.toml` and `.github/workflows/clodable-netlify.yml`; GitHub secrets `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`. Each Publish then runs the workflow: Lovable's lockfile is read from the public registry (same versions, same checksums), the app is built and deployed with `netlify-cli`, and a GitHub deployment is recorded so Publish follows it. Netlify's free plan can't watch a private repository owned by an organization; this works on any plan. The settings server code reads (`process.env.X`) are pasted in the panel; `LOVABLE_*` ones are listed apart. |

### The move, step 3: the switch

The panel asks first how the app should move (`move method careful|quick`, changeable until the pause or going live):
- **Carefully**, for an app people use: a working copy to try, then the pause, a last export and copy, and going live. Nothing written in the live app is lost.
- **In one go**, for a prototype: one export, then going live. No try step, no pause, no last export; `golive` starts the scheduled jobs itself, and anything written in Lovable after the export stays there.

The panel groups the steps as *Get ready: your new backend*, *Get ready: your website and emails* (the live app stays on Lovable throughout) and *Go live*.

The live app moves over, with a pause as short as the last export takes. Claude pilots the steps that run Clodable's commands; the builder does what happens in Lovable, with the exact lines and clicks in the panel, and says so there (`move paused`, `move finished`: Claude isn't allowed to say it for them).

| Step | CLI | What happens |
|---|---|---|
| Emails | `move resend` (key on stdin), `move emails --domain <d> [--sender]`, `move emails --skip` | The builder's Resend account (a Full access key, kept locally) gets their domain, in the region nearest the new backend; the panel shows its DNS records with Copy buttons until Resend sees them. Then Supabase gets a key that can only send, only from that domain, as its SMTP password (`smtp.resend.com:465`, user `resend`). Supabase's built-in mailer only writes to the project's team, so without this, sign-up confirmations and password resets never arrive. `--skip` goes live without them (new people sign in straight away; no resets). |
| Lovable's services | `move services [--skip]`, `move ai <openrouter\|gemini\|openai>` (key on stdin), `move app-emails`, `move emails --hook` | The code is scanned for Lovable's AI gateway (`ai.gateway.lovable.dev`, `LOVABLE_API_KEY`), its email API (`api.lovable.dev`), its connectors (`connector-gateway.lovable.dev/<service>`) and the app's own sign-in emails (`auth-email-hook`). AI: `AI_API_URL` and `AI_API_KEY` go to the local settings, the Netlify site and the function secrets; Claude points the code at them, Lovable's gateway kept as the fallback until the switch. Emails: a Resend key that only sends from the builder's domain (`RESEND_API_KEY`, `EMAIL_FROM`). Sign-in emails: Supabase's send-email hook on `auth-email-hook`, with a shared `v1,whsec_` secret (`SEND_EMAIL_HOOK_SECRET`). Connectors: the builder's key per service (`<SERVICE>_API_KEY`). Done when the code reads the builder's keys; `--skip` goes on without (those features stop with Lovable). |
| Google sign-in | `move google <client id>` (secret on stdin), `move google --skip` | When people sign in with Google (the export) or the code offers it. The builder's own Google client (redirect `https://<ref>.supabase.co/auth/v1/callback`, shown) turns Google on in the new backend; `VITE_GOOGLE_SIGN_IN=supabase` goes to the preview and the site (a plain value on Netlify: VITE_ settings are built into the page). Claude switches the button from Lovable's broker (`@lovable.dev/cloud-auth-js`) to Supabase's sign-in when that setting is there. |
| Pause | `move pause` (the SQL), `move paused` | The SQL revokes exactly the INSERT/UPDATE/DELETE grants `anon` and `authenticated` had per table (from the export; all of `public` otherwise), adds a guard on `auth.users` (`clodable_pause`: new sign-ups and password or email changes wait, sign-ins don't), revokes uploads on `storage.objects` where the editor may, and stops pg_cron's jobs; each part in its own block so one refusal doesn't stop the rest. The export reader drops anything named `clodable_pause`, so the guard never reaches the new backend. The undo SQL gives everything back. `paused` records the time and keeps the grants from before it. The panel says when Lovable's next export is possible (one a day). Writes from server code with the service key, or security-definer functions, aren't paused. |
| Final export | `move export` | During the pause, the export is read aside first and refused if it was made before the pause: the revoked grants must be gone from it (or, with nothing to tell by, its own time must be after the pause). |
| Final copy | `move copy` | The usual copy, then the writes from before the pause given back, the scheduled jobs created (old project and `*.lovable.app` replaced with the new ones; a second run doesn't duplicate them), and the queues' waiting messages copied (only here: Lovable's jobs are off). The access check compares with the grants from before the pause. |
| Go live | `move golive [--sign-up yes\|no] [--confirm-email yes\|no]` | Sign-in: the site's address as Supabase's site URL and in the allowed redirects; who may sign up (`disable_signup`), with or without email confirmation (always without, when emails aren't connected). The app's `.env*` (`VITE_SUPABASE_*`, `SUPABASE_*`), `supabase/config.toml` and files in `src/` naming the old project point at the new backend. `.clodable/config.json`: `backend: supabase`, `hosting: github`, `liveUrl`; the repo kit is refreshed. In one go, the scheduled jobs start here, and the panel first gives the line that stops Lovable's (so they don't run twice). The panel shows Stripe webhook functions' new address. The next Publish puts it live and follows the Netlify workflow's deployment. Afterwards `move diagnose --fix` checks sign-in against the site, and `move preview` changes nothing. |
| Address | `move domain <name>`, `move domain`, `move domain --skip` | After the go-live Publish: the app's own domain set on the Netlify site, the records to change at its provider (apex: A `75.2.60.5` + CNAME `www`; subdomain: CNAME to the site), checked through DNS; once they point to Netlify, the certificate is asked for, and Supabase's site URL, the allowed redirects and `liveUrl` use the domain. `CLODABLE_FAKE_DNS` answers in tests. |
| Finish | `move finished` | Shown only once a sign-in on the new backend is seen after going live (`signIn` in `move status`), when the app signs people in. The builder unpublished the app in Lovable, disconnected Lovable's GitHub sync (before Cloud goes, so Lovable doesn't change the code), and removed Lovable Cloud. Clodable deletes its copy of the export from this computer. The panel offers a message for the app's users. |

- **Where things live.** `.clodable/local/move.json`: the move's state, counts and names only. `<config dir>/secrets.json` (0600): the Supabase, Netlify and Resend keys, the database password, and each app's settings. A Supabase token Supabase refuses (expired, deleted) is forgotten there, so the panel asks to connect again. `<config dir>/moves/<app>-<hash>/` (0700): the export, its table of contents, the file list, the copy's logs; `move forget` removes it. Keys, tokens and passwords never reach a command line, an event, a log, the chat or the project (a CLI test checks all of these).
- **PostgreSQL tools.** `pg_restore`/`psql` 18 with zstd, fetched once per computer and checked against pinned SHA-256s: on macOS 15 files read by byte range out of EDB's official zip (8.8 MB), on Linux theseus-rs builds. `CLODABLE_POSTGRES_HOME` points elsewhere.
- **The copy, in passes** (`toc.ts`, `restore.ts`). Supabase's own schemas (auth, storage, realtime, vault, cron, pgmq…) are never rebuilt from an export: the new project has them. With `session_replication_role = replica`, so nothing fires twice and rows load in any order:
  1. extensions, and pgmq queues recreated empty;
  2. people (auth rows) and bucket rows, data only;
  3. the app's own schemas, in the export's order, **with their grants** (newer Supabase projects don't grant new tables to `anon`/`authenticated`, so without them the app's API sees nothing);
  4. the app's triggers and policies on Supabase's tables (the new-user trigger, file rules), last.

  Errors don't stop a pass ("already exists" is normal); the checks decide. Scheduled jobs are not recreated on a copy: they would run twice next to the live app.
- **Fixes** (`fixes.ts`): Lovable's export bucket removed; counters (sequences, identity columns too) moved past their rows in every schema; database functions naming the old project rewritten, old keys swapped for the new project's of the same role; the email queue's vault key; the migration history recorded under the repo's versions.
- **Checks** (`verify.ts`), against the export, never against the copy itself: rows per table, people and password hashes, policies and protected tables per schema, triggers and foreign keys, the app's triggers on Supabase's tables, the API roles' grants, counters, nothing calling Lovable Cloud, extensions, buckets and file counts.
- **Copying again** (a newer export): the copy's app objects and people are emptied first (`emptyCopy`), buckets and files kept. Only ever on a copy.
- **Tests.** `packages/core/test/move.test.ts` copies a Lovable-like export into a local PostgreSQL 18 (skipped where none is installed; `CLODABLE_TEST_FETCHED_TOOLS=1` uses the fetched tools). `packages/cli/test/move.test.ts` drives every step through the CLI against a fake Supabase, Netlify and Resend (`core/test/fake-*.ts`), the switch included: the pause applied to the source, a stale export refused, the final copy's writes and jobs, going live. `scripts/e2e-move.mts` does the whole move on a real local Supabase stack, then signs people in with their original passwords.

## Apps not online yet, or without a backend

`packages/core/src/online.ts`, with the move's own pieces (DECISIONS Q17). Claude runs the two commands when the builder presses the panel's button (the command reaches it beside their request); the tokens are pasted in the panel and go to the CLI on stdin.

| CLI | What happens |
|---|---|
| `clodable connect supabase\|netlify` (token on stdin) | The token, checked, kept in this computer's secret store. The plugin never lets Claude run it. |
| `clodable site`, `clodable site create [--team]` | The Netlify teams; then a site named after the app, the backend's address and keys (service key kept secret) and the settings pasted here, `netlify.toml` and the move's workflow, the two GitHub secrets. `.clodable/config.json` records `netlify` (site id, name, address, team: nothing secret), `hosting: github` and `liveUrl`; sign-in links on the app's own Supabase come back to the site. A second run finds the same site. The next Publish puts it online (`siteLiveAt` in the local state, `site.live` in `clodable status`). |
| `clodable backend`, `clodable backend create [--org] [--region]` | The organizations with what a project costs and the free projects left; then a project (its ref recorded at once, so a second run waits for it instead of making another), its public address and key in `.env`, its server keys in the app's settings on this computer (and on the site, if there is one), sign-in for the preview and the site with no confirmation email (Supabase's mailer only writes to the team), `backend: supabase` and the kit refreshed: AGENTS.md's database rules, `.mcp.json`. |

`clodable status` reports `netlify.connected` when `hosting` is `none`, `database.connected` when there's no backend yet too, and `site` once Clodable made one. A Publish that no host reports, on a repository that never had a GitHub deployment, ends with `noHost: true` ("Published on GitHub"), kept in `lastPublish`, so the bar says "Not on the web yet" and offers **Put it online**.

## The app's database (own Supabase)

`clodable db check` returns Supabase's security advice (its advisors' errors and warnings). `clodable db query "<select>"` reads (run as a subquery, so nothing that writes gets through, at most 200 rows), `clodable db run "<sql>"` changes data (no `create/alter/drop/grant/…`: those are migrations), and `clodable db apply supabase/migrations/<ts>_<what>.sql` applies a migration once, in one transaction, records it in `supabase_migrations.schema_migrations` and reloads the API's schema cache. All three go through the Management API with the Supabase token on this computer (`packages/core/src/database.ts`), so Claude never holds a database key. On Lovable Cloud they refuse. The plugin lets `db query` run quietly and makes `db run`/`db apply` ask, with the same plain note as Supabase's own SQL tools ("This changes your live database…"). `clodable status` reports `database.connected`; without a connection, the panel offers to connect Supabase.

## The app's settings (`process.env`)

What the app's server code reads (`process.env.GREETING`, found by scanning `src/`, `server/`, `app/`; `LOVABLE_*` set apart) needs a value in the preview too, not only on the host. `clodable settings` lists them with where each has a value (this computer, the site on Netlify); `clodable setting <NAME>` (value on stdin) stores it in Clodable's private store for this app (never in the project) and, once the app has a site on Netlify, sets it there too. `clodable dev` gives them to the app as `process.env` (what the person's own shell set wins) and restarts when `.clodable/local/settings.json` (names only) changes. The panel asks for missing ones in **Try your app on the copy**, under **Put your site on Netlify**, and in the editing view's **Your app's settings**.

## Repo kit (what `clodable setup` adds to a client's repo)

| File | Purpose |
|---|---|
| `AGENTS.md` | The rules for any coding agent in this project: plain language, additive database changes, never touch `main` |
| `CLAUDE.md` | Contains `@AGENTS.md` and nothing else, so Claude reads the same rules |
| `.claude/launch.json` | Tells Claude Desktop how to start the preview: `clodable dev` (Vite plus the toolbar) |
| `.claude/settings.json` | Enables the plugin and safe permission defaults |
| `.mcp.json` | The official Supabase MCP server, scoped to this app's project (`project_ref`) |
| `.clodable/config.json` | Project settings: the live branch, the live URL, the Supabase project, checks |

`clodable dev` never edits the app's `vite.config`. It starts the app's own Vite with `@clodable/preview` added through Vite's inline config. The toolbar exists only in that dev server, never in a production build.

## Security model

- **Only in apps Clodable set up.** A Claude plugin loads in every session, so Clodable first checks for `.clodable/config.json`:
  - The CLI's save, status, publish, undo, restore and inbox commands refuse other projects (`not-set-up`). Only `kit` and `setup` run before setup.
  - In other projects the mod stays out of the way: no bar, auto-save, guards, permission changes or plain-language rows. An empty folder gets a setup invitation, and `/clodable` works everywhere.
- **Guards in the mod:**
  - No pushes to the live branch and no force-pushes. Merges happen only through Publish.
  - No direct edge-function deploys.
  - Database writes always ask first.
  - These guards also cover the claude.ai Supabase connector (`mcp__claude_ai_Supabase__…`), not just Clodable's own project-scoped Supabase server.
- **claude.ai connectors are Claude's tools, not the machine's.** Claude can call them in Desktop and the CLI, but `git`, the CLI and the dev server can't. Saving and publishing therefore need the GitHub CLI login, and Clodable keeps its own Supabase server scoped to the app's project. A connector reaches every project in the account.
- **Secrets never go through the chat.** Local secrets live in Desktop's encrypted environment editor, and production secrets in the host or Supabase.
- **Secret keys never leave the builder's computer.** [gitleaks](https://github.com/gitleaks/gitleaks) finds them, with the roughly 220 rules its community maintains (`packages/core/src/checks/`):
  - Clodable pins one gitleaks release and checks its SHA-256 before running it. It downloads it once per computer into the system cache, so builders install nothing. `CLODABLE_GITLEAKS` points at another copy.
  - **Every save** is checked before it goes to GitHub: the lines it adds (`gitleaks git --pre-commit --staged`), plus any saves made outside Clodable that haven't been sent. A key stops the save with `secret-found`: nothing is sent, and the work stays in the files. Unsent saves that hold a key are taken back into the next save, so the key can still be removed. If the check can't run, saves wait on the computer, unsent.
  - **Publish** checks every tracked file of the version about to go live.
  - A thin Clodable layer sits on top. Supabase's public keys (the anon key and `sb_publishable_`), which every Lovable app ships, are ignored. Its `service_role` and `sb_secret_` keys stop a save. Test keys, guesses and keys made for browsers (Google, Mapbox and so on) are only a note. A project's own `.gitleaks.toml` and `.gitleaksignore` are respected.
  - Clodable adds a few rules to gitleaks' config. One covers Supabase's `sb_secret_` keys. Others cover the keys Lovable apps use most (Stripe, Supabase's `service_role` token, Anthropic, SendGrid) with gitleaks' own patterns, matched anywhere. gitleaks expects a quote, a space or a semicolon after a key, so a key pasted into a sentence or between tags slipped through.
  - GitHub's own push protection adds a second net where the repository has it: free on public repositories, and part of GitHub Secret Protection on Team and Enterprise plans. Developers can also run gitleaks or TruffleHog as a pull-request workflow. Publish then waits for it, like any other check.
- **Checks at Publish:**
  - The app builds.
  - Production dependencies have no critical advisories (high ones are a note).
  - No secret keys in the version going live (above).
  - Supabase's security advisors run after every database change (`clodable db check`, which AGENTS.md asks Claude to run).
- **The toolbar's dev endpoints:**
  - They only exist on the local dev server.
  - They only accept same-origin requests carrying a per-session token.
  - They only write inside the project root, and only to files the tagger saw.
