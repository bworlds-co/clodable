# Working on Clodable

Clodable makes Claude Desktop a calm, Lovable-style place to shape an app, then publish it. Read these first:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the packages, the branch model, the protocols.
- [docs/DECISIONS.md](docs/DECISIONS.md): the product decisions. Don't re-litigate them in code.
- [docs/design/PRINCIPLES.md](docs/design/PRINCIPLES.md): the builder-facing vocabulary and voice.

## Rules of the house

- **Builders never see git words.** In anything a builder reads (toolbar, plugin, CLI pretty output), say *Saved / Publish / Live / Undo / Restore*. Never *commit / merge / deploy / branch*.
- **Built for Claude: judgment in Claude, mechanics in the CLI.** Use the conversation for what needs reading or deciding (the app's code, naming features, code changes), through the panel's requests and the skills. Keys, API calls, the move's state and checks live in `packages/core`, behind the CLI (`plugin/cli/clodable.mjs`, NDJSON on `--json`); `plugin/` draws them and asks Claude. Working without Claude isn't a goal (DECISIONS Q1).
- **The NDJSON event contract** (`packages/core/src/events.ts`) is a public API. Change it compatibly, and update `packages/cli/test/cli.test.ts`.
- **The preview toolbar** (`packages/preview/src/client`) runs inside other people's apps. Use shadow DOM only, never touch the app's styles, keep the bundle small, and stay accessible: keyboard, focus rings, `prefers-reduced-motion`.
- **Mods:** spell every `$` call in full; helpers that take `$` are top-level functions in `register.tsx`. Claude Code writes the types beside the plugin (`plugin/.claude-plugin/types/claude-code/index.d.ts`, git-ignored); the cheat sheet is `docs/research/mods-api-cheatsheet.md`.

## Commands

```bash
pnpm build                    # everything, including plugin/cli/clodable.mjs
pnpm test                     # core, preview, CLI (vitest)
pnpm test:plugin              # claude plugin validate + test
pnpm lint:fix && pnpm typecheck
CLODABLE_TOOLBAR_DEV=1 pnpm tsx scripts/dev-example.mts lovable-vite 5199   # example + live toolbar
pnpm tsx scripts/toolbar-shots.mts && pnpm tsx scripts/readme-assets.mts    # screenshots
pnpm tsx scripts/export-brand.mts && pnpm tsx scripts/mascot-assets.mts     # logo files, mascot drawings, link preview
pnpm tsx scripts/e2e-edit.mts http://127.0.0.1:5199 examples/lovable-vite   # real inline edit, restored after
pnpm tsx scripts/e2e-move.mts   # move off Lovable on a real local Supabase (Docker; own ports 55320-55329)
pnpm tsx scripts/e2e-errors.mts http://127.0.0.1:5199 examples/lovable-vite # Try to fix card: break, reload, fix, restored after
```

Use `CLODABLE_FAKE_GITHUB=<bare repo>` to run the CLI or plugin against a local fake GitHub. For the move off Lovable: `CLODABLE_SUPABASE_API` and `CLODABLE_SUPABASE_PROJECT_URL` point at a fake Supabase, `CLODABLE_MOVE_DATABASE_URL` at a local database, `CLODABLE_CONFIG_DIR` moves the secret store.
