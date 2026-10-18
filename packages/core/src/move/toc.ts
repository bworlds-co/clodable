/**
 * A database export's table of contents (`pg_restore -l`), and the plan that copies it into a fresh
 * Supabase project in passes. Supabase already runs its own parts (sign-in, files, jobs, queues),
 * so only the app's own objects are rebuilt; the people and bucket rows are loaded as data, and the
 * app's triggers and rules on Supabase's tables come last.
 */

export interface TocEntry {
  id: number;
  /** pg_dump's kind of entry: "TABLE", "TABLE DATA", "FK CONSTRAINT"… */
  type: string;
  /** Null for entries outside any schema (extensions, schemas themselves). */
  schema: string | null;
  /** The object's name; for triggers, rules and constraints, "<table> <name>". */
  tag: string;
  owner: string;
  /** The line as pg_restore printed it, for `-L` lists. */
  line: string;
}

export interface Toc {
  /** Header fields: "Compression", "Dump Version", "Dumped from database version", "Archive created at"… */
  header: Record<string, string>;
  entries: TocEntry[];
}

/** Every kind pg_dump writes, longest first, so "TABLE DATA" wins over "TABLE". */
const TYPES = [
  "PUBLICATION TABLES IN SCHEMA",
  "TEXT SEARCH CONFIGURATION",
  "TEXT SEARCH DICTIONARY",
  "MATERIALIZED VIEW DATA",
  "TEXT SEARCH TEMPLATE",
  "FOREIGN DATA WRAPPER",
  "PROCEDURAL LANGUAGE",
  "DATABASE PROPERTIES",
  "TEXT SEARCH PARSER",
  "SUBSCRIPTION TABLE",
  "MATERIALIZED VIEW",
  "PUBLICATION TABLE",
  "SEQUENCE OWNED BY",
  "CHECK CONSTRAINT",
  "OPERATOR FAMILY",
  "STATISTICS DATA",
  "OPERATOR CLASS",
  "FOREIGN SERVER",
  "SECURITY LABEL",
  "BLOB METADATA",
  "BLOB COMMENTS",
  "EVENT TRIGGER",
  "FK CONSTRAINT",
  "FOREIGN TABLE",
  "ACCESS METHOD",
  "INDEX ATTACH",
  "LARGE OBJECT",
  "ROW SECURITY",
  "SEQUENCE SET",
  "TABLE ATTACH",
  "ACL LANGUAGE",
  "USER MAPPING",
  "DEFAULT ACL",
  "SEARCH PATH",
  "SHELL TYPE",
  "TABLE DATA",
  "PUBLICATION",
  "SUBSCRIPTION",
  "STATISTICS",
  "CONSTRAINT",
  "CONVERSION",
  "STDSTRINGS",
  "SEARCHPATH",
  "PROCEDURE",
  "AGGREGATE",
  "COLLATION",
  "EXTENSION",
  "TRANSFORM",
  "DATABASE",
  "ENCODING",
  "FUNCTION",
  "OPERATOR",
  "SEQUENCE",
  "LANGUAGE",
  "TRIGGER",
  "COMMENT",
  "DEFAULT",
  "WARNING",
  "DOMAIN",
  "POLICY",
  "SCHEMA",
  "SERVER",
  "BLOBS",
  "INDEX",
  "TABLE",
  "BLOB",
  "CAST",
  "RULE",
  "TYPE",
  "VIEW",
  "ACL",
];

const ENTRY = /^(\d+);\s+(\d+)\s+(\d+)\s+(.*)$/;

