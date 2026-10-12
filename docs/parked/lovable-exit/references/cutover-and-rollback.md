# Cutover runbook, rollback plan, decommissioning

Every step marked [confirm] changes production: show the exact action, its effect and its undo, wait for an explicit yes, then log it. Lovable's rule for the final copy: "pause writes from users, scheduled jobs, webhooks, and other integrations, request the final export ... copy any storage files changed since your last copy, restore, and then switch."

## Contents
- Go/no-go 1: preconditions
- T-7 to T-1 days
- T-0: the window
- After the switch: monitoring
- Rollback plan
- Sign-off and decommissioning Lovable
- Sources

## Go/no-go 1: preconditions

All must be true and logged before the window starts:
- [ ] `STAGING GATE: PASS` and `LOGIN TEST: PASS` are in the log (`cloud-to-supabase.md`, sections 8 and 13).
- [ ] AI and connectors are replaced and tested on staging; `git grep` finds no Lovable gateway calls.
- [ ] The new host passed every check on its temporary URL against staging (`hosting-and-domain.md`, section 2).
- [ ] The production Supabase project is prepared:
  - migrations and the drift migration pushed;
  - buckets created;
  - auth providers, Redirect URLs (including the host's production URL), custom SMTP, templates and rate limits set;
  - secrets set and functions deployed;
  - cron jobs created **inactive**;
  - advisors clean.
- [ ] The production deployment on the new host is built with production variables and reachable on the host's own URL; the domain is not switched yet.
- [ ] Production storage pre-copied (T-1), so the window only moves the delta.
- [ ] Rehearsal timings are recorded and the window sized from them. The client approved the notice and end users were told.
- [ ] DNS TTL lowered at least one old-TTL period ago. If the domain was bought through Lovable, its nameservers are already moved.
- [ ] The last Lovable export is more than 24 hours old.
- [ ] Git sync is disconnected and `main` protected (`github.md`).
- [ ] Rollback owner, triggers and deadline (for example 72 hours after the DNS switch) are agreed. The current Lovable version is noted for restore.

## T-7 to T-1 days

- Remind end users (email or banner) at T-7 and on the day.
- T-1: download all storage files from Lovable again and upload them to production (`cloud-to-supabase.md`, section 9). Link the CLI to production for this only, after checking the LINKED marker. Record the time **the download started** as `T_storage`.
- T-1: rehearse the write freeze on **staging**: generator, revoke, re-grant, then compare the grants before and after. In Lovable's SQL editor, run only the read-only generator for now.
- T-1: prepare the provider webhook endpoints for the new backend (created, but not receiving live traffic yet), and list the old endpoint IDs.

**Write freeze (old backend).** Open tabs keep calling the old Supabase API whatever DNS says, so freeze at the database.

Step 1, in Lovable's SQL editor (read-only): generate the re-grant script and save the output as `$W/backups/regrant.sql`. Run it again right before the revoke, and keep that newer version.

```sql
select format('grant %s on %I.%I to %I;', privilege_type, table_schema, table_name, grantee)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE');
```

Step 2, in the window [confirm]: revoke writes.

```sql
revoke insert, update, delete on all tables in schema public from anon, authenticated;
```

Re-granting from `regrant.sql` (never a blanket `grant ... on all tables`) restores exactly the previous privileges.

## T-0: the window

1. Tell the client the window has started. Log the start time.
2. [confirm] **Lovable: maintenance page.** In the Lovable editor (sync is disconnected, so this stays in Lovable), ask: "Replace every page with a full-page maintenance message: <text>. Do not change the backend." Check the preview, then **Publish → Publish changes**.
3. [confirm] **Lovable: stop background writers.**
   - **More → Cloud → Users → Auth settings → Disable sign-up**.
   - **More → Cloud → Jobs → Disable** each job.
   - Run the write freeze.
4. [confirm] **Final export**: Advanced settings → Export project data → Database → Export → Start export. Then download it, take a checksum, and inspect it (`cloud-to-supabase.md`, section 4). Log the export start time as `T_export`.
5. [confirm] **Restore into production**, each command confirmed:
   - data (`cloud-to-supabase.md`, section 7, with `PROD_DB_URL`);
   - storage delta: download and upload the files changed on the old backend since `T_storage` (first query below). Then compare the full object lists on both sides (second query, run on each) to catch deletions, and remove those through the Storage API, CLI or Dashboard;
   - the ownership fix if needed (`cloud-to-supabase.md`, section 9);
   - URL rewrite (`cloud-to-supabase.md`, section 12).

   ```sql
   select bucket_id, name, updated_at from storage.objects where updated_at > '<T_storage>' order by 1, 2;
   select bucket_id, name from storage.objects where bucket_id not like 'database_export%' order by 1, 2;
   ```

6. **Verify production** (`cloud-to-supabase.md`, section 13): exact counts must now equal the frozen old backend, RLS, advisors. Tables written by webhook functions, which use the service role and are not frozen, may differ; explain them in the log, because step 7 replays those events. Run the login test on the host's production URL (test account, one real user, each OAuth provider). Any failure: stop and decide go or rollback.
7. [confirm] **Turn on the new background work**:
   - activate the cron jobs (`select cron.alter_job(<jobid>, active := true);`);
   - point the provider webhooks at the new endpoints and disable the old ones;
   - resend the events received since `T_export` from the provider's event log (the handlers are idempotent).
8. **Go/no-go 2** with the client: data, login and payments verified.
9. [confirm] **Switch DNS** (`hosting-and-domain.md`, section 4). Watch propagation and the certificate, then rerun the `hosting-and-domain.md` section 2 checks on the custom domain.
10. Check `https://<project>.lovable.app` redirects to the domain or shows the maintenance page.
11. Announce that the app is back. Log the go-live time as `T_live`.

## After the switch: monitoring

- First 2 hours, actively watch:
  - Supabase logs (API, Auth, Edge Functions);
  - host deploy and runtime logs;
  - the AI provider's usage;
  - webhook deliveries;
  - email delivery (reset and confirmation);
  - support messages.
- For the next 72 hours (or until the rollback deadline), do a daily check of the same items, plus Security Advisor and errors.
- Keep Lovable as it is: maintenance page, writes frozen, Cloud intact, domain connected. That is what makes rollback possible.

## Rollback plan

**Triggers** (agreed in advance): real users can't sign in; data is missing or mismatched; payments fail; a critical feature is broken and not fixable within <N> minutes; or the client asks. The rollback owner decides and logs it.

**Before the DNS switch (cheap)**:
1. [confirm] In Lovable's SQL editor, run `$W/backups/regrant.sql`. Re-enable sign-up and each job.
2. [confirm] Restore the noted Lovable version from version history and **Publish**.
3. [confirm] Re-enable the old webhooks and disable the new ones. Disable the new cron jobs.
4. Leave the production Supabase project unused. Log the cause, and plan a new window (at least 24 hours later, because of the export cadence).

**After the DNS switch, before the rollback deadline**:
1. [confirm] Freeze the new backend: a maintenance page on the new host, and a write freeze in production (same two scripts, run against `PROD_DB_URL`).
2. List what changed since `T_live` in production: rows with newer `created_at`/`updated_at`, new `auth.users` (`created_at > T_live`), new storage objects. Export them to `$W/backups/rollback-delta/`.
3. [confirm] Point DNS back to Lovable: apex `A 185.158.133.1` and the old `www` record, using values from the zone backup. The `_lovable` TXT records were kept. Wait for Lovable's domain status to return to **Live**.
4. [confirm] In Lovable: run `regrant.sql`, re-enable sign-up and jobs, restore the noted version and Publish, and re-enable the old webhooks. Disable the new cron jobs and webhooks.
5. [confirm] Copy the delta back into Lovable Cloud through its SQL editor or CSV import, one table at a time. Users who signed up after `T_live` must sign up again: tell them.
6. Log, write a short post-mortem for the client, and plan a new window.

**After the deadline**: roll forward. Fix on the new stack, because reconciling the delta becomes riskier than the fix.

## Sign-off and decommissioning Lovable

Start only after the client's **written** sign-off is recorded in the log (who, when, where). One [confirm] per step, in this order:
1. The final export (checksum) and the storage files are stored where the client wants them, with a retention period the client approved.
2. Built-in payments, if used: **Payments → ⋮ → Disconnect payments** (type `DISCONNECT`). This deletes Lovable's keys and webhook secrets and attempts to delete Lovable's webhooks. The provider account and subscriptions are untouched.
3. Unpublish the `lovable.app` address: **More → Settings → General → Unpublish project → Unpublish**.
4. Disconnect the domain from the project: **Project → Settings → Domains → ⋮ → Disconnect → Disconnect**. For a domain bought through Lovable, DNS must already be off Lovable's nameservers; transferring the registration out is optional and irreversible.
5. Optional cooling period: **Pause Cloud**, which is reversible. Storage is still billed while paused.
6. **Remove Lovable Cloud**: Advanced settings → **Remove Lovable Cloud → Remove**, check both boxes, type the project name, then **Remove**. This permanently deletes the database, storage, auth, functions and any exports saved in Cloud storage.
7. Unlink or delete connections that only served this project (**Connectors → connection → Linked projects → Unlink projects**, or **Delete this connection** when nothing else uses it).
8. Remove Lovable's DNS records: the `_lovable` TXT records, Lovable's email-sending records (for example on `notify.<domain>`), and CAA entries only Lovable needed.
9. Remove old OAuth redirect URIs (the old Supabase ref, Lovable's gateway callback).
10. Rotate provider keys that were stored in Lovable, and the Supabase database password if it ever appeared in a chat or file.
11. The Lovable subscription is the client's decision: Lovable says it continues "until you change" it.
12. Keep the Lovable project as a read-only archive. Do not delete it.
13. After the retention period, delete `$W` (exports with password hashes, env files) and log the deletion.
14. Send the handback note (`client-communication.md`).

## Sources
- Lovable, Complete a move away from Lovable (final copy, 24-hour cadence, switch traffic, retire services): https://docs.lovable.dev/tips-tricks/external-deployment-hosting#complete-a-move-away-from-lovable
- Lovable, Advanced settings (export, pause, remove Cloud): https://docs.lovable.dev/features/advanced-settings
- Lovable, Authentication (Disable sign-up): https://docs.lovable.dev/features/authentication ; Jobs (Enable/Disable): https://docs.lovable.dev/features/jobs
- Lovable, Publish (unpublish, publish changes): https://docs.lovable.dev/features/publish ; Custom domains (disconnect, transfer out, 185.158.133.1): https://docs.lovable.dev/features/custom-domain
- Lovable, Payments (disconnect effects): https://docs.lovable.dev/features/payments ; App connectors (unlink, delete): https://docs.lovable.dev/integrations/app-connectors
- Lovable, changelog (upgrade path, version history and revert): https://docs.lovable.dev/changelog
- Supabase, Cron (`cron.alter_job`, `cron.job_run_details`): https://supabase.com/docs/guides/cron
- PostgreSQL, GRANT/REVOKE and `information_schema.role_table_grants`: https://www.postgresql.org/docs/current/sql-revoke.html , https://www.postgresql.org/docs/current/infoschema-role-table-grants.html
