# Desktop UX findings

Review started 2026-10-17. Repository baseline: `c219213`. Desktop: Auto, default Opus 5.5 Extra; Manual also exercised. Screenshots: `~/Clodable Tests/_runs/2026-10-17-ux/`. This is an ongoing review, not an end-to-end sign-off. The Mac locked during the run; further Desktop testing needs the owner to unlock it.

## F01 — blocker — Setup command rejected after changing into the app folder (K1)

- Observed: handoff documents Auto rejecting the hosting command as data exfiltration. Code confirmed the guard accepted only the bare command. After the fix, Desktop used that same own-folder prefix and completed hosting setup in Auto.
- Builder impact: a normal setup button turns into a frightening permission failure with no useful recovery.
- Cause: the allowlist does not recognize a literal `cd` into the current app before the exact bundled command.
- Fix: accept only that exact current-folder prefix, retaining the full command allowlist and existing deny decisions. Reject other folders, expansion, redirection and appended commands.
- Status: fixed in [PR #45](https://github.com/bworlds-co/clodable/pull/45), merged after CI. Automated and real Desktop verification passed.

## F02 — major — Preparing hosting sounds like publishing (K2)

- Observed: Desktop button and heading say “Put my site online”; the operation only prepares hosting. Handoff records Claude refusing because Publish belongs to the builder.
- Builder impact: unclear whether the site has become public or another action is needed.
- Cause: the preparation step and publishing use the same promise.
- Fix: “Set up hosting”, a plain explanation that Publish makes the app public, and an unambiguous request to Claude.
- Status: fixed in [PR #47](https://github.com/bworlds-co/clodable/pull/47), merged after CI. Two model replays and real Desktop setup passed. The first Publish subsequently made the address public.

## F03 — major — Primary action clipped in the docked panel

- Observed: `01-sam-home-before.png` shows “Put my site…” cut off at the panel's right edge. Default panel width is about 270 px in this window.
- Builder impact: the most important action is partially hidden; its meaning is harder to read.
- Cause: shared cards put long explanation and non-shrinking actions in one horizontal row. History also forces title, badges, age and Restore into one row.
- Fix: stack card actions below their explanation; let history metadata and actions use a second line, with Restore always visible.
- Status: fixed in [PR #46](https://github.com/bworlds-co/clodable/pull/46), merged after CI. Home verified at the original dock width. Long history and Restore confirmation still need their full journey retest.

## F04 — major — History says “Live” for a site that is not online

- Observed: same Desktop screenshot: bar says “Not on the web yet”; History says “Published”, “Live”, “Current” for the initial app.
- Builder impact: directly contradicts the app's status and undermines trust in Publish.
- Cause: history assumes the latest version on the main line is live, regardless of hosting state.
- Fix: gate live claims on known hosting state; use neutral saved-version wording before first publication.
- Status: fixed in [PR #48](https://github.com/bworlds-co/clodable/pull/48), merged after CI. Automated absent/unknown/Lovable/pending hosting checks pass; Sam's offline home verified in Desktop.

## F05 — external — First-message slash command error (K5)

- Observed: fresh conversation displays “/clodable isn’t a command here.” while Clodable opens successfully and later loads the correct app.
- Builder impact: first action looks unsuccessful even though it worked.
- Cause: Desktop's command handling. The initial spare-folder setup briefly appears before the app's home loads.
- Fix: report to owner; Clodable cannot replace Desktop's message.
- Status: external, reproduced.

## Verification ledger

- Baseline: lint, typecheck, 183 package tests and 114 plugin tests pass.
- Existing e2e-edit and e2e-errors scripts pass; example restored byte-for-byte.
- Existing isolated e2e-move script passes using only its own ports 55320–55329; original passwords, existing sessions, new sign-up, data access and new writes verified.
- Sam baseline: new conversation on already-set-up fresh-app, `/clodable`, home and team selector inspected. No cloud resources created. Correct permitted Netlify team is display name “Vulk”, slug `emmanuel-acqvas8`; initial default is a different team.
- Sam reset begun: archived baseline conversation; closed test PR #3 and removed its draft branch. Repo retained. No repository secrets were present; config had no test site or backend.
- Léa: owner authorized inspection and copy-only migration steps. Live changes and Lovable changes still require separate approval.

## F06 — major — Create controls appear before account choices and costs load

- Observed: Sam's home initially offers hosting creation before the Netlify team selector appears. Opening Add a backend immediately offers creation without organization or cost; the blank choices state persisted in that conversation. The read-only CLI subsequently returned the account choices successfully.
- Builder impact: cannot know which account is affected or what it will cost; a failed lookup still looks actionable.
- Cause: null/empty choices fall through to the creation controls; lookup errors become empty lists.
- Fix: loading messages replace creation controls until valid choices exist; failures and empty results offer Try again. A single Netlify team is named explicitly.
- Verification: [PR #49](https://github.com/bworlds-co/clodable/pull/49), merged after CI. New tests cover unavailable choices, no creation action, and successful retry for both services. A fresh Desktop conversation loaded account choices, and Sam selected test-org successfully. The transient loading/failure state still needs a controlled Desktop retest.

## Fix verification update

- F01: PR #45 merged after CI. Guard tests include own-folder prefixes and rejection of other folders and extra shell commands. One of two headless hosting replays independently produced the problematic prefix.
- F03: PR #46 merged after CI. Card actions stack, history uses a second line for metadata, Restore is always visible.
- F02: PR #47 merged after CI. “Set up hosting” distinguishes preparation from Publish. Two model replays ran the provided command and said Publish comes next. Replays use an inert local fixture, not cloud resources.
- F04: code and tests now cover absent, unknown, Lovable and pending Netlify hosting; 118 plugin tests passed before the next fix.
- Combined build with F06: 120 plugin tests pass; package suite remains at 183 passing. Built and copied into Desktop's plugin cache. fresh-app preview now points at the repository build as instructed.
- Sam setup pass: progress shows tool check, added files, installing packages with “a minute or two”, then saved. Two questions answered No database yet / Not online yet. First question screen also wrongly said “Everything is live” (screenshot 02), included in F04.

## Desktop retest: hosting setup

- Rebuilt plugin loaded in fresh conversation `local_d5d63bf9-62fb-4c0c-a4f2-e19a1dd6fbfb` (engine `ac8fe438-bd74-43f4-95ee-f51210bfb466`).
- F01 verified: Claude used `cd` into fresh-app followed by the exact bundled site command; Auto allowed it and hosting was prepared. No permission failure.
- F02 verified: Claude said the address is empty until Publish. It did not refuse to prepare hosting or claim the app was already public.
- F03/F04 verified on the home: full action visible, no false Live badge, “Saved versions” and “Everything is saved”. Screenshot 04. Pending-site screen screenshot 05.
- Test-created Netlify site: `fresh-app-kgjt`, team `emmanuel-acqvas8`, address `https://fresh-app-kgjt.netlify.app`. This run created it through the panel.

## F07 — polish — First-publish progress repeats the action and assumes an existing live site

- Observed: the pending-site card retains Publish while the progress card below runs. “Your live site keeps working meanwhile” appears on the first publish. The URL pushes the app name out of the header at the default narrow width.
- Builder impact: ambiguity about whether the click worked; inaccurate reassurance before the first publication.
- Cause: pending-site card ignores activity; shared progress copy assumes a previous live version; header is a single row.
- Fix: hide pending-site card while publishing/undoing; first-publish wording; stacked app name and URL. [PR #50](https://github.com/bworlds-co/clodable/pull/50) merged after CI; 120 plugin tests passed. Desktop verification pending in a new conversation.

## F08 — major / structural proposal — Empty-folder setup offers only an existing GitHub app

- Observed: Nadia's empty folder opens a GitHub repository field and “Show my repositories”, with no way to describe a new app in the panel. Screenshot 06.
- Builder impact: someone with an idea cannot recognize a starting point and may assume they need a developer or another product first.
- Cause: setup is exclusively an import/setup flow; Clodable stays out of folders without a configured app.
- Proposal: add an explicit “Start with an idea” route that hands a plain request to Claude and explains when saving/publishing becomes available. This is a structural change reserved for the report.
- Status: Claude created a working local book-swap page with three books and local borrowing state. Clodable's import panel stayed unchanged; no Clodable saving or History became available. Screenshot 08. This validates the structural gap; it does not validate a full new-app journey.

## F09 — major — A local prototype is directed to a setup button that does not exist

- Observed: after Claude built Nadia's page, it told her to reopen /clodable and press “Set up Clodable here”. Reopening still offered only GitHub import. Screenshot 10.
- Builder impact: she follows the instruction and reaches the same dead end, with uncertainty about whether her work is saved.
- Cause: the guide equates “a folder holding an app” with a supported app already connected to GitHub. The setup panel offers import even when the folder is no longer empty.
- Fix: clarify the unsupported local-prototype state, preserve local work, and stop promising the absent button or offering import into a non-empty folder. A full from-scratch route remains an owner decision (F08).
- Verification: [PR #51](https://github.com/bworlds-co/clodable/pull/51), merged after CI. Lint/typecheck and 122 plugin tests pass, including both empty and non-empty folder cases. Two independent model replays explain the limitation and preserve the local page. Updated build copied to Desktop; visual retest is pending because the Mac is locked.

## Manual-mode observation

- Desktop currently calls the brief's Ask mode “Manual”. Backend creation in test-org was allowed through Clodable's command guard. Claude's surrounding help and inspection commands caused three technical permission prompts; one described a read-only inspection as a command with a write operation. These prompts belong to Desktop, but Claude's unnecessary exploratory steps contribute to the friction. Screenshot 09.
- Returned to Auto after exercising Manual. Approved individual inspections only, without saving broad permission rules.
- Sam's first Publish completed. Public home and About pages verified in a browser; screenshot 07. No Clodable toolbar appears on the public site.

## F10 — major / partly external — Manual mode exposes technical detours around setup

- Observed: backend setup required three permission decisions for surrounding help and read-only inspection commands. One warning characterized a read-only inspection as containing a write operation. The actual supported create command passed Clodable's guard.
- Builder impact: someone pressing Add a backend has to interpret shell commands and alarming warnings before understanding whether their app is safe.
- Cause: Claude explores around a deterministic operation; Desktop owns the permission presentation. Clodable cannot rewrite those dialogs.
- Status: external presentation reproduced; structural proposal to narrow the model's role for deterministic setup mechanics. Do not broaden the command allowlist to cover arbitrary exploration.

## F11 — major — A session can run different Clodable versions (K3)

- Observed: the panel runs the bundled CLI while the guide and generated app rules still use `npx clodable`; the preview's default launcher does too. The installed release is 0.2.2, so local source fixes do not automatically apply to all three paths.
- Builder impact: the same action can behave differently depending on which surface starts it; a fix can appear not to work.
- Cause: independent runtime resolution for the panel, model commands and preview.
- Status: open engineering follow-up. For this test, fresh-app's preview points at the repository build as the brief permits. No npm publication or release tag was created. A release requires owner approval; local verification is not proof of the released experience.

## Coverage at interruption

- **Sam:** reset, setup, two questions, hosting preparation, first Publish and public home/About verified. Backend `fresh-app` (`xeetvorbzybetwewdzdh`) was created in test-org; Claude reported the connection and build checked. The note feature, database confirmation, and live saved-data use remain to test.
- **Tom:** automated inline-edit and broken-page recovery scripts passed. The everyday Desktop journey, History/asked restore, Publish/Undo, synthetic-key stop, broken-build stop and simultaneous live change remain to test.
- **Léa:** owner approved inspection and copy-only work. Read-only local move status found an existing destination named `hirebright-score` (`aqvgqmycchkemeviyqpw`) from before this run. Separate permission to verify/reuse that pre-existing cloud destination is pending. No export/copy or live/Lovable change was performed.
- **Nadia:** empty folder, plain request, resulting local page and the missing-save dead end exercised once. Fix F09 needs a new-conversation Desktop retest.
- **Also:** new conversation in an existing app exercised repeatedly; correct-folder handoff settles successfully. GitHub import into an empty folder, simultaneous conversations on one app and installation of the released plugin remain to test.
- **Repeat criterion:** no journey has yet been signed off twice from a fresh start. The brief's completion criterion has not been met.

## Resources and resume notes

- Test-created site: `fresh-app-kgjt`, Netlify team `emmanuel-acqvas8`, public address `https://fresh-app-kgjt.netlify.app`.
- Test-created backend: `fresh-app`, Supabase `xeetvorbzybetwewdzdh`, test-org `vuhauwchbncatqwkvelx`. Retained for the next step; no destructive cleanup performed.
- Sam folder: `~/Clodable Tests/fresh-app`; latest Desktop conversation `local_d5d63bf9-62fb-4c0c-a4f2-e19a1dd6fbfb`. Backend setup finished while the Mac was locked.
- Nadia folder: `~/Clodable Tests/nadia-20261017`; local prototype retained. Empty import fixture: `~/Clodable Tests/github-import-20261017`.
- Headless model replay evidence: four JSONL files under the screenshot run's `model-replay/` folder. They use inert fixtures and do not create cloud resources.
- Next: unlock Mac; open a new Nadia conversation to load F09; finish Sam's saved-data feature; exercise Tom and the additional journeys; complete authorized Léa copy steps after resolving its existing destination; then repeat from fresh starts. Owner-only actions remain gated by the brief.
