import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Secrets the move needs on this computer only: the Supabase access token, a new database's
 * password. They live in one file only this user can read, outside every project, and never reach
 * the project, the chat or a log. `CLODABLE_CONFIG_DIR` moves the file (tests use it).
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

const file = () => join(configDir(), "secrets.json");

async function load(): Promise<Record<string, string>> {
  if (!existsSync(file())) return {};
  try {
    return JSON.parse(await readFile(file(), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

async function save(all: Record<string, string>): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  // Written whole under a temporary name, then swapped in, so a crash never leaves half a file.
  const tmp = `${file()}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file());
}

export async function readSecret(name: string): Promise<string | undefined> {
  return (await load())[name];
}

export async function storeSecret(name: string, value: string): Promise<void> {
  const all = await load();
  all[name] = value;
  await save(all);
}

export async function forgetSecret(name: string): Promise<void> {
  const all = await load();
  if (!(name in all)) return;
  delete all[name];
  await save(all);
}
