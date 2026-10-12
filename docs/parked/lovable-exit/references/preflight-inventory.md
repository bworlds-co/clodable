# Pre-flight: inventory, decisions, window, backups

Verified against the cited pages on 2026-10-10. Lovable's UI changes often: if a click path below doesn't match, find the current one in the docs and log the difference.

## Contents
- Work folder (outside the repo)
- 1. Stack and backend
- 2. Repo scan
- 3. Lovable UI checklist
- 4. SQL inventory (read-only, run in Lovable)
- 5. Domain and DNS
- 6. Inventory table for the log
- 7. Decisions to record
- 8. Maintenance window
- 9. Backups
- Sources

## Work folder (outside the repo)

Exports contain every user's email and password hash. Keep them, connection strings and secret files outside the repository:

```bash
umask 077
W=~/lovable-exit/<client-slug>; mkdir -p "$W"/backups "$W"/work
cat > "$W/vars.sh" <<'EOF'
W=~/lovable-exit/<client-slug>
PGBIN="$(brew --prefix postgresql@18)/bin"
B="$W/backups/<export-file>.backup"
EOF
```

Claude Code does not keep shell variables between calls. Start every command that needs them with `. ~/lovable-exit/<client-slug>/vars.sh`. Add `set -a; . "$W/staging.env"; set +a` (or `production.env`) when it needs a database URL or password. Those env files are created later (`cloud-to-supabase.md`, section 3), mode 600.

Never print these files, paste their values in chat, or copy them into the repo or the log.

## 1. Stack and backend

```bash
grep -q '"@tanstack/react-start"' package.json && echo "TanStack Start: needs a host that runs a server (SSR)" || echo "React + Vite: static SPA (dist/)"
grep -E '^(VITE_)?SUPABASE_(URL|PROJECT_ID)=' .env; grep -E '^project_id' supabase/config.toml
```

TanStack Start projects were created from May 13, 2026; older projects are React + Vite. Backend:
- **Lovable Cloud** when the project has **More → Cloud** with Database, Users, Storage, Secrets, Jobs and Edge functions, and nobody on the client side can open that project ref at supabase.com.
- **Client's own Supabase** when the backend view shows **Manage secrets** opening a Supabase dashboard the client controls. Phase 1's data move is then not needed. Still inventory it, and plan to disconnect Lovable's access (see `github.md` and `cutover-and-rollback.md`).

## 2. Repo scan

Run from the repo root and paste a summary (not secret values) into the log. `git grep` searches tracked files only, so `node_modules` and build output are skipped:

```bash
# Every hard-coded backend URL (old project ref)
git grep -noE 'https://[a-z0-9]{20}\.supabase\.co' | sort -u
# Lovable AI, connector gateway, Lovable API, Lovable packages
git grep -nE 'ai\.gateway\.lovable\.dev|connector-gateway\.lovable\.dev|api\.lovable\.dev|LOVABLE_API_KEY|Lovable-API-Key|X-Connection-Api-Key|@tanstack/ai-lovable|lovableText|createLovable'
git grep -nE 'lovable' -- package.json 'vite.config.*'
# Model IDs in use
git grep -hoE "[\"'\`](google|openai|anthropic)/[a-z0-9.-]+" | sort | uniq -c
# Edge functions and their JWT setting
ls supabase/functions 2>/dev/null; grep -nA1 '^\[functions\.' supabase/config.toml 2>/dev/null
# Secret names read by server code
git grep -hoE "Deno\.env\.get\([\"'][A-Za-z0-9_]+[\"']\)|process\.env\.[A-Za-z0-9_]+" | sort -u
# Storage buckets used in code
git grep -noE "storage[[:space:]]*\.from\([\"'][^\"']+[\"']\)" | sort -u
# Sign-in methods used in code
git grep -noE "signInWith(OAuth|Password|Otp|IdToken|SSO)|provider:[[:space:]]*[\"'][a-z_]+[\"']" | sort -u
# Migrations
ls supabase/migrations 2>/dev/null | wc -l; ls drizzle/migrations 2>/dev/null
# Lockfile (hosts need a consistent install)
ls package-lock.json bun.lock bun.lockb pnpm-lock.yaml yarn.lock 2>/dev/null
```

A Lovable gateway connector call looks like `https://connector-gateway.lovable.dev/<connector>/...` with `LOVABLE_API_KEY` plus an `X-Connection-Api-Key` header (observed in public Lovable-generated code). See `connectors.md`.

## 3. Lovable UI checklist

Record what you find for each item. Values of secrets are never visible in Lovable (write-only).

