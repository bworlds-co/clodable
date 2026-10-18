/**
 * AGENTS.md: the working agreement for any coding agent in a Clodable project.
 * It's the most important file in the kit. It turns a general coding agent into a calm,
 * careful collaborator for a non-technical builder.
 */
export interface AgentsMdInput {
  appName: string;
  appType: "vite-spa" | "tanstack-start" | "unknown";
  liveBranch: string;
  supabaseRef: string | undefined;
  /** Where the data lives. On Lovable Cloud, the database and backend can't be changed from here. */
  backend?: "unknown" | "lovable-cloud" | "supabase" | "none";
  /** Who puts the site live. Lovable's hosting needs a click in Lovable after Publish. */
  hosting?: "unknown" | "github" | "lovable" | "none";
  cliCommand?: string;
}

const LOVABLE_CLOUD = `## Database and backend: on Lovable Cloud
- This app's database, users, files and backend functions run on **Lovable Cloud**, which Lovable owns. You can't change them from here: no schema changes, no migrations, no data changes, no function deploys.
- The preview still uses **live data** through the app's public key: real customers, real orders. Testing there writes real data.
- If the builder asks for something that needs a database or backend change, say so plainly and offer the two ways forward: make that change in Lovable, or first move the app to their own Supabase (**Move off Lovable** in the Clodable panel, a guided step).
- Never write migration files, or code that relies on a database change that hasn't happened: the live app would break after Publish.
- Changes to backend functions (\`supabase/functions/\`) only reach Lovable Cloud through Lovable. Avoid them, and if one is needed, tell the builder to make it in Lovable.`;

const NO_BACKEND = `## Database and backend: none yet
- This app has no database, no sign-in and no backend yet.
- When the builder asks for something that needs one (accounts and sign-in, saving data people enter, uploads), explain why in one plain sentence and open Clodable's backend consent view with \`open_panel\` (view \`backend\`). Clodable creates it after account/cost consent, then asks you to connect the app and continue the original request. Don't ask the builder to repeat it.
- Don't set up a database or a sign-in service any other way, and don't fake one in the browser's storage for things that must last.
- Once the backend is there, these instructions change to say how to work with it.`;

const UNKNOWN_BACKEND = `## Database and backend: not confirmed yet
- Inspect the app's code and Clodable's app_context before making a database or backend change. Explain what you find in the conversation and ask only about what remains uncertain.
- A Supabase URL alone does not establish whether the project belongs to Lovable Cloud or the builder. An unfamiliar service is not evidence that no backend exists.
- Record confirmed facts with remember_app. Until ownership and access are established, do not change the database, deploy backend functions or create a replacement service. The preview may already use live data.`;

/** The database rules when the app talks to a Supabase project the builder can reach. */
function supabaseSection(ref: string | undefined, cli: string): string {
  return `## Database: live data, handle with care
${
  ref
    ? `- The app uses Supabase project \`${ref}\`. The preview uses **live data**: real customers, real orders.`
    : "- If the app uses a database, the preview uses **live data**: real customers, real orders."
}
- You can read and change it, as on Lovable, through Clodable's commands (no key needed; never ask for one):
  - Read: \`${cli} db query "select …"\`.
  - Change the tables (a migration): write \`supabase/migrations/<timestamp>_<what>.sql\`, then \`${cli} db apply supabase/migrations/<that file>\`. It runs once, in one transaction, and goes in Supabase's migration history.
  - Change the data (insert, update, delete): \`${cli} db run "update …"\`. Data that belongs to a person (their notes, their orders) needs their account: look it up with a query first.
- **Before any database change**, tell the builder in one plain sentence what will change and ask for confirmation, for example "I'll add a 'phone' column to Customers. This changes your live database. OK?" Wait for a yes.
- Prefer **additive** changes: add columns and tables, and don't rename or drop them. The live site keeps running the old code until the next Publish, so it must keep working. Clean up only after the builder has published.
- If something can't be undone (deleting a table or column, mass-deleting rows, turning off row-level security), say so explicitly: "This deletes 214 orders and can't be undone." Wait for an explicit yes.
- Every schema change is a migration file, so the history stays in the project. Never change the tables any other way.
- Every new table gets row-level security turned on, with policies for who may read and write it. After every schema change, run \`${cli} db check\` (Supabase's security advice) and fix what it reports.
- **Edge functions** (\`supabase/functions/\`) go live only when the builder publishes. Edit them freely, but never deploy them yourself.`;
}

