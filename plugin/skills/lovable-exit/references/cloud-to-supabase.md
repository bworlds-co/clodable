# Lovable Cloud → the client's own Supabase project

Verified against the cited pages on 2026-10-10. The restore commands below were tested locally on PostgreSQL 18.6 against a simulated Supabase source and destination, not against a real Supabase project. That is one more reason to rehearse on staging first. `$W` is the work folder from `preflight-inventory.md`; `$PGBIN` is set in section 3.

## Contents
1. Official sequence and how this skill runs it
2. The export: content, format, limits
3. Tools
4. Inspect the export
5. Create the staging project
6. Structure: migrations, then drift check
7. Data: selective restore
8. Auth: providers, URLs, emails, login test
9. Storage files
10. Secrets, Edge Functions, API keys
11. Scheduled jobs and other outbound calls
12. Rewrite stored URLs of the old project
13. Verification gate
14. Production run
15. Automation option: dreamlit exporter
16. Known pitfalls
Sources

## 1. Official sequence and how this skill runs it

Lovable's "Migration sequence at a glance" has nine steps: (1) create the destination, (2) move the structure by applying the migration files in order, (3) move the data by restoring the export, which includes user accounts, (4) configure sign-in, (5) copy storage files, (6) set secrets, deploy Edge Functions and scheduled jobs, and replace app connector and AI calls, (7) point a test deployment at the new backend while leaving the Lovable project unchanged, (8) verify, (9) switch: restore the final export, update `.env` and `supabase/config.toml`, and move traffic.

This skill runs steps 1-8 against a **staging** project (sections 5-13; phases 2 and 3 of SKILL.md cover the AI and connector parts of step 6). Step 9 runs against a **production** project inside the cutover window (section 14). Because Git sync is disconnected in phase 4, `.env` and `supabase/config.toml` are updated in the repo on the migration branch, not inside Lovable.

## 2. The export: content, format, limits

- Format: "a PostgreSQL custom-format `.backup` archive with zstd compression", which may arrive wrapped in a `.zip`. It contains "schema and data, including managed schemas such as `auth`". It is not a SQL file for the SQL editor. The launch changelog (Jul 3, 2026) called it "an SQL dump", so always check the file type (section 4).
- Users: Lovable says the export "includes your users' accounts and their password hashes", so users keep their passwords. A community migration guide (v4.1.2, tested 2026-08-31) says the opposite: "the official project export does not contain user passwords in a usable form". Treat the claim as unproven until the login test in section 8 passes.
- Not included: storage files, Edge Function code (it is in the repo), secrets, sign-in provider settings, API keys.
- Limits: databases using up to 15 GB of storage, export file at most 5 GB, **one export every 24 hours**, and only while the backend runs (resume a paused project first). Available on all plans since Jul 3, 2026.
- Where: Lovable saves it into the project's own Cloud storage (bucket named like `database_export_<date>`) and emails a link. Download it before anything else: it is deleted with Cloud. The community guide reports the email can be late, so also check **More → Cloud → Storage**.
- How (Lovable-side action; confirm first, it uses the 24-hour slot): **More → Cloud → Overview → Advanced settings → Export project data → Export data → Database card → Export → Start export**.

## 3. Tools

```bash
brew install postgresql@18                     # full build with zstd; Homebrew's libpq build has no zstd
PGBIN="$(brew --prefix postgresql@18)/bin"     # always call tools through $PGBIN
"$PGBIN/pg_restore" --version                  # 17+ needed to read a PG 17/18 archive; use 18
"$PGBIN/pg_config" --configure | grep -o with-zstd || echo "STOP: this build cannot restore the export"
npx supabase --version                         # 2.115+ for `supabase db advisors`
```

On Linux, install `postgresql-client-18` from the PostgreSQL apt repository (apt.postgresql.org) and run the same checks.

