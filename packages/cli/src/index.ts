import { messageOf } from "@clodable/core";
import { cac } from "cac";
import { dbCommand } from "./commands/db.js";
import { devCommand } from "./commands/dev.js";
import { configCommand, MOVE_HELP, moveCommand } from "./commands/move.js";
import { backendCommand, connectCommand, siteCommand } from "./commands/online.js";
import { checkCommand, publishCommand, undoCommand } from "./commands/publish.js";
import { settingsCommand } from "./commands/settings.js";
import { doctorCommand, kitCommand, setupCommand } from "./commands/setup.js";
import {
  historyCommand,
  inboxCommand,
  restoreCommand,
  saveCommand,
  statusCommand,
} from "./commands/work.js";
import { createContext, type GlobalOptions } from "./context.js";

declare const __CLODABLE_VERSION__: string | undefined;
const version = typeof __CLODABLE_VERSION__ === "string" ? __CLODABLE_VERSION__ : "0.1.0-dev";

const cli = cac("clodable");
cli.option("--json", "Print one JSON event per line (for programs)");
cli.option("--cwd <dir>", "Run in another folder");

const ctx = (options: GlobalOptions) => createContext(options);

cli
  .command("dev", "Run your app with the preview tools (what Claude Desktop's preview starts)")
  .option("--port <port>", "Port (Claude Desktop passes PORT automatically)")
  .option("--host <host>", "Host to listen on")
  .option("--no-toolbar", "Run without the preview tools")
  .action((options) =>
    devCommand(ctx(options), {
      port: options.port ? Number(options.port) : undefined,
      host: options.host,
      toolbar: options.toolbar,
    }),
  );

cli
  .command("save", "Save your changes to your draft on GitHub")
  .option("-m, --message <text>", "What changed, in your words")
  .action((options) => saveCommand(ctx(options), { message: options.message }));

cli
  .command("status", "Where you stand: saved, not live yet, live")
  .option("--fetch", "Check GitHub for the latest live version first")
  .action((options) => statusCommand(ctx(options), { fetch: options.fetch }));

cli
  .command("publish", "Check your app and put your draft live")
  .option("-m, --message <text>", "Describe any last unsaved changes")
  .option("--skip-checks", "Developers only: skip the checks")
  .action((options) =>
    publishCommand(ctx(options), { message: options.message, skipChecks: options.skipChecks }),
  );

cli
  .command("undo", "Put the previous version live again")
  .option("-y, --yes", "Don't ask for confirmation")
  .option("--sha <sha>", "Undo a specific publish")
  .action((options) => undoCommand(ctx(options), { yes: options.yes, sha: options.sha }));

cli
  .command("restore <version>", "Bring back an earlier version of your draft (as a new save)")
  .action((version: string, options) => restoreCommand(ctx(options), version));

cli
  .command("history", "Your saves and publishes")
  .option("--limit <n>", "How many publishes to show")
  .action((options) =>
    historyCommand(ctx(options), { limit: options.limit ? Number(options.limit) : undefined }),
  );

cli
  .command("check", "Run the publish checks without publishing")
  .action((options) => checkCommand(ctx(options)));

cli
  .command("setup", "Bring your app home: connect GitHub, add Clodable's files")
  .option("--repo <owner/name>", "The GitHub repository of your app")
  .option("-y, --yes", "Don't ask questions")
  .option("--publish", "Publish the setup right away")
  .option("--backend <where>", "Where the data lives: lovable-cloud, supabase or none")
  .option("--hosting <where>", "Where the site is live: lovable, github or none (not online yet)")
  .action((options) =>
    setupCommand(ctx(options), {
      repo: options.repo,
      yes: options.yes,
      publish: options.publish,
      ...(["lovable-cloud", "supabase", "none"].includes(options.backend)
        ? { backend: options.backend }
        : {}),
      ...(["lovable", "github", "none"].includes(options.hosting)
        ? { hosting: options.hosting }
        : {}),
    }),
  );

cli
  .command("doctor", "Check that everything Clodable needs is in place")
  .action((options) => doctorCommand(ctx(options)));

cli
  .command(
    "config [key] [value]",
    "Read or change where your app runs: backend (lovable-cloud, supabase, none), hosting (lovable, github, none)",
  )
  .action((key, value, options) => configCommand(ctx(options), { key, value }));

cli
  .command(
    "settings",
    "The settings your app's server code reads (process.env), on this computer and on your site",
  )
  .action((options) => settingsCommand(ctx(options), {}));

cli
  .command("setting <name>", "Set one of your app's settings, its value piped in")
  .action((name, options) => settingsCommand(ctx(options), { name: String(name) }));

