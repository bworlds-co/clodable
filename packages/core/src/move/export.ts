import { createWriteStream, existsSync } from "node:fs";
import { copyFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { ClodableError } from "../errors.js";
import { archiveLines, archiveSql, listArchive } from "./postgres.js";
import {
  appTriggerIds,
  countBySchema,
  isManaged,
  managedTriggers,
  parseToc,
  type Toc,
  type TocEntry,
} from "./toc.js";
import { extractEntry, type ZipEntry, zipEntries } from "./zip.js";

/**
 * Lovable's database export, read once into the move's protected folder: the archive, its table
 * of contents, the list of uploaded files, the scheduled jobs. What's kept in the project is only
 * the summary below: counts, names of tables and buckets, never a row.
 */

export interface ExportSummary {
  /** The file the builder downloaded. */
  file: string;
  bytes: number;
  /** When Lovable made it, as the archive says ("2026-10-10 17:13:16 CEST"). */
  madeAt?: string;
  postgresVersion?: string;
  /** Tables of the app, with their row counts ("public.profiles": 57). */
  rows: Record<string, number>;
  people: {
    total: number;
    /** People who sign in with a password Supabase can check as is. */
    withPassword: number;
    /** People without one: they sign in with Google and the like, or were only invited. */
    withoutPassword: number;
    providers: Record<string, number>;
    sessions: number;
  };
  buckets: Array<{ id: string; public: boolean; files: number; bytes: number; largest: number }>;
  scheduledJobs: string[];
  vaultSecrets: string[];
  queues: string[];
  extensions: string[];
  appSchemas: string[];
  functions: number;
  /** Per schema, as in the archive: what the checks compare the copy against. */
  policies: Record<string, number>;
  triggers: Record<string, number>;
  foreignKeys: Record<string, number>;
  rowSecurity: Record<string, number>;
  /** Triggers on Supabase's tables that call the app (the new-user trigger), by archive id. */
  appTriggers: number[];
  /** Supabase projects the export's code points at: the Lovable Cloud one, normally. */
  sourceRefs: string[];
  /** What Supabase's API roles may do on each table ("public.posts" → authenticated → INSERT…). */
  grants: Record<string, Record<string, string[]>>;
}

export const BACKUP = "export.backup";
export const FILES_LIST = "files.jsonl";
export const JOBS_FILE = "jobs.json";

/** Where Lovable's export usually lands: the newest zip in Downloads that holds one backup. */
export async function findExport(
  folder = join(homedir(), "Downloads"),
): Promise<string | undefined> {
  if (!existsSync(folder)) return undefined;
  const month = Date.now() - 31 * 24 * 60 * 60_000;
  const candidates: Array<{ path: string; at: number }> = [];
  for (const name of await readdir(folder).catch(() => [] as string[])) {
    const ext = extname(name).toLowerCase();
    if (ext !== ".zip" && ext !== ".backup") continue;
    const path = join(folder, name);
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile() || info.mtimeMs < month) continue;
    candidates.push({ path, at: info.mtimeMs });
  }
  candidates.sort((a, b) => b.at - a.at);
  for (const { path } of candidates.slice(0, 40)) {
    if (path.toLowerCase().endsWith(".backup")) return path;
    const entries = await zipEntries(path).catch(() => [] as ZipEntry[]);
    if (entries.some((e) => e.name.toLowerCase().endsWith(".backup"))) return path;
  }
  return undefined;
}

/** Put the backup in the protected folder, from the zip Lovable gave or a bare .backup file. */
async function takeBackup(source: string, dir: string): Promise<void> {
  const target = join(dir, BACKUP);
  await rm(target, { force: true });
  if (source.toLowerCase().endsWith(".zip")) {
    let entries: ZipEntry[];
    try {
      entries = await zipEntries(source);
    } catch (error) {
      throw unreadable(error);
    }
    const backups = entries.filter((e) => e.name.toLowerCase().endsWith(".backup"));
    if (backups.length === 0) {
      throw new ClodableError({
        code: "export-unreadable",
        message: "That zip doesn't hold a database export.",
        hint: "Download the zip from the email Lovable sent when the export was ready, or from More → Cloud → Storage in Lovable.",
      });
    }
    // Several (an older export kept in the same zip): the largest is the database.
    const entry = backups.sort((a, b) => b.size - a.size)[0]!;
    try {
      await extractEntry(source, entry, target);
    } catch (error) {
      throw unreadable(error);
    }
  } else {
    await copyFile(source, target);
  }
}

const unreadable = (error: unknown) =>
  new ClodableError({
    code: "export-unreadable",
    message: "Couldn't open that export.",
    hint: "Download it again (from Lovable's email, or More → Cloud → Storage), then try again.",
    details: error instanceof Error ? error.message : String(error),
  });

