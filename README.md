<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/lockup-dark.svg">
    <img src="docs/assets/lockup.svg" alt="Clodable" height="60">
  </picture>
</p>

<p align="center">
  <b>Shape your app with Claude. Publish when you're happy.</b><br>
  For people who built their app with Lovable and want to keep shaping it, on their own terms.
</p>

<p align="center">
  <img src="docs/assets/hero.png" alt="A bakery website running locally with Clodable's preview toolbar: the headline is highlighted for editing, and a phone preview sits beside it." width="100%">
</p>

<p align="center">
  <b>Open source. Your code, data and workflow stay yours. Runs on Claude today.</b>
</p>

---

## What it feels like

1. **Ask for a change in your own words.** "Make the header feel warmer", or "Add a pricing page with three plans."
2. **Watch it appear** in the live preview next to the chat. Your work is saved after every reply.
3. **Click Publish** when you're happy. Clodable checks your app, and a minute later it's live.
4. **Changed your mind?** Undo puts the previous version back.

You never see git, branches or deploy logs. Your developer, if you have one, sees all of it on GitHub, the way developers like it.

## In the preview

<table>
  <tr>
    <td width="50%"><img src="docs/assets/edit-text.png" alt="Editing a headline in place"></td>
    <td width="50%"><img src="docs/assets/point-and-ask.png" alt="Pointing at a button and asking Claude to change it"></td>
  </tr>
  <tr>
    <td><b>Edit text in place.</b> Click any words and type. The change goes straight into your code, without AI and without using your Claude plan.</td>
    <td><b>Point & ask.</b> Click any part of the page and say what should change. Claude knows exactly which element and which line you mean.</td>
  </tr>
  <tr>
    <td><img src="docs/assets/try-to-fix.png" alt="A page that can’t load, explained in plain words, with a Try to fix button"></td>
    <td><img src="docs/assets/locked-text.png" alt="A note explaining that this text comes from data, with an Ask Claude button"></td>
  </tr>
  <tr>
    <td><b>Try to fix.</b> If a page breaks, one click hands the error to Claude, with the page and the file.</td>
    <td><b>Honest about limits.</b> Text that comes from your data can't be typed over, so Clodable says so and offers to ask Claude.</td>
  </tr>
</table>

You can also preview your app at phone and tablet sizes, with real breakpoints. The toolbar only exists on your computer: visitors never see it.

## In Claude Desktop

Clodable adds a **Publish bar** above the message box. It always tells you where you stand:

| You see | It means |
|---|---|
| `● 3 changes not live yet` **[Publish]** | Your work is saved on GitHub, in your draft |
| `Publishing · Checking it builds…` | Clodable is putting it live, step by step |
| `● You're live · crumb.co` **[Undo]** | Visitors now see your changes |
| `Not published · A page doesn't build` **[Fix it]** | Nothing changed for visitors. Claude can fix it |

Claude's activity is written in plain words ("Updated the Pricing page", "Changed your database: add phone to customers"). Before anything touches your live data, Clodable asks you, and says plainly when a change can't be undone.

## How it works

```
YOUR COMPUTER · Claude Desktop
  1. Ask for a change
  2. Preview updates instantly
  3. Each reply is saved to your draft            ──▶  GitHub: draft/<you> + a pull request
        │
        │ 4. Publish: catch up with the live site → checks → merge
        ▼
PRODUCTION
  your host deploys main · edge functions go live · "You're live"
```

Underneath it's plain **GitHub Flow**: one draft branch per person, one pull request per draft, and `main` always equal to what's live. Everything Clodable does is a normal git commit, pull request or file, so a developer can open the hood and find nothing strange. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Your database is the one exception.** Like Lovable, your preview uses your real data, and database changes apply when you confirm them. Claude is told to make them additive, so your live site keeps working until you publish.

## Get started

