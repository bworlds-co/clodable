import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { CloclodError } from "../errors.js";
import { exec } from "../exec.js";
import { postgresTool, ToolUnavailable } from "./postgres-tools.js";
import type { SupabaseApi } from "./supabase-api.js";
import { listFile, type TocEntry } from "./toc.js";

/**
 * Talking to a Postgres database for the move: SQL for checks and fixes, and `pg_restore` piped
 * into `psql` for the copy itself. The password travels in the environment, never on a command
 * line, and errors are kept terse so no row of data lands in a log.
 */

export interface PgTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

/** SQL against the new backend: through Supabase's API, or straight to Postgres (tests). */
export interface Sql {
  /** The rows of one SELECT. */
  rows<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /** Statements, in order; nothing comes back. Wrap them in BEGIN/COMMIT to make them one. */
  run(sql: string): Promise<void>;
}

/** SQL through the Management API: the `postgres` role, no password needed. */
export function managementSql(api: SupabaseApi, ref: string): Sql {
  return {
    rows: <T>(sql: string) => api.query<T>(ref, sql),
    run: async (sql: string) => {
      await api.query(ref, sql);
    },
  };
}

function pgEnv(target: PgTarget): Record<string, string> {
  return {
    PGHOST: target.host,
    PGPORT: String(target.port),
    PGUSER: target.user,
    PGPASSWORD: target.password,
    PGDATABASE: target.database,
    PGSSLMODE: target.ssl ? "require" : "disable",
    PGAPPNAME: "cloclod",
    PGCONNECT_TIMEOUT: "20",
    // Never read the person's own Postgres settings or saved passwords.
    PGSERVICEFILE: join(tmpdir(), "cloclod-no-pg-service"),
    PGPASSFILE: join(tmpdir(), "cloclod-no-pgpass"),
  };
}

async function tool(name: "pg_restore" | "psql"): Promise<string> {
  try {
    return await postgresTool(name);
  } catch (error) {
    throw new CloclodError({
      code: "tools-unavailable",
      message:
        error instanceof ToolUnavailable
          ? error.message
          : "Couldn't get PostgreSQL's tools, which copying your data needs.",
      hint: "Check your internet connection, then try again.",
    });
  }
}

/** SQL straight to Postgres with psql: tests, and local databases. */
export function psqlSql(target: PgTarget): Sql {
  const psql = async (sql: string, args: string[]) => {
    const result = await exec(
      await tool("psql"),
      ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", ...args, "-f", "-"],
      { cwd: process.cwd(), env: pgEnv(target), input: sql, timeout: 120_000 },
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim().split("\n").slice(-3).join("\n") || "psql failed");
    }
    return result.stdout;
  };
  return {
    rows: async <T>(sql: string) => {
      const out = await psql(
        `select coalesce(json_agg(row_to_json(cloclod_row)), '[]'::json) from (${sql.trim().replace(/;$/, "")}) cloclod_row;`,
        ["-t", "-A"],
      );
      return JSON.parse(out.trim() || "[]") as T[];
    },
    run: async (sql: string) => {
      await psql(sql, []);
    },
  };
}

/** Can we sign in yet? A new project's pooler takes a little while to learn its password. */
export async function waitForConnection(
  target: PgTarget,
  { attempts = 8, delayMs = 15_000 } = {},
): Promise<void> {
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await exec(await tool("psql"), ["-X", "-q", "-t", "-A", "-c", "select 1"], {
      cwd: process.cwd(),
      env: pgEnv(target),
      timeout: 40_000,
    });
    if (result.exitCode === 0) return;
    last = result.stderr.trim();
    // A wrong password stays wrong, and failed sign-ins get a computer blocked for a while.
    if (/password authentication failed/i.test(last) && attempt >= 3) break;
    if (attempt < attempts) await new Promise((done) => setTimeout(done, delayMs));
  }
  throw new CloclodError({
    code: "copy-failed",
    message: "Couldn't connect to your new database.",
    hint: "It can take a few minutes after it's created. Try again shortly.",
    details: last.slice(0, 500),
  });
}

/** The archive's table of contents. */
export async function listArchive(backup: string): Promise<string> {
  const result = await exec(await tool("pg_restore"), ["-l", backup], {
    cwd: process.cwd(),
    timeout: 120_000,
  });
  if (result.exitCode !== 0) {
    throw new CloclodError({
      code: "export-unreadable",
      message: "That file isn't a database export Cloclod can read.",
      hint: "Download the export again (from Lovable's email, or More → Cloud → Storage), then try again.",
      details: result.stderr.trim().slice(0, 500),
    });
  }
  return result.stdout;
}

/** The SQL of some entries, as text: small things only (definitions, never data). */
export async function archiveSql(
  backup: string,
  entries: TocEntry[],
  dir: string,
  extra: string[] = [],
): Promise<string> {
  if (entries.length === 0) return "";
  const list = join(dir, "select.list");
  await writeFile(list, listFile(entries), { mode: 0o600 });
  const result = await exec(
    await tool("pg_restore"),
    ["-f", "-", "-L", list, "--no-owner", ...extra, backup],
    { cwd: dir, timeout: 300_000 },
  );
  if (result.exitCode !== 0) {
    throw new CloclodError({
      code: "export-unreadable",
      message: "Couldn't read part of your export.",
      details: result.stderr.trim().slice(0, 500),
    });
  }
  return result.stdout;
}