/** Read the export: table of contents, triggers, then one streamed pass over the rows. */
export async function readExport(
  source: string,
  dir: string,
): Promise<{ summary: ExportSummary; toc: Toc }> {
  await takeBackup(source, dir);
  const backup = join(dir, BACKUP);
  const listing = await listArchive(backup);
  await writeFile(join(dir, "toc.list"), listing, { mode: 0o600 });
  const toc = parseToc(listing);
  if (toc.entries.length === 0) {
    throw new ClodableError({
      code: "export-unreadable",
      message: "That export is empty.",
      hint: "Export your data again in Lovable, then download the new zip.",
    });
  }

  const triggers = managedTriggers(toc);
  const appTriggers = appTriggerIds(triggers, await archiveSql(backup, triggers, dir));

  const appEntries = toc.entries.filter(
    (e) => e.schema !== null && !isManaged(e.schema) && e.schema !== "supabase_migrations",
  );
  const sourceRefs = new Set<string>();
  const definitions = await archiveSql(
    backup,
    appEntries.filter((e) => e.type === "FUNCTION" || e.type === "VIEW"),
    dir,
  );
  for (const match of definitions.matchAll(/\b([a-z]{20})\.supabase\.(?:co|in)\b/g)) {
    sourceRefs.add(match[1]!);
  }
  const grants = tableGrants(
    await archiveSql(
      backup,
      appEntries.filter((e) => e.type === "ACL" && e.tag.startsWith("TABLE ")),
      dir,
    ),
  );

  const summary: ExportSummary = {
    file: basename(source),
    bytes: (await stat(backup)).size,
    ...(toc.header["Archive created at"] ? { madeAt: toc.header["Archive created at"] } : {}),
    ...(toc.header["Dumped from database version"]
      ? { postgresVersion: toc.header["Dumped from database version"] }
      : {}),
    rows: {},
    people: { total: 0, withPassword: 0, withoutPassword: 0, providers: {}, sessions: 0 },
    buckets: [],
    scheduledJobs: [],
    vaultSecrets: [],
    queues: toc.entries
      .filter((e) => e.schema === "pgmq" && e.type === "TABLE" && e.tag.startsWith("q_"))
      .map((e) => e.tag.slice(2)),
    extensions: toc.entries.filter((e) => e.type === "EXTENSION").map((e) => e.tag),
    appSchemas: [
      ...new Set(appEntries.filter((e) => e.type === "TABLE").map((e) => e.schema!)),
    ].sort(),
    functions: appEntries.filter((e) => e.type === "FUNCTION").length,
    policies: countBySchema(toc, "POLICY"),
    triggers: countBySchema(toc, "TRIGGER"),
    foreignKeys: countBySchema(toc, "FK CONSTRAINT"),
    rowSecurity: countBySchema(toc, "ROW SECURITY"),
    appTriggers: [...appTriggers],
    sourceRefs: [],
    grants,
  };

  const wanted = (e: TocEntry) =>
    e.type === "TABLE DATA" &&
    ((e.schema !== null && !isManaged(e.schema) && e.schema !== "supabase_migrations") ||
      (e.schema === "auth" && ["users", "identities", "sessions"].includes(e.tag)) ||
      (e.schema === "storage" && (e.tag === "buckets" || e.tag === "objects")) ||
      (e.schema === "cron" && e.tag === "job") ||
      (e.schema === "vault" && e.tag === "secrets"));
  await scanRows(backup, toc.entries.filter(wanted), dir, summary, sourceRefs);
  summary.sourceRefs = [...sourceRefs].sort();
  await writeFile(join(dir, "export.json"), `${JSON.stringify(summary, null, 2)}\n`, {
    mode: 0o600,
  });
  return { summary, toc };
}

const API_ROLES = new Set(["anon", "authenticated", "service_role"]);
const ALL_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];

/** `GRANT SELECT,INSERT ON TABLE public.posts TO authenticated;` lines, for the API's roles. */
export function tableGrants(sql: string): Record<string, Record<string, string[]>> {
  const grants: Record<string, Record<string, string[]>> = {};
  for (const match of sql.matchAll(/^GRANT (.+?) ON TABLE (\S+) TO (\S+);$/gm)) {
    const role = match[3]!.replace(/"/g, "");
    if (!API_ROLES.has(role)) continue;
    const table = splitNames(match[2]!, ".").join(".");
    const privileges =
      match[1] === "ALL" ? ALL_PRIVILEGES : match[1]!.split(",").map((p) => p.trim().toUpperCase());
    const byRole = grants[table] ?? {};
    byRole[role] = [...new Set([...(byRole[role] ?? []), ...privileges])].sort();
    grants[table] = byRole;
  }
  return grants;
}

const COPY = /^COPY (.+?) \((.*)\) FROM stdin;$/;

/** Split "schema.table" or a column list, minding quoted names. */
export function splitNames(text: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && text.startsWith(separator, i)) {
      out.push(current);
      current = "";
      i += separator.length - 1;
    } else current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim());
}

