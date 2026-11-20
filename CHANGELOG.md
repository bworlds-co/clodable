# Changelog

All notable changes to Clodable are recorded here. The plugin, the `clodable` CLI and its packages share one version, and each release is tagged `clodable--v<version>`. This page lists what's ready for the next release, then each release in a few words. Each release's full notes are in [`docs/releases`](docs/releases): what builders will notice, then the details for developers.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry links the pull request it comes from (for 0.1.x, which had none, the commit).

**The CLI's event contract.** With `--json`, every `clodable` command prints one JSON event per line (NDJSON), and the last line is always a `result`. The types live in [`packages/core/src/events.ts`](packages/core/src/events.ts), and the Claude plugin reads them. During 0.x, this contract changes only in compatible ways: a release can add events, step ids, error codes and optional fields, and the ones that exist keep their names and meaning. A program that reads it should ignore what it doesn't know.

## [Unreleased]

**For builders**

- **Help when something stops you.** A [troubleshooting page](docs/TROUBLESHOOTING.md) lists the words you may see on screen, and what to do about each. When Clodable stops, its hint now points at the Clodable panel or at Claude, never at a command to type. ([#78](https://github.com/bworlds-co/clodable/pull/78))
- **A README you can check.** Get started has two ways in, from an idea or from an app you already have on GitHub, and says what you should see at each step, and what to do if you don't. ([#76](https://github.com/bworlds-co/clodable/pull/76))
- **Where to ask.** [SUPPORT.md](SUPPORT.md) says where to get help, the issue forms ask in plain words, and anything private, or a security problem, has a private way in. Everyone follows a [code of conduct](CODE_OF_CONDUCT.md). Clodable's code stays MIT, while its name, logo and mascot belong to BWorlds ([TRADEMARKS.md](TRADEMARKS.md)). ([#75](https://github.com/bworlds-co/clodable/pull/75))
- **Licenses included.** The plugin and the command line on npm carry the licenses of the open-source code inside them. ([#81](https://github.com/bworlds-co/clodable/pull/81))
- **Plainer words in the move.** Moving off Lovable, the functions step is now **Move your backend functions**, with **Move my functions**, and messages name **Prepare your website**, the step you see. ([#103](https://github.com/bworlds-co/clodable/pull/103))
- **Installs follow releases.** Adding or updating Clodable brings its last release, never work in progress. ([#77](https://github.com/bworlds-co/clodable/pull/77))

**For developers**

- Seven error hints that sent builders to `clodable setup` or `clodable save`, or to edit `.clodable/config.json` by hand, point at the panel or at Claude. The error codes and the events' shape are unchanged. ([#78](https://github.com/bworlds-co/clodable/pull/78))
- `packages/cli/build.mjs` writes `dist/THIRD_PARTY_NOTICES.txt` from esbuild's metafile. The npm package ships it with Clodable's `LICENSE`, and `plugin/cli/` carries both. ([#81](https://github.com/bworlds-co/clodable/pull/81))
- The move's functions step says "move" instead of "deploy" in its title, button, progress and errors; its `move:functions` id is unchanged. After a Publish with backend functions to update, the CLI says "Ask Claude to put them live." ([#103](https://github.com/bworlds-co/clodable/pull/103))
- `.claude-plugin/marketplace.json` pins Clodable to `clodable--v0.3.0` (a `git-subdir` source, over `https`). `pnpm release` pins each new release to its tag, `pnpm build` keeps the tag on the version, and a release is tagged before its pull request merges ([CONTRIBUTING](CONTRIBUTING.md#releasing)). ([#77](https://github.com/bworlds-co/clodable/pull/77))
- Docs: the 0.3.0 release checks ([#117](https://github.com/bworlds-co/clodable/pull/117)); ONBOARDING follows the panel ([#78](https://github.com/bworlds-co/clodable/pull/78)); the community files and brand notices ([#75](https://github.com/bworlds-co/clodable/pull/75)); this changelog, with each release's notes in `docs/releases` ([#74](https://github.com/bworlds-co/clodable/pull/74)).

## [0.3.0] - 2026-10-20

Start from an idea in the conversation, focused controls, clearer publishing and recovery with **Retry Publish**, a calmer preview, and a move off Lovable that picks up where you left it. [Release notes](docs/releases/0.3.0.md).

## [0.2.2] - 2026-10-15

Undo, Restore and the count of what isn't live yet agree with your live site. [Release notes](docs/releases/0.2.2.md).

## [0.2.1] - 2026-10-15

Typing `/move-off-lovable` opens the move, and **Fix it** asks in your words. [Release notes](docs/releases/0.2.1.md).

## [0.2.0] - 2026-10-15

The move opens when you ask, Undo and Restore ask with Clodable's own buttons, and requests stay in your words. [Release notes](docs/releases/0.2.0.md).

## [0.1.2] - 2026-10-13

One way to move off Lovable for everyone, and the clod logo. [Release notes](docs/releases/0.1.2.md).

## [0.1.1] - 2026-10-12

The first tagged release. [Release notes](docs/releases/0.1.1.md).

[Unreleased]: https://github.com/bworlds-co/clodable/compare/clodable--v0.3.0...HEAD
[0.3.0]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.2...clodable--v0.3.0
[0.2.2]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.1...clodable--v0.2.2
[0.2.1]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.0...clodable--v0.2.1
[0.2.0]: https://github.com/bworlds-co/clodable/compare/clodable--v0.1.2...clodable--v0.2.0
[0.1.2]: https://github.com/bworlds-co/clodable/compare/clodable--v0.1.1...clodable--v0.1.2
[0.1.1]: https://github.com/bworlds-co/clodable/tree/clodable--v0.1.1