Claude Code's shell cannot answer interactive prompts, so give the CLI its credentials through files instead. The CLI reads `SUPABASE_ACCESS_TOKEN` (which skips `supabase login`) and `SUPABASE_DB_PASSWORD` (which skips the password prompt of `supabase link`).
- Put the operator's personal access token (https://supabase.com/dashboard/account/tokens) in `$W/supabase.env`.
- Put each project's database password next to its URL in `$W/staging.env` and `$W/production.env`.
- All files mode 600. Load them in the same shell call as the command: `set -a; . "$W/supabase.env"; . "$W/staging.env"; set +a`.

Alternatively, the user runs `npx supabase login` in their own terminal.

## 4. Inspect the export

```bash
cd "$W/backups" && unzip -n database_export_*.zip 2>/dev/null; B="$W/backups/<file>.backup"
file "$B"     # "PostgreSQL custom database dump" = OK; "Zstandard compressed data" = run `zstd -d` first; "ASCII text" = plain SQL, restore with psql
"$PGBIN/pg_restore" --list "$B" > "$W/work/toc.full.list"
grep -E 'Compression|Dump Version|Dumped from|Dumped by' "$W/work/toc.full.list"
grep -c ' TABLE DATA ' "$W/work/toc.full.list"
# Listing works even without zstd support. Prove the data decompresses:
"$PGBIN/pg_restore" --data-only --table=<smallest_public_table> -f - "$B" | head -5
```

