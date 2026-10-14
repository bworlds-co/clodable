import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { configDir, writeJsonFile } from "./places.js";

/**
 * Secrets the move needs on this computer only: the Supabase access token, a new database's
 * password. They live in one file only this user can read, outside every project, and never reach
 * the project, the chat or a log. `CLODABLE_CONFIG_DIR` moves the file (tests use it).
 */

const file = () => join(configDir(), "secrets.json");

async function load(): Promise<Record<string, string>> {
  if (!existsSync(file())) return {};
  try {
    return JSON.parse(await readFile(file(), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function save(all: Record<string, string>): Promise<void> {
  return writeJsonFile(file(), all, { private: true });
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
