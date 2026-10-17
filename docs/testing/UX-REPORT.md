# Clodable in Claude Desktop: UX review

**2026-10-17 · Working report; testing resumed after the Mac was unlocked.** This report distinguishes observed behavior, fixes checked in Desktop, automated checks, and work still needed. The brief's requirement—every journey twice from a fresh start—has **not** been met. Detailed evidence and resume notes are in [FINDINGS.md](FINDINGS.md).

## Judgment

Clodable's strongest moment is the ordinary promise: describe a change, see it, then press Publish. Sam reached a real public site, added a backend, and published a visitor-notes feature whose entries survived a public-page reload. Tom edited, restored, published, undid, and recovered from stopped saves and publishes in Desktop. The progress steps and the separation between saved work and the public site can make that process understandable.

The weakest moments are transitions: from a local page to a protected app, from a prepared web address to a live site, and from a button in the panel to commands in the conversation. Before the fixes, the interface contradicted itself about what was live, clipped the primary action, and directed a new builder to a button that did not exist. These are trust failures for someone already afraid of breaking their app.

The brand and calm typography are appropriate. The practical priority is truthful state, readable actions at the default dock width, and a next step that actually exists.

## How the journeys feel

| Builder | Observed experience | Judgment and limits |
|---|---|---|
| Sam | A complete run reached the web, added a backend in test-org, and published persistent visitor notes. After reset, a second run imported the GitHub app and reached a public site again. | The core promise works. Setup still asks infrastructure questions and can trigger technical permission prompts. The second run’s backend/data feature is in progress. |
| Tom | Plain edit, inline edit, Point & ask, History Restore, conversational restore, Publish/Undo, key-stop recovery and broken-page recovery worked in Desktop. A simultaneous live edit stopped safely and could be recovered. | Everyday work feels direct. Restore is readable and durable Undo is available. Conflict recovery chose a heading before asking; a focused fix is merged and awaits a fresh Desktop conflict. A second fresh run is underway. |
| Léa | Claude inspected the app and named its AI, sign-in and settings needs. The Carefully route reached the step-by-step Lovable export instructions. | The sequence is understandable so far, but the actual export/copy remains untested. Permission is pending for the pre-existing destination and the Lovable export. The isolated migration test is technical evidence, not a completed builder journey. |
| Nadia | Empty-folder panel asks for a GitHub app. Claude can create a useful local book-swap page, but Clodable still offers import and Claude recommends an absent setup button. | The current product has no complete starting-from-an-idea journey. F09 makes the limit honest; it cannot make this journey complete without a product decision. |

Desktop currently labels the brief's Ask mode **Manual**. I exercised it during backend setup. Three surrounding inspection/help commands triggered technical permission prompts. Returning to Auto avoided continuing that experiment; no broad permanent permission was granted.

## What changed

Eleven focused fixes were merged as separate pull requests after CI:

| Fix | Result | Evidence |
|---|---|---|
| [#45](https://github.com/bworlds-co/clodable/pull/45) · Own-folder command prefix | Exact supported setup commands remain allowed when Claude first changes into the app's own folder. Other folders, extra commands and redirects stay rejected. | Guard tests; real Desktop hosting setup passed in Auto with the formerly problematic prefix. |
| [#46](https://github.com/bworlds-co/clodable/pull/46) · Narrow panel | Card actions sit below their explanation. History gives titles their own line and keeps Restore visible. | Home and the complete History Restore confirmation verified at the original dock width; screenshot 12. |
| [#47](https://github.com/bworlds-co/clodable/pull/47) · Hosting language | “Set up hosting” prepares an address; Publish makes it public. Panel requests, model guidance and progress agree. | Two model replays and actual Desktop setup followed by first Publish. |
| [#48](https://github.com/bworlds-co/clodable/pull/48) · Honest live status | Offline/unknown states no longer claim a version is Live. History uses Saved versions where appropriate. | State tests and Sam's offline Desktop home. |
| [#49](https://github.com/bworlds-co/clodable/pull/49) · Account loading | Creation waits for valid account and cost choices; lookup failures offer Try again. | Loading/error/retry tests; successful Desktop account selection. The second backend setup visibly waited for organization/cost choices. |
| [#50](https://github.com/bworlds-co/clodable/pull/50) · First Publish | Removes the duplicate Publish action while running, gives accurate first-publication reassurance, and stacks the app title and URL. | Verified during the second fresh first Publish; screenshot 19. |
| [#51](https://github.com/bworlds-co/clodable/pull/51) · Local prototype | Explains that Clodable is not saving the new local page; removes import from a non-empty local folder and stops promising a nonexistent setup button. | Two model replays, empty/non-empty folder tests, and a fresh Desktop retest; screenshot 11. |
| [#53](https://github.com/bworlds-co/clodable/pull/53) · Local-page heading | Removes a misleading one-minute setup promise from the unsupported local prototype state. | Plugin test; fresh visual heading check pending. |
| [#54](https://github.com/bworlds-co/clodable/pull/54) · Recovery vocabulary | Progress updates follow the same plain-language rule as final replies. | Two model replays and subsequent Desktop conflict recovery. |
| [#55](https://github.com/bworlds-co/clodable/pull/55) · GitHub import | Accepts the copied GitHub address and shows setup progress while downloading/installing. | Real GitHub import succeeded; a fresh demo import visibly shows steps and hides the form (screenshot 20). Its later clone failure is a fake-adapter limitation, not a second successful import. |
| [#56](https://github.com/bworlds-co/clodable/pull/56) · Conflicting edits | Asks before choosing between incompatible edits and avoids promising both can always be kept. | Two independent model replays; fresh Desktop conflict retest pending. |

Lint and typecheck pass. The package suite passed **183 tests**; the latest plugin suite passed **125 tests**. Inline-edit, broken-page recovery, and isolated migration scripts passed. The migration script used its own ports and did not use the owner's other Supabase stack. The updated plugin was built and copied into Desktop's cache; existing conversations retain their earlier code.

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

## Remaining risks and completion work

- **Version consistency (K3):** panel, model commands and preview can resolve different versions. The preview override used for this review is a test accommodation. Align these paths and verify the released installation; publishing a release requires owner approval.
- **Recovery confidence:** History Restore and conversational restore passed in Desktop. The conflict-choice fix still needs a fresh Desktop retest; model replay success alone is not sign-off.
- **Token onboarding:** accounts were already connected. This review cannot say that finding and pasting a token is bearable for a new builder. Token creation/sign-out was not authorized or attempted.
- **Incomplete journeys:** finish Sam’s second saved-data feature, Tom’s second fresh run and simultaneous-conversation routing, Nadia’s second fresh-folder pass, released installation, and Léa’s copy stages after permission. The required repeat criterion remains open.
- **Owner boundaries:** permission is still needed for the pre-existing Léa destination, and separately for every live/Lovable change, release, token creation or spending action reserved by the brief.

Sam’s first-run site and backend were deleted after exact ownership checks, and the disposable repository was reset before the second run. The second test site is `github-import-20261017` in Netlify team `emmanuel-acqvas8`. Current resource details and evidence are in FINDINGS.md. No real credential was placed in chat or these notes, no release was published, and no live/Lovable migration step was performed.
