# Saving UX fixes — Desktop retest, November 20, 2026

Both findings from the first Desktop pass are fixed locally and verified in Claude Desktop. The changes are uncommitted; no release was made.

## Changes

- When setup ends unsuccessfully, each still-running progress step becomes failed. Completed steps remain checked. The active indicator and ellipsis disappear, while the retry controls return.
- An unexpected error from Set up saving now says: “Something unexpected went wrong. Ask Claude for help to find out what stopped saving.” Other error-specific recovery hints remain unchanged, and Claude still receives the original diagnostic privately.

## Native verification

Used Claude Desktop's Code interface, a fresh session in the existing disposable local fixture, and the actual bundled Clodable CLI. The fixture uses a simulated connected account and an empty local GitHub stand-in; it deliberately fails while fetching the initial version. No real GitHub creation or authentication was attempted in this retest.

On the first attempt and a same-name retry, the settled panel showed:

- ✓ Your tools are ready.
- ✕ Checking your local app before saving, with no running indicator or ellipsis.
- The new help wording, with no reference to “your developer.”
- Ask Claude for help, the preserved app name, and Create private app.
- No raw command or diagnostic output in the panel.

The retry's accessibility snapshot showed the running tools check with the old error and recovery controls removed, followed by the correct failed state. The fake GitHub log still contains only the one creation request from the earlier test, confirming these retries reused the existing destination.

Native screenshots and accessibility snapshots are in the Codex conversation. Session: `local_5860fb48-b05e-416b-a35c-aac834c6c0a4`, archived as “Clodable — saving UX fixes retested 2026-11-20”.

## Automated verification

The extended saving-failure test failed against the previous code (156 passed, 1 failed) and passed after the fix (157 passed, 0 failed). It verifies preserved completed progress, failed active progress, the new wording, restored app-name input, hidden raw output, and the diagnostic help payload. Plugin type checking passes. Biome reports no errors and one pre-existing unused `Link` warning. Plugin validation passes with warnings.

## Runtime and cleanup

Tested hook SHA-256: `17fdcb9a2de1812bb9ad9fe9d3a625c69d7572f0b9bb7dea7e13f74f0484bd3d`.
The CLI bundle was unchanged. Desktop's managed installed hook was restored byte-for-byte to its original SHA-256, `b0a38235145ffbfb36d603eb05da6fb1c5361b54fbbd598226468393168c22b4`, then reloaded in the test session before archiving it. The CLI cache was not changed in this retest.

These checks establish the two UI fixes. They do not identify or resolve the original saving failure on the other computer. The earlier report's authentication and clipboard limits remain unchanged.
