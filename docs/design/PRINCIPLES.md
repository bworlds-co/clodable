# Clodable UX principles

Our builder made an app with Lovable. They think in pages, words, buttons and "make it feel more premium". They are afraid of breaking things. They want to **see** changes, **feel safe**, **publish with confidence**, and **undo easily**.

## The eight principles

1. **Never make them think about git.** In the interface we say *Saved*, *Publish*, *Live*, *Undo*, *Restore*. We never say commit, branch, merge, pull request, push or deploy, except behind "Details", for developers.
2. **One glance tells them where they stand.** Is my work saved? What's live? What isn't live yet? Is something broken? The band above the prompt always answers all four.
3. **Safe by default, reversible always.** Every change can be undone. Database changes are the one exception, and we say so *before* they happen, not after.
4. **Calm, not noisy.** We use few colors, few words, and one primary action per surface. Progress is a short story ("Checking it builds… Going live…"), not a log.
5. **Plain words, warm voice.** We explain what happened and what to do next, and we never blame. Every error comes with a way forward.
6. **Instant feedback.** Text edits apply in place and the preview updates immediately. The Publish progress appears within 100 ms of the click.
7. **Respect their app.** The toolbar floats out of the way and can be hidden. It never leaks styles into the app, and it never ships to production.
8. **Standard underneath.** Everything is GitHub Flow, plain files and public tools, so developers can open the hood and find nothing strange.

## Vocabulary

| Say | Don't say | Means |
|---|---|---|
| Saved | committed, pushed | A commit on `draft/<you>`, pushed to GitHub |
| Your draft · *N changes not live yet* | branch, diff | Commits that aren't on `main` yet |
| Publish | merge, deploy, ship to prod | Squash-merge the draft's pull request; the host deploys `main` |
| Live · *your site* | production, main | What visitors see |
| Undo publish | revert | Revert the last publish commit and publish that revert |
| Restore this version | reset, checkout | A new commit that brings back an earlier save |
| Checks | CI, build, lint, audit | Build, vulnerable packages, leaked keys |
| Your database · *live data* | Postgres, migration, schema | Supabase |
| Try to fix | debug | Hand the error to Claude with its context |

## Voice

- **Short and active:** "Saved." "Publishing…" "You're live." Not "Your changes have been successfully committed to the repository."
- **Warm, never cute in critical moments.** Clay metaphors ("Shaping…") are allowed in delight moments such as the spinner and empty states. They never appear in errors, confirmations or anything about data.
- **Specific:** "3 changes not live yet", not "You have unpublished changes."
- **Honest about risk:** "This changes your live data. It can't be undone." Say it once, plainly, before the action.
- **Time:** relative ("2 min ago"), with the absolute time on hover or in Details.
- **Buttons are verbs:** *Publish*, *Try to fix*, *Undo*, *Restore this version*, *Show me*.

## Error copy pattern

```
<What happened, in their words>      ← "Your site couldn't go live: a page is broken."
<Why, one line, optional>            ← "The pricing page refers to a file that doesn't exist."
[Primary next step]  Secondary       ← [Fix it]  Show details
```

## Accessibility baseline

- Every control can be reached by keyboard and has a visible focus ring (2 px, offset 2 px, in a brand color with 3:1 contrast against its surroundings).
- Text contrast is at least 4.5:1. Non-text indicators are at least 3:1.
- Every icon-only button carries `aria-label`. The toolbar uses `role="toolbar"` with roving tabindex.
- `prefers-reduced-motion` turns off all non-essential motion.
- Live regions announce changes: "Saved", "Published", errors.
- Hit targets are at least 32×32 px on the toolbar, 44×44 px in device-frame mode.
