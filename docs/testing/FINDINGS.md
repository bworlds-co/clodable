# Desktop UX findings

Review started 2026-10-17; continued into 2026-10-18. Repository baseline: `c219213`. Desktop: Auto, default Opus 5.5 Extra; Manual also exercised. Screenshots: `~/Clodable Tests/_runs/2026-10-17-ux/`. Testing resumed after the owner unlocked the Mac. This review records repeated Desktop evidence and the remaining limits to sign-off.

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
- Status: fixed in [PR #46](https://github.com/bworlds-co/clodable/pull/46), merged after CI. Home verified at the original dock width. Long History titles and the adjacent Restore confirmation were verified in both Tom fixtures; screenshots 12 and 21.

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
- Verification: [PR #49](https://github.com/bworlds-co/clodable/pull/49), merged after CI. New tests cover unavailable choices, no creation action, and successful retry for both services. A fresh Desktop conversation loaded account choices, and Sam selected test-org successfully. The second backend run visibly waited for account/cost choices before offering creation. Failure/retry behavior is covered by automated tests, not a forced real-service outage.

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
- Verification: [PR #51](https://github.com/bworlds-co/clodable/pull/51), merged after CI. Lint/typecheck and 122 plugin tests pass, including both empty and non-empty folder cases. Two independent model replays explain the limitation and preserve the local page. Updated build verified in a fresh Desktop conversation after the Mac was unlocked. The local-page explanation and absent import controls are correct; screenshot 11. PR #53 removes the misleading one-minute heading. After F15, two fresh empty-folder runs both changed to the correct local-page heading and explanation after Claude’s reply (screenshots 24 and 27).

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
- Fix: setup and fresh conversations copy the installed CLI atomically into ignored local support files. The preview uses that copy and the verified Node executable; generated instructions use the same copy, and the guide uses the plugin directly before setup. Runtime refresh preserves account settings, preview ports and explicit developer overrides. Publish/Undo remain builder-only. [PR #63](https://github.com/bworlds-co/clodable/pull/63), merged after CI.
- Verification: 186 package tests and 129 plugin tests passed; the 12 CLI contract tests passed again after the port-preservation and failed-copy checks. Two fresh Desktop fixtures automatically replaced their default npm launchers. Each local CLI matched the installed bundle byte for byte, and Claude ran its status check through that local CLI, with no additional permission prompt. Both previews and toolbars worked. Inline edit and broken-page recovery passed against the first preview, restoring app files byte for byte. Screenshots 37 and 38; `installed-runtime-evidence.json` records hashes, launch entries and observed model commands. A third fresh conversation after the final build refreshed the existing second fixture to the new matching bundle hash and opened its preview; screenshot 39 and `installed-runtime-upgrade.json`.
- Status: fixed and verified locally. No npm publication or release tag was created. The released-install passes still verify the original 0.2.2, not these changes; shipping a new release requires owner approval.

## F12 — polish — Recovery progress exposes git vocabulary

- Observed: after the synthetic-key stop, Claude’s intermediate update said the unused key had never been “pushed”. The final explanation was plain.
- Builder impact: a reassuring recovery moment introduces technical words the builder should not need.
- Cause: hidden repair instructions contain technical mechanics; the voice rule did not explicitly cover progress updates.
- Fix: recovery requests now state the vocabulary rule for both progress and final replies, with short examples. [PR #54](https://github.com/bworlds-co/clodable/pull/54), merged after CI.
- Verification: 122 plugin tests; two independent model replays (key removal and combined edits) used plain words. The second Desktop synthetic-key recovery also avoided git vocabulary: “The key stayed on this computer.”

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
- Fix: ask before choosing incompatible wording or behavior, preserve compatible changes, and accurately say what was kept. The panel now says Claude can review both versions with the builder. [PR #56](https://github.com/bworlds-co/clodable/pull/56), merged after CI. The second Desktop run asked before choosing; screenshot 26. F16 below records the preview break observed while that choice was pending.
- Verification: two model replays (headings; booking versus waitlist behavior) asked before changing anything and kept the words plain. 122 plugin tests pass. In Desktop, the builder chose the live heading; Claude preserved the separate badge edit and repaired the preview. No incompatible wording was chosen before approval.

## F15 — major — The panel stays on import after Claude creates a local page

- Observed: in Nadia’s second fresh folder, Claude correctly described the local prototype’s limits, but the open panel retained the GitHub import form and one-minute promise. Screenshot 22.
- Builder impact: the panel contradicts the conversation and invites an import into a folder that now contains work.
- Cause: the not-a-repo state did not refresh folder emptiness after a reply.
- Fix: refresh the empty-folder state when a turn completes, without saving or changing local files. [PR #58](https://github.com/bworlds-co/clodable/pull/58), merged after CI.
- Verification: 126 plugin tests, including a real empty-to-nonempty transition. Two independent fresh Desktop folders (`nadia-refresh-1`, `nadia-refresh-2`) created book/plant prototypes and changed to “Keep shaping your local app with Claude.” Import controls disappeared; the panel explicitly said Clodable was not saving yet. Screenshots 24 and 27. The book’s Borrow action worked when exercised directly.

## F16 — major — The preview breaks while a conflict choice is pending

- Observed: the preview showed “Your app can’t load” while the builder was deciding between headings. Screenshot 26. The first retest proved that Publish had already left conflict markers before Claude received the recovery request; the conversation was not the only cause.
- Builder impact: asking for help appears to break the app, precisely when the builder needs reassurance.
- Cause: Publish tried the combination in the working files and left conflicts there. Recovery also needed an explicit instruction to compare without changing those files before asking.
- Fix: [PR #59](https://github.com/bworlds-co/clodable/pull/59) requires read-only comparison before the choice and protects pre-existing unresolved work. This alone did not solve Publish’s earlier mutation. [PR #61](https://github.com/bworlds-co/clodable/pull/61) checks the combination in a temporary detached working copy first, reports the conflicting files, and leaves the builder’s preview intact. Both merged after CI.
- Verification: lint/typecheck, 185 package tests and 127 plugin tests. The real-git regression checks unchanged draft contents, no unresolved working state, unchanged live site and temporary-copy cleanup. Two fresh Desktop fixtures then stopped Publish with the draft intact. Claude asked before choosing in each; one kept the draft heading, one the live heading, and both retained compatible badge/recipe edits and published successfully. The second fixture’s visible preview stayed healthy while awaiting the choice. Screenshots 34 and 35; two model replays also passed.

## F17 — major — A fresh copy of a live app asks for its first Publish

- Observed: the second successful GitHub import of Sam’s already-live app showed “Your site is ready to go online”, although its public visitor notes were working. Screenshot 28.
- Builder impact: the same app appears live on one computer and offline on another, inviting an unnecessary Publish.
- Cause: the first-publication flag existed only in `.clodable/local/state.json`.
- Fix: with no local record, check the configured Netlify site’s published result. Record a confirmed live publication; a missing connection or failed lookup stays unknown and says Saved. Preserve the existing boolean JSON field and add an optional `statusKnown` flag. [PR #60](https://github.com/bworlds-co/clodable/pull/60), merged after CI. The API field is documented in [Netlify’s API reference](https://open-api.netlify.com/).
- Verification: 184 package tests plus the added CLI contract case (185 total cases), 127 plugin tests. Cases cover new hosting, unavailable hosting and an imported live site. A fresh Desktop conversation in `github-import-pass-2` shows “Everything is live” and Published History, without a first-Publish card; screenshot 33.

## F18 — major / external — Desktop hides the reason a marketplace source is rejected

- Observed: adding the release-tagged Clodable URL over its existing unpinned marketplace returned only “Failed to add marketplace.” The log explained that it did not match the existing source declaration. Screenshot 29.
- Builder impact: no visible way to understand or fix the failed installation.
- Cause: Desktop’s source-consistency check is reduced to a generic message in its UI.
- Status: external. Removing this test installation’s marketplace and adding the exact released source succeeded. No other marketplace was changed. Discover’s ordinary text search also failed to surface the custom Clodable listing; filtering Source to clodable did.

## F19 — polish — Preview’s reply exposes a local address and gives an unsolicited tour

- Observed: pressing Preview produced a localhost link, port number and a paragraph describing the page. Screenshot 35 includes that reply.
- Builder impact: extra technical text distracts from the simple result: the preview is open beside the conversation.
- Cause: the panel’s hidden request supplied the address without repeating the guide’s rule to keep it out of the reply.
- Fix: keep the address for the tool call; confirm in one short sentence, without a local URL or page tour. [PR #62](https://github.com/bworlds-co/clodable/pull/62), merged after CI.
- Verification: lint/typecheck, 127 plugin tests, two independent model replays (known address / start-preview paths). Both say “Your preview is open beside this conversation.” A fresh Desktop conversation returned that same single sentence without a local address; screenshot 36.

## F20 — major — An unavailable migration backend looks paused or ready

- Observed on 2026-10-18: the saved destination `aqvgqmycchkemeviyqpw` was absent from test-org's project list. `move diagnose` said Supabase did not answer, then suggested restoring a paused project. A subsequent check reported that Supabase was no longer connected on this computer. This does not prove the project was deleted: access is unresolved.
- Builder impact: the suggested recovery may not apply, and retrying Create previously claimed the remembered project was ready without checking it.
- Cause: diagnosis swallowed lookup errors; Create returned its local record immediately.
- Fix: preserve specific account/access errors, explain an unavailable project without claiming deletion, check remembered projects and wait for readiness, and distinguish paused from starting. No replacement is created automatically.
- Verification: 187 package tests and 129 plugin tests pass, including unavailable/paused projects, expired account access, no duplicate creation and no new writes from a failed check. Merged in [PR #64](https://github.com/bworlds-co/clodable/pull/64) after CI; the isolated real-Supabase migration script passed again. Fresh Desktop asks for Supabase reconnection; screenshot 41.

- Follow-up: the first model retest still guessed that a missing address meant paused/deleted/empty and promised a replacement path that does not exist. [PR #66](https://github.com/bworlds-co/clodable/pull/66), merged after CI, makes the move guide separate current checks from old local records, requires connection/access recovery first, and describes the export refusal without inferring its cause.
- Two independent model replays with the final guide preserved these limits and did not promise automatic replacement. A fresh Desktop read-only check returned the missing connection, said readiness could not be confirmed, named the missing export and gave reconnection as the next step. Screenshot 47. No copy, new backend or live-app change was performed. Desktop independently suggested “Fix merge conflicts” even though a read-only `git status` was clean; this surrounding Desktop suggestion is external.

## F21 — blocker / external — Lovable refuses Léa's database export

- Owner approved verifying/reusing the existing destination and requesting/downloading a fresh export on 2026-10-18.
- In the authorized Lovable project's Cloud → Advanced settings → Export data, Start export showed Exporting, then returned to Start export without a download. The page's console recorded `api_error_database_too_large_for_export` for this attempt. Screenshot 40 records the returned dialog. A prior Lovable conversation described the same limit; it was not treated as a fresh export or executed.
- No export was downloaded or opened, and no data, people, files or functions were copied. The live app is unchanged. Copy testing needs an export supplied by Lovable and a working Supabase connection. No support message, new token or live migration was attempted.

## Approved continuation — Nadia

- On 2026-10-18 the owner approved **Start from an idea**: Claude creates a local prototype; Clodable requests account consent before setting up saving and publishing. Implementation and repeat Desktop tests are in progress. This supersedes the earlier pending-decision status below; it is not yet a completed journey.

## Coverage after unlocking the Mac

- **Sam, twice complete:** first setup from `fresh-app`, then a full reset and GitHub import into `github-import-20261017`. Both runs reached a public site, added a free backend in test-org, asked before database changes, and published visitor notes. A note entered on each public site survived reload. Screenshots 13 and 23. The second note reads “Second fresh run: this note should still be here after a refresh.”
- **Tom, two fresh fixtures:** plain edit, inline Edit text, Point & ask, History Restore, conversational restore, Publish and durable Undo worked. Both runs stopped a synthetic key before it reached the remote, then recovered through Fix it. Both stopped a broken build with “Nothing went live”, and preview Try to fix repaired the page. Conflicting live headings stopped Publish safely. The second run asked before selecting the heading; the builder chose the live wording and retained the independent badge edit. F16’s final sequence also passed in two fresh dedicated fixtures, with both wording choices and successful Publish.
- **Two conversations on one app:** Tom’s second fixture had simultaneous conversations and preview servers. Point & ask from the second preview inserted its badge request into that second conversation and updated the intended app. New conversations repeatedly settled in the correct folder after Desktop’s spare-folder handoff.
- **GitHub import:** two successful imports of the authorized throwaway repository from empty folders. Full GitHub URLs work and progress appears immediately. The fake demo clone failure is not counted as a success.
- **Nadia:** the original page, a second book-swap prototype, and two fresh post-fix book/plant prototypes were exercised. The last two both updated the open panel correctly. Claude explained local-only behavior and the missing saving/publishing route. This verifies the honest limitation, not a complete from-idea product journey.
- **Released installation:** two remove/add passes through Desktop’s Plugins screen succeeded with `https://github.com/bworlds-co/clodable.git#clodable--v0.2.2`. Marketplace HEAD matches the peeled release tag `0a8ecb9d`; the installed CLI’s hash matches the tagged CLI. A fresh released conversation opened the original panel and reproduced Desktop’s contradictory “isn’t a command here” message (screenshot 31). Screenshots 30 and 32 show successful installation. Accounts were already connected; no token creation or sign-out was tested.
- **Léa:** owner approved inspection and copy-only work. Claude inspected hirebright-score and recorded AI/sign-in/settings facts. Carefully reached the Lovable export instructions. Those two preparation steps were approved on October 18. The destination was not listed in test-org; Supabase now requires reconnection. Lovable refused the new export because of its export-size limit (F21). No export was opened and no data, people, files or functions were copied. No live app changes occurred.
- **Repeat criterion:** Sam’s complete journey and Tom’s main actions have been repeated. Full sign-off remains withheld: Léa is blocked by the export and connection, Nadia’s approved route is still being verified, and the fixes have not been released. K3 now passes two fresh local runtime checks. The final conflict sequence passed twice from fresh fixtures. Do not present this as every journey completed twice.

## Resources and continuation notes

- Sam first-run resources were removed after verifying exact names and ownership: Netlify `fresh-app-kgjt` (`e9e279bf-5733-4154-bc9e-42db71409bc9`) in `emmanuel-acqvas8`, and Supabase `fresh-app` (`xeetvorbzybetwewdzdh`) in test-org. Netlify returned 404; Supabase no longer listed the reference.
- The disposable GitHub repository was reset to initial app `e4cb1df`, with only main and no repository secrets, before the second run. Both first-run bundles are retained outside the repo. Its conversation was archived and preview stopped; the reset remained not-set-up after a minute.
- Sam’s retained second run: `~/Clodable Tests/github-import-20261017`, conversation `local_23f5bf6b-a26e-476c-aaf6-f6f0183049cb`. Netlify `github-import-20261017`, id `cd736b43-4258-4aee-bea5-12c53c4ff552`, team `emmanuel-acqvas8`, URL `https://github-import-20261017.netlify.app`. Supabase `github-import-20261017`, ref `mhnokcaprwzrpjehbzqe`, in test-org. On October 18 this was the only project visible in test-org; the old migration destination was absent from that list.
- Second imported copy: `~/Clodable Tests/github-import-pass-2`, import conversation `local_cd1592a9-d8ae-4f92-aa66-598a3eccefa4`, corrected-status conversation `local_b8e483d4-0bd0-4457-927a-a8521aa0ec6a`. It shares Sam’s test services; it created no extra cloud resource.
- Runtime fixtures: `~/Clodable Tests/_runs/2026-10-17-ux/runtime-a/crumb-site` and `runtime-b/crumb-site`, with independent local fake remotes. Conversations `local_44c595d6-5aa1-4dec-ae27-070a60223d01` and `local_d9d76311-5727-4ea3-b2d4-ab2f8d4538dd`. Both used the automatically installed runtime for preview and Claude’s status command. Final update check: `local_44aee621-3814-408b-ac77-ef2ffbb38452` in the second fixture.
- Final conflict fixtures: `~/Clodable Tests/_runs/2026-10-17-ux/conflict-preview-a/crumb-site` and `conflict-preview-b/crumb-site`, with separate local fake remotes. Conversations `local_ec878537-5b43-407e-a9d4-8f41ee56ce2e` and `local_a2345788-89e9-4438-a874-3d60a986a0cd`. Both published the chosen heading while retaining compatible edits.
- Tom’s disposable fixtures: `~/Clodable Tests/_runs/2026-10-17-ux/tom-pass-1/crumb-site` and `tom-pass-2/crumb-site`, with local fake GitHub. No public bakery site is involved. Second-run conversations include `local_346be4d7-7b6f-4eec-83fb-be72236a30d7`, `local_27677460-7cd6-4d5d-bbc3-57ce9cbfa59b`, and final retest `local_b00788b1-4da5-4be3-9acb-44c908ecbae6`.
- Nadia’s files remain in `nadia-20261017`, `nadia-pass-2`, `nadia-refresh-1`, and `nadia-refresh-2` under `~/Clodable Tests`. Léa’s copy journey is conversation `local_70c6782d-cbc3-4653-b5c2-c480a8e2fb85`.
- The marketplace is pinned to release 0.2.2 after installation testing. The working plugin build was then copied into Desktop’s 0.2.2 cache as the brief instructs; this is a local test override, not a release. Existing conversations retain earlier code.
- Screenshots and model replays: `~/Clodable Tests/_runs/2026-10-17-ux/`. Failed/timed-out replays are not counted. Latest runtime build/check logs are `/tmp/clodable-runtime-final-build.log`, `/tmp/clodable-runtime-contract.log` and `/tmp/clodable-runtime-plugin.log`; earlier logs include `/tmp/clodable-ux-import-status*.log`.
- No npm release, release tag, new token, sign-out, paid resource, live migration or Lovable change was performed.

## F23 — major — The connection instructions contradict each other

- The Supabase connection panel said Clodable uses the token after the move, then instructed the builder to delete it as soon as the move finishes. Following that advice would break the connection needed for later database changes.
- Cause: the closing note described a temporary migration token although the connection is retained for ongoing use.
- Fix: [PR #67](https://github.com/bworlds-co/clodable/pull/67), merged after CI, explains that the connection supports later database changes and that revoking the token requires reconnecting before those changes. No account, token, permission or expiry was changed.
- Validation: plugin validation and all 129 existing plugin tests pass. A fresh Desktop conversation shows the consistent connection guidance; screenshot 48. No token was entered or created.

## F24 — major — The panel gives background information too much prominence

- Reviewed on 2026-10-18 after the owner raised panel crowding. The everyday home composes account/setup cards, site and data status, settings, history and warnings into one vertical view. In the migration view, the full assessment and “Worth knowing” notes precede the current action. Screenshot 48 shows the connection form below that material; losing the connection also makes the full assessment appear again.
- Builder impact: finding the next action requires scanning information for several different tasks. Narrow width magnifies the problem. This is an expert review of the observed journeys, not a measured usability study with representative builders.
- Cause: `register.tsx` renders most home responsibilities at the same level. `movePane` puts `whatMoves` before `moveSection`; `whatMoves` treats the connection step being incomplete as a reason to expand the full assessment. The migration stages already have some progressive disclosure, but the preceding assessment defeats its focus.
- Approved fix: a small app overview with separate History and Settings views inside the same panel; task views put the current action first and offer the assessment and completed work on demand. Keep actionable blockers visible. Let Claude open the appropriate view through a navigation-only mod tool when the builder asks naturally. Keep everyday editing usable with the panel closed.
- Feasibility: the current implementation already uses panes, the prompt bar, message/tool rendering, events and shared state. The official mods API also supports registering tools for Claude. The proposal does not require a custom client renderer or new permanent panels. Desktop's permission dialogs remain outside Clodable's control. See the capability review in UX-REPORT.md.
- Status: owner approved the structure on October 18, explicitly preferring conversation where dialogue works better. Implemented in [PR #68](https://github.com/bworlds-co/clodable/pull/68), stacked on the existing idea-route branch: focused app/History/Settings/task views, navigation-only `open_panel`, current migration step before expandable assessment, and retained actionable blockers. Desktop verification is recorded below.

## F22 — major — An idea needs a supported route into saving

- The owner approved the product direction on 2026-10-18. Implemented in [draft PR #65](https://github.com/bworlds-co/clodable/pull/65), with passing CI: Start from an idea → describe it to Claude → local preview → Set up saving → named GitHub account and private-app consent → normal draft/Publish workflow.
- Initial Desktop book-swap run: `/clodable` offered both starting choices, Claude created Vite/React without creating a remote, borrowed/returned a sample book and explained browser-only data. The panel changed to Your local app and Set up saving. Consent named @emmanuelvulk and private visibility. Screenshot 42 shows the starting screen.
- The initial form stayed clickable while Claude started. The latest source replaces it with progress immediately and prevents repeated submissions. The bar now names both starting routes. Immediate request feedback is covered by the plugin test; the two complete local-prototype runs predate that last waiting-state polish.
- Verification: lint/typecheck/build, 191 package tests and 132 plugin tests pass. Coverage includes idea submission without an account, named consent, typing a changed name without Enter, account-change refusal, secret-key stops, preserved prototype files, draft-only saves, failure recovery and the existing import route. Inline-edit and broken-page recovery scripts pass, restoring their fixture byte for byte. The isolated real-Supabase migration script also passed again, on its own ports.
- Two independent Desktop starts produced working book and plant prototypes. I borrowed/returned a book, watered/undid a plant and confirmed both choices survived reload. Two fresh conversations reached the simplified account consent; cancel/reopen and empty-name recovery stayed local. Screenshots 44–46. The initial account screen showed healthy development tools; the revised screen shows the account and hides those details.
- Fresh conversations briefly offered import while their folder was still being checked. The panel now waits before choosing a setup route. A final fresh conversation reached Your local app and the account-consent screen without the initial import form (screenshot 49; `local_9e43134e-56e4-47bd-92a5-49d7a95157bb`). An empty name asks for a name without an unnecessary Ask Claude action.
- The owner approved private repositories `emmanuelvulk/clodable-idea-books-test` and `emmanuelvulk/clodable-idea-plants-test` on October 18. Both were created through Clodable's named-account consent in Desktop, and GitHub independently confirms private visibility. The real saving/publishing continuation is recorded below.

### Nadia test locations

- Local prototypes: `~/Clodable Tests/nadia-idea-books` and `~/Clodable Tests/nadia-idea-plants`, now connected to the two approved private repositories above.
- Initial Desktop conversations: `local_b5116954-e151-4dbe-9fb4-5335755646ff` (books) and `local_048af90f-2127-49a7-8a31-9d397d9aad2a` (plants). Fresh consent checks: `local_f0a51684-9f1f-454a-baff-3bb729bc0c83` (books), `local_ed6cf93e-c607-4eeb-94b8-2bd16f573c09` (plants).
- Evidence: screenshots 42–46; package/plugin/build logs `/tmp/clodable-idea-full-final.log`, `/tmp/clodable-idea-plugin-final.log`, `/tmp/clodable-idea-build.log`; isolated migration `/tmp/clodable-idea-e2e-move.log`.

## F25 — major — Setup questions belong in a short conversation

- The old form required builders to classify their hosting and database. The owner approved inspect-then-confirm setup and conversational UX on October 18.
- Implemented: `app_context` exposes safe current facts, Claude inspects the app, asks one relevant question at a time, and `remember_app` records confirmed facts. Unknown and unsupported arrangements stay unknown; recording facts creates no service and grants no live-data consent.
- The first four wording replays were cautious but asked two questions together. The guide now explicitly waits for an answer before another question. A Desktop run then treated the demo's saved address as evidence of a live site. The final guidance also treats recorded addresses and unused database clients as potentially stale or placeholders. Four further replays (two ownership cases, two hosting cases) preserved uncertainty and asked one question.
- Fresh Desktop retest `local_d478ceb8-e8f0-4f02-ad4f-87c73f04fe4b` identified the placeholders and asked whether people already visit the site. It did not record an arrangement before confirmation. Earlier run `local_3dce6628-0198-4bfb-b8f5-a5eff3fe24c5` recorded the builder's correction through `remember_app` and opened hosting consent from ordinary conversation.
- Model wording still varies and can mention technical clues in progress messages. This is an improvement in the tested cases, not a guarantee that every reply will be equally concise.

## F26 — major — Fixed account creation should finish where it was approved

- Sam's earlier backend button sent a command to Claude, which could perform surrounding inspection and encounter technical permission prompts. The owner approved running the fixed hosting/backend operation in the panel after account/cost consent.
- Implemented: the panel displays the selected account and known costs, runs the exact CLI operation, shows progress, and prevents repeated presses while running. Hosting setup saves the configuration and says that Publish makes it public. Backend setup hands app-specific integration back to Claude. Chat creation commands are denied; unknown costs keep creation unavailable.
- Failed lookups of remembered sites/backends now stop with the original access error. They no longer fall through to creating replacements. Two CLI regressions verify no resource is created and the remembered configuration survives.
- Desktop: two independent fixtures connected to local fake service APIs through the panel, created their hosting, and created their backend before the integration request appeared in chat. No real cloud resource or credential was created. The demo included an obsolete placeholder backend reference: the new check correctly refused to replace it; the fixture reference was then removed explicitly before continuing. This is not evidence of a complete real-cloud setup rerun.
- Test locations: `~/Clodable Tests/_runs/2026-10-18-conversation/conversation-a/crumb-site` and `conversation-b/crumb-site`; conversations `local_461fb71b-3e02-4ea2-9d4b-63b8631b7ec7` and `local_3dce6628-0198-4bfb-b8f5-a5eff3fe24c5`. Fake service process is `/tmp/clodable-fake-accounts.mts`; each fixture isolates its account directory. Screenshots `hosting-created.png` and `backend-handoff-b.png` are in the same run directory.

### Conversation-first pass: evidence and limits

- Home fits in the original narrow dock; History and Settings no longer share the same long screen. Natural-language History opened the correct view. The first reply duplicated the list in chat, so the tool result and guide now request a short acknowledgement. Offline Home also hid a stale website link after this test exposed it.
- Léa's fresh read-only layout check (`local_3b3839d5-092c-4b1c-88ef-de6f8ed377aa`) shows the connection field immediately, followed by **See all steps** and **What moves with my app?**. The assessment expands and collapses on request. Screenshot `migration-current-step.png`. No reconnection, export, copy or live step was performed.
- Lint, typecheck and build pass; 193 package tests and 138 plugin tests pass. Inline-edit and broken-page recovery restore their fixture byte for byte; isolated real-Supabase migration passes on its own ports. The inline-edit script initially met a duplicate-React error in the generated Vite cache; restarting with a fresh generated cache resolved it without a source change.
- Plugin rebuilt and reloaded locally into Desktop's 0.2.2 cache. This is not a release. Previous full live Sam/Tom journeys remain prior evidence; these tests target the changed UX. Léa's export/connection remain outstanding. Nadia's private-repository creation was subsequently approved and completed, as recorded below.

- Final focused navigation retest: `local_a75373f9-a5cf-4e76-ba5f-c69b0d40ae84` opened History from “Show me my previous versions” and replied with two short sentences, without listing the versions again. Screenshot `history-final.png`. In the independent inspection fixture, Restore confirmation appeared beside the chosen version and Cancel preserved it; Home showed no stale website address. Screenshot `home-final.png`.
- With the panel closed, the final configured-app session answered a status question in chat without reopening it. Nadia's new session `local_05a1bb8c-ded5-4224-83b8-db4d08043cc7` opened private saving consent from an ordinary request, named @emmanuelvulk, and stopped before creation. Its navigation activity initially used a technical tool label before setup; Clodable's own tool rows now use friendly labels in local prototypes too.


### Nadia: approved real saving and publishing continuation — October 18

- The owner explicitly approved creation of the two named private test repositories. Both creations ran through the current Clodable panel in Claude Desktop, after the account and private visibility were shown. GitHub confirms both destinations are private; neither prototype was recreated or replaced.
- Books: `~/Clodable Tests/nadia-idea-books`, Desktop `local_801cd582-c084-427a-a341-054865292bd6`, private repository [emmanuelvulk/clodable-idea-books-test](https://github.com/emmanuelvulk/clodable-idea-books-test). Hosting was created in Netlify team `emmanuel-acqvas8` (displayed as Vulk), site `shelf-next-door`, id `e1bf8fde-0208-4aac-b026-b210f7bf026e`. Publish succeeded: [workflow](https://github.com/emmanuelvulk/clodable-idea-books-test/actions/runs/39108274339), [live app](https://shelf-next-door.netlify.app). Desktop showed **Everything is live**. Borrowing a sample book survived reload; returning it restored the sample state.
- Plants: `~/Clodable Tests/nadia-idea-plants`, fresh Desktop `local_97edae3e-5664-4061-91e3-6f2d9c654315`, private repository [emmanuelvulk/clodable-idea-plants-test](https://github.com/emmanuelvulk/clodable-idea-plants-test). Hosting was created in the same authorized team, site `little-leaves`, id `af0647ef-170c-464b-9575-b8fc4299c89f`. Publish succeeded: [workflow](https://github.com/emmanuelvulk/clodable-idea-plants-test/actions/runs/39108438906), [live app](https://little-leaves.netlify.app). Desktop showed the timed **Going live** progress; the successful workflow and live page confirm completion. Watering the sample Peace lily survived reload; Undo restored its original state.
- The hosting selector defaults to another connected team, Ops & Product; both tests explicitly selected Vulk before creation. No resource was created in the other team. The CLI's read-only team listing verified the display-name/slug mapping.
- Both apps disclose browser-local data, and the public pages contain no Clodable editing toolbar. These tests verify saving and publishing a prototype, not shared data, account creation, or sign-in.
- Evidence in `~/Clodable Tests/_runs/2026-10-18-conversation/`: `nadia-books-published-desktop.png`, `nadia-books-live.png`, `nadia-plants-live.png`. Both private repositories and both test sites are retained.
- No product code changed in this continuation; the real GitHub publication workflows and live-browser checks add evidence to the previously passing package/plugin tests. No npm publication, release tag, new token, sign-out or live migration was performed.
- The owner offered to reconnect Supabase. Claude Desktop was left on hirebright-score's current migration connection screen, with **Prefer a narrower token?** expanded. Credential entry is handed to the owner; reconnection has not been assumed successful. The Lovable source is [hirebright-score](https://lovable.dev/projects/e1a96225-0edb-4967-ae0f-256c871f673e); the prior export-size refusal remains unresolved.


### Léa: replacement app and successful fresh export — October 18

- The owner requested `vulk-corp/tiny-notes-wall` instead of `hirebright-score` because the original Lovable export is broken. The replacement is authorized for inspection, fresh export and copy-only testing. Live changes, final cutover and removal from Lovable remain reserved for the owner.
- Confirmed [Tiny Notes & Wall in Lovable](https://lovable.dev/projects/b5d444a0-777d-4ff9-90b8-a613ef97daa0) matches the local README and GitHub remote. The checkout remains on `main` at `76f3ecf`, matching freshly fetched origin/main; only pre-existing local Clodable session files are untracked. Clodable status reports `not-set-up`. No setup, GitHub write or live-app change was made during this preflight.
- Read-only code inspection confirms email/password sign-in, private notes, wall posts, attachment/cover storage, a server-side greeting setting, and note summaries through Lovable AI. These are preflight observations; Claude's guided Desktop assessment remains to be exercised. No personal note or account records were displayed.
- In Lovable, More → Cloud → Advanced settings → Export data → Export → Start export succeeded. Cloud storage gained `database_export_18_10_26` containing `b5d444a0-777d-4ff9-90b8-a613ef97daa0_261018.backup`, displayed as 375 KB. Download completed to `~/Downloads/b5d444a0-777d-4ff9-90b8-a613ef97daa0_261018.backup.zip` (383,880 bytes); the archive contains one 383,682-byte backup and passes its integrity check. Export contents have not been printed or imported. The older October 11 export was not used.
- SHA-256 of the downloaded archive: `322dbb921a692a9f6ce53a825d5e80d5cae759e8b1ab7af99d37571022228675`. Screenshot: `~/Clodable Tests/_runs/2026-10-18-conversation/tiny-notes-export-created.png`.
- A read-only status check still reports Supabase disconnected. Claude Desktop was left untouched for the owner's pending reconnection. Next: after that handoff, run the replacement's setup and assessment in a fresh Desktop conversation, create its copy backend in test-org within the free capacity, and import this fresh backup through Clodable. The old hirebright destination must not silently become this app's destination.
- F21 remains a confirmed external failure for hirebright-score; it no longer blocks the replacement's export. The replacement's real import, people/files/functions copy and sign-in rehearsal remain outstanding. No credential, paid resource, live-app cutover or release was created.


## F27 — major — Downloads can select another app’s export and miss a manual dump

- **Observed:** the migration reader chose the newest `.backup` or zip in Downloads without matching it to the current Lovable app. With both hirebright-score and Tiny Notes exports present, the hirebright panel could select Tiny Notes’ archive. A support-supplied `.dump` was ignored by discovery even though the reader accepts PostgreSQL custom archives.
- **Why it matters:** a builder can import the wrong app’s data without knowing; a usable support export looks unsupported. A failed replacement read also overwrote the previous protected backup before validation.
- **Cause:** selection used modification time alone, zip extraction chose the largest backup, and normal imports read directly into the saved-copy folder.
- **Fix:** match outer/member filenames to the known Lovable project; support `.dump` alongside `.backup`, including inside zips; refuse a labelled mismatch or multiple backups; request an explicit conversational file choice when identity is unknown. Read replacements in a temporary protected folder, preserving the last usable export on failure. Filenames are a selection aid, not proof of archive provenance.
- **Checks:** 198 package tests and 138 plugin tests pass, including two-app selection, manual dumps, ambiguous archives, and successful copying after a failed replacement. Lint, typecheck, build, inline editing and broken-page recovery pass. Read-only discovery on the owner’s Downloads independently selects the correct Tiny Notes zip and hirebright dump. Two model replays explain manual-file support and request the missing path; the older export is limited to rehearsal. The isolated real-Supabase migration check passes (original passwords, session refresh, new sign-up, saved data and access rules). The updated plugin is loaded into Desktop; the real migration journey is in progress. A final damaged-zip regression also passes (six focused selection tests). PR [#70](https://github.com/bworlds-co/clodable/pull/70) merged after CI passed at head `d692094`; no release.

## Manual hirebright export and Supabase reconnection — October 18

- Owner supplied `~/Downloads/e1a96225-0edb-4967-ae0f-256c871f673e.dump`. Read-only inspection identifies a PostgreSQL custom archive (`PGDMP`, format 1.16, gzip), made on October 13 at 09:02:34 CEST by PostgreSQL 17.11. It is 334,679 bytes with 478 archive entries. The application’s eight table definitions plus account and storage data sections are present; a full `pg_restore --file=/dev/null` read succeeds. No records or raw SQL were displayed, and no database was connected or modified. SHA-256: `3ed006503e6cb257cd6c8c1eecc067350ca90ec6041d69f213effc1ba4bc7b57`.
- This establishes format/readability, not successful import or data completeness. The archive predates current testing by five days and is suitable only for rehearsal unless a later final export is obtained. Storage metadata is not the uploaded file content. The dump was not imported; Tiny Notes remains the approved active fixture.
- After the owner connected a Supabase token in the panel, account lookup succeeds. `test-org` has one free slot, with `github-import-20261017` the only listed project. The remembered hirebright destination `aqvgqmycchkemeviyqpw` remains unavailable to this account; this does not establish that it was deleted. It was not cleared or replaced.

- Additional manual-dump validation: Clodable’s own reader succeeds in a temporary private folder, which was removed afterwards. It reports 9 non-managed tables (including `drizzle.__drizzle_migrations`), 123 rows, 2 password accounts, and no application storage buckets or files. These are archive counts, not a comparison against the live app. No import or migration-state change was made.


## Léa: Tiny Notes setup and copy backend — October 18

- Fresh Desktop conversation `local_d657685a-6467-4231-9f37-32f6e0554340` in Auto mode used the installed source build. Asked naturally to move Tiny Notes, rehearse on a copy, keep the live app unchanged, and use only free space in test-org. Claude inspected the code, asked one hosting/data confirmation, and opened setup. Setup then returned automatically to the conversation; Claude reused the confirmed answer and recorded migration facts.
- The setup created the draft and [review #10](https://github.com/vulk-corp/tiny-notes-wall/pull/10); nothing was published. The panel’s initial account was a different free organization, so test-org was explicitly selected before creating anything. Paris was selected; the cost was Free. Carefully was selected for the rehearsal.
- Created copy backend **tiny-notes-wall**, reference `vpewfafqslrjiqjexyix`, region `eu-west-3`, in test-org. The real panel confirmed creation and moved to the export step. This is a new test resource, not the unavailable hirebright destination. The preview still points at Lovable until the copy is ready.
- The new export help is visible in Desktop, including the conversational route for a support-supplied file. Pressed “I’ve downloaded it” to read the fresh Tiny Notes archive. The reader selected the correct fresh Tiny Notes export despite the newer hirebright dump beside it. It contains 3 wall posts, 1 note, 0 people and 0 uploaded files. Lovable’s Users page independently reports “No users found.” After acknowledging that source observation in chat, the real copy passed every check. This fixture cannot establish that existing accounts/passwords or private files transfer.


## F28 — polish — Region help claims it knows the computer’s location

- **Observed:** the region picker defaulted to East US on this Paris Mac, and kept saying “Picked from where this computer is” even after Paris was selected manually.
- **Why it matters:** the explanation presents an assumption as fact and stops matching the choice on screen.
- **Fix:** remove the location claim; keep the useful advice to choose where the app’s users are.
- **Checks:** lint, typecheck, build, 199 package tests and 138 plugin tests pass. No selection logic or account behavior changed.


## F29 — major — Migration actions in conversation leave the panel behind

- **Observed:** a plain-language request copied Tiny Notes successfully, but the panel kept offering “Copy my data” during the running operation and after Claude reported completion. It did not advance to the preview step. Screenshot: `~/Clodable Tests/_runs/2026-10-18-conversation/tiny-notes-copy-panel-stale.png`.
- **Why it matters:** the two surfaces disagree, and the remaining button invites the builder to repeat an operation that has already finished. That undermines the approved conversation-first workflow.
- **Cause:** move status refreshed after a turn only when that turn came from a panel button. The shared action helper also ignored an active turn started directly in chat.
- **Fix:** after any main-conversation turn with loaded migration state, refresh it before re-enabling step actions. During a turn, requests that would send another migration instruction show a waiting message. Secret-entry fields remain available. Child-agent completion does not unlock the main conversation’s action.
- **Checks:** lint/typecheck/build and 141 plugin tests pass, including completed/aborted conversational operations and usable secret fields. The 199 package tests passed immediately before this plugin-only fix. Fresh Desktop conversation `local_b4e1b08c-85f0-4b9f-8781-ed2e8f0dc571` verified the fix: the open panel shows the waiting message during chat, then a conversational switch to live data changes the next action from website setup to Try my app on the copy without reopening the panel. The preview was then returned to Copy; no live data was edited.

F28 merged as [#71](https://github.com/bworlds-co/clodable/pull/71) after CI passed. F29 merged as [#72](https://github.com/bworlds-co/clodable/pull/72) after CI passed on final head `40329b3`. No release was published.


### Tiny Notes public preview rehearsal

- Fresh source-build conversation **Tiny Notes preview migration** switched only the preview to `vpewfafqslrjiqjexyix` in test-org. Desktop’s Browser pane at port 8082 shows the public Wall and all three sample posts, with the toolbar labelled **Copy**. Reload and the conversation’s request inspection confirmed the posts came from the new backend. No sign-in, account creation, data edit or publication was performed.
- Screenshot: `~/Clodable Tests/_runs/2026-10-18-conversation/tiny-notes-wall-copy-preview.png`. The next migration stage is website/email/service preparation. This is public-page evidence only: it does not verify private notes, new-account behavior, uploaded images, the greeting setting, or AI summaries.
- Polish / conversational friction: the fresh preview request spent several minutes inspecting Clodable’s implementation and looking up the supported command before switching. The skill’s opening still assumes every request came from a panel button with its command attached. A direct request needs concise supported-command guidance; the existing source inspection was unnecessary for this established operation. This remains a recorded improvement opportunity, not a failure of the copy.

- Source-scope check: GitHub main still points to `76f3ecfa5f35860734f34cbc8bb8816d6d08032c`, the preflight revision. The preview was switched to live data and back only to verify state synchronization; no live data was edited. The rehearsal remains on Copy.


## F30 — polish — The floating toolbar covers signup in a short preview

- **Observed:** with Browser above the Clodable panel, the short preview put “No account? Sign up” behind the floating toolbar. Attempts to press the link hit Edit text instead. No text was changed. Exiting Edit text and hiding Clodable’s tools exposed the link and opened Create account.
- **Why it matters:** an app control becomes hard to discover and use when Desktop divides the available height between panels. The existing Hide control is a working recovery, but builders should not have to discover that to sign up.
- **Fix:** previews 420 px high or shorter initially show a small corner control. Pressing it opens the full tools; resizing back to a taller preview restores the normal dock. This automatic compact state does not save a Hide preference. The minimized control retains **Copy** when the preview uses copied data, and keyboard shortcuts reveal their active tools.
- **Checks:** 201 package tests and 141 plugin tests pass, with focused checks for resizing, manual expansion, keyboard focus, shortcuts and the Copy label. Lint, typecheck, build, inline editing, broken-page recovery and isolated real-Supabase migration pass. Desktop's short Browser pane shows the compact **Tools** control and opens the full toolbar on request. The source build is loaded locally; no release.
- **Handoff, completed:** the owner created a test account personally in the copy’s form, then asked testing to continue. No credentials were entered by the testing agent or requested in chat. The authenticated rehearsal below follows that handoff. At that handoff the greeting and AI settings were unset. The later completion pass below verifies the greeting; AI still needs an owner-selected provider and key. GitHub main remains at the preflight revision.


### Tiny Notes authenticated rehearsal — October 18

- Resumed **Tiny Notes preview migration**, still using the copied backend `vpewfafqslrjiqjexyix` in test-org and the preview at port 8082. The owner’s account was signed in and initially showed **No notes yet**. Its session survived reload and navigation. The owner performed signup; this verifies its resulting session, not an agent-observed credential-entry flow or a separate sign-in after signing out.
- Created two clearly disposable notes through Desktop. The first survived reload, an edit and another navigation back. The second uploaded a 59-byte text attachment; opening it displayed the exact test text through the copied backend’s signed-file route. The signed address and credentials were not recorded. This verifies new private content and uploads, not transfer of pre-existing source files.
- Posted a disposable Wall message with a generated 64 × 64 PNG cover. A separate anonymous browser saw the post and the correctly loaded cover (`naturalWidth: 64`), alongside the three copied sample posts. Its private-notes page instead showed **Your notes, kept private** and **Sign in to start writing**. This is UI evidence for the intended visibility; it is not an independent penetration test of every access rule.
- **Summarize** on the disposable note returned **AI is not configured**. The greeting remains blank. The server function still requires a Lovable AI connection, so the database checks do not establish that every app feature is ready to leave Lovable. No AI key was supplied, provider changed or paid request made. Screenshot: `~/Clodable Tests/_runs/2026-10-18-conversation/tiny-notes-private-rehearsal.png`.
- Deletion through the fixture’s **Delete** button produced no visible confirmation or removal in Desktop; the app uses `window.confirm`. The cause was not isolated, and deletion is **not** counted as a passing UI check. The Wall has no delete control. Cleanup therefore used Clodable’s existing Supabase API adapter after verifying the project name and test-org ownership, restricted to the exact test records and generated file paths. No credential was printed or new credential created.
- Cleanup verified **1 original note, 3 original posts, 0 uploaded files and 1 owner-created account** remain. Reloaded Desktop shows **No notes yet** for that account; the anonymous Wall again shows only the three original posts. The account remains signed in. No live data, source records, account settings or publication changed. The copy backend remains available; together with Sam’s backend it occupies both free test-org slots.
- Remaining evidence gaps: a second fresh migration rehearsal, transfer of existing accounts/passwords and files, a separate sign-in, deletion in Desktop, greeting and AI configuration, hosted server behavior and live cutover. These results do not satisfy the brief’s full twice-from-fresh sign-off criterion. No further product-structure decision is pending; new credentials, spending, release and live migration still follow the brief’s owner-only boundaries.


## F31 — external — Desktop silently cancels browser confirmation dialogs

- **Observed:** a separate, harmless local page calls `window.confirm` and displays its result. In Desktop it immediately displayed **Cancelled**, without presenting a dialog. The same page in the control browser produced a JavaScript confirmation. This isolates the reason Tiny Notes' Delete button did nothing; the database was not refusing deletion.
- **Builder impact:** actions implemented with the browser's confirmation can appear unresponsive in Desktop's preview. Clodable cannot change Desktop's browser-dialog handling.
- **Recovery:** keep the confirmation but render it inside the app. A fresh Desktop conversation was asked to apply that change only to Tiny Notes' draft, with **Delete note**, **Cancel**, and explicit failure feedback. The repair passed in Desktop: Cancel kept a disposable note; Delete removed it. A second disposable note with a text attachment was removed with its file. A read-only count check confirmed the copy returned to 1 original note, 3 original posts, 0 files and 1 owner-created account. The draft also reports note-delete and file-cleanup errors separately, checks returned errors and zero-row results, and offers Retry removing attachment. Nine temporary fake-database checks passed, including retry failure and recovery. Actual storage-failure injection was not performed; retry state lasts only until reload. These changes remain in Tiny Notes review #10, with main unchanged.
- The probe has no side effects and is retained outside the repository at `~/Clodable Tests/_runs/2026-10-18-conversation/dialog-check.html`.


## F32 — polish — Natural migration requests lack the command a panel button supplies

- **Observed:** a direct request to try the copy spent several minutes inspecting Clodable's implementation and looking up its preview command. The move guide assumed every request came from a panel button carrying a hidden exact command.
- **Fix:** the guide now supports both entry points, names the installed command, and maps ordinary requests to status, preview and diagnosis. It checks current progress before continuing and keeps consent, secrets and live changes behind their existing boundaries. Repeating a copy explicitly warns that rehearsal data and accounts are replaced.
- **Checks:** two independent model replays used an inert local CLI. “Let me try the copy” ran status → preview copy → diagnose, without inspecting implementation or touching a real service. “Where were we? Do not change anything” ran status only. Both kept database checks distinct from untested app behavior. Replay evidence is in `~/Clodable Tests/_runs/2026-10-18-conversation/natural-move-replays/`. Lint and 141 plugin tests pass; the preceding toolbar revision passed all 201 package tests and the three end-to-end checks.


## Completion pass — October 18, afternoon

- **F30 merged:** [PR #79](https://github.com/bworlds-co/clodable/pull/79), CI passed. Desktop's short preview retains a small **Copy · Tools** control. Expanded tools remain available. The source plugin was rebuilt and loaded locally; no release.
- **F32 merged:** [PR #80](https://github.com/bworlds-co/clodable/pull/80), CI passed. A fresh real Desktop conversation, `local_4392137d-cd11-4240-912d-92a0894f1f08`, invoked the move skill, ran status and diagnosis directly, and inspected the app's feature code instead of Clodable's implementation. Two earlier inert model replays also passed. The actual conversation started the configured preview on a different available port (8081 rather than the retained authenticated 8082), so the browser asked for sign-in on that new origin. The existing account was not removed. The Mac locked during the final UI check; full fresh-conversation preview continuity is not signed off.
- **Greeting verified:** entered the harmless value “Welcome to Tiny Notes — test copy.” in the actual Settings field. The preview restarted and displayed it. The app had no Netlify site at this point, so the setting remained local; no Lovable setting changed.
- **Deletion verified:** the in-page confirmation and attachment removal passed as recorded in F31. Screenshot: `~/Clodable Tests/_runs/2026-10-18-conversation/tiny-notes-greeting-delete-passed.png`. The test account remains signed in at the retained preview origin. No account credentials were read or changed.
- **Populated migration mechanics, twice:** extended `scripts/e2e-move.mts` to keep separate, disposable local source and target Supabase projects alive. The source has three password accounts, rows, and real public/private file contents. Two fresh runs exported, restored, copied both files, checked original-password sign-in, refreshed a pre-move session, created a new account/profile, wrote data, compared file bytes, and refused private-file reads to another user and anonymous visitors. Repeating the file step also passed. Only the named local test projects on ports 55320–55329 and 55420–55429 were stopped; the owner's bworlds-api stack was untouched. This verifies transfer mechanics, not a second real Lovable/Desktop migration. Logs are retained outside the repository.
- **Still requires the owner:** AI provider and a key entered in the panel; a sending domain if signup/password-reset email is to be tested; a separate credential-entry/sign-in handoff; approval for live cutover, final export/pause, domain changes, Lovable disconnection and any release. Both free test-org slots are occupied. No further product-structure decision is waiting.


## F33 — major — A saved app setting disappears from Settings

- **Observed:** after saving GREETING through the real panel and seeing it in the preview, the entire app-settings card disappeared. Returning to Settings offered no way to change that value. The screenshot `tiny-notes-greeting-delete-passed.png` records this state.
- **Builder impact:** a mistaken value, changed greeting or replacement service key becomes a dead end. Asking Claude to change it would be the wrong recovery because values belong in the panel's secure fields.
- **Cause:** Settings reused the migration checklist, which intentionally renders only missing values. Once a value existed, neither a status nor an edit action remained.
- **Fix:** Settings retains a compact name / Saved / Change row. Change opens an empty replacement field, states whether saving affects only the local preview or also the Netlify site, and offers Cancel. Saving returns to the compact row; failure keeps a field available. Stored values are never read back. The migration checklist still shows only missing values.
- **Checks:** lint, typecheck and 143 plugin tests pass. Two regressions cover initial save, replacement, Cancel without writing, failure recovery, site-scope wording, and values travelling only on the CLI's protected input rather than chat or command arguments. Native Desktop verification now passes in fresh conversation `local_735e14b3-09bf-474d-91f5-f68587636190`: Cancel discarded a temporary greeting; Change reopened an empty field; replacement Save updated the preview; a second replacement restored the original harmless greeting. The Saved/Change row remained available throughout, and the owner’s account stayed signed in at port 8082. Screenshot: `~/Clodable Tests/_runs/2026-10-18-conversation/settings-change-verified.png`. [PR #83](https://github.com/bworlds-co/clodable/pull/83) is merged after CI; no release.


## Unlocked Desktop continuation — October 18

- F33’s full native Cancel/change/save/repeat check passed as recorded above. The fresh conversation opened the retained preview when explicitly given its existing address; the original greeting and signed-in account survived. A natural follow-up opened the migration view and reported the next hosting step without copying data or creating anything.
- Preview continuity remains a limited observation: the earlier unaided request chose port 8081, while the retained authenticated preview at 8082 is a manually retained process. The explicit-address check proves session preservation at the original origin, not automatic reuse across fresh conversations or a defect in Desktop’s managed-server discovery.
- Hosting preparation exposed F34 below. Netlify currently returns 401 to its read-only team lookup; no new site, publication or credential change was attempted. Supabase’s completed copy and the owner-created test account remain intact. The live Tiny Notes source remains unchanged.

## F34 — major — Migration hides a failed Netlify connection

- **Observed:** the migration panel offered **Put my site on Netlify** without an account selector. A read-only `move teams` check returned `netlify-auth`, HTTP 401: Netlify rejected the saved connection. The panel suppressed this failure and continued showing the creation action.
- **Builder impact:** the screen looks ready but cannot perform the offered step, and gives no way to reconnect. A previously loaded account could also remain visible after a later lookup failure.
- **Cause:** migration account lookup handled only success. Unlike ordinary hosting setup, it had no loading/error recovery state and did not clear stale teams on failure.
- **Fix:** withhold site setup until account lookup succeeds; show the original failure and **Check again**. Rejected authentication also exposes the secure Netlify field with **Reconnect**. Empty-account and network failures retain retry without implying credentials were rejected. A single available team is named explicitly; failed refreshes remove old account choices. The navigation tool waits for that lookup and reports the same blocker to Claude, so its reply does not imply setup is ready.
- **Checks:** three regression cases cover authentication failure, network failure and an empty account list, recovery, and a subsequent failure after a valid team was loaded. Lint, typecheck, build, 201 package tests and 146 plugin tests pass. Native Desktop shows the rejected connection, an empty secure reconnection field and Check again, without a site-creation button. Retry preserves that recovery screen. Two fresh model runs (`local_bf5959c4-3951-4520-af78-a0331310ce59` and `local_f3aef4b9-08e5-41ce-80f8-2c8e41b8327f`) both explain the same Netlify blocker. Screenshot: `~/Clodable Tests/_runs/2026-10-18-conversation/netlify-reconnect-verified.png`. The updated plugin is loaded locally; no credential was entered or changed.

- **Remaining conversational limitation:** those two runs still repeated stale greeting reminders and described the successful database-copy checks too broadly (one said “The copy checks out fully”). The Netlify blocker is now correctly communicated, but that does not verify every app feature. GREETING already passed; AI, email and hosted behavior remain untested. This is retained as a readiness-language risk, not counted as complete migration sign-off.
- Final source check: Tiny Notes main still points to `76f3ecfa5f35860734f34cbc8bb8816d6d08032c`. Its rehearsal remains on Copy; no Netlify site exists for this move. The owner’s original signed-in preview at 8082 is retained. Desktop is left on **Tiny Notes migration controls**, at the secure Netlify reconnection field.


## Netlify reconnection and approved hosting preparation — October 18

- The owner reconnected Netlify in the secure field. Read-only team lookup now succeeds, returning Ops & Product and Vulk. The same open Desktop panel recovered to account selection and the hosting action; Vulk (`emmanuel-acqvas8`) was selected explicitly.
- At the action boundary, the owner approved creating an unpublished test site, giving the Tiny Notes publication workflow the connected Netlify credential, and storing the copied backend's server credentials in that site. The actual panel action completed in `local_f3aef4b9-08e5-41ce-80f8-2c8e41b8327f`.
- Created **tiny-notes-wall**, Netlify site `21cc90b8-8fd2-4c58-a718-e3a7d72f9873`, reserved address `https://tiny-notes-wall.netlify.app`, in team Vulk. A scoped API read verifies the site name/team and **no published deployment**. Only setting names were inspected: the Supabase settings and GREETING are present. GitHub confirms the two encrypted publication secrets were updated; their values were not read or printed.
- The migration advances to **Set up emails for your users**. `settings --json` confirms GREETING exists both locally and on the new site. The generated Netlify configuration selects the Netlify server preset; the publication workflow runs on main or an explicit manual run. Claude ran a successful test build with that preset. The generated files were saved to the Tiny Notes draft (`9fe0500`); its working folder is clean. No publication, email skip, DNS change or live cutover occurred. Tiny Notes main remains `76f3ecfa5f35860734f34cbc8bb8816d6d08032c`.

## F35 — major — Hosting preparation tells the builder to publish before the move is ready

- **Observed:** after the approved hosting preparation, the panel correctly advanced to email setup, but Claude said Publish was the only remaining step and offered to check after publication. AI and email preparation, the final copy and switch were still pending. The owner had authorized only the copy and hosting preparation.
- **Builder impact:** a builder can mistake Publish for a private test of the copied app. Publish updates shared app code; with Lovable's GitHub sync connected, those changes can also reach the live app. A successful build does not establish migration readiness.
- **Cause:** the migration guide explicitly instructed Claude to suggest Publish immediately after `move site`; the CLI completion detail said “Publish to see it”, and the panel request asked what remained before seeing the new site. These instructions competed with the actual migration state.
- **Fix:** use **Prepare your website** for the hosting step and **Prepare my website** for its action. Completion says nothing was published and directs the builder back to the move. The guide and hidden request tell Claude to read current progress, explain the next unfinished step, respect copy-only restrictions, and distinguish data-copy checks from feature testing. The Publish behavior and migration order are unchanged.
- **Verification:** lint, typecheck, build, 201 package tests and 146 plugin tests pass. Two isolated model-response replays pass: one explains the next step after hosting preparation; the other rejects Publish as a private copy check, explains its shared-code effect, and names emails then AI. Both recognize GREETING as already saved and limit their claims to the database/build evidence. Replay inputs and outputs are retained in `~/Clodable Tests/_runs/2026-10-18-conversation/hosting-guidance-replays/`. Fresh Desktop conversation `local_395935bd-5df2-43c3-a0c5-1aa5e272fb81` then passed the same check in Auto with the default model: it read current status, explained why Publish would affect the live app, confirmed the website is unpublished and GREETING is configured, and opened emails as the next step. Expanded progress shows **Prepare your website** completed. No copy, skip, account change or publication occurred. Screenshots: `~/Clodable Tests/_runs/2026-10-18-conversation/hosting-prepared-progress.png` and `hosting-prepared-guidance-verified.png`. Desktop is left at the focused email-domain controls with progress collapsed.
