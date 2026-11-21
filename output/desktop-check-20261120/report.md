# Clodable Desktop check — November 20, 2026

Follow-up: both UX findings below were subsequently fixed and retested. See [the fix retest](ux-fix-retest.md). This report preserves the initial observations.

The two uncommitted changes were exercised in the real Claude Desktop Code interface. The updated GitHub guidance and saving-error handoff work. Two existing error-screen problems remain; no product-code fixes were made in this test.

## Verified

- The disconnected GitHub account appears as a normal setup step, without a red account error or a terminal command.
- Connect GitHub first shows “Asking GitHub for a code…”, then a one-time code, three numbered steps, Open GitHub and Copy the code. The compact panel remains readable without clipping.
- Ending a pending attempt shows “GitHub didn't connect…” and Try again. Retry produces a new code. No GitHub sign-in was approved.
- A simulated connected-account check automatically replaces the sign-in controls with the private-app consent form.
- The real bundled CLI, backed by a local GitHub stand-in, records its destination and fails while fetching main from an empty local bare repository. The panel shows its plain fallback message and Ask Claude for help, without the command or error output.
- Clicking help submits the new diagnostic request. The hidden context contains the exact error: `git fetch origin main` / `fatal: couldn't find remote ref main`, plus the instructions against creating, renaming or deleting a GitHub app or running setup. Claude inspected the recorded state and identified the missing main branch. After a request to conclude without changes, it directed the builder to retry Create private app with the same name. It did not run setup or change project files.
- Retrying Create private app with the same name reuses the recorded destination. The fake GitHub call log contains exactly one creation request across those attempts.
- The app component remains byte-for-byte unchanged. The completed fixture app builds successfully.
- The copied current plugin passes type checking and all 157 plugin tests.

## Remaining UX findings

1. **Progress still looks active after failure.** A step retains its running indicator and ellipsis while the terminal error and retry controls are visible. `runSetup` clears `settingUp` on failure but leaves the last `setupSteps` entry running; `setupProgress` continues rendering it. Mark that step stopped/failed, or remove the progress display once the operation ends.
2. **The fallback text sends a solo builder to a developer.** “Share the details with your developer” conflicts with the adjacent Ask Claude for help action. Use that available recovery action in the saving-screen wording.

Both are inherited by the current patch, rather than regressions introduced by its new GitHub guidance or error payload.

## Scope and evidence limits

This verifies UI behavior and diagnostics, not the original failure on the other computer. The missing-main condition was deliberately created locally. No real repository was created, no release was made, and no cloud app or account was changed.

Desktop's direct `gh auth login` invocation used the installed GitHub CLI despite the fixture PATH. Two device-code attempts were therefore real, unapproved, and explicitly terminated. Account checks and repository creation used the isolated `CLODABLE_GH` stand-in. Authentication completion was simulated; the newer CLI “copied to clipboard” wording was covered by the passing plugin tests, not observed in Desktop. The Copy the code button and Open GitHub link were inspected, but clipboard transfer and browser navigation were not exercised.

An initial fixture scanner emitted the wrong report format, causing a separate generic error. Its exact diagnostic also reached Claude correctly. The test runner corrected the scanner, supplied a complete app entry and verified the build before testing the intended fetch failure. Claude's first diagnostic turn was stopped while it investigated unrelated fixture build preparation; the second received a bounded request to conclude without changes. This run does not establish that every recovery conversation is concise or finishes without steering.

## Runtime and cleanup

Desktop loads its managed `rpm/plugin_017R7V212duXed4st9xxmyHX` copy ahead of `~/.claude/plugins/cache/...`; changing only the latter did not load the patch. The managed hook was temporarily replaced and reloaded through Desktop. Both installed hook copies were restored byte-for-byte after the test. The test session was reloaded to the released runtime, renamed “Clodable 0.3.1 — Desktop verification 2026-11-20” and archived through Desktop. Product source files remain unchanged; only this report and the findings log were added or updated.

Tested hook SHA-256: `81c3e2c72053b2d61255dd9a0f19385c351af922794519041a7ba76da9980986`.
CLI bundle SHA-256: `e7d8177924edfba6dfcea2f0384b5f21f611a8aac5db50941880843d1e6de4e5`.

Native session: `local_74bce21a-0504-479f-bba8-8aa0663927d7`.
CLI transcript: `/Users/manu/.claude/projects/-private-tmp-clodable-desktop-20261120-app/73a43448-04e3-4ade-b66e-ffc24bbe8051.jsonl`.
Local fixture and sanitized diagnostics: `/private/tmp/clodable-desktop-20261120/`.
Native screenshots and accessibility snapshots are recorded in the Codex task.
