# Security

Cloclod works with people's live apps and live data, so we take reports seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub's "Report a vulnerability" (Security tab), with:
- the steps to reproduce it;
- the affected version;
- the impact.

We aim to reply within 3 working days.

## How Cloclod is built to be safe

- **The preview toolbar** exists only on the local dev server. Its endpoints answer only this computer (never the rest of the network, even when the app does), need a per-session token (handed to the toolbar's code alone: never on `window`, and its script isn't served to the page's own `fetch`), refuse other origins, and only write to files inside the project that the tagger saw. It never ships in a production build.
- **The Claude plugin** guards:
  - Claude can't push, force-push, merge or publish.
  - Edge-function deploys are refused outside Publish.
  - Writes to the live database always ask the builder first, and irreversible ones are called out.
- **Publish checks:**
  - the app must build;
  - no critical vulnerable production packages;
  - no exposed secret keys (Stripe live keys, Supabase `service_role` JWTs, private keys, AWS and GitHub tokens, and so on).
- **No Cloclod server:** code and data go only to the builder's own GitHub, Supabase and host.