| Where (Lovable) | Record |
|---|---|
| More → Cloud → Overview → Advanced settings | Database size and storage used, **Database location** (region and PostgreSQL version), Export project data |
| More → Cloud → Users → Auth settings | Each sign-in method (Enabled/Disabled) and whether Google/Apple/Microsoft are **Managed by Lovable** or **Your own credentials**; Disable sign-up; anonymous users; Site URL and Redirect URLs |
| More → Cloud → Emails | Email domain (e.g. `notify.<domain>`), auth and app email templates |
| More → Cloud → Storage | Buckets, Private/Public, upload size limit; ignore `database_export_*` buckets |
| More → Cloud → Secrets | Secret names and badges (Lovable-managed, connector-managed, yours) |
| More → Cloud → Jobs | Each job, schedule, last run |
| More → Cloud → Edge functions | Each function |
| More → Connectors (in the project) and the workspace Connectors page | Every linked connection, type (app + chat, app user, chat/MCP), **Managed by Lovable** or own credentials |
| More → Payments (if present) | Provider (Stripe or Paddle), test/live, Stripe account claimed or not |
| More → AI | AI features and usage |
| Project → Settings → Domains | Custom domains, primary domain, status |
| Workspace settings → Workspace domains | Whether the domain was **bought through Lovable** (then Lovable runs its DNS) |
| Project settings → Git | Connected repo, synced branch, sync status |
| Publish dialog | `lovable.app` address and visibility |

## 4. SQL inventory (read-only, run in Lovable)

Run in **More → Cloud → SQL editor**. Save outputs to `$W/backups/inventory-source.txt`. Rerun the same queries on the destination later and compare. Queries that fail because a schema or extension is absent mean "not used".

```sql
-- a) Exact row counts (public, auth, storage)
select n.nspname as schema, c.relname as table_name,
  (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as exact_rows
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public','auth','storage')
order by 1, 2;

-- b) Users and password hashes: counts only, never select the hash column
select count(*) as users,
       count(*) filter (where encrypted_password is not null and encrypted_password <> '') as with_password_hash,
       count(*) filter (where email_confirmed_at is null) as unconfirmed
from auth.users;
select provider, count(*) from auth.identities group by provider order by provider;

-- c) Buckets and files
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
select bucket_id, count(*) as files, pg_size_pretty(sum((metadata->>'size')::bigint)) as size
from storage.objects group by bucket_id order by bucket_id;
select policyname, cmd from pg_policies where schemaname = 'storage' order by 1;

-- d) Scheduled jobs. Commands often embed keys: save to $W/backups only, never to the log
select jobid, jobname, schedule, active, command from cron.job order by jobid;

-- e) Extensions, realtime, outbound HTTP from the database
select extname, extversion from pg_extension order by 1;
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1, 2;
select event_object_schema, event_object_table, trigger_name from information_schema.triggers
where action_statement ilike any (array['%http_request%', '%net.http_%']);

-- f) Database code that hard-codes the project URL
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog','information_schema') and p.prosrc ilike '%.supabase.co%';

-- g) Vault secret names (values cannot move: a new project can't decrypt them)
select name, description from vault.secrets order by name;

-- h) Size and version
select pg_size_pretty(pg_database_size(current_database())) as db_size, version();
```

## 5. Domain and DNS

```bash
D=<client-domain>
dig +short NS $D; dig +short A $D; dig +short AAAA $D
dig +short A www.$D; dig +short CNAME www.$D
dig +short TXT _lovable.$D; dig +noall +answer CAA $D; dig +short MX $D; dig +short TXT $D
```

`185.158.133.1` is Lovable's hosting IP; `_lovable` TXT records (value `lovable_verify=...`) are Lovable's ownership check. Lovable's own nameservers mean the domain was bought through Lovable: see `hosting-and-domain.md` before the window, because moving DNS off Lovable takes planning. Export the full zone (or screenshot every record) into `$W/backups/`.

## 6. Inventory table for the log

Paste into `MIGRATION_LOG.md` under `## Inventory` and fill one row per item:

```markdown
| Area | Found | Source → destination | Owner of new account | Status |
|---|---|---|---|---|
| Stack | React + Vite / TanStack Start | Lovable hosting → <host> | <client> | todo |
| Backend | Lovable Cloud ref <ref>, PG <ver>, <region>, <size> | → Supabase <org>/<project> | <client> | todo |
| Auth methods | email, google (managed by Lovable), ... | → own OAuth clients | <client> | todo |
| Users | <n> users, <n> with password hash | restore + login test | | todo |
| Storage | <n> buckets, <n> files, <size> | copy files | | todo |
| Edge functions | <list>, verify_jwt=false: <list> | deploy | | todo |
| Secrets | <names only> | values from providers | <client> | todo |
| Scheduled jobs | <names, schedules> | recreate, inactive until cutover | | todo |
| Lovable AI | <n> call sites, models <list> | → <provider> | <client> | todo |
| Connectors | <list + type> | → own API keys/OAuth apps | <client> | todo |
| Payments | Stripe/Paddle via Lovable | → own keys + webhooks | <client> | todo |
| Emails | Lovable emails from notify.<domain> | → <SMTP provider> | <client> | todo |
| Domain/DNS | <registrar>, DNS at <provider>, A 185.158.133.1 | → <host> records | <client> | todo |
| Git | <repo>, synced branch main | disconnect Lovable sync | <client> | todo |
```

## 7. Decisions to record

Ask the user (and client) and log each answer:
- Destination Supabase organization owned by the client; plan; region (default: the same region as Lovable's **Database location**, for latency and data residency).
- New host (default from `hosting-and-domain.md`: one that supports the project's stack).
- AI provider and key owner (default: Gemini direct when the app uses `google/*` models, see `ai-gateway.md`).
- Email provider for auth and app emails (custom SMTP).
- OAuth credentials owner for each social login.
- DNS: who controls it, and whether to move nameservers before the window.
- Rollback deadline (for example 72 hours after DNS switch) and who decides a rollback.
- Who gives the final written sign-off.

## 8. Maintenance window

Size it from the staging rehearsal, never from guesses: time the export (request until ready), download, data restore, storage delta copy, verification, deploy, and DNS plus certificate. Window = sum of measured times plus at least 50% buffer. Constraints:
- Lovable allows **one export every 24 hours**: the final export must come at least 24 hours after the rehearsal export.
- The database must use at most 15 GB and the export file at most 5 GB. Above that, see the automation option in `cloud-to-supabase.md`.
- Lower DNS TTLs well before the window (see `hosting-and-domain.md`).
- Pick the lowest-traffic period, avoid billing runs, and start a code freeze in Lovable from the rehearsal onwards.

## 9. Backups

Take these before any change, store them in `$W/backups/`, and log what you stored (paths and checksums, not contents):

```bash
git clone --mirror <repo-url> "$W/backups/repo.git"              # full history, all branches
# Official database export: More → Cloud → Overview → Advanced settings → Export project data → Export data
#   → Database card → Export → Start export. Download from the email link or More → Cloud → Storage
#   (bucket named like database_export_<date>). Unzip if wrapped.
shasum -a 256 "$W"/backups/*.backup > "$W/backups/SHA256SUMS"
```

Also save: storage files (More → Cloud → Storage → select → Download; private files download through signed links), the SQL inventory output, cron job commands, auth settings and email templates (screenshots), connector list, DNS zone, and the current Lovable version (Lovable keeps version history, so note the version you would restore for a rollback).

## Sources
- Lovable, Deploying and hosting outside Lovable: https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- Lovable, Advanced settings (export, limits, cadence): https://docs.lovable.dev/features/advanced-settings
- Lovable, Lovable Cloud (Cloud areas, SQL editor): https://docs.lovable.dev/features/cloud
- Lovable, Secrets (write-only, reserved prefixes): https://docs.lovable.dev/features/secrets
- Lovable, Authentication (Users, Auth settings, managed providers): https://docs.lovable.dev/features/authentication
- Lovable, Storage: https://docs.lovable.dev/features/storage
- Lovable, Jobs: https://docs.lovable.dev/features/jobs
- Lovable, Custom domains (A 185.158.133.1, `_lovable` TXT, nameservers): https://docs.lovable.dev/features/custom-domain
- Lovable, App connectors (LOVABLE_API_KEY, gateway): https://docs.lovable.dev/integrations/app-connectors
- Lovable, Payments: https://docs.lovable.dev/features/payments
- Lovable, Custom emails: https://docs.lovable.dev/features/custom-emails
- Supabase, Vault (secrets can't be decrypted in a new project): https://supabase.com/docs/guides/database/vault
- PostgreSQL, pg_class (`reltuples` is an estimate; use count(*)): https://www.postgresql.org/docs/current/catalog-pg-class.html
- Connector gateway pattern in public Lovable-generated code (observed 2026-10-10, not documented by Lovable; GitHub code search, sign-in required): https://github.com/search?q=%22connector-gateway.lovable.dev%22&type=code
