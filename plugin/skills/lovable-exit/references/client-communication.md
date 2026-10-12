# Client communication templates

Plain-language templates for a non-technical client. Fill every `<placeholder>`, delete the bracketed lines that don't apply, and keep each message short. Get the client's written approval of the pre-migration notice before you book the window, and log that approval in `MIGRATION_LOG.md`.

## Contents
- Pre-migration notice (to the client)
- Announcement for the app's users (optional)
- Password reset variant (only if the login test failed)
- Handback note (after sign-off)

## Pre-migration notice (to the client)

Subject: Moving <App> to accounts you own on <date>

Hi <name>,

Here is what will happen when we move <App> off Lovable.

**What we are doing.** Today Lovable runs <App> for you: the database, user logins, uploaded files, AI features and the website. We are moving each part into accounts that you own. The database, logins and files go to Supabase. The AI features will use your own <AI provider> account. The website moves to <host>. The app will look and work the same.

**When.** <date>, from <start> to <end> (<timezone>). We picked this time because it is your quietest period.

**What your users will notice.**
- During that window the app shows a maintenance page. Nobody can sign in or save anything. We expect about <N> minutes of downtime, and at most <M>.
- After the move, **everyone has to sign in again once**. Passwords stay the same.
- [If users sign in with Google, Apple or Microsoft: they click the same button again. The sign-in screen may show your app's name instead of Lovable's.]
- [If users connected their own Google/Notion/other account inside the app: they will be asked to reconnect it once.]
- The web address stays <domain>. [Links to <x>.lovable.app will forward to <domain>, then stop working after <date>.]

**What we need from you.**
1. Reply "approved" to this message and the date.
2. Create or confirm these accounts in your company's name, then invite us (<agency email>): Supabase, <host>, <AI provider>, <email provider>[, Google Cloud / Apple Developer for sign-in][, your domain registrar or DNS provider]. Billing goes on your card.
3. Do not change the app in Lovable from <freeze date> until we confirm we are done. Changes made there would be lost.
4. Tell us about anything planned for that day (a launch, a newsletter, a payment run).

**Safety net.** We back up everything first. Nothing on Lovable is deleted until you confirm in writing that everything works. If something goes wrong, we switch back to Lovable.

**Costs.** After the move you pay Supabase, <host> and <AI provider> directly, roughly <estimate> per month. Lovable keeps charging until you cancel or downgrade your plan, which we will do together after you sign off.

Questions? Reply here or call <phone>.

<signature>

## Announcement for the app's users (optional)

Send by email or show as a banner 3 to 7 days before, and again on the day.

> On <date>, between <start> and <end> (<timezone>), <App> will be unavailable for a short while as we move it to a new home. Afterwards, please sign in again with your usual email and password. Nothing else changes. [If you use "Continue with Google", just click it again.] Questions: <support contact>.

## Password reset variant (only if the login test failed)

Use this only when the staging login test proved that existing passwords do not work after the restore, and the client has approved resets. Replace the "Passwords stay the same" line in both messages with:

> After the move, everyone will receive an email titled "<subject>" to choose a new password. The link is valid for <validity>. If you don't see it, check your spam folder or use "Forgot password" on the sign-in page.

Sending a reset email to every user requires working email delivery on the new backend (custom SMTP). Test it on staging with your own address first.

## Handback note (after sign-off)

Subject: <App> now runs on your own accounts

Hi <name>,

The move is finished. <App> has run on your own accounts since <date and time>.

**Where things live now**

| Part of the app | Service | Account owner | Approx. monthly cost |
|---|---|---|---|
| Database, logins, files | Supabase project "<name>" (<region>) | <client org> | <amount> |
| Website | <host> project "<name>" | <client> | <amount> |
| AI features | <AI provider> | <client> | usage based, alert at <amount> |
| Emails (sign-up, password reset[, app emails]) | <email provider>, from <address> | <client> | <amount> |
| Domain <domain> | DNS at <provider>[, registered at <registrar>] | <client> | <amount> |
| [Payments] | [Stripe/Paddle account] | <client> | provider fees |
| [Other integrations] | <list> | <client> | <amount> |

**What stayed the same.** Your users, their passwords, your data and your files. Everyone had to sign in once again.

**What we switched off on Lovable** (after your written sign-off on <date>): <for example: the <x>.lovable.app address, Lovable Cloud, the GitHub connection>. We kept the Lovable project itself as a read-only archive. [Your Lovable subscription: <cancelled / downgraded / still active, your call>.]

**If something breaks.** Contact <agency> at <contact>. Supabase keeps backups of your database (<backup policy of the plan>), and we keep the migration backups until <date>, then delete them.

**Making changes from now on.** Changes are made in your code repository (<repo>) with Claude Code, reviewed, then published automatically by <host> when merged. Lovable is no longer connected to the code.

<signature>