/** Stream the export's rows for some tables, one line at a time (COPY text format). */
export async function* archiveLines(
  backup: string,
  entries: TocEntry[],
  dir: string,
): AsyncGenerator<string> {
  if (entries.length === 0) return;
  const list = join(dir, "data.list");
  await writeFile(list, listFile(entries), { mode: 0o600 });
  const child = spawn(
    await tool("pg_restore"),
    ["--data-only", "-f", "-", "-L", list, "--no-owner", "--no-privileges", backup],
    { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 4000) stderr += chunk.toString();
  });
  const done = new Promise<number>((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  const lines = createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of lines) yield line;
  } finally {
    if (child.exitCode === null) child.kill();
  }
  if ((await done) !== 0) {
    throw new CloclodError({
      code: "export-unreadable",
      message: "Couldn't read your export's data.",
      details: stderr.trim().slice(0, 500),
    });
  }
}

export interface PassResult {
  /** Errors Postgres reported, terse (no row values): "relation \"x\" already exists". */
  errors: string[];
}

/**
 * Copy some entries of the export into the target: pg_restore writes them as SQL, psql runs it.
 * Triggers and key checks are off for the session (`session_replication_role = replica`, as
 * Supabase's own restore guide does), so rows load in any order and nothing fires twice.
 * Errors don't stop it: Supabase's own parts answer "already exists", and the checks after the
 * copy are what decide whether it worked.
 */
export async function restorePass(
  target: PgTarget,
  backup: string,
  entries: TocEntry[],
  options: {
    dir: string;
    name: string;
    dataOnly?: boolean;
    /** Keep the export's grants (the app's own objects): without them, the app's API can't reach its tables. */
    privileges?: boolean;
    timeoutMs?: number;
  },
): Promise<PassResult> {
  if (entries.length === 0) return { errors: [] };
  const list = join(options.dir, `${options.name}.list`);
  await writeFile(list, listFile(entries), { mode: 0o600 });
  const pgRestore = await tool("pg_restore");
  const psql = await tool("psql");
  const env = { ...process.env, ...pgEnv(target) };
  const log = createWriteStream(join(options.dir, `${options.name}.log`), { mode: 0o600 });

  const producer = spawn(
    pgRestore,
    [
      "-f",
      "-",
      "-L",
      list,
      "--no-owner",
      ...(options.privileges ? [] : ["--no-privileges"]),
      ...(options.dataOnly ? ["--data-only"] : []),
      backup,
    ],
    { cwd: options.dir, stdio: ["ignore", "pipe", "pipe"] },
  );
  const consumer = spawn(
    psql,
    [
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=0",
      "-v",
      "VERBOSITY=terse",
      "-c",
      "SET session_replication_role = replica",
      "-f",
      "-",
    ],
    { cwd: options.dir, env, stdio: ["pipe", "ignore", "pipe"] },
  );
  producer.stdout.pipe(consumer.stdin);
  consumer.stdin.on("error", () => {});

  const errors: string[] = [];
  let producerError = "";
  producer.stderr.on("data", (chunk: Buffer) => {
    if (producerError.length < 4000) producerError += chunk.toString();
  });
  const consumerLines = createInterface({ input: consumer.stderr });
  consumerLines.on("line", (line) => {
    const error = line.match(/(?:ERROR|FATAL):\s+(.*)$/)?.[1];
    if (error) {
      errors.push(error.slice(0, 300));
      log.write(`${error.slice(0, 300)}\n`);
    }
  });

  const exit = (child: ReturnType<typeof spawn>) =>
    new Promise<number>((resolve) => child.on("close", (code) => resolve(code ?? 1)));
  const timer = setTimeout(
    () => {
      producer.kill();
      consumer.kill();
    },
    options.timeoutMs ?? 3 * 60 * 60_000,
  );
  const [produced, consumed] = await Promise.all([exit(producer), exit(consumer)]);
  clearTimeout(timer);
  await new Promise((done) => log.end(done));

  if (produced !== 0) {
    throw new CloclodError({
      code: "export-unreadable",
      message: "Couldn't read your export while copying it.",
      details: producerError.trim().slice(0, 500),
    });
  }
  // psql gives up only when the connection itself fails.
  if (consumed !== 0) {
    throw new CloclodError({
      code: "copy-failed",
      message: "The connection to your new database dropped during the copy.",
      hint: "Try again: the copy starts over cleanly on a fresh database.",
      details: errors.slice(-3).join("\n").slice(0, 500),
    });
  }
  return { errors };
}

/** Errors that only say Supabase already had that part: expected, not a problem. */
export const isExpected = (error: string) =>
  /already exists|must be owner of|multiple primary keys|cannot drop .* because|permission denied to change default privileges|role "[^"]+" does not exist/i.test(
    error,
  );
