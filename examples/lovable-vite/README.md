# Crumb & Co. (Lovable classic template)

A fictional bakery site built as a copy of what Lovable generates with its **classic template**
(`vite_react_shadcn_ts`). Lovable used this template for apps created before May 13, 2026. Clodable's
dev tooling (preview toolbar, source tagger, inline text editing, CLI) is developed and tested
against it.

This is a standalone **npm** project with its own `package-lock.json`. It is not part of the pnpm
workspace.

## Run it

```sh
npm install
npm run dev        # http://localhost:8080 (falls back to 8081, 8082… if 8080 is busy)
npm run build      # vite build -> dist/
npm run preview    # serve dist/
npm test           # vitest (template smoke test)
```

## Routes

| URL             | File                    | Notes                                                                                          |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `/`             | `src/pages/Index.tsx`   | Navbar, hero, "Today's bakes" grid (array), testimonials (array), CTA, footer                  |
| `/menu`         | `src/pages/Menu.tsx`    | Menu sections and prices from `src/data/menu.ts`                                               |
| `/about`        | `src/pages/About.tsx`   | Static story: several paragraphs, values, quote                                                |
| `/__error-test` | `src/pages/ErrorTest.tsx` | Dev only: registered in `App.tsx` when `import.meta.env.DEV`. Throws during render. Not linked anywhere |
| `*`             | `src/pages/NotFound.tsx` | Template 404                                                                                   |

Most copy is static JSX text: headings, paragraphs, button labels, badges and the footer. The
logo uses an entity (`Crumb &amp; Co.`) and the About quote uses curly quotes. Some text is dynamic
on purpose: bakes, testimonials, nav labels, menu items and prices, and the footer year.

## What comes straight from Lovable

The source is Lovable's template commit **`template: vite_react_shadcn_ts_2026-04-20`**, the last
classic revision before the TanStack switch. These files are copied from
[kalyandeep18/vaygr-ai-cs@5bc0ac8a](https://github.com/kalyandeep18/vaygr-ai-cs/commit/5bc0ac8a4ba15c601b9b50c18d992201ccdeae27),
unchanged unless noted:

- `vite.config.ts`: `host: "::"`, `port: 8080`, `hmr.overlay: false`, `@` alias, `resolve.dedupe`,
  `@vitejs/plugin-react-swc`, and `componentTagger()` from `lovable-tagger` in development mode only.
- `package.json` (name `vite_react_shadcn_ts`; only `@supabase/supabase-js` added),
  `components.json`, `tailwind.config.ts` (theme extended, see Design), `postcss.config.js`, the
  three `tsconfig*.json` files, `eslint.config.js`, `vitest.config.ts`, `src/test/*`, `.gitignore`,
  and `public/*` (`favicon.ico`, `placeholder.svg`, `robots.txt`).
- `src/main.tsx`, `src/App.tsx` (routes added above the catch-all, as Lovable does),
  `src/App.css`, `src/pages/NotFound.tsx`, `src/components/NavLink.tsx`, and `src/hooks/*`.
- `src/components/ui/*`: all 49 shadcn/ui components, including `toast`/`toaster` and `sonner`.
- `package-lock.json` started from the lockfile in that template commit, so the pinned versions
  match what Lovable shipped: vite 5.4.19, react 18.3.1, lovable-tagger 1.1.13,
  @vitejs/plugin-react-swc 3.11.0, tailwindcss 3.4.17, typescript 5.8.3, react-router-dom 6.30.1,
  @tanstack/react-query 5.83.0 and lucide-react 0.462.0. That lockfile did not list vitest, jsdom
  or @testing-library; npm resolved those (vitest 3.2.7).

I checked these against a later classic revision, `vite_react_shadcn_ts_current-fce4d67f163f`
([digitalexploits-cmd/nexus.aibase3.com@3e4ae8e0](https://github.com/digitalexploits-cmd/nexus.aibase3.com/commit/3e4ae8e0c3839cf92072dbb78d6ad3a8210c6009)).
It differs only in the README, the `index.html` meta tags and lockfile format (`bun.lock` and no
`package-lock.json`).

## Supabase

When a classic project connects Supabase, Lovable adds `@supabase/supabase-js`,
`src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts` and
`supabase/config.toml`. All four are here. The values are placeholders
(`crumbcoplaceholderxx.supabase.co` and a fake anon JWT), so nothing can reach a real backend. No
page imports the client, and the app runs offline.

## Deviations and assumptions

- **Supabase client style.** `client.ts` uses hardcoded `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`
  constants. This is how Lovable wrote it for projects linked to the user's own Supabase account,
  for example [AdiGaze](https://github.com/Adilmunawar/AdiGaze/blob/main/src/integrations/supabase/client.ts).
  The brief asked for this style. Classic projects on Lovable Cloud in 2026 read
  `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` and commit a `.env` with
  `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_URL` instead, for
  example [vaygr-ai-cs](https://github.com/kalyandeep18/vaygr-ai-cs/blob/main/src/integrations/supabase/client.ts).
  The TanStack example covers the env-var style. `types.ts` is the generator output for an empty
  schema in the 2026 classic format (`PostgrestVersion: "14.5"`). `@supabase/supabase-js` is
  pinned at `^2.105.4`, the latest release before May 13, 2026.
- **Lockfiles.** Lovable ships `bun.lockb` alongside `package-lock.json`. Only the npm lockfile is
  kept here.
- **README.** Lovable's own README (a project title, or "Welcome to your Lovable project") is
  replaced by this file.
- **`index.html`.** The title, description and `og:*` tags are set to Crumb & Co., as Lovable does
  when it builds an app. The rest is the template.
- **Design.** The palette, gradients and shadows are HSL tokens in `src/index.css` with matching
  `tailwind.config.ts` extensions (`font-display`, `bg-gradient-*`, `shadow-soft`/`shadow-warm`).
  This is Lovable's usual design-system pattern. The app uses no web fonts and no remote images.
- **Error test.** The classic template has no error boundary. On `/__error-test` React unmounts
  the tree, leaving a blank page and an uncaught error in the console.
- **Lint.** `npm run lint` reports 3 errors and 7 warnings. All of them are in untouched template
  files (`tailwind.config.ts` `require()`, empty interfaces and fast-refresh warnings in
  `src/components/ui`). The app's own files lint clean.

## Notes for Clodable tooling

- `lovable-tagger@1.1.13` does nothing outside Lovable's sandbox. Every feature is gated on
  `LOVABLE_DEV_SERVER=true`, so locally `componentTagger()` is an empty plugin. To reproduce the
  sandbox, run `LOVABLE_DEV_SERVER=true npm run dev`. The tagger then does three things:
  - It adds no `data-*` attributes. Instead it swaps `react/jsx-dev-runtime` for a virtual module
    that stores `{ fileName, lineNumber, columnNumber, displayName }` on each DOM node under
    `Symbol.for("__jsxSource__")`, plus a `window.sourceElementMap` keyed by `file:line:col`.
  - It writes `src/tailwind.config.lov.json`, using a temporary `.lov.tailwind.config.js`.
  - It accepts in-memory file overrides over the Vite HMR socket: `lovable:override`,
    `lovable:clear-override` and `lovable:clear-all-overrides`. Lovable's visual editor uses these
    to preview edits before saving.
- `hmr.overlay` is `false` in `vite.config.ts`, so Vite's error overlay never shows.
