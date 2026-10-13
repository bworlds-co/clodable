import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Flow, log, step } from "../events.js";
import { FILES_LIST } from "./export.js";
import { literal } from "./fixes.js";
import type { Sql } from "./postgres.js";
import { projectUrl } from "./supabase-api.js";
import { MANAGED_SCHEMAS } from "./toc.js";

/**
 * Uploaded files, from Lovable Cloud's storage to the new project's, bucket by bucket. Public
 * buckets need nothing: their files download like any web page. Private ones need the old
 * backend's service key, which only the builder can get from Lovable, and which stays in memory.
 * A ledger lets a stopped copy carry on where it was. Bytes are compared on a sample of every
 * bucket, never trusted from a listing.
 */

export interface StoredFile {
  bucket: string;
  name: string;
  size: number;
  type?: string;
  owner: string | null;
  ownerId: string | null;
}

export interface FilesOutcome {
  copied: number;
  total: number;
  /** Private buckets left for when the builder gives the old backend's key. */
  waiting: string[];
  /** Larger than the new project accepts (50 MB on Supabase's free plan). */
  tooBig: number;
  failed: number;
  /** Rows whose links to files were pointed at the new backend. */
  links: number;
  /**
   * Signed links to files on the old backend (with a token): they stop working when Lovable Cloud
   * goes, and only the app can make new ones.
   */
  signedLinks: number;
}

const LEDGER = "files-done.txt";
/** A file as copied: its size too, so one changed on Lovable since is copied again. */
const key = (f: { bucket: string; name: string; size: number }) =>
  `${f.bucket}/${f.name}#${f.size}`;
const path = (name: string) => name.split("/").map(encodeURIComponent).join("/");

