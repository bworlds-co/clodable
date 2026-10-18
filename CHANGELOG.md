# Changelog

All notable changes to Clodable are recorded here. The plugin, the `clodable` CLI and its packages share one version, and each release is tagged `clodable--v<version>`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version starts with what builders will notice, then the details for developers. Every entry links the pull request it comes from (for 0.1.x, which had none, the commit).

**The CLI's event contract.** With `--json`, every `clodable` command prints one JSON event per line (NDJSON), and the last line is always a `result`. The types live in [`packages/core/src/events.ts`](packages/core/src/events.ts), and the Claude plugin reads them. During 0.x, this contract changes only in compatible ways: a release can add events, step ids, error codes and optional fields, and the ones that exist keep their names and meaning. A program that reads it should ignore what it doesn't know.

## [Unreleased]

**For builders**

- **Start from an idea.** In an empty folder, describe your app and Claude makes a first version on your computer. When you want it saved, **Set up saving** names your GitHub account and asks before creating a private app there. ([#65](https://github.com/bworlds-co/clodable/pull/65))
- **Put any app on the web.** **Set up hosting** creates a site on your own Netlify, and your next Publish makes it public. **Add a backend** gives your app sign-in and saved data on your own Supabase. You pick the account and see what it costs before anything is created. ([#32](https://github.com/bworlds-co/clodable/pull/32), [#47](https://github.com/bworlds-co/clodable/pull/47), [#49](https://github.com/bworlds-co/clodable/pull/49), [#65](https://github.com/bworlds-co/clodable/pull/65))
- **Less to install.** On a Mac, Clodable fetches the tools it needs when they're missing, and setup shows each step as it goes. ([#35](https://github.com/bworlds-co/clodable/pull/35), [#38](https://github.com/bworlds-co/clodable/pull/38), [#39](https://github.com/bworlds-co/clodable/pull/39), [#40](https://github.com/bworlds-co/clodable/pull/40))
- **Status you can trust.** Clodable says "Saved" until your site is really online, never "You're live" when nothing is on the web, and recognizes a site that's already live when you bring your app in. ([#32](https://github.com/bworlds-co/clodable/pull/32), [#48](https://github.com/bworlds-co/clodable/pull/48), [#60](https://github.com/bworlds-co/clodable/pull/60))
- **You choose when edits collide.** If your draft and your live site changed the same thing, Claude asks which to keep before changing anything, and your preview keeps working. ([#56](https://github.com/bworlds-co/clodable/pull/56), [#59](https://github.com/bworlds-co/clodable/pull/59), [#61](https://github.com/bworlds-co/clodable/pull/61))
- **More in the conversation, a calmer panel.** Ask Claude for History, Settings or hosting in your own words, and it opens the right view. Claude looks at your app first and asks only what it can't tell. To bring in an app, paste its GitHub address. ([#46](https://github.com/bworlds-co/clodable/pull/46), [#50](https://github.com/bworlds-co/clodable/pull/50), [#55](https://github.com/bworlds-co/clodable/pull/55), [#65](https://github.com/bworlds-co/clodable/pull/65))
- **Fewer technical words.** Pressing Preview just says your preview is open, saves from the panel get short names, and Claude's updates while it fixes something stay in plain words. ([#41](https://github.com/bworlds-co/clodable/pull/41), [#42](https://github.com/bworlds-co/clodable/pull/42), [#54](https://github.com/bworlds-co/clodable/pull/54), [#62](https://github.com/bworlds-co/clodable/pull/62))
- **Tools that stay out of the way.** In a short preview, Clodable's tools start folded into a small **Tools** button in the corner, so they don't cover your app. ([#79](https://github.com/bworlds-co/clodable/pull/79))
- **Change a saved setting.** In **Settings**, each setting you saved for your app has **Change**, to paste a new value. The saved value is never shown. ([#83](https://github.com/bworlds-co/clodable/pull/83))
- **A steadier move off Lovable.** Clodable reads the export that belongs to this app, says plainly when your new backend can't be reached, and never creates a second one on its own. If Netlify stops accepting your connection, the panel says so and lets you reconnect there. ([#64](https://github.com/bworlds-co/clodable/pull/64), [#66](https://github.com/bworlds-co/clodable/pull/66), [#67](https://github.com/bworlds-co/clodable/pull/67), [#70](https://github.com/bworlds-co/clodable/pull/70), [#71](https://github.com/bworlds-co/clodable/pull/71), [#72](https://github.com/bworlds-co/clodable/pull/72), [#84](https://github.com/bworlds-co/clodable/pull/84))
- **A clearer move off Lovable.** Ask about it in your own words, like "let me try the copy" or "where are we?". **Prepare your website** sets up your new site without putting it online, and Claude then tells you the move's next step rather than suggesting Publish. An empty domain field asks for your domain. ([#80](https://github.com/bworlds-co/clodable/pull/80), [#85](https://github.com/bworlds-co/clodable/pull/85), [#86](https://github.com/bworlds-co/clodable/pull/86))

After updating, start a new conversation to use the new version.

**For developers**

### Added

- `clodable site [create] [--team]`, `clodable backend [create] [--org] [--region]` and `clodable connect supabase|netlify` (token on stdin): a Netlify site and a Supabase backend for any app, built from the move's pieces in `core/src/online.ts`. `setup --hosting none` and `config hosting none` record an app that isn't online yet. ([#32](https://github.com/bworlds-co/clodable/pull/32))
- `clodable setup --new <name> --account <login>` saves a local prototype into a new private GitHub repository on the account the builder approved. ([#65](https://github.com/bworlds-co/clodable/pull/65))
- `clodable kit --apply --runtime` refreshes only the installed runtime and what points at it: Clodable's managed instructions, the preview's launch entry and the ignore rules. ([#63](https://github.com/bworlds-co/clodable/pull/63))
- Event contract, all additive: step ids `site` and `backend` ([#32](https://github.com/bworlds-co/clodable/pull/32)) and `setup:tools`, `setup:app`, `setup:files`, `setup:packages`, `setup:save` ([#40](https://github.com/bworlds-co/clodable/pull/40)); error codes `needs-choice` and `already-there`; in `status`, `site`, `netlify.connected`, `database.connected` for apps without a backend and `lastPublish.noHost`, with `noHost` on Publish's result ([#32](https://github.com/bworlds-co/clodable/pull/32)); `site.statusKnown` ([#60](https://github.com/bworlds-co/clodable/pull/60)).
- The mod gives Claude three tools: `open_panel` (opens a view and does nothing else), `app_context` (safe status) and `remember_app` (records where the data and the site live, once the builder confirms). ([#65](https://github.com/bworlds-co/clodable/pull/65))
- When they're missing, the plugin fetches Node.js v24.21.0 LTS (macOS and Linux) and the CLI fetches GitHub CLI 2.102.0, both pinned and SHA-256-checked, into the plugin's data folder (`~/.claude/plugins/data/clodable-clodable/tools`), with its `bin` on the session's PATH. Setup offers **Install Git** (`xcode-select --install`), and an app whose package manager isn't installed (Bun, say) is installed, built and audited with npm. ([#35](https://github.com/bworlds-co/clodable/pull/35), [#39](https://github.com/bworlds-co/clodable/pull/39))
- `move export` also reads a `.dump` file, such as one from Lovable's support. ([#70](https://github.com/bworlds-co/clodable/pull/70))

### Changed

- One runtime per app: setup and each new conversation copy the plugin's bundled CLI to `.clodable/local/clodable.mjs`, which git ignores. The preview's launch entry, `AGENTS.md` and the guide skill use it instead of `npx clodable`; account settings, preview ports and explicit developer overrides are kept. ([#63](https://github.com/bworlds-co/clodable/pull/63))
- Publish tries the draft and the live site together in a temporary detached working copy first. When edits overlap, it reports the files and leaves the working files and the preview untouched. ([#61](https://github.com/bworlds-co/clodable/pull/61))
- Hosting and backend creation run from the panel once the builder picks the account and sees the cost. Claude can't run those two commands from the conversation; it handles the app's integration afterwards. Instead of setup's two questions, Claude inspects the app and asks only about what it can't tell. The panel is a short overview with separate History and Settings views, and the move shows its current step first. This revises DECISIONS Q5f and Q17. ([#65](https://github.com/bworlds-co/clodable/pull/65))
- The mod reads the session's folder again before each command, on each turn and every 1.5 s (`syncFolder`), so it follows Desktop's move out of a spare folder. It runs its CLI by full path, with the Node.js it checked. ([#39](https://github.com/bworlds-co/clodable/pull/39))
- `netlify.toml` is one of Clodable's own files, which Undo and Restore keep. Setup clones over HTTPS as the GitHub CLI's account. `db apply` waits until the app's API sees new tables. ([#32](https://github.com/bworlds-co/clodable/pull/32))
- "Put your site online" is now "Set up hosting", in the panel, `AGENTS.md` and the guide skill. ([#47](https://github.com/bworlds-co/clodable/pull/47))
- The guards accept a literal `cd "<app>" &&` before the commands they allow exactly. ([#45](https://github.com/bworlds-co/clodable/pull/45))
- Import accepts a full `https://github.com/<owner>/<name>` address as well as `<owner>/<name>`, and shows setup's steps while it runs. ([#55](https://github.com/bworlds-co/clodable/pull/55))
- The panel's requests: Claude runs Clodable's own commands as given, and reads the app's `AGENTS.md` right after setup ([#41](https://github.com/bworlds-co/clodable/pull/41)); their saves get short names ([#42](https://github.com/bworlds-co/clodable/pull/42)); recovery and Preview requests keep Claude's replies in builder words ([#54](https://github.com/bworlds-co/clodable/pull/54), [#62](https://github.com/bworlds-co/clodable/pull/62)); conflict recovery compares read-only and asks before choosing ([#56](https://github.com/bworlds-co/clodable/pull/56), [#59](https://github.com/bworlds-co/clodable/pull/59)).
- The guide skill sends builders to the panel to bring in or set up an app, instead of Claude cloning it by hand. ([#33](https://github.com/bworlds-co/clodable/pull/33))
- Moving off Lovable: exports are matched to the current Lovable project by file name, zip members included. Conflicting labels and several backups are refused, Claude asks for the file when the app can't be identified, and a damaged replacement keeps the previous usable copy. ([#70](https://github.com/bworlds-co/clodable/pull/70))
- Moving off Lovable from the conversation: the move skill takes plain requests as well as the panel's buttons. It runs the installed command named in the app's `AGENTS.md` (`node ".clodable/local/clodable.mjs"`), maps requests to `move status`, `move preview copy|live`, `move diagnose`, `move export --file` and `move copy`, reads `move status` first, and warns before a repeated copy replaces the rehearsal's data and accounts. ([#80](https://github.com/bworlds-co/clodable/pull/80))
- Moving off Lovable: the `site` step is titled "Prepare your website", with a **Prepare my website** button, and `move site` ends with "Your website is prepared" and "Nothing has been published. Continue the move in the panel." instead of "Publish to see it at …". Claude then reads `move status` and explains the next unfinished step. The skill says Publish updates the app's shared code, which Lovable's GitHub link can carry to the live app, and keeps the database copy's checks apart from testing features. The step's id, the event contract and Publish are unchanged. ([#85](https://github.com/bworlds-co/clodable/pull/85))
- `scripts/e2e-move.mts` moves a populated app between two disposable local Supabase projects (ports 55320–55329 and 55420–55429). It copies real public and private files and checks their bytes and access rules, original passwords, a session from before the move, a new account's profile, and a second run of the file copy. ([#82](https://github.com/bworlds-co/clodable/pull/82))
- Docs: Get started happens in Claude Desktop, with no Terminal ([#33](https://github.com/bworlds-co/clodable/pull/33), [#34](https://github.com/bworlds-co/clodable/pull/34), [#36](https://github.com/bworlds-co/clodable/pull/36), [#37](https://github.com/bworlds-co/clodable/pull/37)). The Desktop UX test brief, findings and report ([#43](https://github.com/bworlds-co/clodable/pull/43), [#44](https://github.com/bworlds-co/clodable/pull/44), [#52](https://github.com/bworlds-co/clodable/pull/52), [#57](https://github.com/bworlds-co/clodable/pull/57), [#69](https://github.com/bworlds-co/clodable/pull/69), [#73](https://github.com/bworlds-co/clodable/pull/73)).

### Fixed

- New Desktop conversations failed with `posix_spawn 'node' ENOENT` once Desktop moved the session out of its spare folder. ([#39](https://github.com/bworlds-co/clodable/pull/39))
- Setup could stay on "Checking…": tool checks now wait 20 s at most, a failed check shows its reason with **Check again**, and an unreadable PATH is left alone. ([#38](https://github.com/bworlds-co/clodable/pull/38))
- A Publish with no host said the site would be live in a moment; it now says the app was published on GitHub and isn't on the web yet. ([#32](https://github.com/bworlds-co/clodable/pull/32))
- "Everything is live" and Live badges appeared before hosting was known ([#48](https://github.com/bworlds-co/clodable/pull/48)), and a live site brought into a fresh copy asked for its first Publish ([#60](https://github.com/bworlds-co/clodable/pull/60)).
- The hosting and backend cards offered creation before the account choices loaded ([#49](https://github.com/bworlds-co/clodable/pull/49)); the docked panel clipped actions and squeezed History ([#46](https://github.com/bworlds-co/clodable/pull/46)); the first Publish showed a second Publish button and spoke of a live site that didn't exist yet ([#50](https://github.com/bworlds-co/clodable/pull/50)).
- After Claude made a local page in an empty folder, the panel kept offering import and a one-minute setup. ([#51](https://github.com/bworlds-co/clodable/pull/51), [#53](https://github.com/bworlds-co/clodable/pull/53), [#58](https://github.com/bworlds-co/clodable/pull/58))
- Moving off Lovable: an unreachable backend was reported as paused, and a remembered one was reused without checking ([#64](https://github.com/bworlds-co/clodable/pull/64)); the move guide guessed at the backend's state ([#66](https://github.com/bworlds-co/clodable/pull/66)); the Supabase connection notes said to delete a token Clodable still needs ([#67](https://github.com/bworlds-co/clodable/pull/67)); an export from another Lovable app could be read ([#70](https://github.com/bworlds-co/clodable/pull/70)); the region picker claimed its default came from the computer's location ([#71](https://github.com/bworlds-co/clodable/pull/71)); the panel kept offering "Copy my data" after a copy done in the conversation ([#72](https://github.com/bworlds-co/clodable/pull/72)).
- Moving off Lovable, continued: when Netlify refused the saved token (`netlify-auth`, HTTP 401) or its team lookup failed, the site step hid the team picker but still offered to create the site. It now waits for `move teams`, shows the error with **Check again**, adds a Netlify token field with **Reconnect** for a refused token, drops stale team choices, and `open_panel` tells Claude the step is blocked ([#84](https://github.com/bworlds-co/clodable/pull/84)). After preparing the website, Claude said Publish was the only step left ([#85](https://github.com/bworlds-co/clodable/pull/85)). An empty domain field said `“” isn't a domain name.`, and now says "Enter your domain name." ([#86](https://github.com/bworlds-co/clodable/pull/86)).
- In a short preview, such as Desktop's split Browser pane, the floating toolbar covered the app's own controls. Previews 420 px high or shorter now start with a small **Tools** control that opens the full toolbar. This doesn't save a Hide preference, the hidden tools read **Copy · Tools** while the preview uses the move's copy, and ⌥⇧E and ⌥⇧A show their tools even after Hide. ([#79](https://github.com/bworlds-co/clodable/pull/79))
- Saving an app setting removed **Your app's settings** from Settings, with no way to change the value. Each saved setting now keeps a Saved / **Change** row. Change opens an empty field, with **Cancel**, that says whether it replaces the value for the preview only or for the Netlify site too. Values are never read back, and the move's checklist still lists only missing ones. ([#83](https://github.com/bworlds-co/clodable/pull/83))

## [0.2.2] - 2026-10-15

**For builders**

- Undo keeps your answers and Clodable's setup as they are on your live site. ([#30](https://github.com/bworlds-co/clodable/pull/30))
- A change you took back no longer shows as "not live yet", and there's nothing to Publish then. ([#30](https://github.com/bworlds-co/clodable/pull/30))
- Restoring a version your app already looks like says "Nothing changed." ([#30](https://github.com/bworlds-co/clodable/pull/30))

**For developers**

### Changed

- `status` and a save's `unpublished` leave out saves when the draft changes no file of the app (`live...HEAD`, Clodable's own files aside), and `history` gains `sameAsLive`. Publish refuses a draft that changes no file (`nothing-to-publish`); one that changes only Clodable's files still publishes. ([#30](https://github.com/bworlds-co/clodable/pull/30))

### Fixed

- Undo reverted Clodable's own files (the answers, the setup, the Netlify workflow). It now puts them back as they are live, and keeps Clodable's lines in `.gitignore`. ([#30](https://github.com/bworlds-co/clodable/pull/30))
- Restore with nothing to save said "Restored". ([#30](https://github.com/bworlds-co/clodable/pull/30))

## [0.2.1] - 2026-10-15

**For builders**

- Typing `/move-off-lovable` opens the move. ([#26](https://github.com/bworlds-co/clodable/pull/26))
- **Fix it** sends one plain sentence in your words, and Claude gets the error and the details beside it. ([#27](https://github.com/bworlds-co/clodable/pull/27))

**For developers**

### Changed

- The move's skill is now `clodable-move`, and `scripts/build-plugin.mjs` fails when a skill and a slash command share a name. ([#26](https://github.com/bworlds-co/clodable/pull/26))
- Fix it's details reach Claude through `$.session.append`, and its saves get plain names. ([#27](https://github.com/bworlds-co/clodable/pull/27))

### Fixed

- Claude Code refused `/move-off-lovable` because a skill had the same name. ([#26](https://github.com/bworlds-co/clodable/pull/26))

## [0.2.0] - 2026-10-15

**For builders**

- **Move off Lovable when you ask.** `/move-off-lovable` opens the move, and `/clodable` opens your app. Apps not made with Lovable aren't asked about Lovable. ([#18](https://github.com/bworlds-co/clodable/pull/18))
- Going back to an earlier version brings back your app's files and keeps your answers and Clodable's setup. ([#15](https://github.com/bworlds-co/clodable/pull/15))
- Undo and Restore ask with Clodable's own buttons, where you pressed. ([#20](https://github.com/bworlds-co/clodable/pull/20))
- Point & ask, Try to fix, Preview and the move's buttons send a plain sentence; Claude gets the technical details separately. ([#21](https://github.com/bworlds-co/clodable/pull/21), [#23](https://github.com/bworlds-co/clodable/pull/23))
- "You're live" and "Undone" show for 10 seconds, then the usual bar comes back. ([#17](https://github.com/bworlds-co/clodable/pull/17))
- The preview toolbar answers only your own computer, and other scripts on the page can't use it. ([#16](https://github.com/bworlds-co/clodable/pull/16), [#22](https://github.com/bworlds-co/clodable/pull/22))

**For developers**

### Changed

- Refactor review: the mod's panel and bar split into modules (`move.ts`, `words.ts`, `activity.ts`, `cli.ts`, `guards.ts`, `preview.ts`) and the move into one module per part, with no import cycles left. The move and the preview's requests are typed, without `any` or `as never`. Inbox posts are validated with zod, and the CLI embeds the toolbar bundle the preview builds. ([#14](https://github.com/bworlds-co/clodable/pull/14))
- `/move-off-lovable` is a new command, and `status` gains `project.madeWithLovable` and `movingOffLovable` (DECISIONS Q5f). ([#18](https://github.com/bworlds-co/clodable/pull/18))
- Requests the plugin sends in the builder's name carry the details to Claude in a row the builder doesn't see (`$.session.append`). ([#21](https://github.com/bworlds-co/clodable/pull/21), [#23](https://github.com/bworlds-co/clodable/pull/23))

### Fixed

- `gh` failures say "not connected" or "offline" in plain words; a signed-out `gh pr checks` no longer counts as "no checks", a missing repository isn't reported as offline, and a program that exits before reading its input no longer crashes Clodable (EPIPE). The toolbar keeps keyboard focus when it redraws, its menus take arrow keys and Escape, and its chips pass AA contrast. ([#14](https://github.com/bworlds-co/clodable/pull/14))
- Restore overwrote Clodable's own files, and could remove its setup. ([#15](https://github.com/bworlds-co/clodable/pull/15))
- Security: `/__clodable/` answers loopback addresses only ([#16](https://github.com/bworlds-co/clodable/pull/16)), and the toolbar's token is handed to its code, never put on `window`, with `toolbar.js` refused to `fetch()` ([#22](https://github.com/bworlds-co/clodable/pull/22)).
- The bar stayed on "You're live" or "Undone"; a build error in a folder ending in "app" named the wrong file; a failed check was listed twice; the live version was named after one of Clodable's own saves. ([#17](https://github.com/bworlds-co/clodable/pull/17))
- "Not live yet" counted saves of Clodable's own files, planning the kit again switched a demo's preview to npm's Clodable, and `doctor` flagged the fake GitHub. ([#19](https://github.com/bworlds-co/clodable/pull/19))
- npm: the `clodable` command is declared as `dist/clodable.mjs`, which npm 11 keeps. Merged just after the plugin's tag; the npm package 0.2.0 includes it. ([#25](https://github.com/bworlds-co/clodable/pull/25))

## [0.1.2] - 2026-10-13

**For builders**

- One way to move off Lovable for everyone: the panel's move. ([fe7b9ef](https://github.com/bworlds-co/clodable/commit/fe7b9ef), [07834d7](https://github.com/bworlds-co/clodable/commit/07834d7))
- A new logo, the clod: a pixel version of the mascot, in the Publish bar, the panel and the preview toolbar. ([44e55d2](https://github.com/bworlds-co/clodable/commit/44e55d2))

**For developers**

### Added

- The CLI is on npm as `clodable` (first as 0.1.1), which the preview's `npx clodable dev` and `AGENTS.md` need. ([fada457](https://github.com/bworlds-co/clodable/commit/fada457))

### Changed

- The by-hand `lovable-exit` playbook leaves the plugin for `docs/parked/` (DECISIONS Q5e), and the docs follow Q1: judgment in Claude, mechanics in the CLI. ([fe7b9ef](https://github.com/bworlds-co/clodable/commit/fe7b9ef), [07834d7](https://github.com/bworlds-co/clodable/commit/07834d7))
- No lint warnings left; Biome's `recommended` setting is now `preset`, and `pnpm shots` runs the screenshot scripts. ([07834d7](https://github.com/bworlds-co/clodable/commit/07834d7))

## [0.1.1] - 2026-10-12

The first tagged release. Version 0.1.0 was never tagged.

**For builders**

- Shape your app with Claude in Claude Desktop, see it in the preview, Publish when you're happy, Undo or Restore, and move off Lovable step by step. ([6be0300](https://github.com/bworlds-co/clodable/commit/6be0300))
- Apps Clodable sets up get its updates on their own. ([06e2f72](https://github.com/bworlds-co/clodable/commit/06e2f72))
- A quieter install, without "2 userConfig options not yet set". ([06e2f72](https://github.com/bworlds-co/clodable/commit/06e2f72))

**For developers**

### Added

- `packages/core` (drafts, saves, Publish with checks, Undo, the move off Lovable, database and settings commands), `packages/cli` (the `clodable` command, NDJSON on `--json`), `packages/preview` (the dev server and the preview toolbar) and `plugin/` (the Desktop mod, skills and the bundled CLI). ([6be0300](https://github.com/bworlds-co/clodable/commit/6be0300))
- `pnpm release patch|minor|major` sets one version on the packages, the plugin and the marketplace; `claude plugin tag plugin --push` tags it `clodable--v<version>`. ([06e2f72](https://github.com/bworlds-co/clodable/commit/06e2f72))

### Changed

- Setup turns on auto-update for Clodable's marketplace in the app's `.claude/settings.json`. ([06e2f72](https://github.com/bworlds-co/clodable/commit/06e2f72))
- The plugin has no `userConfig` options any more; a developer who'd rather not have Clodable turns it off for themselves in `.claude/settings.local.json`. ([06e2f72](https://github.com/bworlds-co/clodable/commit/06e2f72))

[Unreleased]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.2...HEAD
[0.2.2]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.1...clodable--v0.2.2
[0.2.1]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.0...clodable--v0.2.1
[0.2.0]: https://github.com/bworlds-co/clodable/compare/clodable--v0.1.2...clodable--v0.2.0
[0.1.2]: https://github.com/bworlds-co/clodable/compare/clodable--v0.1.1...clodable--v0.1.2
[0.1.1]: https://github.com/bworlds-co/clodable/tree/clodable--v0.1.1
