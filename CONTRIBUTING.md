# Contributing to Clodable

Thank you for helping. Clodable is for builders, not developers. Every change should make their day calmer.

## Before you start

- Read [docs/design/PRINCIPLES.md](docs/design/PRINCIPLES.md). Any text a builder sees follows its vocabulary: *Saved*, *Publish*, *Live*, *Undo*. Never "commit", "merge" or "deploy".
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Judgment belongs to Claude (the panel's requests, the skills); mechanics belong in `packages/core`, behind the CLI: keys, API calls, the move's state, the checks.
- Product decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). Propose changes to them in an issue first.

## Setup

```bash
pnpm install
pnpm build
pnpm test && pnpm test:plugin
```

You need Node.js 20.19 or newer, pnpm 10, git, and the Claude Code CLI (to validate and test the plugin).

## Working on the preview toolbar

```bash
CLODABLE_TOOLBAR_DEV=1 pnpm tsx scripts/dev-example.mts lovable-vite 5199
pnpm tsx scripts/toolbar-shots.mts      # screenshots of every state, in docs/design/shots/toolbar
pnpm tsx scripts/e2e-edit.mts http://127.0.0.1:5199 examples/lovable-vite
```

With `CLODABLE_TOOLBAR_DEV=1`, the toolbar is rebuilt on every page load. Check light and dark mode, keyboard use (Tab, Escape, ⌥⇧E, ⌥⇧A) and `prefers-reduced-motion`.

## Working on the Claude plugin

- `claude plugin validate plugin` and `claude plugin test plugin` must pass.
- The mods API types are written by Claude Code beside the plugin (`plugin/.claude-plugin/types/claude-code/index.d.ts`, git-ignored) when it loads it in an interactive session. `docs/research/mods-api-cheatsheet.md` explains how, and summarises the API.
- Every `$` call must be spelled in full (`$.ui.toast(...)`), and helpers that use `$` must be top-level functions in `register.tsx`.

## Releasing

People install Clodable from this repository, which is its own plugin marketplace (`.claude-plugin/marketplace.json`). Claude Code updates an installed plugin only when its version changes, so every release bumps it:

1. `pnpm release patch` (or `minor`, `major`, or an exact `x.y.z`). It sets one version on the packages, the plugin and the marketplace, and rebuilds the plugin's bundled CLI.
2. Run the checks, commit and push.
3. `claude plugin tag plugin --push` tags the release as `clodable--v<version>`.

Apps Clodable set up get the new version on their own: the setup turns on auto-update for this marketplace in the app's `.claude/settings.json`. Anyone else updates with `claude plugin update clodable@clodable`.

## Pull requests

- Keep them small, with tests.
- Run `pnpm lint:fix` before pushing.
- In the description, say what a builder will notice.
