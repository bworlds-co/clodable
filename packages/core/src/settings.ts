import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { ClodableError } from "./errors.js";
import { readSecret, storeSecret } from "./local-secrets.js";
import { NetlifyApi } from "./move/netlify-api.js";
import { appSettings } from "./move/site.js";
import { loadMove, updateMove } from "./move/state.js";
import { writeJsonFile } from "./places.js";
import type { Workspace } from "./workspace.js";

/**
 * The settings the app's server code reads (`process.env.GREETING`), on this computer, for the
 * preview. On Lovable they live in More → Cloud → Secrets; on the builder's own site, in its host's
 * settings. Their values stay in Clodable's private store, never in the project, and `clodable dev`
 * gives them to the app. A setting pasted once goes to both: here, and the site on Netlify.
 */

/** Names only (never values): `clodable dev` watches it to restart when a setting changes. */
export const SETTINGS_PATH = ".clodable/local/settings.json";

function storeKey(root: string): string {
  let real = root;
  try {
    real = realpathSync(root);
  } catch {
    // keep the path as given
  }
  return `app-settings:${createHash("sha256").update(real).digest("hex").slice(0, 16)}`;
}

/** The values on this computer, for the preview. */
export async function localSettings(root: string): Promise<Record<string, string>> {
  const stored = await readSecret(storeKey(root));
  if (!stored) return {};
  try {
    return JSON.parse(stored) as Record<string, string>;
  } catch {
    return {};
  }
}

export interface SettingsStatus {
  /** What the server code reads, Lovable's own keys aside. */
  wanted: string[];
  /** Of those, the ones with a value on this computer. */
  local: string[];
  /** Lovable's own keys: they only work on Lovable. */
  lovable: string[];
  /** On the site on Netlify, once the app has one: the ones it has a value for. */
  site?: string[];
}

export async function settingsStatus(ws: Workspace): Promise<SettingsStatus> {
  const { wanted, lovable } = await appSettings(ws.root);
  const values = await localSettings(ws.root);
  const move = await loadMove(ws.root);
  return {
    wanted,
    local: wanted.filter((name) => values[name] !== undefined),
    lovable,
    ...(move.site
      ? { site: wanted.filter((name) => (move.siteSettings ?? []).includes(name)) }
      : {}),
  };
}

/** Set one setting: on this computer, and on the site on Netlify when the app has one. */
export async function setSetting(
  ws: Workspace,
  name: string | undefined,
  value: string,
): Promise<SettingsStatus> {
  if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new ClodableError({
      code: "invalid-config",
      message: name ? `“${name}” isn't a setting name.` : "Which setting?",
      hint: "Use capitals, digits and underscores, like GREETING.",
    });
  }
  const clean = value.replace(/\r?\n$/, "");
  if (!clean.trim()) {
    throw new ClodableError({ code: "invalid-config", message: "That setting is empty." });
  }
  const values = await localSettings(ws.root);
  values[name] = clean;
  await storeSecret(storeKey(ws.root), JSON.stringify(values));
  await writeJsonFile(join(ws.root, SETTINGS_PATH), {
    names: Object.keys(values).sort(),
    at: new Date().toISOString(),
  });
  const move = await loadMove(ws.root);
  if (move.site) {
    const netlify = await NetlifyApi.onThisComputer();
    if (netlify) {
      // VITE_ settings are built into the page on purpose: kept as secrets, Netlify's scan for
      // leaked secrets would stop the deploy.
      await netlify.setEnv(move.site.account, move.site.id, name, clean, {
        secret: !name.startsWith("VITE_"),
      });
      await updateMove(ws.root, (s) => {
        s.siteSettings = [...new Set([...(s.siteSettings ?? []), name])].sort();
      });
    }
  }
  return settingsStatus(ws);
}
