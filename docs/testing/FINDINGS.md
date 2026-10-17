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
- Fix: hide pending-site card while publishing/undoing; first-publish wording; stacked app name and URL. [PR #50](https://github.com/bworlds-co/clodable/pull/50) merged after CI; 120 plugin tests passed. Verified in Sam’s second fresh conversation: only progress remains during first Publish, the reassurance is accurate, and the title/address fit; screenshot 19.

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
- Verification: [PR #51](https://github.com/bworlds-co/clodable/pull/51), merged after CI. Lint/typecheck and 122 plugin tests pass, including both empty and non-empty folder cases. Two independent model replays explain the limitation and preserve the local page. Updated build verified in a fresh Desktop conversation after the Mac was unlocked. The local-page explanation and absent import controls are correct; screenshot 11. PR #53 also removes the misleading one-minute setup heading from this state; its fresh visual check remains pending.

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

## F12 — polish — Recovery progress exposes git vocabulary

- Observed: after the synthetic-key stop, Claude’s intermediate update said the unused key had never been “pushed”. The final explanation was plain.
- Builder impact: a reassuring recovery moment introduces technical words the builder should not need.
- Cause: hidden repair instructions contain technical mechanics; the voice rule did not explicitly cover progress updates.
- Fix: recovery requests now state the vocabulary rule for both progress and final replies, with short examples. [PR #54](https://github.com/bworlds-co/clodable/pull/54), merged after CI.
- Verification: 122 plugin tests; two independent model replays (key removal and combined edits) used plain words. The subsequent Desktop conflict recovery also avoided git vocabulary.

## F13 — major — GitHub import rejects a copied address and gives no progress

- Observed: pasting `https://github.com/bworlds-co/clodable-launch-test` into an empty folder’s import form was rejected with an owner/name instruction. After accepting the URL, import left the form unchanged while downloading/installing. Screenshots 16 and 18.
- Builder impact: the natural input is treated as wrong, then a successful click looks inert and invites repeated clicks.
- Cause: owner/name-only validation; the text-input branch omitted the setup-progress component used by the other setup routes.
- Fix: normalize the copied GitHub address, label the field in plain words, and replace the controls with setup steps while import runs. [PR #55](https://github.com/bworlds-co/clodable/pull/55), merged after CI.
- Verification: the full URL imported the authorized repository in Desktop. 183 package tests and 125 plugin tests pass, including real form submission, normalized argument, steps and hidden controls. Fresh Desktop verification shows progress immediately and hides the form (screenshot 20); a failed clone keeps the failed step visible and returns the form. The demo import could not finish because setup’s clone operation does not use the fake GitHub adapter; the real authorized import succeeded earlier. This fixture limitation is not counted as a second successful import.

## F14 — major — Conflict recovery chooses before asking

- Observed: the draft and the fake live site replaced the same heading. Claude kept the draft because it was newer, then offered a choice afterwards. The panel promised it could keep both changes. Screenshot 17 records the safe stop.
- Builder impact: “combine” can silently discard someone’s intended words; the reassurance overpromises.
- Cause: “keep both where you can” leaves the choice implicit when the edits are incompatible.
- Fix: ask before choosing incompatible wording or behavior, preserve compatible changes, and accurately say what was kept. The panel now says Claude can review both versions with the builder. [PR #56](https://github.com/bworlds-co/clodable/pull/56), merged after CI; Desktop retest pending.
- Verification: two model replays (headings; booking versus waitlist behavior) asked before changing anything and kept the words plain. 122 plugin tests pass. A fresh Desktop conflict retest remains to do.

## Coverage after unlocking the Mac

- **Sam, first complete run:** setup, two questions, hosting, first Publish and public home/About passed. Added Supabase backend in test-org. Claude asked before creating the notes table and before posting test data. Published a visitor-notes feature; a note entered on the public site survived reload alongside the earlier test note (screenshot 13). This is one complete fresh run.
- **Sam, second run:** reset the disposable repository and test-created resources, then imported the GitHub app into an empty folder. Two setup questions and hosting preparation passed in Auto. First Publish completed with corrected progress (screenshot 19), and the public page was verified in the browser. The second backend is being created in test-org; live saved-data feature remains.
- **Tom, first run:** plain edit, inline Edit text, Point & ask, History Restore, conversational restore, Publish and durable Undo all worked in Desktop. Synthetic-key save stop clearly named the file and offered Fix it (screenshot 14); the key stayed local and recovery cleared the stop. Broken-build publish stop said nothing went live, and preview Try to fix repaired the page (screenshot 15). A simultaneous live edit stopped Publish; recovery worked and Publish succeeded after the builder chose the draft. F14 records the choice timing problem. Two conversations are open on this app; preview routing across both and a complete second fresh run remain.
- **Léa:** owner approved inspection and copy-only work. Claude inspected hirebright-score, recorded AI/sign-in/settings facts, and the panel’s Carefully route reached the Lovable export instructions. No app feature code or live site changed. The pre-existing destination `aqvgqmycchkemeviyqpw` still requires permission to verify/reuse. Request/download of a fresh Lovable export also awaits owner permission. No export was opened and no data/people/files/functions were copied.
- **Nadia:** local prototype explanation verified in a fresh conversation. Two model replays explain the actual limit without an invented button. The full from-idea journey remains a structural gap; a second fresh-folder pass and PR #53 heading check remain.
- **Also:** GitHub import works with a pasted URL after F13; new conversations repeatedly find the correct app after Desktop’s spare-folder transition. Released-plugin installation remains untested.
- **Repeat criterion:** the brief’s two-complete-fresh-runs criterion has not yet been met. This is continuing work, not UX sign-off.

## Resources and continuation notes

- Sam first-run resources were removed after verifying exact names and ownership: Netlify `fresh-app-kgjt` (`e9e279bf-5733-4154-bc9e-42db71409bc9`) in `emmanuel-acqvas8`, and Supabase `fresh-app` (`xeetvorbzybetwewdzdh`) in test-org. Netlify returned 404 afterwards; Supabase’s project list no longer contained that reference.
- The disposable GitHub repository was reset to initial app `e4cb1df`, with only main and no repository secrets, before the second run. Both first-run git bundles are retained outside the repo. The first conversation was archived and preview stopped; the reset remained not-set-up after a minute.
- Sam second-run folder: `~/Clodable Tests/github-import-20261017`, conversation `local_23f5bf6b-a26e-476c-aaf6-f6f0183049cb`. Test-created Netlify site `github-import-20261017`, id `cd736b43-4258-4aee-bea5-12c53c4ff552`, team `emmanuel-acqvas8`; address `https://github-import-20261017.netlify.app`.
- Tom’s disposable fixture is `~/Clodable Tests/_runs/2026-10-17-ux/tom-pass-1/crumb-site`, with a local fake GitHub. Conversations `local_2660d2fb-3716-48f4-a15e-7a955279f723` and `local_23b50bce-a7c2-4157-8c50-708327594b22`. No public site is involved.
- Nadia’s local page remains in `~/Clodable Tests/nadia-20261017`. Léa’s copy journey is conversation `local_70c6782d-cbc3-4653-b5c2-c480a8e2fb85`.
- Screenshots and model replays remain in `~/Clodable Tests/_runs/2026-10-17-ux/`. Replays use inert fixtures; failed/timed-out attempts are not counted as passes.
- No npm release, release tag, new token, sign-out, paid resource, live migration or Lovable change was performed.
