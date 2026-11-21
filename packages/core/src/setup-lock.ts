import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClodableError } from "./errors.js";
import { tr } from "./i18n.js";

const held = new AsyncLocalStorage<ReadonlySet<string>>();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const codeOf = (error: unknown) => (error as NodeJS.ErrnoException).code;

interface Owner {
  pid: number;
  token: string;
  identity: string;
}

function busy() {
  return new ClodableError({
    code: "needs-choice",
    message: tr("Saving setup is already running for this folder."),
    hint: tr("Wait for it to finish, then try again."),
  });
}

function repair(path: string) {
  return new ClodableError({
    code: "needs-choice",
    message: tr("Saving setup needs a local check before it can continue."),
    hint: tr(
      "Ask Claude to check the interrupted saving setup on this computer, then try again. Your files are unchanged.",
    ),
    details: `Lock owner cannot be verified: ${path}\nCheck that no setup process is running before removing this legacy lock.`,
  });
}

async function ownerOf(path: string): Promise<Owner | undefined> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) throw repair(path);
    const owner = JSON.parse(await readFile(path, "utf8")) as Partial<Owner> | null;
    if (
      !owner ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid! <= 0 ||
      typeof owner.token !== "string" ||
      !owner.token
    )
      throw repair(path);
    return {
      pid: owner.pid!,
      token: owner.token,
      identity: `${stat.dev}:${stat.ino}:${owner.token}`,
    };
  } catch (error) {
    if (codeOf(error) === "ENOENT") return undefined;
    if (error instanceof SyntaxError) throw repair(path);
    throw error;
  }
}

function dead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // Access denied and an unrecognized result never grant permission to remove a lock.
    return codeOf(error) === "ESRCH";
  }
}

async function acquire(path: string): Promise<() => Promise<void>> {
  const token = randomUUID();
  const candidate = `${path}.${token}.owner`;
  try {
    // Publish a complete owner atomically. A killed writer leaves only an unclaimed temp file.
    await writeFile(candidate, JSON.stringify({ pid: process.pid, token }), {
      flag: "wx",
      mode: 0o600,
    });
    for (;;) {
      try {
        await link(candidate, path);
        break;
      } catch (error) {
        if (codeOf(error) !== "EEXIST") throw error;
      }
      const previous = await ownerOf(path);
      if (!previous) continue;
      if (!dead(previous.pid)) throw busy();
      // Serialize recovery for this exact abandoned owner, not for any later live owner.
      // A recoverer can itself die: its atomically published guard is recoverable the same way.
      const guard = join(
        tmpdir(),
        `clodable-setup-recovery-${hash(`${path}\0${previous.identity}`)}.lock`,
      );
      const release = await acquire(guard);
      try {
        const current = await ownerOf(path);
        if (current?.identity === previous.identity) {
          if (!dead(current.pid)) throw busy();
          await rm(path);
        }
      } finally {
        await release();
      }
    }
  } finally {
    await rm(candidate, { force: true });
  }
  let released = false;
  return async () => {
    // Two callers releasing the same lease must not remove the next holder's lock.
    if (released) return;
    released = true;
    const current = await ownerOf(path);
    if (current?.token === token) await rm(path, { force: true });
  };
}

/** Keep the lease through the CLI's initial save; nested core preparation shares that lease. */
export async function withSetupLock<T>(root: string, work: () => Promise<T>): Promise<T> {
  const canonical = await realpath(root);
  const release = await lockSetup(root);
  try {
    return await held.run(new Set([...(held.getStore() ?? []), canonical]), work);
  } finally {
    await release();
  }
}

/** One setup per canonical folder across CLI processes and Desktop conversations. */
export async function lockSetup(root: string): Promise<() => Promise<void>> {
  const canonical = await realpath(root);
  if (held.getStore()?.has(canonical)) return async () => {};
  const path = join(tmpdir(), `clodable-setup-${hash(canonical)}.lock`);
  // Old recovery files have no owner. Never guess that a concurrent older CLI has died.
  if (
    await lstat(`${path}.recovery`).catch((error) => {
      if (codeOf(error) === "ENOENT") return undefined;
      throw error;
    })
  )
    throw repair(`${path}.recovery`);
  return acquire(path);
}
