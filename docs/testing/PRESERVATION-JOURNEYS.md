# Preserving existing journeys

Verified on November 21, 2026 with the 0.4.2 candidate in native Claude Desktop on
macOS. Local screenshots and evidence are kept outside GitHub. No real GitHub
resource, service, email or payment was created by the application rehearsals.

## Preparation and comparison

The disposable original was a static French reading-club app. It offered a
reservation form, one to four places, a two-letter minimum first name, cancellation,
a programme page, direct hash links and browser persistence. Five original files
were hashed before the test; all five matched the verified private snapshot.

The preparation button showed the preservation wording and requested the dedicated
skill. Claude observed the original in a separate local preview, then adapted it
to React and replayed the same journeys. The main preview kept the original port
and storage key. Temporary test previews kept test data separate from the main
preview's reservations. Build and Clodable support checks also passed.

Independent native clicks confirmed:

- A one-letter first name is rejected with the original message.
- A three-place reservation appears alongside the original two-place reservation.
- Reload retains both reservations and the five-place total.
- The programme link and direct reload preserve the selected page.

Claude's before/after comparison also exercised required-field validation,
whitespace trimming, all place choices, form reset, cancellation, an empty list,
persistence after cancellation and navigation back to the reservation page.
It compared element positions and computed appearance. It reported one additional
reachable address (`/index.html`); the existing journeys were preserved.

## Deliberate regressions and recovery

After the first successful preparation, two changes were introduced only in the
disposable app: a different browser-storage key hid existing reservations, and a
lowered validation threshold accepted a one-letter name. A natural request to
resume preparation found and corrected both. Claude replayed the original and
adapted journeys with the same inputs. The existing reservations reappeared in the
main preview; the original key and validation rule were restored in source.

The rehearsal exposed technical filenames and storage details in progress replies.
The final skill explicitly describes regressions through their visible effects and
also names rechecking an already supported adaptation in its discovery description.

## Read-only verification in a fresh conversation

A one-letter-name regression was reintroduced, and a fresh conversation was asked
to verify preservation without making changes. It loaded `clodable-prepare`,
compared the original and adapted journeys and reported the validation difference
despite successful build and support checks. It did not claim full preservation
or fix the code. Hashes confirmed that every recorded application source file was
unchanged. After the test, the disposable app was returned to its corrected state.

The original installed plugin was restored and hash-verified. Both test
conversations reloaded it, and the remaining disposable preview was stopped.
Generated verification replies still included more technical detail than the
skill requests; the panel wording itself was verified in Desktop.

## Automated checks and limits

342 package tests and 227 plugin tests pass, with lint, build and type checks,
including the plugin against generated Claude host types. Native behavior was
checked in French; the plugin's existing tests cover French and English controls.
No assertion test was added merely to match the prose of the skill.

These are instructions for Claude's verification workflow, not a deterministic
proof of equivalence for every application. This rehearsal does not validate a
full live move off Lovable, external services, OAuth, Windows or every architecture.
The move skill's journey comparison and explicit feature-loss guidance were
reviewed with its existing rehearsal and optional-skip rules.
