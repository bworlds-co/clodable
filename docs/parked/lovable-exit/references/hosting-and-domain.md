# Hosting and custom domain (always last)

Verified on 2026-10-10. Commands marked "composed" are ours, not from a provider's docs.

## Contents
- Principles
- 1. Deploy on the new host
- 2. Verify on the temporary URL
- 3. Prepare DNS (days before the window)
- 4. Switch DNS and watch SSL (in the window)
- 5. Redirects and the lovable.app address
- 6. SEO
- Sources

## Principles

- Order: deploy, then test on the host's temporary URL, then move DNS. Lovable says to "Deploy to a temporary URL on the new host first, and check it against the app running on Lovable".
- Keep Lovable hosting live until the new site is verified and the client signs off. The `lovable.app` address "keeps serving the version you last published there". The domain stays connected in Lovable during the rollback window, so a rollback is only a DNS change.
- Never put production keys in preview deployments: previews use the staging Supabase project.

## 1. Deploy on the new host

Connect the repository and deploy the migration branch first. Production deploys from `main` after the merge.

**React + Vite (static SPA).** Build command `npm run build`, output `dist`, Node 22. Keep the install command consistent with the lockfile: with only `bun.lock`, use Bun, or commit a `package-lock.json` first. Add a fallback so every route serves `index.html` with status 200:

Vercel, `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
Netlify, `netlify.toml`:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
Cloudflare Workers static assets, `wrangler.jsonc`:
```jsonc
{ "name": "<app>", "compatibility_date": "<today>",
  "assets": { "directory": "./dist/", "not_found_handling": "single-page-application" } }
```

Cloudflare Pages treats a project without a top-level `404.html` as a single-page app. For Nginx, see Lovable's `try_files $uri $uri/ /index.html;` example.

**TanStack Start (server).** The host must run the server part. A static-only host breaks SSR, server functions and API routes.
- `package.json` must list `nitro`.
- On Vercel, Netlify and Cloudflare Pages, Nitro detects the platform: build with `npm run build` on Node 22. Netlify and Cloudflare Pages need the output directory set to `dist`; Vercel needs none.
- For a container or VM: `NITRO_PRESET=node-server npm run build`, then `node .output/server/index.mjs`, which listens on port 3000 (`PORT` and `HOST` change it).
- Older build configurations can skip Nitro or write elsewhere. Verify the generated server entry point.

**Environment variables.** These are the repo's `.env` names, with the new project's values:
- Browser: `VITE_SUPABASE_URL=https://<ref>.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>`, `VITE_SUPABASE_PROJECT_ID=<ref>`.
- TanStack Start server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, plus every server secret (AI and connector keys) as server-only variables.
- `VITE_*` values are "statically replaced at build time". Rebuild after any change: Vercel applies environment changes "only to new deployments", and Cloudflare Workers build variables are not available at runtime.
- Variables set on the host "have the highest priority and will not be overwritten by .env files". So set production variables to the production project and preview variables to staging.
- At the switch, update the repo's `.env` and the `project_id` in `supabase/config.toml` to production on the migration branch (Lovable's step 9). `.env` holds only public values.

## 2. Verify on the temporary URL

Lovable's checks plus ours, each logged with pass or fail:
- [ ] Open a nested route directly and refresh. A 404 means a missing fallback (Vite) or a server that isn't running (TanStack Start).
- [ ] Sign in and out. A redirect error means the URL is missing from Supabase's Redirect URLs.
- [ ] Run the reads, writes and uploads the app depends on.
- [ ] TanStack Start: view the source of a server-rendered page (real content, not an empty shell) and trigger a server function.
- [ ] Exercise each AI feature, connector, payment flow (test mode) and email.
- [ ] In the browser DevTools Network tab, nothing calls `lovable.app`, `lovable.dev` gateways, or `<old-ref>.supabase.co`.
- [ ] `robots.txt`, `sitemap.xml`, the favicon and Open Graph images return 200.

## 3. Prepare DNS (days before the window)