export function parseToc(text: string): Toc {
  const header: Record<string, string> = {};
  const entries: TocEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith(";")) {
      const created = line.match(/^;\s+Archive created at (.*)$/);
      const field = line.match(/^;\s+([A-Za-z][\w ]*?):\s+(.*)$/);
      if (created) header["Archive created at"] = created[1]!.trim();
      else if (field) header[field[1]!.trim()] = field[2]!.trim();
      continue;
    }
    const match = line.match(ENTRY);
    if (!match) continue;
    const rest = match[4]!;
    const type = TYPES.find((t) => rest.startsWith(`${t} `));
    if (!type) continue;
    const afterType = rest.slice(type.length + 1);
    const space = afterType.indexOf(" ");
    if (space < 0) continue;
    const schema = afterType.slice(0, space);
    const tail = afterType.slice(space + 1);
    // The owner is the last word; pg_restore leaves it empty (a trailing space) for some entries.
    let tag: string;
    let owner: string;
    if (tail.endsWith(" ")) {
      tag = tail.trimEnd();
      owner = "";
    } else {
      const last = tail.lastIndexOf(" ");
      tag = last < 0 ? tail : tail.slice(0, last);
      owner = last < 0 ? "" : tail.slice(last + 1);
    }
    // The pause's guard (switch.ts) lives on Lovable only: never read, never brought over.
    if (/\bcloclod_pause\b/.test(tag)) continue;
    entries.push({
      id: Number(match[1]),
      type,
      schema: schema === "-" ? null : schema,
      tag,
      owner,
      line,
    });
  }
  return { header, entries };
}

/**
 * Schemas Supabase creates and runs itself. Their structure is never rebuilt from an export: the new
 * project already has it, often newer. Only rows (people, buckets) and the app's own triggers and
 * rules on these tables are carried over.
 */
export const MANAGED_SCHEMAS = new Set([
  "auth",
  "storage",
  "realtime",
  "_realtime",
  "vault",
  "cron",
  "net",
  "pgmq",
  "pgmq_public",
  "extensions",
  "graphql",
  "graphql_public",
  "pgbouncer",
  "supabase_functions",
  "pgsodium",
  "pgsodium_masks",
  "_analytics",
  "_supavisor",
  "information_schema",
  "topology",
  "tiger",
  "tiger_data",
]);

export const isManaged = (schema: string | null) =>
  schema !== null && (MANAGED_SCHEMAS.has(schema) || schema.startsWith("pg_"));

/** Supabase's own sign-in bookkeeping: its version history, never copied. */
const AUTH_SKIP = new Set(["schema_migrations"]);

export interface RestorePlan {
  /** 1. Extensions the app turned on. */
  extensions: TocEntry[];
  /** pgmq queues to create once the extension is there. */
  queues: string[];
  /** Their waiting messages (copied only at the switch's final copy: Lovable's jobs are off then). */
  queueData: TocEntry[];
  /** 2. People (auth) and bucket rows, loaded into Supabase's own tables. */
  managedData: TocEntry[];
  /** 3. The app's own schemas, in the export's order: tables, data, functions, keys, rules. */
  app: TocEntry[];
  /** 4. The app's triggers and access rules on Supabase's tables (new-user trigger, file rules). */
  managedExtras: TocEntry[];
  /** What the export holds that the plan leaves aside, by kind, for the record. */
  leftAside: {
    scheduledJobs: boolean;
    vaultSecrets: boolean;
    fileRows: boolean;
    other: number;
  };
}

/**
 * `appTriggers`: the triggers on Supabase's tables that call the app's own functions (the new-user
 * trigger). Supabase's own triggers there are already in place, and can differ by version, so the
 * export's copies of those are left out.
 */
