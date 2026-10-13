import { ClodableError } from "../errors.js";
import type { Flow } from "../events.js";
import type { Workspace } from "../workspace.js";
import { copyFiles, type FilesOutcome } from "./files.js";
import { literal, setVaultSecret } from "./fixes.js";
import {
  type DeployOutcome,
  deployFunctions,
  functionSecrets,
  localFunctions,
} from "./functions.js";
import { homeKeys, homeSql } from "./home.js";
import { loadMove, moveDir, updateMove } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/**
 * What goes into the copy after the data: the uploaded files, the backend functions and the
 * secrets they read, and the database's own encrypted secrets (its vault).
 */

/** The steps after the data need a copy to work on. */
async function readyCopy(ws: Workspace) {
  const state = await loadMove(ws.root);
  if (!state.home || !state.export || !state.data) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Copy your data first.",
      hint: "Files, functions and secrets go into the copy, once it exists.",
    });
  }
  return { state, home: state.home, summary: state.export.summary };
}

/**
 * Copy the uploaded files. `sourceKey`: Lovable Cloud's service key, for private folders; it's used
 * for this run only and never saved.
 */
export async function* copyUploads(
  ws: Workspace,
  options: { sourceKey?: string } = {},
): Flow<FilesOutcome> {
  const { state, home, summary } = await readyCopy(ws);
  if (!state.source) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Clodable doesn't know which Lovable Cloud backend the files are in.",
      hint: "Read your export again: it says where your files are.",
    });
  }
  const api = await SupabaseApi.required();
  const keys = await homeKeys(api, home.ref);
  // As large as the biggest file, if the plan allows; otherwise what it allows.
  const largest = Math.max(0, ...summary.buckets.map((b) => b.largest));
  let maxBytes = (await api.storageConfig(home.ref).catch(() => ({ fileSizeLimit: 0 })))
    .fileSizeLimit;
  if (largest > maxBytes) {
    const wanted = Math.min(largest, 50 * 1024 ** 3);
    await api
      .updateStorageConfig(home.ref, { fileSizeLimit: wanted })
      .then(() => {
        maxBytes = wanted;
      })
      .catch(() => {});
  }
  const dir = await moveDir(ws.root);
  const outcome = yield* copyFiles(
    {
      from: state.source.ref,
      to: home.ref,
      secretKey: keys.secret,
      ...(options.sourceKey ? { sourceKey: options.sourceKey.trim() } : {}),
      maxBytes: maxBytes || 50 * 1024 ** 2,
      sql: homeSql(api, home.ref),
    },
    dir,
    summary.buckets,
  );
  await updateMove(ws.root, (s) => {
    s.files = {
      at: new Date().toISOString(),
      copied: outcome.copied,
      total: outcome.total,
      waiting: outcome.waiting,
      tooBig: outcome.tooBig,
      failed: outcome.failed,
    };
  });
  return outcome;
}

export async function* deployBackendFunctions(ws: Workspace): Flow<DeployOutcome> {
  const { home } = await readyCopy(ws);
  const api = await SupabaseApi.required();
  const outcome = yield* deployFunctions(api, home.ref, ws.root);
  await updateMove(ws.root, (s) => {
    s.functions = {
      at: new Date().toISOString(),
      deployed: outcome.deployed,
      failed: outcome.failed,
      missing: outcome.missingSecrets,
    };
  });
  return outcome;
}

/** The secrets the functions need on the new backend, and which ones it has. */
export async function functionSecretStatus(
  ws: Workspace,
): Promise<{ wanted: string[]; set: string[] }> {
  const { home } = await readyCopy(ws);
  const api = await SupabaseApi.required();
  const wanted = await functionSecrets(ws.root, await localFunctions(ws.root));
  const have = new Set(await api.secretNames(home.ref));
  const set = wanted.filter((name) => have.has(name));
  await updateMove(ws.root, (s) => {
    s.secrets = [...new Set([...(s.secrets ?? []), ...set])].sort();
  });
  return { wanted, set };
}

