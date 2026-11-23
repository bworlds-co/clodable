# Getting-started guides

These sources live in the Clodable repository so a product change and its instructions can be reviewed together.

| Guide | English | Français |
| --- | --- | --- |
| Create an app | [Read](install-clodable/README.md) | [Lire](install-clodable/README.fr.md) |
| Prepare an existing app | [Read](prepare-existing-app/README.md) | [Lire](prepare-existing-app/README.fr.md) |
| Start moving from Lovable | [Read](move-from-lovable/README.md) | [Lire](move-from-lovable/README.fr.md) |

## Edit once, build both languages

- Each `guide.json` holds the guide's pages and steps, with English and French text together. Keep French natural; retain familiar terms such as GitHub, plugin, token and backend.
- `shared.json` owns the installation steps, first-launch tools callout and empty-folder instructions used by multiple guides.
- `catalog.json` owns official links and external menu labels. `{{ui:prepare}}` and the other `ui` references resolve to the actual Clodable labels from `packages/i18n/src/mod.ts`. French guide text uses French labels even though the screenshot is in English. Never duplicate a Clodable button label in prose.
- `assets/screenshots/` is the canonical screenshot library for **every language**. Captions are translated; images are not. `assets/screenshots.json` records each image's hash, dimensions, date, verified plugin/Claude versions where known, and optional highlight rectangle. Keep versions `null` when not recorded.
- `template.css` and `scripts/guides.mts` own the shared layout and renderer. Fonts and their licenses are vendored under `assets/fonts/`, with pinned source URLs and hashes. Builds make no network requests.

Edit the JSON sources, not generated guide READMEs, HTML or PDFs. Add the English and French wording together. The generator fails on a missing translation, missing catalog label, mismatched control references or changed screenshot bytes without updated metadata. There is no language override or silent English fallback. Supported languages follow `packages/i18n/src/index.ts`.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --no-shell chromium
pnpm guides:build    # Markdown, standalone HTML, and all six PDFs
pnpm guides:check    # Typecheck, translations, UI labels, assets, fresh Markdown
pnpm guides:links    # Check official links (requires internet)
```

For copy editing without a browser, `pnpm guides:sources` rebuilds only Markdown and HTML. Run the full build before shipping to catch page overflow in either language.

English exports keep their original names, such as `output/pdf/install-clodable.pdf`; French exports add `.fr`, such as `output/pdf/install-clodable.fr.pdf`. Standalone HTML is written beside each guide's sources with the same suffix. HTML embeds the fonts and screenshot bytes, so it can be shared as one file.

## Keep guides current with the product

1. When changing installation, Code/folder selection, preparation, saving, hosting or the Lovable migration entry, review the relevant guide in the same pull request. A catalog label change automatically changes the next build's text; CI rejects stale generated Markdown.
2. Verify the steps in the current released Claude Desktop/plugin. Replace only affected canonical screenshots. Use isolated demo apps for preparation and migration; record any simulated state or steps not actually completed in capture notes. Never capture tokens or customer data.
3. Update the image metadata with its actual capture date, dimensions and SHA-256 (`shasum -a 256 <image>`). Record the observed versions, not the next planned release. Update `catalog.json`'s verified date/version and localized footer after a full walkthrough; old screenshots retain their own capture facts.
4. Run the build and checks. Open the English **and** French PDFs and inspect every affected page for readable controls, correct labels, clipping and page breaks. The build catches overflow, but visual review remains necessary. Confirm every language still uses the same images.
5. Commit sources, canonical assets and the six generated Markdown guides together. HTML/PDF exports are ignored; CI regenerates them and uploads `clodable-guides`. At release time, build from that release revision and attach the six PDFs as described in [CONTRIBUTING](../../CONTRIBUTING.md#releasing).

CI runs source checks and builds every guide on each pull request. It cannot tell whether a screenshot still matches a live interface; the pull-request and release checklists cover that review. Link checks are separate from CI to avoid failing code changes on a third-party outage.

The current captures were made on 23 November 2026; Clodable-specific controls were verified with 0.4.4. Claude Desktop's exact version was not recorded. See [Lovable capture notes](move-from-lovable/CAPTURE-NOTES.md) for the isolated demo setup and the point where the walkthrough stopped.
