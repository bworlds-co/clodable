# GitHub: stop Lovable from pushing to the repository

Verified on 2026-10-10.

## Contents
- How Lovable's sync behaves
- Before disconnecting
- Disconnect (exact UI path)
- Second layer: protect the default branch
- Third layer: remove the Lovable GitHub App's access
- Verify
- Keep the Lovable project as a read-only archive
- If the app uses the client's own Supabase
- Sources

## How Lovable's sync behaves

- Git sync is two-way on **one branch at a time**, by default the repository's default branch (usually `main`). Commits pushed to that branch flow into Lovable; Lovable's edits are pushed back to it.
- Lovable's commits are authored by `lovable-dev[bot]`, which appears as `gpt-engineer-app[bot]` in raw `git log`.
- When the provider rejects a push to a protected branch, Lovable pushes to a `lovable-sync` branch instead.
- Disconnecting stops the sync and changes nothing else. "Your repository stays on GitHub" with all history, and "Your project and its code stay in Lovable".
- **Disconnecting cannot be undone for this repository.** If the project is reconnected, "Lovable creates a new repository with the current version of your project", and the original repository is no longer linked.

## Before disconnecting

- [ ] All migration work lives on a separate branch (for example `lovable-exit`) that Lovable does not sync, and nothing from it is merged into the synced branch yet. Otherwise Lovable would pull code that needs secrets Lovable doesn't have.
- [ ] The client has stopped editing in Lovable (code freeze). Check `git log origin/main` for recent `lovable-dev[bot]` / `gpt-engineer-app[bot]` commits and the sync status card in **Project settings → Git**.
- [ ] The Lovable-published version and Lovable Cloud stay untouched. They are the rollback target and need no Git sync.
- [ ] You know who can disconnect: workspace or project **admins and owners**.
- [ ] Explicit confirmation obtained. Log: "Git sync disconnect is permanent for this repo".

## Disconnect (exact UI path)

Use the project-level disconnect. Lovable keeps the workspace connection, so the agency's other Lovable projects keep syncing.

1. Open the project's GitHub settings: **More → Settings → Git → GitHub**. Alternatively, open the **Chat actions** menu (the **+** button next to the chat input) and choose **Project → GitHub**.
2. In the active repository connection, open the dropdown and select **Disconnect**.
3. Type the requested confirmation text, then click **Disconnect**.

Workspace owners and admins can also unlink from **Workspace settings → Git → GitHub** → the connection → **Linked projects** → select the project → **Unlink 1 project** → **Unlink**. Do **not** use **Delete this connection** there: that "removes the connection for all projects".

## Second layer: protect the default branch

Even after the disconnect, block direct pushes to `main` so only reviewed pull requests reach production:
- In GitHub, open the repository's **Settings**. In the left sidebar, under **Code, planning, and automation**, open **Rulesets**, then **New ruleset → New branch ruleset**. Name it, set enforcement to **Active**, add the default branch as a target, and enable **Require a pull request before merging** and **Block force pushes**.
- Add the agency's deploy automation to the bypass list only if it truly pushes to `main`.
- If the client's GitHub plan offers neither rulesets nor branch protection for this private repository, log the accepted risk. The disconnect and the app-access removal below still stop Lovable.

## Third layer: remove the Lovable GitHub App's access

The Lovable GitHub App stays installed on the account or organization (other projects may use it). Remove only this repository:
- **Personal account**: profile picture → **Settings** → **Applications** → **Installed GitHub Apps** → Lovable → **Configure** → **Repository access**.
- **Organization**: profile picture → **Your organizations** → the organization's **Settings** → **Third-party Access** → **GitHub Apps** → Lovable → **Configure** → **Repository access**.

If it says **All repositories**, switch to **Only select repositories**, select the repositories other Lovable projects still use (not this one), and **Save**. Uninstall the app only when no other project of this account needs it.

## Verify

```bash
git fetch --all --prune
git log origin/main --since="<disconnect time>" --format='%h %an %ae %s'    # no lovable-dev[bot] / gpt-engineer-app[bot] commits
git branch -r | grep -i lovable-sync || echo "no lovable-sync branch"
```

Re-check after 24 hours and after the cutover. In Lovable, **Project settings → Git** shows the GitHub, GitLab and Bitbucket cards again: that is the disconnected state.

## Keep the Lovable project as a read-only archive

- Do not delete or remix the project. Deleting is permanent and removes its version history and chat. The code, version history and chat stay in Lovable after the disconnect, and they are the reference for any question later.
- Do not publish from it. Lovable's **Publish** button keeps publishing to Lovable hosting only. Any later change made there "stays in Lovable only".
- Reduce who can edit: ask the client to remove editors who no longer need access, keep owners and admins, and use the Viewer role where the plan allows read-only access. Optionally rename it, for example "<App> (archived <date>, migrated)". Agree the rename with the client.
- Lovable Cloud, the published site and the domain connection stay until the client signs off (`cutover-and-rollback.md`).

## If the app uses the client's own Supabase

Lovable reaches that Supabase project through a Supabase organization linked to the Lovable workspace. After sign-off, in the Lovable editor, open **More → Cloud** → **Disconnect** → confirm in the **Disconnect Supabase** dialog. This "does not delete anything in your Supabase project". Linked organizations are listed under **Connectors → Supabase → Manage Connected Organizations**. Lovable's docs don't describe unlinking one there, so if no other Lovable project uses the organization, revoke Lovable's authorization from the Supabase side (organization settings) and log what you did.

## Sources
- Lovable, GitHub integration (disconnect steps, permissions, delete connection, commit author, limitations): https://docs.lovable.dev/integrations/github
- Lovable, Git sync overview (disconnecting and reconnecting, protected branch and `lovable-sync`, one branch at a time): https://docs.lovable.dev/integrations/git-sync-overview
- Lovable, Projects (delete is permanent, roles): https://docs.lovable.dev/features/projects/overview
- Lovable, Publish (Publish goes to Lovable hosting only): https://docs.lovable.dev/features/publish ; https://docs.lovable.dev/tips-tricks/external-deployment-hosting#verify-before-switching-traffic
- Lovable, Supabase integration (Disconnect Supabase, linked organizations): https://docs.lovable.dev/integrations/supabase
- GitHub, Reviewing and modifying installed GitHub Apps: https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps
- GitHub, Creating rulesets for a repository: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository ; available rules: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
