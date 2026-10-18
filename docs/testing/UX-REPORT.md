# Clodable in Claude Desktop: UX review

**2026-10-17–18 · Desktop UX review, with explicit limits to sign-off.** Focused fixes have been merged throughout this review. Sam’s full journey passed twice; Tom’s main editing and recovery actions passed in two fresh fixtures. The owner approved Léa’s copy preparation and Nadia’s from-idea direction on October 18. The owner replaced Léa’s blocked `hirebright-score` test with `tiny-notes-wall`; Supabase is reconnected and its fresh export copied successfully into a new free test-org backend. On that copy, the owner-created account can save and edit private notes, open uploaded attachments, and post Wall covers visible to anonymous visitors. The greeting and in-page deletion now pass too, including attachment cleanup. AI summaries remain unconfigured. Separate populated local migration runs pass twice, including original passwords and public/private file transfer; that is not a second real Lovable rehearsal. Nadia’s new route is merged in PR #65; both local prototypes now pass private saving, hosting setup, Publish and live-page interactions. This is not a claim that all four journeys ran end to end twice. Evidence and retained test resources are in [FINDINGS.md](FINDINGS.md).

## Judgment

Clodable's strongest moment is the ordinary promise: describe a change, see it, then press Publish. Sam reached a real public site, added a backend, and published a visitor-notes feature whose entries survived a public-page reload. Tom edited, restored, published, undid, and recovered from stopped saves and publishes in Desktop. The progress steps and the separation between saved work and the public site can make that process understandable.

The weakest moments are transitions: from a local page to a protected app, from a prepared web address to a live site, and from a button in the panel to commands in the conversation. Before the fixes, the interface contradicted itself about what was live, clipped the primary action, and directed a new builder to a button that did not exist. These are trust failures for someone already afraid of breaking their app.

The brand and calm typography are appropriate. The practical priority is truthful state, readable actions at the default dock width, and a next step that actually exists.

## How the journeys feel

