# Clodable in Claude Desktop: UX review

**2026-10-17 · Desktop UX review, with explicit limits to sign-off.** Fourteen focused fixes are merged. Sam’s full journey passed twice; Tom’s main editing and recovery actions passed in two fresh fixtures. Léa’s remaining copy work needs owner permission, and Nadia’s complete from-idea route needs a product decision. This is not a claim that all four journeys ran end to end twice. Evidence and retained test resources are in [FINDINGS.md](FINDINGS.md).

## Judgment

Clodable's strongest moment is the ordinary promise: describe a change, see it, then press Publish. Sam reached a real public site, added a backend, and published a visitor-notes feature whose entries survived a public-page reload. Tom edited, restored, published, undid, and recovered from stopped saves and publishes in Desktop. The progress steps and the separation between saved work and the public site can make that process understandable.

The weakest moments are transitions: from a local page to a protected app, from a prepared web address to a live site, and from a button in the panel to commands in the conversation. Before the fixes, the interface contradicted itself about what was live, clipped the primary action, and directed a new builder to a button that did not exist. These are trust failures for someone already afraid of breaking their app.

The brand and calm typography are appropriate. The practical priority is truthful state, readable actions at the default dock width, and a next step that actually exists.

## How the journeys feel

| Builder | Observed experience | Judgment and limits |
|---|---|---|
| Sam | Two complete fresh runs reached the web, added a backend in test-org, and published visitor notes that survived a public-page reload. | The core promise works. Setup still asks infrastructure questions and can trigger technical permission prompts. The explicit live-data confirmation is a useful, understandable pause. |
| Tom | Plain edit, inline edit, Point & ask, History Restore, conversational restore, Publish/Undo, key-stop recovery and broken-page recovery worked in Desktop. A simultaneous live edit stopped safely and could be recovered. | Everyday work feels direct. Restore is readable and durable Undo is available. Both fresh fixtures passed the main actions. Conflict recovery now asks before choosing; a further fix keeps the preview intact while the builder decides, with its final Desktop check in progress. |
| Léa | Claude inspected the app and named its AI, sign-in and settings needs. The Carefully route reached the step-by-step Lovable export instructions. | The sequence is understandable so far, but the actual export/copy remains untested. Permission is pending for the pre-existing destination and the Lovable export. The isolated migration test is technical evidence, not a completed builder journey. |
| Nadia | Empty-folder panel asks for a GitHub app. Claude made working local book/plant prototypes. After the fixes, the panel updates and both surfaces explain that Clodable is not saving or publishing them yet. | The current product has no complete starting-from-an-idea journey. F09/F15 make the limit honest; they cannot make this journey complete without a product decision. |

Desktop currently labels the brief's Ask mode **Manual**. I exercised it during backend setup. Three surrounding inspection/help commands triggered technical permission prompts. Returning to Auto avoided continuing that experiment; no broad permanent permission was granted.

## What changed

