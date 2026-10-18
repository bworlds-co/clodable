# Parked

Work kept for later, not shipped in the plugin.

## `lovable-exit/` (parked 2026-10-13)

A by-hand playbook for developers and agencies moving a client's app off Lovable: a rehearsal on a staging project, a real sign-in test, a cutover checklist, a rollback plan and a `MIGRATION_LOG.md`. It was written from real client moves and checked against Lovable's docs on 2026-10-10, but it never ran as a skill.

It's parked until the Cloclod panel's move (the `cloclod-move` skill, the only path offered) supports what it covers: a host other than Netlify, moving into an existing Supabase project, an email provider other than Resend, a way back after going live, a staging rehearsal with a sign-off log, a new key for scheduled jobs that call the app, new signed links, and sign-in providers beyond Google. Use its `references/` as research when building those. See [DECISIONS.md](../DECISIONS.md), Q5e.