A build without zstd prints `cannot restore from compressed archive (this build does not support compression with zstd)` (reproduced with Homebrew's libpq 18.4). Record the source Postgres version from "Dumped from database version".

## 5. Create the staging project

1. In the client's Supabase organization: **New project**, name `<app>-staging`, region = Lovable's **Database location** region, strong database password stored in the agency password manager. The destination Postgres major version must be at least the source's.
2. Connection string: **Connect** → copy the **Session pooler** string (IPv4), or the direct string `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres` if you have IPv6. Never use the transaction pooler (port 6543) for restores. Copy it rather than composing it, because the pooler host differs by region. Percent-encode special characters in the password. Save it as `STAGING_DB_URL=...` in `$W/staging.env` (mode 600).
3. Enable the extensions the source uses (inventory query e) in **Database → Extensions**, and Database Webhooks if used.
4. Check that the role can disable triggers during the load (the restore depends on it):

```bash
set -a; . "$W/staging.env"; set +a
"$PGBIN/psql" "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -c "BEGIN; SET session_replication_role = replica; SHOW session_replication_role; ROLLBACK;"
```

## 6. Structure: migrations, then drift check

```bash
npx supabase db push --db-url "$STAGING_DB_URL" --dry-run
npx supabase db push --db-url "$STAGING_DB_URL"        # applies supabase/migrations in order and records them
```

For a Drizzle project, apply `drizzle/migrations/*.sql` with psql in the order recorded in `drizzle/migrations/meta/_journal.json`. If a migration fails, check order, dependencies and syntax, fix it on the migration branch, and log it. Never patch staging by hand only.

Drift check. Lovable's SQL editor can change the live database without a migration, so compare the archive with staging:

```bash
"$PGBIN/pg_restore" --schema-only --no-owner --no-privileges --schema=public -f "$W/work/archive-public.sql" "$B"
"$PGBIN/pg_dump" "$STAGING_DB_URL" --schema-only --no-owner --no-privileges --schema=public -f "$W/work/staging-public.sql"
F='^(--|SET |SELECT pg_catalog\.set_config|\\restrict|\\unrestrict|$)'
diff <(grep -vE "$F" "$W/work/archive-public.sql") <(grep -vE "$F" "$W/work/staging-public.sql")
grep -E '^[0-9]+; [0-9]+ [0-9]+ (TRIGGER auth|POLICY storage) ' "$W/work/toc.full.list"
```

`CREATE SCHEMA public` and `COMMENT ON SCHEMA public` on the staging side are expected noise. Any `<` line exists only in production: add it as a new migration `supabase/migrations/<YYYYMMDDHHMMSS>_lovable_drift.sql` on the migration branch and push again. Compare the triggers on `auth.users` and the storage policies with staging (`select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;` and `select policyname from pg_policies where schemaname = 'storage';`).

## 7. Data: selective restore

```bash
# Data for public tables and sequences, plus auth minus bookkeeping and short-lived session tables
grep -E '^[0-9]+; [0-9]+ [0-9]+ (TABLE DATA|SEQUENCE SET) (public|auth) ' "$W/work/toc.full.list" \
  | grep -vE ' TABLE DATA auth (schema_migrations|sessions|refresh_tokens|flow_state|one_time_tokens|audit_log_entries|mfa_amr_claims) ' \
  > "$W/work/data.list"
"$PGBIN/pg_restore" --use-list="$W/work/data.list" -f "$W/work/data.sql" "$B"
# Seed check: run inventory query (a) on staging. Public tables that already have rows were seeded by migrations.
"$PGBIN/psql" "$STAGING_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'SET session_replication_role = replica' \
  -c 'TRUNCATE public.<seeded_table_1>, public.<seeded_table_2>' \
  -f "$W/work/data.sql" > "$W/work/restore-data.log" 2>&1; echo "exit=$?"
```

Drop the `TRUNCATE` line if no table was seeded. Why this shape:
- One transaction with `ON_ERROR_STOP`: all or nothing. On error nothing is half-loaded, so you fix and rerun.
- `session_replication_role = replica` (also used in Supabase's restore guide) turns off triggers and foreign-key checks during the load. The archive orders `auth.identities` before `auth.users`, so without it the load fails on `identities_user_id_fkey` (reproduced). It also stops triggers such as `on_auth_user_created` from inserting duplicate profile rows.
- The excluded auth tables are the same bookkeeping and ephemeral tables the dreamlit exporter skips. Sessions cannot carry over anyway.
- `storage.objects` rows are excluded on purpose. Rows without files block uploads ("The resource already exists") and cannot be removed with SQL. Section 9 recreates them by uploading.
- `SEQUENCE SET` entries make new IDs continue after the restored ones.
- `unrecognized configuration parameter "transaction_timeout"` means the destination Postgres is older than the dump tool. Use Postgres 17 or newer.
- A failed `COPY auth.<table>` on a column mismatch means the Auth versions differ. Stop, log, and investigate. Never alter managed schemas by hand.
- If the TOC shows other app schemas besides `public` (not `auth`, `storage`, `extensions`, `graphql*`, `realtime`, `_realtime`, `vault`, `cron`, `net`, `pgbouncer`, `pgsodium*`, `supabase_*`, `_analytics`), handle them like `public`.

Buckets created in Lovable's Storage UI are not in migrations. Compare inventory query (c) with staging and create the missing ones (skip `database_export_*`):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('<id>', '<id>', false, null, null) on conflict (id) do nothing;
```

## 8. Auth: providers, URLs, emails, login test

Sign-in settings and API keys are not in the database. Configure them on each destination project:

1. **URL Configuration** (Authentication → URL Configuration): Site URL is the app's URL (production domain; the staging deployment URL on staging). Redirect URLs: the domain, `www`, the new host's preview URLs (`**` wildcard), and `http://localhost:<port>/**` for development. Lovable kept these up to date automatically; your own project does not.
2. **Providers** (Authentication → Sign In / Providers), for each method enabled in Lovable:
   - Email: copy confirmation, password rules, OTP and rate limits from Lovable's Auth settings.
   - Google, Apple or Microsoft **Managed by Lovable**: Lovable's OAuth client cannot move. Create the client's own credentials, for example a Google Cloud OAuth client of type "Web application" with the authorized redirect URI `https://<ref>.supabase.co/auth/v1/callback`, and a published consent screen. Register the staging and production callbacks.
   - **Your own credentials**: reuse the client ID and secret, and add the new callback URL in the provider console. Keep the old one until sign-off.
   - Phone: reuse the client's SMS provider credentials. SAML SSO: re-register the identity provider with the new project; SSO users are never auto-linked.
3. **Emails**: Supabase's default SMTP "is not meant for production use". It sends 2 messages per hour, and only to the project team's addresses. Set custom SMTP with the client's provider (https://supabase.com/dashboard/project/_/auth/smtp). It then starts at 30 emails per hour, so raise that in Auth → Rate Limits (https://supabase.com/dashboard/project/_/auth/rate-limits) before launch day or any reset campaign. Copy the templates from Lovable (**More → Cloud → Emails**) to Authentication → Email Templates. Add the provider's SPF/DKIM records to the client's DNS, and keep Lovable's `notify.<domain>` records until sign-off.
4. **Sessions do not carry over**: the new project signs tokens with its own keys, so everyone signs in again.
5. **Identity linking**: Supabase links identities with the same verified email to one user (SAML SSO users excluded). A new OAuth client may return a different provider user ID, so the login test checks each provider.

**Login test (mandatory gate before any production step).**
- Before the rehearsal export, ask the client to create a dedicated test account through the live app's normal sign-up (email and password, for example `qa+lovable-exit@<client-domain>`). Store its password in the agency password manager. Also line up one real user (usually the client) to try their own login on staging. Nobody pastes passwords into chat, files or the log.
- After the restore, compare counts with the source (never select hash values):

```sql
select count(*) as users,
       count(*) filter (where encrypted_password is not null and encrypted_password <> '') as with_password_hash
from auth.users;
select provider, count(*) from auth.identities group by provider order by provider;
```

- On the staging deployment (phase 5's temporary URL pointed at staging):
  - [ ] The test account signs in with its existing password, with no reset.
  - [ ] A real user signs in with their own password (they type it).
  - [ ] Each OAuth provider: an existing user signs in and lands on the same user id (`select id from auth.users where email = '<email>'` equals the source id).
  - [ ] After sign-out and sign-in, the user sees only their own records (RLS).
  - [ ] A password-reset email arrives through the custom SMTP, the link opens the app, and the new password works.
  - [ ] A new sign-up gets its confirmation email (if confirmation is on).
- Log `LOGIN TEST: PASS` or `LOGIN TEST: FAIL`, with the accounts and providers tested.
- If a password sign-in fails while hash counts match: stop, then check that user's `email_confirmed_at`, `banned_until`, `deleted_at`, the `email` identity row, and the restore log. If hashes are missing or unusable: tell the user, and switch to the password reset plan (`client-communication.md`) only with the client's written approval. Never set or generate passwords for users, and never print or copy hash values.

## 9. Storage files

1. Download from Lovable: **More → Cloud → Storage** → open the bucket → select → **Download** (several files come as a zip; private files download through temporary signed links). Keep the folder structure, because object paths must equal the source `storage.objects.name` values. Skip `database_export_*`.
2. Upload to staging, one bucket at a time. `storage cp` only targets the **linked** project, so confirm the link before every upload:

```bash
npx supabase link --project-ref <staging-ref>
npx supabase projects list                                   # the LINKED marker must be on staging
npx supabase storage cp -r "$W/backups/storage/<bucket>" ss:///<bucket> --experimental -j 4
npx supabase storage ls -r ss:///<bucket> --experimental | head   # paths must match the source names
```

If paths come out nested (for example `<bucket>/<bucket>/...`), delete them with the CLI or Dashboard (not SQL), adjust the source path, and upload again.

3. For many files or large buckets, use the exporter's storage copy (section 15). For a handful, use Dashboard → Storage uploads.
4. File counts per bucket on staging must equal the source (inventory query c).
5. Ownership: uploads made with a secret key have no owner. If a storage policy uses `owner` or `owner_id`, users lose access to their own files:

```sql
select policyname, qual, with_check from pg_policies
where schemaname = 'storage' and (qual ilike '%owner%' or with_check ilike '%owner%');
```

If any rows come back, restore ownership from the archive (tested locally; rehearse on staging):

```bash
grep -E '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA storage objects ' "$W/work/toc.full.list" > "$W/work/objects.list"
"$PGBIN/pg_restore" --use-list="$W/work/objects.list" -f "$W/work/objects.sql" "$B"
sed -e 's/^COPY storage\.objects /COPY migration_tmp.objects /' "$W/work/objects.sql" > "$W/work/objects_tmp.sql"
"$PGBIN/psql" "$STAGING_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'create schema migration_tmp' -c 'create table migration_tmp.objects (like storage.objects)' \
  -f "$W/work/objects_tmp.sql" \
  -c "update storage.objects o set owner = t.owner, owner_id = t.owner_id from migration_tmp.objects t where o.bucket_id = t.bucket_id and o.name = t.name and o.owner_id is distinct from t.owner_id" \
  -c 'drop schema migration_tmp cascade'
```

If the COPY fails on a column mismatch, create `migration_tmp.objects` with exactly the columns named on the `COPY` line (type `text` is fine), and cast in the update (`t.owner::uuid`).

## 10. Secrets, Edge Functions, API keys

Secrets: take the names from Lovable (**More → Cloud → Secrets**) and the code scan. Take the values from each provider's dashboard, since Lovable never shows them; rotating to fresh values is better. Skip `SUPABASE_*` (Supabase provides these, and the prefix is not allowed) and `LOVABLE_*` (replaced in phases 2-3). Connector-named variables such as `RESEND_API_KEY` may hold Lovable's opaque connection key rather than a real provider key (see `connectors.md`).

```bash
# $W/secrets.staging.env holds NAME=value lines, mode 600, never committed
npx supabase secrets set --env-file "$W/secrets.staging.env" --project-ref <staging-ref>
npx supabase secrets list --project-ref <staging-ref>       # compare names with the inventory
npx supabase functions deploy --project-ref <staging-ref>   # every function in supabase/functions
```

- Functions read new secrets immediately, with no redeploy.
- `[functions.<name>] verify_jwt = false` entries in `supabase/config.toml` apply at deploy. Keep them: webhook and cron-called functions usually need them.
- API keys: Supabase is deprecating the legacy `anon` and `service_role` keys by the end of 2026. Projects have publishable (`sb_publishable_...`) and secret (`sb_secret_...`) keys, exposed to functions as `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS` (JSON). The legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` remain only while legacy keys exist. List them with `npx supabase projects api-keys --project-ref <ref>`. Set the frontend's `VITE_SUPABASE_PUBLISHABLE_KEY` to the publishable key. A secret key is not a JWT: a function called with it needs `verify_jwt = false` and must check the key itself.
- TanStack Start server functions run on the new host, not through this command. Set their environment variables on the host.

## 11. Scheduled jobs and other outbound calls

The community guide reports that restoring `cron.job` rows fails with permission denied, and those rows would call the old project anyway. Recreate each job from inventory query (d) against the new project, and keep it inactive until cutover:

```sql
-- Staging SQL editor. Type secret values in the dashboard; never commit them.
select vault.create_secret('https://<new-ref>.supabase.co', 'project_url');
select vault.create_secret('<key the job sends>', 'cron_key');
select cron.schedule('<jobname>', '<schedule>', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/<function>',
    headers := jsonb_build_object('Content-Type', 'application/json',
               'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_key')),
    body := '{}'::jsonb);
$$);
select cron.alter_job((select jobid from cron.job where jobname = '<jobname>'), active := false);
```

- Keep each job's original headers and body. Only swap the URL and key. Jobs that only run SQL can be copied as they are.
- Vault values cannot be decrypted by a new project: recreate them.
- Database webhooks and SQL functions that call HTTP (inventory queries e and f) need the new URLs.
- Inbound webhooks (Stripe, Paddle, and others) still target the old function URLs. They switch during the cutover.
- Enable the new jobs only at cutover, after disabling the Lovable ones (**More → Cloud → Jobs → Disable**), so both copies never run. Then check the first run in `cron.job_run_details`.

## 12. Rewrite stored URLs of the old project

Public file URLs saved in rows contain the old host. Find them on staging, and again in production after the final restore:

```sql
do $$ declare r record; n bigint; begin
  for r in select table_schema, table_name, column_name from information_schema.columns
           where table_schema = 'public' and data_type in ('text','character varying','json','jsonb') loop
    execute format('select count(*) from %I.%I where %I::text like %L', r.table_schema, r.table_name, r.column_name, '%<old-ref>.supabase.co%') into n;
    if n > 0 then raise notice '%.%.% : % rows', r.table_schema, r.table_name, r.column_name, n; end if;
  end loop; end $$;
-- For each column reported (text/varchar):
update public.<table> set <col> = replace(<col>, 'https://<old-ref>.supabase.co', 'https://<new-ref>.supabase.co')
where <col> like '%<old-ref>.supabase.co%';
-- For jsonb columns: set <col> = replace(<col>::text, '<old>', '<new>')::jsonb
```

Also check `auth.users.raw_user_meta_data` (avatar URLs). Signed URLs (`/storage/v1/object/sign/...?token=`) cannot be rewritten; the app must request new ones.

## 13. Verification gate

Run on the source (Lovable SQL editor) and on staging. Every difference must be fixed or explained in the log.
- Exact row counts (inventory query a), ignoring the auth tables you excluded.
- Users, hashes and identities per provider (query b), plus the login test result.
- Buckets and files per bucket (query c), after the upload.
- RLS on every public table, with policy counts equal to the source:

```sql
select n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname = 'public'
order by c.relrowsecurity, c.relname;
```

  Any `rls_enabled = false` row fails the gate. Restored public tables get the default grants to `anon` and `authenticated`, so RLS is what protects them.
- Functions, triggers, extensions, realtime: `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';`, `select event_object_schema, event_object_table, trigger_name from information_schema.triggers where event_object_schema in ('public','auth','storage') order by 1, 2, 3;`, and query (e).
- Sequences: `select sequencename, last_value from pg_sequences where schemaname = 'public';`, plus one real insert through the app.
- Security advisors:

```bash
npx supabase db advisors --db-url "$STAGING_DB_URL" --type security --level info --fail-on error
```

  You can also use Dashboard → Advisors → Security Advisor, or the Supabase MCP `get_advisors` tool. ERROR lints such as `0013_rls_disabled_in_public`, `0007_policy_exists_rls_disabled` and `0023_sensitive_columns_exposed` block the production run. Report them to the user and the client, and fix them as separate reviewed migrations. They probably exist on Lovable today, so a fix can change app behavior: test it. Review WARN lints such as `0024_rls_policy_always_true` and `0025_public_bucket_allows_listing`. Run `--type performance` once as well.
- Functional: the app loads, records can be created and read, uploads and downloads work, Edge Functions respond, and the jobs run when activated on staging.

Log `STAGING GATE: PASS` with the numbers.

## 14. Production run

Prepare the production project before the window: sections 5 and 6, auth (8), buckets, secrets and functions (10), and jobs created inactive (11). Do this in a fresh project, because staging holds test logins and test records. Inside the window, run sections 4, 7, 9, 12 and 13 again with `PROD_DB_URL` (`$W/production.env`) and `<prod-ref>`, using the same files and commands as the rehearsal. Each production command needs its own confirmation. Link the CLI to production only for the storage upload, and check the LINKED marker first.

## 15. Automation option: dreamlit exporter

"Lovable Cloud to Supabase Exporter" by Dreamlit (https://github.com/dreamlit-ai/lovable-cloud-to-supabase-exporter). License is MIT (LICENSE file verified), last commit 2026-08-07. It moves tables, users with their password hashes, and storage files (bucket by bucket through the Storage API, with upsert). It does not move Edge Functions, secrets, auth provider settings, cron jobs, email or AI.

How it works: you deploy a temporary `migrate-helper` Edge Function into the Lovable project (ask Lovable to create it, paste the generated source, deploy). Protected by a one-time access key, the helper returns the source `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The CLI then clones the database into a **blank** target, skipping bookkeeping and ephemeral auth tables.

```bash
pnpm dlx lovable-cloud-to-supabase-exporter@latest setup edge-function    # prints the helper source and access key
pnpm dlx lovable-cloud-to-supabase-exporter@latest export run \
  --source-edge-function-url <migrate-helper URL> --source-edge-function-access-key <key> \
  --target-db-url <target direct or session-pooler URL> --target-project-url https://<ref>.supabase.co \
  --target-admin-key <target secret key> --confirm-target-blank
pnpm dlx lovable-cloud-to-supabase-exporter@latest job status --job-id <job-id>
# Variants: `db clone ...` (database only), `storage copy ...` (storage only), `export download ...` (ZIP)
```

Requirements: Node.js 22, Docker, pnpm 10 (or `npx`). Use it when the export limits block you (database over 15 GB, file over 5 GB), when there are too many storage files to move by hand, or when you need a fresh copy less than 24 hours after the last export.

Rules:
- Deploying the helper is a production change on Lovable's side, so confirm first.
- Run the CLI locally rather than the hosted service, so client data never leaves your machine.
- Target staging first.
- Afterwards, delete the helper, delete the temporary target key, and ask Lovable to rotate the Cloud database password (supported from chat since Sep 30, 2026).
- Then run sections 8-13 of this file as usual.

## 16. Known pitfalls

Community-reported unless a docs source is given:
- Homebrew's `libpq` `pg_restore` lacks zstd: use `postgresql@18` (reproduced).
- Restoring the whole archive over an initialized project floods "already exists" and "permission denied" errors. Lovable warns not to add `--clean` without reviewing it. The selective restore avoids both.
- `auth.identities` before `auth.users` breaks foreign keys without replica mode (reproduced).
- Cron rows restore with "permission denied", and copied commands keep calling the old URL ("zombie" jobs).
- `storage.objects` ghost rows block uploads, and SQL `DELETE` is blocked by a protect-delete trigger. Use the Storage API, CLI or Dashboard.
- `database_export_*` buckets hold the export: don't copy them.
- Vault values do not decrypt in a new project (Supabase docs).
- Remixing a Cloud project creates another Cloud project; it does not move you off Cloud (Lovable docs).
- Temporary helper functions come back through Git sync if they remain in the repo. Delete them everywhere.

## Sources
- Lovable, Deploying and hosting outside Lovable (9-step sequence, import notes, what migrates): https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- Lovable, Advanced settings (export content, 15 GB/5 GB/24 h, remove Cloud): https://docs.lovable.dev/features/advanced-settings
- Lovable, changelog Jul 3, 2026 (export and remove launched) and Sep 30, 2026 (rotate Cloud database password): https://docs.lovable.dev/changelog
- Lovable, Lovable Cloud FAQ (remix, no one-click migration): https://docs.lovable.dev/features/cloud
- Lovable, Secrets, Storage, Jobs, Authentication, Custom emails: https://docs.lovable.dev/features/secrets , https://docs.lovable.dev/features/storage , https://docs.lovable.dev/features/jobs , https://docs.lovable.dev/features/authentication , https://docs.lovable.dev/features/custom-emails
- Supabase, Backup and restore using the CLI (session pooler, `session_replication_role`, storage script): https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Supabase, Restore dashboard backup (expected "already exists" errors, what is not in the DB): https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore
- Supabase, Migrating auth users between projects (hashes preserved, new JWT secret forces sign-in): https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
- Supabase, Connecting to Postgres: https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase, Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls ; Google login: https://supabase.com/docs/guides/auth/social-login/auth-google ; Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp ; Identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking
- Supabase, Edge Function secrets: https://supabase.com/docs/guides/functions/secrets ; Function configuration: https://supabase.com/docs/guides/functions/function-configuration ; API keys: https://supabase.com/docs/guides/api/api-keys
- Supabase, Cron: https://supabase.com/docs/guides/cron ; Scheduling functions with Vault: https://supabase.com/docs/guides/functions/schedule-functions ; Vault: https://supabase.com/docs/guides/database/vault
- Supabase, Advisors: https://supabase.com/docs/guides/observability/advisors ; Splinter lints: https://github.com/supabase/splinter ; CLI reference: https://supabase.com/docs/reference/cli/introduction
- PostgreSQL, pg_restore (`--list`, `--use-list`, selective restore): https://www.postgresql.org/docs/current/app-pgrestore.html ; pg_dump (zstd): https://www.postgresql.org/docs/current/app-pgdump.html ; PG 16 release notes (zstd added): https://www.postgresql.org/docs/16/release-16.html
- Community guide disputing the password claim (MIT, v4.1.2): https://github.com/CarolMonroe22/lovable-cloud-to-supabase-migration
- Dreamlit exporter: https://github.com/dreamlit-ai/lovable-cloud-to-supabase-exporter and https://dreamlit.ai/tools/lovable-cloud-to-supabase-exporter