| Builder | Observed experience | Judgment and limits |
|---|---|---|
| Sam | Two complete fresh runs reached the web, added a backend in test-org, and published visitor notes that survived a public-page reload. | The core promise works. The approved redesign replaces the infrastructure form with conversational inspection and runs hosting/backend creation after panel consent. The earlier full live runs predate that redesign; two new isolated Desktop setup runs cover the changed creation path. The explicit live-data confirmation is a useful, understandable pause. |
| Tom | Plain edit, inline edit, Point & ask, History Restore, conversational restore, Publish/Undo, key-stop recovery and broken-page recovery worked in Desktop. A simultaneous live edit stopped safely and could be recovered. | Everyday work feels direct. Restore is readable and durable Undo is available. Both fresh fixtures passed the main actions. Conflict recovery now asks before choosing; the final sequence passed in two further fresh fixtures, keeping the preview intact until the builder chose. Both then published successfully. |
| Léa | Tiny Notes passed guided setup, a new free copy backend in test-org, fresh-export selection, database copy checks and the public Wall. After the owner created an account, its session persisted; private-note creation/editing, attachment opening, and a Wall post with a cover worked. An anonymous visitor saw the Wall cover and was asked to sign in for private notes. Conversational preview changes update the open panel. | This is a useful rehearsal, not a completed move. The source has no accounts or uploaded files, so the real export cannot establish their transfer. Two populated local migration runs verify original passwords, file bytes and private access rules. The greeting, Cancel/Delete and attachment deletion now pass in Desktop; Summarize still reports **AI is not configured**. Test content was removed and the owner’s account retained. A second real fresh rehearsal and hosted/live steps remain. No live migration or publication occurred. |
| Nadia | The empty-folder panel now offers Start from an idea alongside GitHub import. Claude makes the local prototype before account setup. After the fixes, the panel updates and both surfaces explain that Clodable is not saving or publishing them yet. | The owner approved the new route ([PR #65](https://github.com/bworlds-co/clodable/pull/65)). Two Desktop runs produced working book and plant prototypes whose sample interactions survived reload. Both reached explicit private-GitHub consent in fresh conversations. After owner approval, both created private repositories, set up hosting in the authorized Netlify team, and published successfully. Borrow/return and water/undo worked on the live pages and survived reload; their data remains browser-local as disclosed. |

Desktop currently labels the brief's Ask mode **Manual**. I exercised it during backend setup. Three surrounding inspection/help commands triggered technical permission prompts. Returning to Auto avoided continuing that experiment; no broad permanent permission was granted.

## What changed

The approved conversation-first pass from [PR #68](https://github.com/bworlds-co/clodable/pull/68) is merged through [PR #65](https://github.com/bworlds-co/clodable/pull/65). Home is short; History and Settings are separate views. Claude can open the appropriate controls from an ordinary request. App discovery and uncertain choices stay in chat, while account consent, costs, secret fields and fixed creation stay in the panel. Migration shows its current action before optional background detail. The final fresh History request received a brief acknowledgement instead of another copy of the list. These changes are loaded locally in Desktop; they are not a released build.

Focused fixes are tracked in separate pull requests with CI checks:

| Fix | Result | Evidence |
|---|---|---|
| [#45](https://github.com/bworlds-co/clodable/pull/45) · Own-folder command prefix | Exact supported setup commands remain allowed when Claude first changes into the app's own folder. Other folders, extra commands and redirects stay rejected. | Guard tests; real Desktop hosting setup passed in Auto with the formerly problematic prefix. |
| [#46](https://github.com/bworlds-co/clodable/pull/46) · Narrow panel | Card actions sit below their explanation. History gives titles their own line and keeps Restore visible. | Home and the complete History Restore confirmation verified at the original dock width; screenshot 12. |
| [#47](https://github.com/bworlds-co/clodable/pull/47) · Hosting language | “Set up hosting” prepares an address; Publish makes it public. Panel requests, model guidance and progress agree. | Two model replays and actual Desktop setup followed by first Publish. |
| [#48](https://github.com/bworlds-co/clodable/pull/48) · Honest live status | Offline/unknown states no longer claim a version is Live. History uses Saved versions where appropriate. | State tests and Sam's offline Desktop home. |
| [#49](https://github.com/bworlds-co/clodable/pull/49) · Account loading | Creation waits for valid account and cost choices; lookup failures offer Try again. | Loading/error/retry tests; successful Desktop account selection. The second backend setup visibly waited for organization/cost choices. |
| [#50](https://github.com/bworlds-co/clodable/pull/50) · First Publish | Removes the duplicate Publish action while running, gives accurate first-publication reassurance, and stacks the app title and URL. | Verified during the second fresh first Publish; screenshot 19. |
| [#51](https://github.com/bworlds-co/clodable/pull/51) · Local prototype | Explains that Clodable is not saving the new local page; removes import from a non-empty local folder and stops promising a nonexistent setup button. | Two model replays, empty/non-empty folder tests, and a fresh Desktop retest; screenshot 11. |
| [#53](https://github.com/bworlds-co/clodable/pull/53) · Local-page heading | Removes a misleading one-minute setup promise from the unsupported local prototype state. | Two fresh Desktop prototype transitions show the corrected heading; screenshots 24 and 27. |
| [#54](https://github.com/bworlds-co/clodable/pull/54) · Recovery vocabulary | Progress updates follow the same plain-language rule as final replies. | Two model replays and the second Desktop key-stop recovery, including progress updates. |
| [#55](https://github.com/bworlds-co/clodable/pull/55) · GitHub import | Accepts the copied GitHub address and shows setup progress while downloading/installing. | Two real GitHub imports succeeded. Progress appears immediately and hides the form (screenshot 20); failed import also recovers to the form. |
| [#56](https://github.com/bworlds-co/clodable/pull/56) · Conflicting edits | Asks before choosing between incompatible edits and avoids promising both can always be kept. | Two independent model replays and a fresh Desktop choice before changing either heading; screenshot 26. |
| [#58](https://github.com/bworlds-co/clodable/pull/58) · Prototype transition | Refreshes the panel after a local page appears, removing stale import controls. | Two fresh Desktop starts, book/plant prototypes; screenshots 24 and 27. |
| [#59](https://github.com/bworlds-co/clodable/pull/59) · Preview during a choice | Requires read-only comparison before asking about conflicting edits. | Two model replays and two fresh Desktop recoveries; completed by #61’s engine correction. |
| [#60](https://github.com/bworlds-co/clodable/pull/60) · Imported live site | A new copy checks Netlify rather than assuming its absent local record means offline. Unavailable status remains neutral. | Real imported app shows Everything is live; screenshot 33. Automated unavailable-host and JSON contract cases. |
| [#61](https://github.com/bworlds-co/clodable/pull/61) · Conflict check | Checks in a temporary copy so a stopped Publish leaves the preview intact. | Real-git regression and two fresh Desktop conflicts, both recovered and published with the chosen heading. Screenshot 35 shows the working preview during the choice. |
| [#62](https://github.com/bworlds-co/clodable/pull/62) · Preview confirmation | Keeps local addresses and unsolicited page tours out of Claude’s reply. | Two independent model replays and a fresh Desktop reply: “Your preview is open beside this conversation.” Screenshot 36. |
| [#63](https://github.com/bworlds-co/clodable/pull/63) · One installed runtime | The panel, Claude and the default preview use the installed plugin’s CLI. Fresh conversations prepare the ignored local copy automatically. | Two fresh Desktop fixtures, matching bundle hashes, natural-language status checks without extra prompts, and functioning previews. Inline editing and broken-page recovery passed through the new launcher. Screenshots 37 and 38. |
| [#64](https://github.com/bworlds-co/clodable/pull/64) · Migration backend recovery | Keeps account/access errors intact and checks a remembered destination before calling it ready. | 187 package tests, 129 plugin tests and isolated real-Supabase migration passed. Fresh Desktop correctly requests Supabase reconnection; screenshot 41. |
| [#66](https://github.com/bworlds-co/clodable/pull/66) · Migration explanations | Claude distinguishes an unsuccessful check from a deleted, paused or empty backend and no longer promises automatic replacement. | Two independent model replays and a fresh Desktop read-only diagnosis; screenshot 47. |
| [#72](https://github.com/bworlds-co/clodable/pull/72) · Conversation and migration state | Refreshes the migration panel after work started in chat; holds duplicate step requests while Claude works. | 141 plugin tests and a real Desktop change from website preparation back to the copy-preview step, without reopening the panel. |
| [#70](https://github.com/bworlds-co/clodable/pull/70) · Export selection | Matches the current Lovable app, accepts manual dumps, asks for an explicit file when unsure, and preserves a usable copy if a new read fails. | Mixed-app Downloads check, six selection tests, failed-replacement copy regression, isolated migration, two model replays; merged after CI. |
| [#79](https://github.com/bworlds-co/clodable/pull/79) · Compact preview tools | Short previews start with a small Tools control; Copy remains visible. | Two regression tests and actual Desktop expansion; signup is no longer covered by the full toolbar. |
| [#80](https://github.com/bworlds-co/clodable/pull/80) · Conversational migration | Natural requests have supported commands without implementation exploration. | Two model replays; a fresh Desktop conversation used status and diagnosis directly. Its final preview-continuity check remains open. |
| [#67](https://github.com/bworlds-co/clodable/pull/67) · Connection lifetime | Removes contradictory advice to delete a token still needed for later database changes. | 129 existing plugin tests and a fresh Desktop panel check; screenshot 48. No credential change. |

Lint and typecheck pass. The current source passes **201 package tests** and **141 plugin tests**, including the new private-app CLI contract. These counts include earlier preview-port preservation and failed-copy checks. Inline-edit, broken-page recovery, and isolated migration scripts passed again for the idea route; earlier checks also exercised the installed runtime’s launcher. The migration script used its own ports and did not use the owner's other Supabase stack. The updated plugin was built and copied into Desktop's cache; existing conversations retain their earlier code.

## Where each moment belongs

| Moment | Today | Recommendation |
|---|---|---|
| Choose a starting point | The approved implementation offers an existing GitHub app or an idea. Both idea journeys now pass local preview, consent, private saving and publication. | Keep shaping in the conversation and account consent in the panel. |
| Understand an existing app | Claude reads the code and current status, then clarifies uncertain facts in conversation. | Approved and implemented. Ask one relevant question at a time; recorded addresses are not proof that a service is live. |
| Create hosting/backend | The panel gathers account/cost consent and runs the exact operation. Backend creation returns app integration to Claude. | Approved and implemented. Keep product decisions in chat and secret values in fields. |
| Shape the product | Conversation plus preview. | Keep this split. It matches the builder's intent and avoids another editor to learn. |
| Publish and recover | Bar, home, History and per-reply Restore. | Keep Publish in the builder's control. The History confirmation appeared beside Restore, and the durable Undo action remained available. Ask before choosing incompatible edits. No change to the settled ten-second Undo behavior. |
| Move off Lovable | Dedicated mode in the same panel, with conversational piloting. The current action comes first; progress and assessment expand on request. | Keep a dedicated task view in the same panel, put the current action first and make the detailed assessment available on demand. Do not change migration orchestration before Léa's real journey supplies evidence. |

## Panel focus and mods capability review — October 18

The owner's concern about crowding matches the evidence. The home has accumulated several jobs in one narrow column. In migration, the assessment and notes precede the current action; a missing connection brings the long assessment back. Screenshot 48 and F24 document the problem. Smaller type or tighter spacing would make it harder to read without clarifying what matters.

Clodable already makes substantial use of mods: a pane, the band above the prompt, readable tool activity, contextual Saved/Restore actions, question context, notices, commands, tool guards and state updates. The opportunity is better allocation of work across those surfaces, not using every API.

The [official interface guide](https://code.claude.com/docs/en/plugins/mods/interface) supports stateful views built from ordinary controls. The [mods API](https://code.claude.com/docs/en/plugins/mods/api) supports tools that Claude can call, and process/network operations performed by the mod. Clodable now registers `open_panel`, `app_context` and `remember_app`. Navigation opens the requested view without creating, publishing or restoring anything. Desktop tests have exercised natural-language History and hosting navigation, recording confirmed facts, direct creation after consent, and the return to Claude for backend integration.

The [built-in diff mod](https://github.com/anthropics/claude-code/blob/main/mods/diff/README.md) is a useful design reference for focused detail, folded secondary information and respecting a person's decision to close a pane. Its documented automatic-opening rules target terminal layouts; they are not evidence of identical Desktop behavior. The [mods overview](https://code.claude.com/docs/en/plugins/mods/overview) and interface documentation distinguish supported surfaces. Clodable cannot redesign Desktop's permission prompt or message box. A custom client renderer, more panes or extra model calls are not prerequisites for this UX pass.

Recommended allocation:

| Surface | Job |
|---|---|
| Conversation and preview | Shape the app, explain choices and inspect results. |
| Existing bar | Show saved/live state and offer the everyday actions. |
| App overview | Show a short status, actionable blockers and the next step; provide access to History and Settings. |
| History / Settings views | Show details when requested, with a clear way back. |
| Setup / migration task view | Show the current action and its necessary explanation first; retain progress and reveal background detail on demand. |

The owner approved all three product choices on October 18: focused views and natural navigation, inspect-then-confirm setup, and direct hosting/backend creation after consent. They also explicitly chose the conversation for work that benefits from dialogue. Nadia's prototype-first direction was already approved. No further structural decision is needed for this pass; remaining resource approvals and external migration blockers are separate.

## Structural decisions and their status

### 1. Start from an idea — approved October 18; two saving/publishing journeys passed

Nadia produced a working page but had no way to enter Clodable's saving/publishing loop. Add an initial choice that explains what happens next: Claude shapes the idea, then Clodable establishes the supported app and saving arrangement with explicit account consent. Preserve the prototype if setup cannot finish.

This extends **Q14's self-serve setup scope**. The owner approved creating a private GitHub app after explicit account consent; the decision is recorded in DECISIONS.md. It preserves **Q1's Claude-first product**. Merely adding a nicer empty-state illustration would leave the same dead end.

### 2. Confirm discovered infrastructure — approved and implemented

The setup questions ask builders to name hosting and database arrangements before they have seen value. Sam's answers were known from the test brief; that does not prove an ordinary builder could answer them. Have Claude inspect the app, show a short conclusion, and ask only where evidence is insufficient.

This changes **Q17's two-question setup**, using the existing assessment approach from **Q5d**. Evidence supports testing this direction; it is not user-research proof that every question can be removed.

### 3. Run fixed account setup after panel consent — approved and implemented

Sam pressed one backend action but met three technical permission prompts around it. The supported command itself was allowed. Account selection, exact creation and progress now stay in the panel, then the result returns to Claude for integration and explanation.

This changes **Q17/Q5b's choice that Claude pilots these operations**. It can preserve Q1's distinction between judgment and mechanics. Do not solve the problem by broadly allowing arbitrary shell exploration. Do not extend this recommendation to every migration step without Léa's evidence.

### 4. Natural-language navigation — approved and implemented

The first `/clodable` message can produce Desktop's “isn't a command here” error while opening the panel correctly. Nadia's follow-up also depended on remembering a command. The new navigation-only `open_panel` tool lets Claude open the appropriate view when the builder asks naturally; slash commands remain available as a fallback.

This revisits **Q5f's command-led navigation**. Desktop owns the misleading error and its repository/branch labels; Clodable cannot fix those surfaces. Any proposal must use the plugin APIs Desktop actually offers.

### 5. Focused panel views — approved and implemented

The panel now has a short app overview, dedicated History and Settings views, and task views that lead with the current action. Keep one Clodable panel with clear navigation. Combine this with decision 4's natural-language opening so builders do not have to learn a menu or slash commands before they can proceed. Preserve account consent, important blockers, and access to the complete assessment.

This changes the panel's structure and therefore belongs to the owner under the testing brief. The implementation reduces simultaneous information and has been reloaded into Desktop for focused verification. This remains an expert review, not a measured study with representative builders. It does not require changing the brand, Claude-first principle, live-data rule or settled Publish/Undo behavior.

## Remaining risks and completion work

- **Release validation:** K3 is fixed and retested locally. The two installation passes verified the existing 0.2.2 release; these fixes have not been released. Shipping and testing a new tagged release requires owner approval. Existing conversations and preview servers need a fresh start to load an update.
- **Conflict recovery:** the final sequence passed twice with fresh fixtures and both choices. This is bounded evidence for these cases, not a promise that every simultaneous edit can be combined automatically.
- **Token onboarding:** accounts were already connected. Finding and pasting a new token was not tested; no sign-out or token creation was attempted.
- **Léa:** the owner-approved Tiny Notes replacement and fresh export passed the real copy checks in test-org, Paris (`vpewfafqslrjiqjexyix`). The source export contains 3 posts, 1 note, no people and no files; Lovable’s Users page also reported no users. After the owner created a test account, private notes, edits, attachment opening, and public Wall covers passed on the copy. Its session persisted through reload; anonymous browsing showed the expected public/private separation. All generated content was removed, leaving the original sample records and the owner’s account. Both free test-org slots are now occupied. Two fresh populated local source/target migrations now verify original passwords and public/private file transfer, including byte comparisons and access rules. The actual Tiny Notes greeting and deletion checks also pass. Separate sign-in, AI/email configuration, hosted behavior and a second real fresh rehearsal remain. Summarize explicitly reports **AI is not configured**: successful database checks must not be confused with a fully working migrated app. The manually supplied hirebright dump is readable and contains two password accounts, but is five days old and was not imported; the old hirebright destination remains unavailable. These limits and the isolated migration test are not substitutes for a complete real migration.
- **Nadia:** the owner approved both test repositories, and both were created privately through Desktop. The book and plant journeys now pass local prototype → named account consent → private saving → hosting in the authorized Netlify team → Publish → live-page interaction and reload. Both GitHub publication workflows succeeded. These prototypes deliberately use browser-local sample data; this does not verify shared data or sign-in. Details and retained resources are in FINDINGS.md.
- **Latest fixes:** natural migration command guidance and compact preview tools are merged and loaded into Desktop. The fresh natural request used the commands directly. It then started a different available preview port, which showed a signed-out origin despite the retained signed-in preview; the final UI check was interrupted when the Mac locked. This continuity check remains open. The compact toolbar and greeting/deletion checks passed before the lock.
- **Desktop limitations:** its Browser silently cancels `window.confirm`; Tiny Notes now uses an in-page confirmation in its draft. Its initial slash-command error, technical permission dialogs, repository/branch labels, a spurious “Fix merge conflicts” suggestion on a clean app, and the generic marketplace source-mismatch error are external. Released install succeeded twice after using the matching tagged source; ordinary Discover search did not surface the custom listing until its source filter was selected.

The brief’s full sign-off criterion remains unmet. The supported everyday path is much clearer and has been exercised repeatedly; the remaining limitations above should be explicit before presenting Clodable as ready for every builder.

Sam’s first-run cloud resources were removed after ownership checks and the throwaway repository was reset before the second run. The retained review site is [github-import-20261017.netlify.app](https://github-import-20261017.netlify.app), with its test-org backend. The marketplace is pinned to the released tag; the source build was then copied back into the cache for fresh-session retests. FINDINGS.md records these resources, exact test locations, screenshots, and the installation distinction. No release, paid resource or live/Lovable migration was performed. The owner reconnected Supabase personally in the panel.


## Exact handoff after the latest pass

There is no remaining product-structure decision. The approved conversation-first design is implemented. The source fixes and populated local migration checks are complete; they are not released.

The remaining work is bounded by access and live-service choices:

1. Unlock the Mac to finish the current Desktop preview-continuity and hosting-preparation checks. The retained signed-in copy is at the original preview origin; opening another port does not carry its browser session over.
2. Choose the AI provider and enter its key in the secure panel. Then adapt and test Summarize against that provider. Choose a sending domain if email delivery is part of this rehearsal; review any DNS changes before applying them.
3. Complete a separate sign-in personally, without signing out of the existing preview. Existing credentials are not needed in this report or conversation.
4. Decide when to authorize the actual live move and the Clodable release. No pause, final export, public cutover, domain change, Lovable disconnection, package publication or release tag has been performed.

A second real Lovable migration from fresh state is still outstanding. Recopying the current backend would replace the owner's test account; no such reset was done. The automated two-run evidence closes a mechanics gap while keeping this distinction explicit.