/**
 * Going on without what's left of a step (a prototype that doesn't need it): the settings on the
 * site, the functions' secrets, or the database's encrypted secrets. The step then counts as done.
 */
export async function skipLeftovers(
  ws: Workspace,
  what: "settings" | "secrets" | "vault",
): Promise<{ skipped: typeof what }> {
  await updateMove(ws.root, (s) => {
    s.skipped = { ...s.skipped, [what]: new Date().toISOString() };
  });
  return { skipped: what };
}

/** Vault secrets Clodable fills in itself (the email queue's key is the new project's own). */
export const AUTO_VAULT = new Set(["email_queue_service_role_key"]);

/**
 * The database's own secrets (Supabase Vault). They're encrypted with the old project's key, so
 * their values never come with the export: the builder reads them in Lovable and pastes each.
 */
export async function vaultStatus(
  ws: Workspace,
): Promise<{ wanted: string[]; set: string[]; query?: string }> {
  const state = await loadMove(ws.root);
  const wanted = (state.export?.summary.vaultSecrets ?? [])
    .filter((n) => !AUTO_VAULT.has(n))
    .sort();
  if (wanted.length === 0 || !state.home) return { wanted, set: [] };
  const api = await SupabaseApi.required();
  const names = wanted.map(literal).join(", ");
  const rows = await homeSql(api, state.home.ref).rows<{ name: string }>(
    `select name from vault.secrets where name in (${names})`,
  );
  const set = rows.map((r) => r.name).sort();
  await updateMove(ws.root, (s) => {
    s.vault = set;
  });
  return {
    wanted,
    set,
    query: `select name, decrypted_secret from vault.decrypted_secrets where name in (${names});`,
  };
}

/** One of them, its value on stdin: straight into the new backend's vault. */
export async function setVaultValue(
  ws: Workspace,
  name: string | undefined,
  value: string,
): Promise<{ wanted: string[]; set: string[] }> {
  const state = await loadMove(ws.root);
  const wanted = (state.export?.summary.vaultSecrets ?? []).filter((n) => !AUTO_VAULT.has(n));
  if (!name || !wanted.includes(name)) {
    throw new ClodableError({
      code: "invalid-config",
      message: name ? `Your database has no secret called “${name}”.` : "Which secret?",
      ...(wanted.length > 0 ? { hint: `It has: ${wanted.join(", ")}.` } : {}),
    });
  }
  if (!value.trim() || !state.home) {
    throw new ClodableError({ code: "invalid-config", message: "That secret is empty." });
  }
  const api = await SupabaseApi.required();
  await setVaultSecret(homeSql(api, state.home.ref), name, value.replace(/\r?\n$/, ""));
  const status = await vaultStatus(ws);
  return { wanted: status.wanted, set: status.set };
}

/** Set one secret on the new backend. The value goes straight to Supabase, never to a file. */
export async function setFunctionSecret(
  ws: Workspace,
  name: string,
  value: string,
): Promise<{ wanted: string[]; set: string[] }> {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name.startsWith("SUPABASE_")) {
    throw new ClodableError({
      code: "invalid-config",
      message: `“${name}” isn't a secret name Supabase accepts.`,
      hint: "Use capitals, digits and underscores, not starting with SUPABASE_.",
    });
  }
  if (!value.trim()) {
    throw new ClodableError({ code: "invalid-config", message: "That secret is empty." });
  }
  const { home } = await readyCopy(ws);
  const api = await SupabaseApi.required();
  await api.setSecrets(home.ref, [{ name, value: value.replace(/\r?\n$/, "") }]);
  await updateMove(ws.root, (s) => {
    s.secrets = [...new Set([...(s.secrets ?? []), name])].sort();
  });
  return functionSecretStatus(ws);
}
