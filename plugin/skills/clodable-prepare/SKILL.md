---
name: clodable-prepare
user-invocable: false
description: Prepare an existing local application for Clodable when its architecture is unsupported. Use when the builder asks to make an HTML prototype or another framework compatible with Clodable, requests preparation for saving, or saving requires adapting the app. Inspect the app, preserve its original, agree on any rewrite and verify the result. Ordinary feature edits, new app ideas and moving services off Lovable use their own workflows.
---

# Prepare an existing app for Clodable

Make the existing application work with Clodable's supported formats: Vite + React or TanStack Start. Preserve the builder's design, content, routes, data behavior and interactions. Explain decisions in product terms and match the builder's language.

Keep each progress update to one sentence and the final reply to at most 80 words. Say “the application checks” and “the preview”; leave command names, build terminology, filenames, ports and local addresses out unless the builder requests technical details. Apply the same vocabulary to visible task titles. Resolve startup retries and port conflicts quietly; mention a diagnostic only when the builder must act. For successful checks, say “Les vérifications de l’application ont réussi. Je vérifie maintenant l’aperçu.” (or its equivalent in the builder’s language).

This workflow prepares local code. Account consent, creating the private app and publishing remain in Clodable's controls. Never run setup, initialize Git, change existing history or remote connections, create anything on GitHub, connect accounts or provision services during preparation. Use `clodable:clodable-move` for an authorized move off Lovable's services; ownership and architecture are separate decisions.

## Inspect and agree

Read the app's own instructions, files, dependencies, scripts, routes and interactions. An `index.html` can belong to a framework or server application. Identify what must keep working and any live services the preview calls.

Use the installed command named by the app's `AGENTS.md`. Before setup, use the bundled command below from this app's folder. Never fetch another version with `npx clodable`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/clodable.mjs" doctor --local --json
```

- For an already supported app, preserve its architecture. Fix only a missing requirement. If no adaptation is needed, open `saving` with `open_panel` and stop.
- For a simple static app, adapt the existing content and behavior to Vite + React with `dev` and `build` scripts. Preserve CSS, images, fonts, URLs, navigation, forms and local data. Do not replace the app with a template or hide it in an iframe to pass detection.
- For another framework or server application, choose a supported format that preserves the behavior, including server routes. Get agreement before rewriting. Do not replace a working server with sample data or add dependencies merely to pass detection. If the scope is unclear or essential behavior cannot be preserved, explain the limit and keep the app working locally.

Before rewrite consent, use at most 80 words total: one short paragraph explaining the need, the features preserved and any visible limitation, then the two choices. Do not add headings, an inventory, implementation details or a verification checklist. For example: “Pour pouvoir enregistrer votre application ici, je dois adapter son fonctionnement. Je peux conserver la page et la consultation des mêmes réservations. Une copie de l’original restera sur cet ordinateur. Voulez-vous que je la prépare, ou préférez-vous la garder telle quelle ?”

Choose the technical approach yourself. Ask the builder about its effects on their app, not which framework to use. Explain why adaptation is needed, which pages, features and data will stay, and any visible change or unresolved limitation. Describe what people can do (for example, “consult the same reservations”), rather than where code runs or how data is fetched. Offer to adapt the app or keep the current version. Use names such as Vite, React or TanStack only if the builder asks for technical details. Apply this to progress, questions, choice labels and the final reply. For example: “To save this app here, I need to adapt how it runs. I can keep the page and its reservation feature. Shall I prepare it, or leave the current version as it is?” Replace that example's claims with facts verified in this app.

A request to inspect, explain, plan or wait authorizes only that scope. A refusal leaves the original unchanged. Ordinary feature edits do not authorize preparation.

## Preserve before editing

Before installing packages, scaffolding, moving or editing app files, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/clodable.mjs" prepare backup --json
```

Require `ok: true` and `completed: true`. The command creates a verified, ignored snapshot under `.clodable/local/original/<id>/`. It includes hidden and untracked files, environment files and symlinks. It preserves links without copying their external targets. Preserve external files separately before changing them.

The manifest and completion marker stay beside `files/`. The original ignore file is preserved before the command adds the private-folder rule. Each retry creates a new snapshot. Never overwrite or delete an earlier snapshot. If preservation fails, leave app files unchanged and resolve the backup failure first. Do not improvise a tracked-files-only backup or print secrets. This command is the narrow exception to the rule against editing Clodable's private files.

## Adapt and verify

Make the agreed changes. Keep private settings out of browser code. Verify all three results before reporting preparation complete:

1. **Production build:** inspect its configuration and run the build successfully. Never use the whole project as `publicDir`, include `.clodable/local/` in inputs or broadly copy the project into output. Confirm the output contains no backup, manifest, environment file or private local state.
2. **Clodable support:** run the installed `doctor --json`. Require `local-app.contents` to be `supported` and the `app` check to be `ok`. Overall command success alone is insufficient. Missing GitHub connection or saving setup is expected here; do not initialize Git or connect an account to clear those warnings.
3. **Working preview:** register the installed `dev` command with Desktop’s preview server tools, start it there and open it in Desktop. Keep this verified preview running for the builder; do not stop it after testing. Avoid unmanaged background shell processes. This preview protects Clodable's private files. Do not use a generic static file server. Check the original design, main interaction, images, links, direct route reloads and any preserved server behavior. Avoid actions that change live data.

Fix a failed check and repeat that check. Stop and explain any unresolved blocker. Do not invite another saving attempt until all three pass.

When ready, briefly state what was preserved and verified, then open `saving` with `open_panel` for the builder's account consent. Preparation alone does not mean the app is saved or public.