- Export or screenshot the whole zone into `$W/backups/`.
- Lower the TTL of the records you will change (apex `A`, `www`) to 300 seconds or less. Do it at least one old-TTL period before the window; Google suggests "at least a week in advance" for a host move. Vercel suggests a short TTL, for example 60 seconds, "so you can quickly roll back".
- **CAA**: if any exist, they must allow the new host's certificate authority (for example `0 issue "letsencrypt.org"`). Keep the authorities Lovable needs (`pki.goog`, `letsencrypt.org`, `ssl.com`) until sign-off, for rollback.
- **AAAA**: Lovable requires none. Remove stale ones that would send IPv6 visitors elsewhere. Netlify's load balancer does not support IPv6.
- Add the domain to the new host project in advance; it shows as misconfigured until DNS moves. On Vercel you can pre-issue the certificate with a TXT challenge, and test before switching:

```bash
vercel certs issue <domain> www.<domain> --challenge-only     # then add the TXT records it prints
curl -sI https://<domain> --resolve <domain>:443:<new-host-ip>
```

- On Netlify, with external DNS, there is no documented way to issue the certificate before DNS points at Netlify. Expect a short HTTPS gap and schedule it inside the window.
- **Domain bought through Lovable**: its DNS runs on Lovable's nameservers, and Lovable's auto-created records can't be edited. Well before the window (48 hours or more), move DNS to a provider the client controls:
  1. Recreate **every** record there first: Lovable's `A 185.158.133.1`, the `_lovable` TXT records, `www`, MX, and the email SPF/DKIM/DMARC and verification TXT records.
  2. Then, in Lovable: **Workspace settings → Workspace domains → Configure** → **Nameservers** → **Edit** (at least two nameservers). Lovable warns: "Connected sites and email break until you recreate the records."
  3. Transferring the registration out (**Configure → ⋮ → Transfer out → Transfer lock off → Reveal authorization code**) is irreversible from Lovable's side and blocked for 60 days after registration. Lovable disconnects the domain from projects when the transfer completes, so do it only after sign-off.

## 4. Switch DNS and watch SSL (in the window)

Use the values shown in the new host's domain screen; it is the source of truth.

| Host | Apex | `www` | Certificate |
|---|---|---|---|
| Vercel | `A` to the IP on the domain card (often `76.76.21.21`) | project-specific `CNAME` | Let's Encrypt, HTTP-01, "typically ... within a few minutes" of verification, or pre-issued |
| Netlify | `ALIAS`/`ANAME` to `apex-loadbalancer.netlify.com`, or `A 75.2.60.5` | `CNAME` to `<site>.netlify.app` | Let's Encrypt once DNS points at Netlify; retries every 10 minutes for 24 hours, then hourly for two days |
| Cloudflare (Workers/Pages) | apex needs an active Cloudflare zone; adding the custom domain creates the records | custom domain, or proxied record | DCV by TXT, automatic; "within 15 minutes to 24 hours" |

- Delete Lovable's `www` A record before adding the new `www` CNAME.
- Keep the `_lovable` TXT records until sign-off; they are harmless and help a rollback.
- Lovable then shows the domain as **Connection issue**. Leave it connected until sign-off.

Watch the switch (composed commands):

```bash
for r in 1.1.1.1 8.8.8.8 9.9.9.9; do dig +short @$r A <domain>; done
curl -sI https://<domain>/ | head -5; curl -sI https://<domain>/<nested/route> | head -3
echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null | openssl x509 -noout -issuer -dates -ext subjectAltName
```

## 5. Redirects and the lovable.app address

- Keep the same canonical host as on Lovable. Lovable's default is the root domain as primary, with `www` redirecting to it.
- On the new host:
  - Vercel: the domain's **Redirect to** setting, or `vercel.json` redirects (`"permanent": true` gives 308).
  - Netlify: with the apex as primary domain, `www` redirects automatically.
  - Cloudflare: a Redirect Rule from `https://www.*` to `https://${1}` with status 301 (`www` needs a proxied DNS record).
- Keep every URL path identical. If a path must change, add a 301 for it.
- `<project>.lovable.app` can't be removed. While a custom domain stays primary in Lovable, the `lovable.app` address redirects to it with a 302. Check after the switch with `curl -sI https://<project>.lovable.app`. Anything still served there talks to the **old** backend, so it must redirect or show a maintenance page. Unpublish it after sign-off (**Project settings → Unpublish project → Unpublish**).
- Move any webhook or OAuth callback that used a `lovable.app` URL to the new domain. For example, TanStack Start payment webhooks use `https://<project>.lovable.app/api/public/payments/webhook`.

## 6. SEO