Fourteen focused fixes were merged as separate pull requests after CI:

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
| [#59](https://github.com/bworlds-co/clodable/pull/59) · Preview during a choice | Requires read-only comparison before asking about conflicting edits. | Two model replays; final Desktop verification in progress. |
| [#60](https://github.com/bworlds-co/clodable/pull/60) · Imported live site | A new copy checks Netlify rather than assuming its absent local record means offline. Unavailable status remains neutral. | Real imported app shows Everything is live; screenshot 33. Automated unavailable-host and JSON contract cases. |

Lint and typecheck pass. The package suite passed **185 tests** (184 in the full run, followed by the additional CLI contract case); the latest plugin suite passed **127 tests**. Inline-edit, broken-page recovery, and isolated migration scripts passed. The migration script used its own ports and did not use the owner's other Supabase stack. The updated plugin was built and copied into Desktop's cache; existing conversations retain their earlier code.

## Where each moment belongs

| Moment | Today | Recommendation |
|---|---|---|
| Choose a starting point | Setup assumes an existing GitHub app. | Give the initial panel two explicit routes: an existing app, or an idea. |
| Understand an existing app | Builder answers where data and site live. | Let Claude inspect first; show its conclusion and ask the builder only to confirm or correct it. |
| Create hosting/backend | Panel gathers choices, then sends a request to Claude, which may explore before running the command. | Keep account/cost consent in the panel; consider running the exact creation operation there. Claude handles app-specific integration and explanations. |
| Shape the product | Conversation plus preview. | Keep this split. It matches the builder's intent and avoids another editor to learn. |
| Publish and recover | Bar, home, History and per-reply Restore. | Keep Publish in the builder's control. The History confirmation appeared beside Restore, and the durable Undo action remained available. Ask before choosing incompatible edits. No change to the settled ten-second Undo behavior. |
| Move off Lovable | Dedicated mode in the same panel, with conversational piloting. | Retain the current structure until Léa's real journey has been tested. The evidence here does not justify splitting it yet. |

## Structural decisions for the owner

### 1. Make starting with an idea a supported route

Nadia produced a working page but had no way to enter Clodable's saving/publishing loop. Add an initial choice that explains what happens next: Claude shapes the idea, then Clodable establishes the supported app and saving arrangement with explicit account consent. Preserve the prototype if setup cannot finish.

This extends **Q14's self-serve setup scope** and needs a decision about creating GitHub apps. It preserves **Q1's Claude-first product**. Merely adding a nicer empty-state illustration would leave the same dead end.

### 2. Confirm discovered infrastructure instead of asking builders to identify it

The setup questions ask builders to name hosting and database arrangements before they have seen value. Sam's answers were known from the test brief; that does not prove an ordinary builder could answer them. Have Claude inspect the app, show a short conclusion, and ask only where evidence is insufficient.

This changes **Q17's two-question setup**, using the existing assessment approach from **Q5d**. Evidence supports testing this direction; it is not user-research proof that every question can be removed.

### 3. Give deterministic account setup a shorter path

Sam pressed one backend action but met three technical permission prompts around it. The supported command itself was allowed. Consider keeping account selection, exact creation and progress in the panel, then returning the result to Claude for integration and explanation.

This changes **Q17/Q5b's choice that Claude pilots these operations**. It can preserve Q1's distinction between judgment and mechanics. Do not solve the problem by broadly allowing arbitrary shell exploration. Do not extend this recommendation to every migration step without Léa's evidence.

### 4. Make the product discoverable without knowing slash commands

The first `/clodable` message can produce Desktop's “isn't a command here” error while opening the panel correctly. Nadia's follow-up also depended on remembering a command. Prefer a visible entry point, or a supported tool that lets Claude open the appropriate panel when the builder asks naturally.

This revisits **Q5f's command-led navigation**. Desktop owns the misleading error and its repository/branch labels; Clodable cannot fix those surfaces. Any proposal must use the plugin APIs Desktop actually offers.

### 5. Give all three surfaces one release source

The panel uses its bundled CLI, while model instructions and the default preview command resolve npm independently. Local fixes therefore need a preview override, and an installed plugin can lag behind the npm command it runs. The two successful installation passes used the actual 0.2.2 tag; the modified cache used for this review is not that release.

Choose one runtime/version policy for the panel, preview and model commands, then verify it through a released install. This is **K3/F11**, still an engineering limitation, and release/tagging remains the owner’s decision. I have not hidden it behind the successful local tests or published anything to close it.

## Remaining risks and completion work

- **Version consistency (K3):** the three execution paths are not yet unified. The source fixes and local cache do not establish a corrected released experience. A release requires owner approval; aligning runtime resolution also remains engineering work.
- **Conflict recovery:** the final read-only-before-choice sequence is awaiting its last Desktop check. Earlier choice behavior, final repair and Publish were verified.
- **Token onboarding:** accounts were already connected. Finding and pasting a new token was not tested; no sign-out or token creation was attempted.
- **Léa:** permission is still pending to inspect/reuse the pre-existing destination and to request/download the Lovable export. Her copied data, people, files, functions and sign-in rehearsal remain untested in Desktop. The isolated migration test is not a substitute.
- **Nadia:** local prototypes work, but saving and publishing from an idea remain unsupported. The corrected explanation is not a completed journey.
- **Desktop limitations:** its initial slash-command error, technical permission dialogs, repository/branch labels and generic marketplace source-mismatch error are external. Released install succeeded twice after using the matching tagged source; ordinary Discover search did not surface the custom listing until its source filter was selected.

The brief’s full sign-off criterion remains unmet. The supported everyday path is much clearer and has been exercised repeatedly; the remaining limitations above should be explicit before presenting Clodable as ready for every builder.

Sam’s first-run cloud resources were removed after ownership checks and the throwaway repository was reset before the second run. The retained review site is [github-import-20261017.netlify.app](https://github-import-20261017.netlify.app), with its test-org backend. The marketplace is pinned to the released tag; the source build was then copied back into the cache for fresh-session retests. FINDINGS.md records these resources, exact test locations, screenshots, and the installation distinction. No release, credential change, paid resource or live/Lovable migration was performed.