cli
  .command(
    "db <action> [arg]",
    'Your app\'s Supabase database: query "select …" (reads), run "update …" (changes data), apply <migration file>, check (Supabase\'s security advice)',
  )
  .action((action, arg, options) =>
    dbCommand(ctx(options), { action: String(action), ...(arg ? { arg: String(arg) } : {}) }),
  );

cli
  .command(
    "connect <service>",
    "Connect supabase or netlify on this computer, the token piped in (for a new backend or site)",
  )
  .action((service, options) => connectCommand(ctx(options), String(service)));

cli
  .command(
    "site [action]",
    "Your app's site: where it stands, or create: put it online on your own Netlify",
  )
  .option("--team <slug>", "create: the Netlify team the site goes in")
  .action((action, options) =>
    siteCommand(ctx(options), {
      ...(action ? { action: String(action) } : {}),
      ...(options.team ? { team: String(options.team) } : {}),
    }),
  );

cli
  .command(
    "backend [action]",
    "Your app's backend: the choices, or create: a new one on your own Supabase",
  )
  .option("--org <slug>", "create: the Supabase organization")
  .option("--region <code>", "create: where it runs (eu-central-1…)")
  .action((action, options) =>
    backendCommand(ctx(options), {
      ...(action ? { action: String(action) } : {}),
      ...(options.org ? { org: String(options.org) } : {}),
      ...(options.region ? { region: String(options.region) } : {}),
    }),
  );

/** An option given as text, or nothing when it wasn't given. */
const text = (value: unknown) =>
  value === undefined || value === false || value === "" ? undefined : String(value);

/** A yes/no option: anything but no, false or 0 is a yes. */
const yes = (value: unknown) =>
  value === undefined ? undefined : !/^(no|false|0)$/i.test(String(value));

cli
  .command("move [step] [arg]", MOVE_HELP)
  .option("--org <slug>", "create: the Supabase organization")
  .option("--region <code>", "create: where it runs (eu-central-1…)")
  .option("--name <name>", "create: the project's name")
  .option("--file <path>", "export: the zip Lovable gave (else the newest in Downloads)")
  .option("--private", "files: read Lovable Cloud's service key from stdin, for private folders")
  .option("--fix", "diagnose: apply Clodable's own fixes on the copy")
  .option("--account <slug>", "site: the Netlify team the site goes in")
  .option("--domain <domain>", "emails: the domain emails come from")
  .option("--sender <address>", "emails: the sender address (no-reply@ the domain by default)")
  .option(
    "--skip",
    "emails: go live without emails of your own for now; domain: keep the Netlify address; settings, secrets, vault: go on without the ones left",
  )
  .option("--hook", "emails: send sign-in emails through the app's own templates (auth-email-hook)")
  .option("--set", "facts: record what Claude found in the app's code (JSON on stdin)")
  .option("--sign-up <yes|no>", "golive: whether anyone may sign up (no: only invited people)")
  .option("--confirm-email <yes|no>", "golive: whether new people confirm their email first")
  .action((step, arg, options) =>
    moveCommand(ctx(options), {
      step: text(step) ?? "check",
      arg: text(arg),
      org: text(options.org),
      region: text(options.region),
      name: text(options.name),
      file: text(options.file),
      private: options.private === true,
      fix: options.fix === true,
      account: text(options.account),
      domain: text(options.domain),
      sender: text(options.sender),
      skip: options.skip === true,
      hook: options.hook === true,
      set: options.set === true,
      signUp: yes(options.signUp),
      confirmEmail: yes(options.confirmEmail),
    }),
  );

cli
  .command("kit", "Show (or add) the files Clodable keeps in your project")
  .option("--apply", "Write them")
  .option("--live-url <url>", "Your live site's address")
  .action((options) =>
    kitCommand(ctx(options), { apply: options.apply, liveUrl: options.liveUrl }),
  );

cli
  .command("inbox", "Requests from the preview toolbar (for front ends)")
  .option("--ack <id>", "Mark one as handled")
  .option(
    "--claim <session>",
    "Take the waiting requests for this conversation, if it's the one its person used last",
  )
  .action((options) => inboxCommand(ctx(options), { ack: options.ack, claim: options.claim }));

cli.help();
cli.version(version);

try {
  cli.parse(process.argv, { run: false });
  if (cli.options.help || cli.options.version) {
    // cac already printed it.
  } else if (!cli.matchedCommand) {
    if (cli.args.length > 0) {
      process.stderr.write(`Unknown command: ${cli.args[0]}\n\n`);
      process.exitCode = 1;
    }
    cli.outputHelp();
  } else {
    await cli.runMatchedCommand();
  }
} catch (error) {
  process.stderr.write(`${messageOf(error)}\n`);
  process.exitCode = 1;
}