export async function readFileList(dir: string): Promise<StoredFile[]> {
  const list = join(dir, FILES_LIST);
  if (!existsSync(list)) return [];
  return (await readFile(list, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StoredFile);
}

/** New keys (sb_…) go alone in `apikey`; a legacy JWT goes there and as the bearer token. */
const authHeaders = (key: string): Record<string, string> =>
  key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

async function download(
  from: string,
  file: StoredFile,
  isPublic: boolean,
  sourceKey: string | undefined,
): Promise<Buffer> {
  const url = isPublic
    ? `${projectUrl(from)}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${path(file.name)}`
    : `${projectUrl(from)}/storage/v1/object/${encodeURIComponent(file.bucket)}/${path(file.name)}`;
  const response = await fetch(url, {
    headers: sourceKey && !isPublic ? authHeaders(sourceKey) : {},
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`download answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function upload(
  to: string,
  secretKey: string,
  file: StoredFile,
  body: Buffer,
): Promise<void> {
  const response = await fetch(
    `${projectUrl(to)}/storage/v1/object/${encodeURIComponent(file.bucket)}/${path(file.name)}`,
    {
      method: "POST",
      headers: {
        apikey: secretKey,
        "content-type": file.type ?? "application/octet-stream",
        "cache-control": "max-age=3600",
        "x-upsert": "true",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(300_000),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`upload answered ${response.status} ${text.slice(0, 200)}`);
  }
}

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

export interface FilesTarget {
  from: string;
  to: string;
  /** The new project's secret key: uploads and checks. */
  secretKey: string;
  /** The old backend's service key, for private buckets (never stored). */
  sourceKey?: string;
  /** The largest file the new project takes, in bytes. */
  maxBytes: number;
  sql: Sql;
}

export async function* copyFiles(
  target: FilesTarget,
  dir: string,
  buckets: Array<{ id: string; public: boolean }>,
): Flow<FilesOutcome> {
  const files = await readFileList(dir);
  const isPublic = new Map(buckets.map((b) => [b.id, b.public]));
  const ledgerPath = join(dir, LEDGER);
  const done = new Set(
    existsSync(ledgerPath) ? (await readFile(ledgerPath, "utf8")).split("\n").filter(Boolean) : [],
  );
  const waiting = new Set<string>();
  let copied = 0;
  let tooBig = 0;
  let failed = 0;
  const failures: string[] = [];
  const notCopied = new Set<string>();
  const todo: StoredFile[] = [];
  for (const file of files) {
    if (done.has(key(file))) {
      copied++;
      continue;
    }
    if (!isPublic.get(file.bucket) && !target.sourceKey) {
      waiting.add(file.bucket);
      continue;
    }
    if (file.size > target.maxBytes) {
      tooBig++;
      continue;
    }
    todo.push(file);
  }

  yield step(
    "move:files",
    "running",
    "Copying your files",
    `${copied.toLocaleString("en-US")} of ${files.length.toLocaleString("en-US")}`,
  );
  let lastReport = Date.now();
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const file = todo[next++]!;
      try {
        const body = await download(
          target.from,
          file,
          Boolean(isPublic.get(file.bucket)),
          target.sourceKey,
        );
        await upload(target.to, target.secretKey, file, body);
        await appendFile(ledgerPath, `${key(file)}\n`, { mode: 0o600 });
        copied++;
      } catch (error) {
        failed++;
        notCopied.add(key(file));
        if (failures.length < 20) {
          failures.push(
            `${file.bucket}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  };
  // Six at a time, reporting every couple of seconds.
  const workers = Array.from({ length: 6 }, worker);
  const all = Promise.all(workers);
  let finished = false;
  void all.then(() => {
    finished = true;
  });
  while (!finished) {
    await Promise.race([all, new Promise((resolve) => setTimeout(resolve, 2000))]);
    if (Date.now() - lastReport >= 2000 || finished) {
      lastReport = Date.now();
      yield step(
        "move:files",
        "running",
        "Copying your files",
        `${copied.toLocaleString("en-US")} of ${files.length.toLocaleString("en-US")}`,
      );
    }
  }
  await all;

  // The bytes themselves, on a sample of every bucket: smallest, middle, largest. A file that
  // didn't come over is already counted.
  yield step("move:files", "running", "Checking your files", "Comparing them byte for byte");
  for (const bucket of new Set(files.map((f) => f.bucket))) {
    if (waiting.has(bucket)) continue;
    const copiedHere = files
      .filter((f) => f.bucket === bucket && f.size <= target.maxBytes && !notCopied.has(key(f)))
      .sort((a, b) => a.size - b.size);
    const sample = [...new Set([0, Math.floor(copiedHere.length / 2), copiedHere.length - 1])]
      .map((i) => copiedHere[i])
      .filter((f): f is StoredFile => Boolean(f));
    for (const file of sample) {
      try {
        const [before, after] = await Promise.all([
          download(target.from, file, Boolean(isPublic.get(bucket)), target.sourceKey),
          download(target.to, file, false, target.secretKey),
        ]);
        if (sha256(before) !== sha256(after)) {
          failed++;
          failures.push(`${bucket}: a copied file differs from the original`);
        }
      } catch (error) {
        failed++;
        failures.push(`${bucket}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Files keep their owner, which access rules often check ("only you see your files").
  await restoreOwners(
    target.sql,
    files.filter((f) => !waiting.has(f.bucket)),
  );
  const { changed: links, signed: signedLinks } = await repointLinks(
    target.sql,
    target.from,
    target.to,
  );

  const outcome: FilesOutcome = {
    copied,
    total: files.length,
    waiting: [...waiting].sort(),
    tooBig,
    failed,
    links,
    signedLinks,
  };
  const pending = outcome.waiting.length > 0 || tooBig > 0 || failed > 0;
  for (const failure of failures) yield log("warn", failure);
  yield step(
    "move:files",
    pending ? "warning" : "done",
    pending ? "Copied most of your files" : "Copied your files",
    [
      `${copied.toLocaleString("en-US")} of ${files.length.toLocaleString("en-US")}`,
      ...(outcome.waiting.length > 0
        ? [`private folders waiting: ${outcome.waiting.join(", ")}`]
        : []),
      ...(tooBig > 0 ? [`${tooBig} too large for your plan`] : []),
      ...(failed > 0 ? [`${failed} failed`] : []),
    ].join(" · "),
  );
  return outcome;
}

/** Put each file's owner back, from the export (uploads by the service key have none). */
async function restoreOwners(sql: Sql, files: StoredFile[]): Promise<void> {
  const owned = files.filter((f) => f.owner || f.ownerId);
  for (let i = 0; i < owned.length; i += 400) {
    const batch = owned.slice(i, i + 400);
    const values = batch
      .map(
        (f) =>
          `(${literal(f.bucket)}, ${literal(f.name)}, ${f.owner ? `${literal(f.owner)}::uuid` : "null::uuid"}, ${f.ownerId ? literal(f.ownerId) : "null"})`,
      )
      .join(", ");
    await sql.run(
      `update storage.objects o set owner = x.owner, owner_id = x.owner_id from (values ${values}) as x(bucket, name, owner, owner_id) where o.bucket_id = x.bucket and o.name = x.name;`,
    );
  }
}

/**
 * Links to files saved in the app's own tables ("avatar_url"), and in people's profiles (the
 * avatar their sign-up saved), still name the old backend: point them at the new one. Signed
 * links (with a token) belong to the old backend: they stay as they are, and are counted.
 */
async function repointLinks(
  sql: Sql,
  from: string,
  to: string,
): Promise<{ changed: number; signed: number }> {
  const managed = [...MANAGED_SCHEMAS].map(literal).join(", ");
  const columns = await sql.rows<{ schema: string; table: string; column: string; type: string }>(`
    select c.table_schema as schema, c.table_name as table, c.column_name as column, c.data_type as type
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where t.table_type = 'BASE TABLE'
      and c.table_schema not in (${managed}) and c.table_schema not like 'pg\\_%' and c.table_schema <> 'information_schema'
      and c.table_schema <> 'supabase_migrations'
      and (c.data_type in ('text', 'character varying', 'json', 'jsonb') or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar')))`);
  const old = literal(`https://${from}.supabase.co/`);
  const next = literal(`https://${to}.supabase.co/`);
  const like = literal(`%https://${from}.supabase.co/%`);
  // People's profiles, in Supabase's own part: only this one column, which the app writes.
  columns.push({ schema: "auth", table: "users", column: "raw_user_meta_data", type: "jsonb" });
  let changed = 0;
  let signed = 0;
  for (const c of columns) {
    const table = `"${c.schema.replace(/"/g, '""')}"."${c.table.replace(/"/g, '""')}"`;
    const column = `"${c.column.replace(/"/g, '""')}"`;
    const cast =
      c.type === "jsonb"
        ? "::jsonb"
        : c.type === "json"
          ? "::json"
          : c.type === "ARRAY"
            ? "::text[]"
            : "";
    const where = `${column}::text like ${like} and ${column}::text not like '%token=%'`;
    const [tokens] = await sql
      .rows<{ n: number }>(
        `select count(*)::int as n from ${table} where ${column}::text like ${like} and ${column}::text like '%token=%'`,
      )
      .catch(() => [{ n: 0 }]);
    signed += Number(tokens?.n ?? 0);
    const [hits] = await sql.rows<{ n: number }>(
      `select count(*)::int as n from ${table} where ${where}`,
    );
    const n = Number(hits?.n ?? 0);
    if (n === 0) continue;
    await sql.run(
      `update ${table} set ${column} = replace(${column}::text, ${old}, ${next})${cast} where ${where};`,
    );
    changed += n;
  }
  return { changed, signed };
}