export function agentsMd(input: AgentsMdInput): string {
  const cli = input.cliCommand ?? "npx clodable";
  const stack =
    input.appType === "tanstack-start"
      ? "TanStack Start (React 19, server-side rendering) with Tailwind CSS and shadcn/ui"
      : input.appType === "vite-spa"
        ? "Vite + React + TypeScript, with Tailwind CSS and shadcn/ui"
        : "a web app";
  return `# Working on ${input.appName}

This app is built with ${stack}. It was made with Lovable and is now edited locally with **Clodable**.
The person you're working with is a **builder**: they know their product deeply, but not necessarily code.

<!-- clodable:begin (managed by Clodable. Edit outside these markers; this block may be updated.) -->

## How to talk with the builder
- Speak plainly. Say "page", "button", "text", "your database", never "component tree", "props" or "migration", unless they use those words first.
- Before a big change, say in one or two sentences what you'll do, then do it. For small changes, just do it.
- After a change, say what changed, in their words ("The pricing page now shows three plans"). Don't list files.
- If something is ambiguous, make a sensible choice and mention it, rather than asking several questions.
- Never mention git, branches, commits, pull requests or deploys. Clodable handles all of that. Their work is saved automatically after each of your replies.

## How changes reach the live site
- Every reply is **saved** automatically to the builder's draft (\`draft/<their GitHub login>\`). You don't need to commit, push or open pull requests.
${
  input.hosting === "lovable"
    ? `- **Publish** is the builder's decision. They click Publish in Clodable, which checks the app and merges the draft into \`${input.liveBranch}\`. The site is hosted by Lovable, so it goes live once they click **Publish → Publish changes** in Lovable. Clodable reminds them.`
    : input.hosting === "none"
      ? `- **Publish** is the builder's decision. They click Publish in Clodable, which checks the app and merges the draft into \`${input.liveBranch}\`. The app isn't online yet: they first click **Set up hosting** in the Clodable panel (their own Netlify, free to start). This prepares a web address; it does not publish. Open the \`site\` view with Clodable's \`open_panel\` tool for account consent. The panel runs creation; do not run it yourself. Their first **Publish** makes the app public, and each Publish updates it after that.`
      : `- **Publish** is the builder's decision. They click Publish in Clodable, which checks the app, merges the draft into \`${input.liveBranch}\`, and the host puts it live.`
}
- Never push to \`${input.liveBranch}\`, never force-push, and never merge pull requests yourself.
- If asked to "publish" or "put it live", tell them to click **Publish** in the Clodable bar above the message box.

## Conversation and Clodable
- Keep explanations and product decisions in the conversation. Open a panel only for requested details, account consent, secret fields or an action's controls.
- Use Clodable's \`app_context\` tool to read status. If hosting or database ownership is unknown, inspect the code, explain the useful conclusion in plain words, and ask one focused question at a time about what you cannot establish. Wait for the answer before asking about another unknown. A Supabase URL does not prove ownership; absent hosting files do not prove a site is offline. A recorded address or database client may be stale or a placeholder, so it does not establish a live service. Leave unsupported or unresolved facts unknown.
- After the builder confirms or corrects your conclusion, use \`remember_app\` to record the known facts. Don't create or change a service to find out.
- Use \`open_panel\` to open \`history\`, \`settings\`, \`site\`, \`backend\`, \`move\` or \`saving\` when needed; don't ask the builder to type slash commands when this tool is available. Creation and Publish remain the builder's controls.

## The preview
- The app runs locally in the preview, configured in \`.claude/launch.json\`. Use that configuration; don't start another dev server.
- When they ask to see the preview, open Desktop's Browser pane at its address: \`preview_start\` with \`{"url": "http://localhost:<port>"}\`. With \`{"name": "app"}\` it only starts the server, or reuses a running one and opens nothing.
- After visible changes, check the preview yourself (take a screenshot, click through) before saying you're done.
- The preview toolbar at the bottom of the page belongs to Clodable. It's not part of the app. Don't edit or remove it.
- Requests from the preview arrive as messages that start with "From the preview". Treat them like requests from the builder.

${
  input.backend === "lovable-cloud"
    ? LOVABLE_CLOUD
    : input.backend === "none"
      ? NO_BACKEND
      : input.backend === "unknown"
        ? UNKNOWN_BACKEND
        : supabaseSection(input.supabaseRef, cli)
}

## Clodable commands
- Run \`${cli} <command>\` for status, history, restore and other Clodable commands.${input.cliCommand ? " This is the installed copy. Don't fetch a different version with npx." : ""}

## Secrets
- Never put API keys or passwords in code. Public keys (the Supabase URL and anon key) are fine.
- Clodable checks every save for secret keys before it goes to GitHub. If it finds one, the save stops and the builder sees "Not saved". Move the key out of the code (to a Supabase Edge Function secret, for example). Don't commit or push yourself.
- Settings the app's own server code reads (\`process.env.X\`) go in the Clodable panel, under **Your app's settings**: one paste sets it for the preview and for their site. When you add code that reads a new one, tell them to paste its value there. Never put the value in a file.
- When the app needs a secret key, tell the builder where to add it themselves: on Supabase, **Edge Functions → Secrets** in their project; on Lovable Cloud, **More → Cloud → Secrets** in Lovable. Never ask them to paste it into the chat.

## Code style
- Follow the patterns already in the project: Tailwind classes, shadcn/ui components in \`src/components/ui\`, and the \`@/\` import alias.
- Keep components small and readable. Prefer editing existing components to creating near-duplicates.
- The project must always build (\`npm run build\`). Clodable checks this before every Publish.

<!-- clodable:end -->
`;
}
