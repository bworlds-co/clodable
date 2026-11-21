# Changelog

All notable changes to Clodable are recorded here. The plugin, the `clodable` CLI and its packages share one version, and each release is tagged `clodable--v<version>`. This page lists what's ready for the next release, then each release in a few words. Each release's full notes are in [`docs/releases`](docs/releases): what builders will notice, then the details for developers.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry links the pull request it comes from (for 0.1.x, which had none, the commit).

**The CLI's event contract.** With `--json`, every `clodable` command prints one JSON event per line (NDJSON), and the last line is always a `result`. The types live in [`packages/core/src/events.ts`](packages/core/src/events.ts), and the Claude plugin reads them. During 0.x, this contract changes only in compatible ways: a release can add events, step ids, error codes and optional fields, and the ones that exist keep their names and meaning. A program that reads it should ignore what it doesn't know.

## [Unreleased]

## [0.4.1] - 2026-11-21

Prepare existing local apps before saving, preserve verified originals, keep approved local versions, and explain migration choices in plain language. [Release notes](docs/releases/0.4.1.md). ([#124](https://github.com/bworlds-co/clodable/pull/124))

## [0.4.0] - 2026-11-21

French controls that follow Claude’s language, usable-Git checks before saving, tool preparation that retries, and clearer GitHub connection recovery. [Release notes](docs/releases/0.4.0.md). ([#119](https://github.com/bworlds-co/clodable/pull/119))

## [0.3.1] - 2026-11-21

Guided GitHub connection, saving errors Claude can investigate, clearer Desktop panels and progress that stops on failure. Includes the troubleshooting, support and install improvements since 0.3.0. [Release notes](docs/releases/0.3.1.md). ([#118](https://github.com/bworlds-co/clodable/pull/118))

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

[Unreleased]: https://github.com/bworlds-co/clodable/compare/clodable--v0.4.1...HEAD
[0.4.1]: https://github.com/bworlds-co/clodable/compare/clodable--v0.4.0...clodable--v0.4.1
[0.4.0]: https://github.com/bworlds-co/clodable/compare/clodable--v0.3.1...clodable--v0.4.0
[0.3.1]: https://github.com/bworlds-co/clodable/compare/clodable--v0.3.0...clodable--v0.3.1
[0.3.0]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.2...clodable--v0.3.0
[0.2.2]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.1...clodable--v0.2.2
[0.2.1]: https://github.com/bworlds-co/clodable/compare/clodable--v0.2.0...clodable--v0.2.1
[0.2.0]: https://github.com/bworlds-co/clodable/compare/clodable--v0.1.2...clodable--v0.2.0
[0.1.2]: https://github.com/bworlds-co/clodable/compare/clodable--v0.1.1...clodable--v0.1.2
[0.1.1]: https://github.com/bworlds-co/clodable/tree/clodable--v0.1.1