const ESCAPES: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" };

/** One value of COPY's text format; null for \N. */
export function copyValue(raw: string | undefined): string | null {
  if (raw === undefined || raw === "\\N") return null;
  return raw.replace(
    /\\(?:([0-7]{1,3})|x([0-9a-fA-F]{1,2})|(.))/g,
    (_, octal?: string, hex?: string, ch?: string) => {
      if (octal) return String.fromCharCode(Number.parseInt(octal, 8));
      if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
      return ESCAPES[ch!] ?? ch!;
    },
  );
}

/**
 * One pass over the rows: counts for every table, and from Supabase's tables only what the move
 * needs (password kinds, sign-in providers, buckets, the file list, jobs, secret names). Values
 * themselves stay in the protected folder or are dropped right away.
 */
async function scanRows(
  backup: string,
  entries: TocEntry[],
  dir: string,
  summary: ExportSummary,
  sourceRefs: Set<string>,
): Promise<void> {
  const files = createWriteStream(join(dir, FILES_LIST), { mode: 0o600 });
  const jobs: Array<Record<string, string | null>> = [];
  const buckets = new Map<string, ExportSummary["buckets"][number]>();
  let table: string | null = null;
  let columns: string[] = [];
  let count = 0;
  const col = (name: string) => columns.indexOf(name);

  for await (const line of archiveLines(backup, entries, dir)) {
    if (table === null) {
      const match = line.match(COPY);
      if (!match) continue;
      table = splitNames(match[1]!, ".").join(".");
      columns = splitNames(match[2]!, ",");
      count = 0;
      continue;
    }
    if (line === "\\.") {
      if (table === "auth.users") summary.people.total = count;
      else if (table === "auth.sessions") summary.people.sessions = count;
      else if (!/^(auth|storage|cron|vault)\./.test(table)) summary.rows[table] = count;
      table = null;
      continue;
    }
    count++;
    const values = line.split("\t");
    const get = (name: string) => copyValue(values[col(name)]);
    if (table === "auth.users") {
      const hash = get("encrypted_password");
      if (hash && /^\$(2[aby]|argon2)/.test(hash)) summary.people.withPassword++;
      else summary.people.withoutPassword++;
    } else if (table === "auth.identities") {
      const provider = get("provider") ?? "unknown";
      summary.people.providers[provider] = (summary.people.providers[provider] ?? 0) + 1;
    } else if (table === "storage.buckets") {
      const id = get("id") ?? "";
      if (/^database_export/.test(id)) continue;
      buckets.set(id, {
        id,
        public: get("public") === "t",
        files: buckets.get(id)?.files ?? 0,
        bytes: buckets.get(id)?.bytes ?? 0,
        largest: buckets.get(id)?.largest ?? 0,
      });
    } else if (table === "storage.objects") {
      const bucket = get("bucket_id") ?? "";
      if (/^database_export/.test(bucket)) continue;
      let size = 0;
      let type: string | undefined;
      try {
        const metadata = JSON.parse(get("metadata") ?? "{}") as {
          size?: number;
          mimetype?: string;
        };
        size = Number(metadata.size ?? 0) || 0;
        type = metadata.mimetype;
      } catch {
        // no metadata: size unknown
      }
      const entry = buckets.get(bucket) ?? {
        id: bucket,
        public: false,
        files: 0,
        bytes: 0,
        largest: 0,
      };
      entry.files++;
      entry.bytes += size;
      entry.largest = Math.max(entry.largest, size);
      buckets.set(bucket, entry);
      files.write(
        `${JSON.stringify({
          bucket,
          name: get("name"),
          size,
          ...(type ? { type } : {}),
          owner: get("owner"),
          ownerId: get("owner_id"),
        })}\n`,
      );
    } else if (table === "cron.job") {
      const job = Object.fromEntries(columns.map((c, i) => [c, copyValue(values[i])]));
      jobs.push(job);
      if (job.jobname) summary.scheduledJobs.push(job.jobname);
      for (const match of (job.command ?? "").matchAll(/\b([a-z]{20})\.supabase\.(?:co|in)\b/g)) {
        sourceRefs.add(match[1]!);
      }
    } else if (table === "vault.secrets") {
      const name = get("name");
      if (name) summary.vaultSecrets.push(name);
    }
  }
  await new Promise((done) => files.end(done));
  summary.buckets = [...buckets.values()].sort((a, b) => a.id.localeCompare(b.id));
  summary.scheduledJobs.sort();
  summary.vaultSecrets.sort();
  await writeFile(join(dir, JOBS_FILE), `${JSON.stringify(jobs, null, 2)}\n`, { mode: 0o600 });
}