export function planRestore(toc: Toc, appTriggers: ReadonlySet<number> = new Set()): RestorePlan {
  const extensions: TocEntry[] = [];
  const queues: string[] = [];
  const queueData: TocEntry[] = [];
  const managedData: TocEntry[] = [];
  const app: TocEntry[] = [];
  const managedExtras: TocEntry[] = [];
  const leftAside = { scheduledJobs: false, vaultSecrets: false, fileRows: false, other: 0 };
  for (const entry of toc.entries) {
    const { type, schema, tag } = entry;
    if (type === "EXTENSION") {
      extensions.push(entry);
      continue;
    }
    if (schema === null) {
      // Schemas the app made; Supabase's own and `public` already exist.
      if (type === "SCHEMA" && !isManaged(tag) && tag !== "public") app.push(entry);
      else leftAside.other++;
      continue;
    }
    if (!isManaged(schema)) {
      app.push(entry);
      continue;
    }
    if (schema === "pgmq" && type === "TABLE" && tag.startsWith("q_")) {
      queues.push(tag.slice(2));
      continue;
    }
    if (schema === "pgmq" && type === "TABLE DATA" && tag.startsWith("q_")) {
      queueData.push(entry);
      continue;
    }
    if (type === "TABLE DATA" && schema === "auth" && !AUTH_SKIP.has(tag)) {
      managedData.push(entry);
      continue;
    }
    if (type === "SEQUENCE SET" && schema === "auth") {
      managedData.push(entry);
      continue;
    }
    if (type === "TABLE DATA" && schema === "storage" && tag === "buckets") {
      managedData.push(entry);
      continue;
    }
    if (type === "POLICY" || (type === "TRIGGER" && appTriggers.has(entry.id))) {
      managedExtras.push(entry);
      continue;
    }
    if (type === "TABLE DATA" && schema === "cron") leftAside.scheduledJobs = true;
    else if (type === "TABLE DATA" && schema === "vault" && tag === "secrets") {
      leftAside.vaultSecrets = true;
    } else if (type === "TABLE DATA" && schema === "storage" && tag === "objects") {
      leftAside.fileRows = true;
    } else leftAside.other++;
  }
  // Sign-in rows first: people before what hangs off them.
  managedData.sort((a, b) => dataRank(a) - dataRank(b));
  return { extensions, queues, queueData, managedData, app, managedExtras, leftAside };
}

const AUTH_ORDER = [
  "users",
  "identities",
  "sessions",
  "refresh_tokens",
  "mfa_factors",
  "mfa_challenges",
  "mfa_amr_claims",
  "one_time_tokens",
  "flow_state",
  "sso_providers",
  "sso_domains",
  "saml_providers",
  "saml_relay_states",
];

function dataRank(entry: TocEntry): number {
  if (entry.schema === "storage") return 200;
  if (entry.type === "SEQUENCE SET") return 300;
  const index = AUTH_ORDER.indexOf(entry.tag);
  return index < 0 ? 100 : index;
}

/** Triggers on Supabase's tables, whose definitions say whether they call the app's functions. */
export const managedTriggers = (toc: Toc) =>
  toc.entries.filter((e) => e.type === "TRIGGER" && isManaged(e.schema));

/**
 * From the SQL of those triggers (`pg_restore -f -`), the ones that run a function outside
 * Supabase's schemas: the app's own.
 */
export function appTriggerIds(triggers: TocEntry[], sql: string): Set<number> {
  const ids = new Set<number>();
  // pg_restore heads each entry with "-- Name: <tag>; Type: TRIGGER; Schema: <schema>; Owner: …".
  const blocks = sql.split(/^-- Name: /m).slice(1);
  for (const block of blocks) {
    const head = block.match(/^(.*?); Type: TRIGGER; Schema: (\S+);/);
    if (!head) continue;
    const runs = block.match(/EXECUTE (?:FUNCTION|PROCEDURE) ("?[\w$]+"?)\./);
    const schema = runs?.[1]?.replace(/"/g, "");
    if (!schema || isManaged(schema)) continue;
    const entry = triggers.find((t) => t.tag === head[1] && t.schema === head[2]);
    if (entry) ids.add(entry.id);
  }
  return ids;
}

/** A `pg_restore -L` list: only these entries, in this order. */
export const listFile = (entries: TocEntry[]) => `${entries.map((e) => e.line).join("\n")}\n`;

/** How many entries of a kind each schema holds: the yardstick the checks compare against. */
export function countBySchema(toc: Toc, type: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of toc.entries) {
    if (entry.type !== type || entry.schema === null) continue;
    counts[entry.schema] = (counts[entry.schema] ?? 0) + 1;
  }
  return counts;
}
