# Clodable in Claude Desktop: UX review

**2026-10-17 · Interim report.** Desktop testing stopped when the Mac locked. This report distinguishes observed behavior, fixes checked in Desktop, automated checks, and work still needed. The brief's requirement—every journey twice from a fresh start—has **not** been met. Detailed evidence and resume notes are in [FINDINGS.md](FINDINGS.md).

## Judgment

Clodable's strongest moment is the ordinary promise: describe a change, see it, then press Publish. Sam did reach a real public site through Desktop. The progress steps and the separation between saved work and the public site can make that process understandable.

The weakest moments are transitions: from a local page to a protected app, from a prepared web address to a live site, and from a button in the panel to commands in the conversation. Before the fixes, the interface contradicted itself about what was live, clipped the primary action, and directed a new builder to a button that did not exist. These are trust failures for someone already afraid of breaking their app.

The brand and calm typography are appropriate. The practical priority is truthful state, readable actions at the default dock width, and a next step that actually exists.

## How the journeys feel

| Builder | Observed experience | Judgment and limits |
|---|---|---|
| Sam | Setup shows progress; two infrastructure questions precede the home. Hosting preparation now clearly leads to Publish. The first Publish reached a working public home and About page. Add a backend completed in test-org. | A viable route, with unnecessary decisions and technical interruptions. Saved-data feature and live use remain untested. One partial fresh run, not two completed runs. |
| Tom | Existing-app home loads in a fresh conversation. Automated real-preview inline editing and broken-page recovery pass. History layout has been made readable. | Everyday editing and recovery look promising, but automated coverage does not establish the Desktop journey. History, conversational restore, Publish/Undo and stopped-save/publish recovery still need hands-on testing. |
| Léa | Local move state resumes an existing copy destination. No export or copy was performed in this review. | No end-to-end UX judgment yet. Existing destination requires permission to verify/reuse; live and Lovable steps remain owner-only. The isolated migration test passed, which establishes technical evidence, not a builder experience. |
| Nadia | Empty-folder panel asks for a GitHub app. Claude can create a useful local book-swap page, but Clodable still offers import and Claude recommends an absent setup button. | The current product has no complete starting-from-an-idea journey. F09 makes the limit honest; it cannot make this journey complete without a product decision. |

Desktop currently labels the brief's Ask mode **Manual**. I exercised it during backend setup. Three surrounding inspection/help commands triggered technical permission prompts. Returning to Auto avoided continuing that experiment; no broad permanent permission was granted.

## What changed

Seven focused fixes were prepared as separate pull requests:

| Fix | Result | Evidence |
|---|---|---|
| [#45](https://github.com/bworlds-co/clodable/pull/45) · Own-folder command prefix | Exact supported setup commands remain allowed when Claude first changes into the app's own folder. Other folders, extra commands and redirects stay rejected. | Guard tests; real Desktop hosting setup passed in Auto with the formerly problematic prefix. |
| [#46](https://github.com/bworlds-co/clodable/pull/46) · Narrow panel | Card actions sit below their explanation. History gives titles their own line and keeps Restore visible. | Home verified at the original dock width; full Restore journey pending. |
| [#47](https://github.com/bworlds-co/clodable/pull/47) · Hosting language | “Set up hosting” prepares an address; Publish makes it public. Panel requests, model guidance and progress agree. | Two model replays and actual Desktop setup followed by first Publish. |
| [#48](https://github.com/bworlds-co/clodable/pull/48) · Honest live status | Offline/unknown states no longer claim a version is Live. History uses Saved versions where appropriate. | State tests and Sam's offline Desktop home. |
| [#49](https://github.com/bworlds-co/clodable/pull/49) · Account loading | Creation waits for valid account and cost choices; lookup failures offer Try again. | Loading/error/retry tests; successful Desktop account selection. Controlled Desktop failure retest pending. |
| [#50](https://github.com/bworlds-co/clodable/pull/50) · First Publish | Removes the duplicate Publish action while running, gives accurate first-publication reassurance, and stacks the app title and URL. | Plugin checks; new-conversation Desktop retest pending. |
| [#51](https://github.com/bworlds-co/clodable/pull/51) · Local prototype | Explains that Clodable is not saving the new local page; removes import from a non-empty local folder and stops promising a nonexistent setup button. | Two model replays and empty/non-empty folder tests; updated Desktop retest blocked by Mac lock. |

Lint and typecheck pass. The package suite passed **183 tests**; the latest plugin suite passed **122 tests**. Inline-edit, broken-page recovery, and isolated migration scripts passed. The migration script used its own ports and did not use the owner's other Supabase stack. The updated plugin was built and copied into Desktop's cache; existing conversations retain their earlier code.

## Where each moment belongs

| Moment | Today | Recommendation |
|---|---|---|
| Choose a starting point | Setup assumes an existing GitHub app. | Give the initial panel two explicit routes: an existing app, or an idea. |
| Understand an existing app | Builder answers where data and site live. | Let Claude inspect first; show its conclusion and ask the builder only to confirm or correct it. |
| Create hosting/backend | Panel gathers choices, then sends a request to Claude, which may explore before running the command. | Keep account/cost consent in the panel; consider running the exact creation operation there. Claude handles app-specific integration and explanations. |
| Shape the product | Conversation plus preview. | Keep this split. It matches the builder's intent and avoids another editor to learn. |
| Publish and recover | Bar, home, History and per-reply Restore. | Keep Publish in the builder's control. Validate that confirmations appear where the action was pressed and that the durable recovery route is easy to find. No change to the settled ten-second Undo behavior. |
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
- **Recovery confidence:** K4's long save names and out-of-view Restore question need the complete Desktop journey. Do not infer success from a layout patch.
- **Token onboarding:** accounts were already connected. This review cannot say that finding and pasting a token is bearable for a new builder. Token creation/sign-out was not authorized or attempted.
- **Incomplete journeys:** finish Sam's data feature, Tom's editing and all failure/recovery cases, GitHub import, simultaneous conversations, released installation and Léa's authorized copy stages. Then repeat from fresh starts.
- **Owner boundaries:** permission is still needed for the pre-existing Léa destination, and separately for every live/Lovable change, release, token creation or spending action reserved by the brief.

Test-created resources are retained for continuation: `fresh-app-kgjt` in Netlify team `emmanuel-acqvas8`, and `fresh-app` in Supabase test-org. No real credential was placed in chat or these notes, no release was published, and no live/Lovable migration step was performed.