- **TanStack Start**: SSR continues on any host that runs the server output. Check with `curl -s https://<domain>/<page> | grep -i '<title>'`.
- **React + Vite**: Lovable hosting serves "on-request pre-rendering ... only to verified search and AI crawlers". A plain static host does not. That loss is our inference, since Lovable doesn't state it. Google renders JavaScript, but social-preview bots "often do not execute client-side JavaScript". Google says server-side rendering or prerendering "is still a great idea", and calls dynamic rendering "a workaround and not a recommended solution". Decide with the client, and log it:
  1. Upgrade to TanStack Start inside Lovable **before** the code freeze (chat `/` → **Migrate to TanStack Start**; uses credits; full re-test), then host it as TanStack Start.
  2. Prerender public routes at build time: `vite-prerender-plugin` (released 2026-09-26) or `vite-react-ssg` (needs data routes), or React Router v7 framework mode with `prerender`. Avoid `react-snap` (last release 2018) and `vite-plugin-prerender` (repository gone).
  3. Accept client-side rendering when the app sits behind a login and search doesn't matter.
- **Same domain, same URLs**: Google's guide for hosting moves without URL changes applies, and the Change of Address tool doesn't. Make sure Search Console verification still works (DNS TXT survives; an HTML file or meta tag must exist on the new host). Resubmit the sitemap, and watch the Pages report for 2 to 4 weeks.
- **Domain changes** (for example the app was only on `lovable.app`): follow Google's site move with URL changes: 301/308 redirects kept "generally at least 1 year", Change of Address, and a new sitemap. Lovable can only send 302s from `lovable.app`.
- Check: no `noindex`, `robots.txt` allows crawling, canonical tags and sitemap URLs use the custom domain (not `lovable.app`), and Open Graph tags are present.

## Sources
- Lovable, Deploying and hosting outside Lovable (both stacks, env vars, SPA routing, Nitro, verify before switching, complete a move): https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- Lovable, Custom domains (A/TXT records, CAA, AAAA, nameservers, transfer out, disconnect, 302 from lovable.app, no 301 between domains): https://docs.lovable.dev/features/custom-domain ; Launch on a custom domain: https://docs.lovable.dev/tips-tricks/launch-on-a-custom-domain
- Lovable, Publish and unpublish: https://docs.lovable.dev/features/publish
- Lovable, SEO and AI search (on-request pre-rendering, TanStack Start SSR): https://docs.lovable.dev/features/seo-aeo ; Upgrade to TanStack Start: https://docs.lovable.dev/features/upgrade-to-tanstack-start
- Lovable, Payments (webhook URLs on lovable.app): https://docs.lovable.dev/features/payments
- Vite, env and modes: https://vite.dev/guide/env-and-mode
- Vercel: Vite SPA rewrites https://vercel.com/docs/frameworks/frontend/vite ; env vars https://vercel.com/docs/environment-variables ; A record and CAA https://vercel.com/kb/guide/a-record-and-caa-with-vercel ; SSL https://vercel.com/docs/domains/working-with-ssl ; pre-generating certificates https://vercel.com/docs/domains/pre-generating-ssl-certs ; zero-downtime migration https://vercel.com/kb/guide/zero-downtime-migration ; redirects https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
- Netlify: rewrites https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/ ; external DNS https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/ ; HTTPS https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/ ; SSL troubleshooting https://docs.netlify.com/manage/domains/troubleshooting/troubleshoot-ssl-and-https/ ; multiple domains https://docs.netlify.com/manage/domains/manage-domains/manage-multiple-domains/
- Cloudflare: Workers SPA https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/ ; Workers custom domains https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ ; Pages serving https://developers.cloudflare.com/pages/configuration/serving-pages/ ; Pages custom domains https://developers.cloudflare.com/pages/configuration/custom-domains/ ; Universal SSL https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/enable-universal-ssl/ ; www redirect rule https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/
- Let's Encrypt, CAA: https://letsencrypt.org/docs/caa/ ; challenge types: https://letsencrypt.org/docs/challenge-types/
- Google Search Central: JavaScript SEO basics https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics ; dynamic rendering https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering ; hosting move without URL changes https://developers.google.com/search/docs/crawling-indexing/site-move-no-url-changes ; site move with URL changes https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes ; redirects https://developers.google.com/search/docs/crawling-indexing/301-redirects
- React Router prerendering: https://reactrouter.com/7.18.4/how-to/pre-rendering ; TanStack Start static prerendering: https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering
