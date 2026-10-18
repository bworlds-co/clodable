# Clodable in Claude Desktop: UX review

**2026-10-17–18 · Desktop UX review, with explicit limits to sign-off.** Nineteen focused fixes are merged. Sam’s full journey passed twice; Tom’s main editing and recovery actions passed in two fresh fixtures. The owner approved Léa’s copy preparation and Nadia’s from-idea direction on October 18. Léa is now blocked by Lovable’s export limit and a missing Supabase connection; Nadia’s new route is implemented in draft PR #65 and tested through local preview and account consent. This is not a claim that all four journeys ran end to end twice. Evidence and retained test resources are in [FINDINGS.md](FINDINGS.md).

## Judgment

Clodable's strongest moment is the ordinary promise: describe a change, see it, then press Publish. Sam reached a real public site, added a backend, and published a visitor-notes feature whose entries survived a public-page reload. Tom edited, restored, published, undid, and recovered from stopped saves and publishes in Desktop. The progress steps and the separation between saved work and the public site can make that process understandable.

The weakest moments are transitions: from a local page to a protected app, from a prepared web address to a live site, and from a button in the panel to commands in the conversation. Before the fixes, the interface contradicted itself about what was live, clipped the primary action, and directed a new builder to a button that did not exist. These are trust failures for someone already afraid of breaking their app.

The brand and calm typography are appropriate. The practical priority is truthful state, readable actions at the default dock width, and a next step that actually exists.

## How the journeys feel

