# Live GitHub authorization follow-up — November 20, 2026

The owner completed GitHub authorization from the live demo, but saw Try again. This was a test-fixture error: the installed GitHub CLI performed real authentication while the fixture's CLODABLE_GH wrapper still returned an unconditional disconnected result for the subsequent check. It does not establish a failure of GitHub authorization or the product flow with a normal configuration.

Using the demo's isolated GitHub configuration, the real CLI returned success for auth status and identified the account as emmanuelvulk. No credential contents were read or included in the report.

Corrected the local fixture wrapper so its real-read-only mode delegates only version, auth status and account lookup to the actual CLI with the same isolated configuration. All other GitHub operations are blocked in this mode. Cancelled one redundant pending login in the demo folder after confirming authorization had succeeded. Its completion refreshed the panel to the real connected account.

The original session still held the earlier deliberate saving failure. A clean session, local_d95f17c0-0fab-4bec-8ace-e85adfeae4c6, now shows ✓ GitHub account · @emmanuelvulk and the private-app form, with no retry message or saving error. It is left open as “Clodable — GitHub connection verified”. No app creation was attempted. This verifies real authorization and subsequent account detection, but the initial automatic success transition was obstructed by the test fixture and was recovered after its correction.

The user-requested live demo still has the fixed development hook loaded. The original installed-hook backup remains in /private/tmp/clodable-ux-fix-20261120/desktop-register.backup.tsx. No further product-source change or release was made. The previous reports describe the earlier completed test passes; their restored-runtime and untested-real-auth statements are historical.