**You'll need:**
- [Claude Desktop](https://claude.com/download).
- A GitHub account with your app on it. Lovable can push your project to GitHub in one click.
- A host that deploys from GitHub, such as Vercel, Netlify or Cloudflare. If Lovable hosts your app today, keep it live there until your first Publish works, then move your domain.

> **About Claude plans.** Pro and Max are personal plans. For your company's app, use **Claude Team or Enterprise**. Anthropic's consumer terms don't allow business use of personal plans in the EU.

1. **Add Clodable to Claude.** Run this once in Terminal. Claude Desktop picks it up too.
   ```
   claude plugin install clodable --marketplace bworlds-co/clodable
   ```
   Already in a Claude Code session in the terminal? Type `/plugin install clodable --marketplace bworlds-co/clodable` there instead.
2. **Open an empty folder** in Claude Desktop's Code tab, and type `/clodable`.
3. **Follow the setup.** It connects GitHub, brings your app in, and adds a few plain files. Then ask for your first change.

**Leaving Lovable Cloud** (the backend Lovable manages for you) is something you do yourself, in the Clodable panel. Claude first looks at your app to see what it uses. Then each step is guided: your data, people and files go to your own Supabase, your site to Netlify, and your live app keeps running on Lovable until you switch. Developers and agencies who'd rather do it by hand can follow the `lovable-exit` skill, with a rehearsal, real sign-in tests and a rollback plan. Helping a client? Follow the [onboarding playbook](docs/ONBOARDING.md).

## For developers

```bash
pnpm install
pnpm build        # design, core, preview, CLI bundle, and the plugin's copy of it
pnpm test         # core, preview (vitest) · plus `pnpm test:plugin` for the Claude plugin
pnpm lint && pnpm typecheck
```

**Run an example app with the toolbar**, straight from source:
```bash
pnpm tsx scripts/dev-example.mts lovable-vite 5199       # or lovable-tanstack
```

**Try the whole flow without a GitHub account.** The CLI can run against a fake GitHub on your disk:
```bash
git clone --bare <some-app> /tmp/demo.git && git clone /tmp/demo.git /tmp/demo && cd /tmp/demo
export CLODABLE_FAKE_GITHUB=/tmp/demo.git
node <repo>/packages/cli/dist/clodable.mjs save -m "warmer welcome"
node <repo>/packages/cli/dist/clodable.mjs publish
```

**Use your checkout in Claude Desktop and the terminal while you work on it.** Install it once from the folder:
```bash
claude plugin install clodable --marketplace "$PWD"
```
In the terminal, Claude Code reads the plugin straight from `plugin/` here, so your edits apply at the next session or `/reload-plugins`. Claude Desktop loads the copy made at install time instead, so point that copy at your checkout once:
```bash
rm -rf ~/.claude/plugins/cache/clodable/clodable/0.1.0 && ln -s "$PWD/plugin" ~/.claude/plugins/cache/clodable/clodable/0.1.0
```
Clodable only acts in apps it set up, so your other projects are unaffected. To remove it: `claude plugin marketplace remove clodable`.

| Package | What it is |
|---|---|
| [`packages/core`](packages/core) | The vendor-neutral engine: drafts, publish, undo, checks, repo kit, inbox |
| [`packages/cli`](packages/cli) | `clodable`: pretty output for people, NDJSON (`--json`) for programs |
| [`packages/preview`](packages/preview) | The dev-only Vite plugin and preview toolbar |
| [`packages/design`](packages/design) | Tokens, icons and the logo ([brand](docs/design/BRAND.md), [UX principles](docs/design/PRINCIPLES.md)) |
| [`plugin`](plugin) | The Claude Code plugin: Publish bar, panel, guards, auto-save, and the `clodable-guide` and `lovable-exit` skills |
| [`examples`](examples) | Faithful Lovable apps, classic Vite and TanStack Start, for development |

Only `plugin/` depends on Claude. Everything else works with any agent, and any front end can drive the CLI's NDJSON events. That's how Clodable keeps its "no lock-in" promise.

## What Clodable will never do

- Push to your live branch, force-push, or merge on its own. Only your Publish click does that.
- Put backend code live before you publish.
- Change your live data without asking you first.
- Send your code or data anywhere except your own GitHub, your own Supabase and your own host.
- Ask for your secret keys in the chat.
- Send a secret key to GitHub. Every save is checked with [gitleaks](https://github.com/gitleaks/gitleaks) before it leaves your computer, and a key stops it there.
- Ship its toolbar to your visitors.
- Touch a project it wasn't set up in. Your other folders look and work exactly as before.

## Status

Clodable is **v0.1**: early, working end to end, and moving fast. The design decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). Coming next:
- a local staging database;
- a "wait for my developer" mode;
- a secure form for your production keys.

## License

[MIT](LICENSE). Clodable is not affiliated with Anthropic or Lovable.
