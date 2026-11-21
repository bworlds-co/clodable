# Issue #121 — preparation and first saving

Verified on November 21, 2026, in native Claude Desktop on macOS. Candidate branch:
`codex/121-prepare-saving`, based on `f3469780ef402db9bc91442f4581a3a0caa34b1b`.

Local artifacts under `output/issue-121/` contain a French report, 20 screenshots,
structured evidence and logs. They stay outside Git and release archives because
Desktop screenshots include unrelated conversation titles.

## Verified behavior

- An empty folder remains an idea/import entry point, including with an unborn
  repository. Unsupported prototypes offer preparation before saving.
- Claude prepared a two-page static prototype as Vite/React after a verified
  original backup. Navigation, assets, reservation behavior and the anchor were
  exercised in Desktop. The anchor needed a fixture correction and passed on retry.
- A server application requested migration consent. Refusal left its five original
  files unchanged; acceptance produced TanStack Start with the real JSON route
  preserved. Backup hashes and server data were verified separately.
- Private originals are excluded from saving and inaccessible through the preview.
  Real Vite tests include custom bases, encoded URLs, `@fs` and symlink aliases.
- Name submission leads to explicit creation consent. A simulated name collision
  leaves the real index intact and permits changing the name before retrying.
- Existing local history requires consent for the inspected head. The two original
  commits and an uncommitted edit survived the native save. The first saved version
  is visible as current in history; imported-repository setup remains hidden.
- Existing GitHub and other remotes receive separate routes in the panel.
- Automated tests cover protected/nested repositories, stale context, private and
  staged files, interrupted setup and competing processes.

## Validation and limits

342 package tests and 223 plugin tests passed. Build, type checks, Biome and
`git diff --check` passed. Native tests used a local FakeGitHub bare repository
and real gitleaks 8.30.1. They did not create real GitHub resources or exercise
OAuth, real-service outages, or Windows. The import form and return were inspected
in Desktop; actual cloning into a child folder is covered by CLI tests.

Both native test sessions reloaded the original installed plugin after its files
were restored and hash-verified. Test preview servers were stopped. The original
Clodable source working copy was not changed. No commit, push or release was made
for this candidate.
