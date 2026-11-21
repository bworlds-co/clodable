import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { lockSetup, withSetupLock } from "../src/setup-lock.js";

let root: string;
let path: string;
const children = new Set<ChildProcess>();
const files = new Set<string>();
const DEAD_PID = 2_147_483_647;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "clodable-setup-lock-test-")));
  path = join(tmpdir(), `clodable-setup-${hash(root)}.lock`);
  files.add(path);
  files.add(`${path}.recovery`);
});

async function stop(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  children.delete(child);
}

afterEach(async () => {
  await Promise.all([...children].map(stop));
  for (const name of await readdir(tmpdir())) {
    if (name.startsWith(`${basename(path)}.`) && name.endsWith(".owner"))
      files.add(join(tmpdir(), name));
  }
  await Promise.all([...files].map((file) => rm(file, { recursive: true, force: true })));
  files.clear();
  await rm(root, { recursive: true, force: true });
});

/** Stop real CLI-like processes at the filesystem boundaries that used to strand the lock. */
async function childAt(phase: "held" | "owner-write" | "recovery-link") {
  const source = new URL("../src/setup-lock.ts", import.meta.url).href;
  const script = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const phase = ${JSON.stringify(phase)};
    setInterval(() => {}, 1000);
    const stopHere = async path => {
      process.stdout.write(JSON.stringify({ path }) + '\\n');
      await new Promise(() => {});
    };
    if (phase === 'owner-write') {
      const write = fs.promises.writeFile;
      fs.promises.writeFile = async (path, ...args) => {
        if (String(path).endsWith('.owner')) {
          await write(path, '', { flag: 'wx', mode: 0o600 });
          await stopHere(path);
        }
        return write(path, ...args);
      };
    }
    if (phase === 'recovery-link') {
      const link = fs.promises.link;
      fs.promises.link = async (from, to) => {
        await link(from, to);
        if (String(to).includes('clodable-setup-recovery-')) await stopHere(to);
      };
    }
    syncBuiltinESMExports();
    const { lockSetup } = await import(${JSON.stringify(source)});
    await lockSetup(${JSON.stringify(root)});
    await stopHere(${JSON.stringify(path)});
  `;
  const child = spawn(
    process.execPath,
    ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", script],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.add(child);
  let stderr = "";
  child.stderr!.on("data", (data) => {
    stderr += String(data);
  });
  const stopped = await new Promise<{ path: string }>((resolve, reject) => {
    let stdout = "";
    child.stdout!.on("data", (data) => {
      stdout += String(data);
      if (!stdout.includes("\n")) return;
      try {
        resolve(JSON.parse(stdout.split("\n")[0]!) as { path: string });
      } catch (error) {
        reject(error);
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Lock child exited ${code}: ${stderr}`)));
  });
  files.add(stopped.path);
  return { child, stopped: stopped.path };
}

it("excludes concurrent callers and an old release cannot remove the next holder", async () => {
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => lockSetup(root)));
  const acquired = attempts.filter((attempt) => attempt.status === "fulfilled");
  expect(acquired).toHaveLength(1);
  expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(11);
  const release = acquired[0]!.value;
  await Promise.all([release(), release()]);
  const next = await lockSetup(root);
  await release();
  await expect(lockSetup(root)).rejects.toMatchObject({ code: "needs-choice" });
  await next();
});

it("shares nested setup work and releases the outer lease on failure", async () => {
  await expect(
    withSetupLock(root, async () => {
      await withSetupLock(root, async () => {
        const release = await lockSetup(root);
        await release();
      });
      throw new Error("interrupted setup");
    }),
  ).rejects.toThrow("interrupted setup");
  await (await lockSetup(root))();
});

it.skipIf(process.platform === "win32")(
  "uses the same lease through a folder symlink",
  async () => {
    const alias = `${root}-alias`;
    files.add(alias);
    await symlink(root, alias);
    const release = await lockSetup(root);
    await expect(lockSetup(alias)).rejects.toMatchObject({ code: "needs-choice" });
    await release();
  },
);

it("keeps a live process's lock and recovers it after that process is killed", async () => {
  const { child } = await childAt("held");
  const before = await readFile(path, "utf8");
  expect(JSON.parse(before)).toMatchObject({ pid: child.pid, token: expect.any(String) });
  await expect(lockSetup(root)).rejects.toMatchObject({
    message: "Saving setup is already running for this folder.",
  });
  expect(await readFile(path, "utf8")).toBe(before);
  await stop(child);
  await (await lockSetup(root))();
});

it("can start after a writer dies before publishing its owner", async () => {
  const { child, stopped } = await childAt("owner-write");
  expect(await readFile(stopped, "utf8")).toBe("");
  await expect(lstat(path)).rejects.toMatchObject({ code: "ENOENT" });
  await stop(child);
  await (await lockSetup(root))();
});

it("recovers an interrupted recoverer without admitting two competing setups", async () => {
  await writeFile(path, JSON.stringify({ pid: DEAD_PID, token: "original-dead-owner" }));
  const { child, stopped } = await childAt("recovery-link");
  const guard = JSON.parse(await readFile(stopped, "utf8")) as { pid: number; token: string };
  expect(guard.pid).toBe(child.pid);
  // The guard candidate is hard-linked until acquire() returns; a killed child cannot clean it.
  files.add(`${stopped}.${guard.token}.owner`);
  await expect(lockSetup(root)).rejects.toMatchObject({
    message: "Saving setup is already running for this folder.",
  });
  await stop(child);
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => lockSetup(root)));
  const acquired = attempts.filter((attempt) => attempt.status === "fulfilled");
  expect(acquired).toHaveLength(1);
  await acquired[0]!.value();
});

it.each(["", "{", "null", JSON.stringify({ pid: process.pid })])(
  "preserves ambiguous legacy owner metadata (%j) and explains the repair",
  async (contents) => {
    await writeFile(path, contents);
    await expect(lockSetup(root)).rejects.toMatchObject({
      message: "Saving setup needs a local check before it can continue.",
      details: expect.stringContaining(path),
    });
    expect(await readFile(path, "utf8")).toBe(contents);
  },
);

it("does not guess that an ownerless legacy recovery is abandoned", async () => {
  const contents = JSON.stringify({ pid: DEAD_PID, token: "legacy-owner" });
  await writeFile(path, contents);
  await writeFile(`${path}.recovery`, "");
  await expect(lockSetup(root)).rejects.toMatchObject({
    message: "Saving setup needs a local check before it can continue.",
    details: expect.stringContaining(`${path}.recovery`),
  });
  expect(await readFile(path, "utf8")).toBe(contents);
  expect(await readFile(`${path}.recovery`, "utf8")).toBe("");
});