| Builder | Observed experience | Judgment and limits |
|---|---|---|
| Sam | Two complete fresh runs reached the web, added a backend in test-org, and published visitor notes that survived a public-page reload. | The core promise works. Setup still asks infrastructure questions and can trigger technical permission prompts. The explicit live-data confirmation is a useful, understandable pause. |
| Tom | Plain edit, inline edit, Point & ask, History Restore, conversational restore, Publish/Undo, key-stop recovery and broken-page recovery worked in Desktop. A simultaneous live edit stopped safely and could be recovered. | Everyday work feels direct. Restore is readable and durable Undo is available. Both fresh fixtures passed the main actions. Conflict recovery now asks before choosing; the final sequence passed in two further fresh fixtures, keeping the preview intact until the builder chose. Both then published successfully. |
| Léa | Claude inspected the app and named its AI, sign-in and settings needs. The Carefully route reached the step-by-step Lovable export instructions. | The sequence is understandable so far, but the actual export/copy remains untested. The approved export attempt was refused by Lovable’s database-size limit. The recorded destination is not visible in test-org, and the Supabase connection now needs to be restored. No data was copied. The isolated migration test is technical evidence, not a completed builder journey. |
| Nadia | The empty-folder panel now offers Start from an idea alongside GitHub import. Claude makes the local prototype before account setup. After the fixes, the panel updates and both surfaces explain that Clodable is not saving or publishing them yet. | The owner approved the new route ([draft PR #65](https://github.com/bworlds-co/clodable/pull/65)). Two Desktop runs produced working book and plant prototypes whose sample interactions survived reload. Both reached explicit private-GitHub consent in fresh conversations. Saving/publishing verification still needs approval for two test repositories under the brief’s account limits. |

Desktop currently labels the brief's Ask mode **Manual**. I exercised it during backend setup. Three surrounding inspection/help commands triggered technical permission prompts. Returning to Auto avoided continuing that experiment; no broad permanent permission was granted.

## What changed

Nineteen focused fixes were merged as separate pull requests after CI:

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

Lint and typecheck pass. The current idea-route branch passes **191 package tests** and **132 plugin tests**, including the new private-app CLI contract. These counts include earlier preview-port preservation and failed-copy checks. Inline-edit, broken-page recovery, and isolated migration scripts passed again for the idea route; earlier checks also exercised the installed runtime’s launcher. The migration script used its own ports and did not use the owner's other Supabase stack. The updated plugin was built and copied into Desktop's cache; existing conversations retain their earlier code.

## Where each moment belongs

| Moment | Today | Recommendation |
|---|---|---|
| Choose a starting point | The approved implementation offers an existing GitHub app or an idea; Desktop retesting is underway. | Keep shaping in the conversation and account consent in the panel. |
| Understand an existing app | Builder answers where data and site live. | Let Claude inspect first; show its conclusion and ask the builder only to confirm or correct it. |
| Create hosting/backend | Panel gathers choices, then sends a request to Claude, which may explore before running the command. | Keep account/cost consent in the panel; consider running the exact creation operation there. Claude handles app-specific integration and explanations. |
| Shape the product | Conversation plus preview. | Keep this split. It matches the builder's intent and avoids another editor to learn. |
| Publish and recover | Bar, home, History and per-reply Restore. | Keep Publish in the builder's control. The History confirmation appeared beside Restore, and the durable Undo action remained available. Ask before choosing incompatible edits. No change to the settled ten-second Undo behavior. |
| Move off Lovable | Dedicated mode in the same panel, with conversational piloting. | Retain the current structure until Léa's real journey has been tested. The evidence here does not justify splitting it yet. |

## Structural decisions for the owner

### 1. Start from an idea — approved October 18; local tests passed, remote tests waiting

Nadia produced a working page but had no way to enter Clodable's saving/publishing loop. Add an initial choice that explains what happens next: Claude shapes the idea, then Clodable establishes the supported app and saving arrangement with explicit account consent. Preserve the prototype if setup cannot finish.

This extends **Q14's self-serve setup scope**. The owner approved creating a private GitHub app after explicit account consent; the decision is recorded in DECISIONS.md. It preserves **Q1's Claude-first product**. Merely adding a nicer empty-state illustration would leave the same dead end.

### 2. Confirm discovered infrastructure instead of asking builders to identify it

The setup questions ask builders to name hosting and database arrangements before they have seen value. Sam's answers were known from the test brief; that does not prove an ordinary builder could answer them. Have Claude inspect the app, show a short conclusion, and ask only where evidence is insufficient.

This changes **Q17's two-question setup**, using the existing assessment approach from **Q5d**. Evidence supports testing this direction; it is not user-research proof that every question can be removed.

### 3. Give deterministic account setup a shorter path

Sam pressed one backend action but met three technical permission prompts around it. The supported command itself was allowed. Consider keeping account selection, exact creation and progress in the panel, then returning the result to Claude for integration and explanation.

This changes **Q17/Q5b's choice that Claude pilots these operations**. It can preserve Q1's distinction between judgment and mechanics. Do not solve the problem by broadly allowing arbitrary shell exploration. Do not extend this recommendation to every migration step without Léa's evidence.

### 4. Make the product discoverable without knowing slash commands

The first `/clodable` message can produce Desktop's “isn't a command here” error while opening the panel correctly. Nadia's follow-up also depended on remembering a command. Prefer a visible entry point, or a supported tool that lets Claude open the appropriate panel when the builder asks naturally.

This revisits **Q5f's command-led navigation**. Desktop owns the misleading error and its repository/branch labels; Clodable cannot fix those surfaces. Any proposal must use the plugin APIs Desktop actually offers.

## Remaining risks and completion work

- **Release validation:** K3 is fixed and retested locally. The two installation passes verified the existing 0.2.2 release; these fixes have not been released. Shipping and testing a new tagged release requires owner approval. Existing conversations and preview servers need a fresh start to load an update.
- **Conflict recovery:** the final sequence passed twice with fresh fixtures and both choices. This is bounded evidence for these cases, not a promise that every simultaneous edit can be combined automatically.
- **Token onboarding:** accounts were already connected. Finding and pasting a new token was not tested; no sign-out or token creation was attempted.
- **Léa:** both copy-preparation steps were approved. Lovable refused the export (`api_error_database_too_large_for_export`); Supabase now requests reconnection. The destination’s availability is unresolved, not proven deleted. Her copied data, people, files, functions and sign-in rehearsal remain untested in Desktop. The isolated migration test is not a substitute.
- **Nadia:** the approved route is implemented in [draft PR #65](https://github.com/bworlds-co/clodable/pull/65), with passing CI. Two local prototype journeys and fresh account-consent screens pass. Automated tests cover private creation, preserved prototype files, secret-key stops and draft-only saves. Full Desktop saving/publishing tests await the requested approval for `emmanuelvulk/clodable-idea-books-test` and `emmanuelvulk/clodable-idea-plants-test`. Neither has been created.
- **Desktop limitations:** its initial slash-command error, technical permission dialogs, repository/branch labels and generic marketplace source-mismatch error are external. Released install succeeded twice after using the matching tagged source; ordinary Discover search did not surface the custom listing until its source filter was selected.

The brief’s full sign-off criterion remains unmet. The supported everyday path is much clearer and has been exercised repeatedly; the remaining limitations above should be explicit before presenting Clodable as ready for every builder.

Sam’s first-run cloud resources were removed after ownership checks and the throwaway repository was reset before the second run. The retained review site is [github-import-20261017.netlify.app](https://github-import-20261017.netlify.app), with its test-org backend. The marketplace is pinned to the released tag; the source build was then copied back into the cache for fresh-session retests. FINDINGS.md records these resources, exact test locations, screenshots, and the installation distinction. No release, credential change, paid resource or live/Lovable migration was performed.
