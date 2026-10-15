import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Where Clodable keeps things on this computer, and how it writes them. Outside every project,
 * the usual way on each system: settings and secrets in the config folder, downloaded tools in
 * the cache. `CLODABLE_CONFIG_DIR` and `CLODABLE_CACHE_DIR` move them (tests use them). The tools
 * a builder would otherwise install go where the plugin says (`toolsDir`).
 */

export function configDir(): string {
  if (process.env.CLODABLE_CONFIG_DIR) return process.env.CLODABLE_CONFIG_DIR;
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "clodable");
  }
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "clodable");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "clodable");
}

/**
 * Where the tools Clodable fetches for a builder who has none go (the GitHub CLI; the plugin's
 * Node.js): the plugin's own data folder, which Claude Code removes with the plugin. The plugin
 * passes it in `CLODABLE_TOOLS_DIR`; the CLI on its own uses the cache.
 */
export function toolsDir(): string {
  return process.env.CLODABLE_TOOLS_DIR || cacheDir();
}

export function cacheDir(): string {
  if (process.env.CLODABLE_CACHE_DIR) return process.env.CLODABLE_CACHE_DIR;
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches", "clodable");
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "clodable");
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clodable");
}

/**
 * Write a JSON file whole under a temporary name, then swap it in: a crash, or a reader at the
 * wrong moment, never sees half a file. A private one only this user can read, in a folder only
 * they can open.
 */
export async function writeJsonFile(
  path: string,
  value: unknown,
  options: { private?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, ...(options.private ? { mode: 0o700 } : {}) });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(
    tmp,
    `${JSON.stringify(value, null, 2)}\n`,
    options.private ? { mode: 0o600 } : {},
  );
  // The mode given to writeFile passes through the umask: make sure.
  if (options.private) await chmod(tmp, 0o600);
  await rename(tmp, path);
}
