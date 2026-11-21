import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { ClodableError } from "./errors.js";
import { tr } from "./i18n.js";

const ORIGINALS = ".clodable/local/original";
const IGNORE = "/.clodable/local/";

export interface PreparationBackup {
  id: string;
  /** Relative to the app; file names and contents stay in the private manifest. */
  path: string;
  files: number;
  bytes: number;
  completed: true;
}

type Entry =
  | { path: string; kind: "directory"; mode: number }
  | { path: string; kind: "file"; mode: number; bytes: number; sha256: string }
  | { path: string; kind: "symlink"; target: string };

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

async function exists(path: string) {
  return lstat(path).catch((error: unknown) => {
    if (absent(error)) return undefined;
    throw error;
  });
}

/** The snapshot's ancestors must be real folders, never redirects into another folder. */
async function privateFolder(path: string): Promise<void> {
  const before = await exists(path);
  if (!before)
    await mkdir(path, { mode: 0o700 }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
  const now = await lstat(path);
  if (!now.isDirectory() || now.isSymbolicLink()) throw new Error("Unsafe backup folder.");
}

async function regularFile(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) throw new Error("An app file changed while being copied.");
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

async function fileHash(path: string): Promise<string> {
  const file = await regularFile(path);
  try {
    const digest = createHash("sha256");
    for await (const chunk of file.createReadStream({ autoClose: false })) digest.update(chunk);
    return digest.digest("hex");
  } finally {
    await file.close();
  }
}

/** Only skip dependency folders with an actual package-manager installation marker. */
async function installedDependencies(path: string): Promise<boolean> {
  for (const marker of [
    ".package-lock.json",
    ".modules.yaml",
    ".yarn-integrity",
    ".yarn-state.yml",
  ]) {
    const file = join(path, marker);
    if (!(await exists(file))?.isFile()) continue;
    const contents = await readFile(file, "utf8");
    if (marker === ".modules.yaml" && /^layoutVersion: \d+$/m.test(contents)) return true;
    if (marker === ".yarn-state.yml" && /^__metadata:\s*$/m.test(contents)) return true;
    if (marker.endsWith(".json") || marker === ".yarn-integrity") {
      try {
        const data = JSON.parse(contents) as Record<string, unknown>;
        if (
          marker === ".package-lock.json" &&
          typeof data.lockfileVersion === "number" &&
          data.packages &&
          typeof data.packages === "object"
        )
          return true;
        if (
          marker === ".yarn-integrity" &&
          Array.isArray(data.topLevelPatterns) &&
          typeof data.systemParams === "string"
        )
          return true;
      } catch {
        // A folder with an unrecognized marker may be original work: preserve it.
      }
    }
  }
  return false;
}

async function inventory(root: string): Promise<{ entries: Entry[]; excluded: string[] }> {
  const entries: Entry[] = [];
  const excluded: string[] = [];
  async function walk(relative: string) {
    const directory = join(root, relative);
    if ((await realpath(directory)) !== directory)
      throw new Error("An app folder changed while being copied.");
    for (const name of (await readdir(directory)).sort()) {
      const path = relative ? `${relative}/${name}` : name;
      if (name === ".git" || path === ".clodable/local") {
        excluded.push(path);
        continue;
      }
      const full = join(root, path);
      const stat = await lstat(full);
      if (stat.isSymbolicLink()) {
        entries.push({ path, kind: "symlink", target: await readlink(full) });
      } else if (stat.isDirectory()) {
        if (name === "node_modules" && (await installedDependencies(full))) {
          excluded.push(path);
          continue;
        }
        entries.push({ path, kind: "directory", mode: stat.mode & 0o777 });
        await walk(path);
      } else if (stat.isFile()) {
        entries.push({
          path,
          kind: "file",
          mode: stat.mode & 0o777,
          bytes: stat.size,
          sha256: await fileHash(full),
        });
      } else {
        throw new Error("The app contains a file that cannot be preserved safely.");
      }
    }
  }
  await walk("");
  return { entries, excluded };
}

async function copyEntry(root: string, destination: string, entry: Entry): Promise<void> {
  const source = join(root, entry.path);
  const target = join(destination, entry.path);
  if (entry.kind === "directory") {
    await mkdir(target, { mode: 0o700 });
  } else if (entry.kind === "symlink") {
    await symlink(entry.target, target);
  } else {
    if ((await realpath(dirname(source))) !== dirname(source)) {
      throw new Error("An app folder changed while being copied.");
    }
    const input = await regularFile(source);
    try {
      const output = await open(target, "wx", 0o600);
      try {
        await pipeline(input.createReadStream(), output.createWriteStream());
        await chmod(target, entry.mode);
      } finally {
        await output.close();
      }
    } finally {
      await input.close();
    }
  }
}

async function verifyCopy(destination: string, entries: Entry[]): Promise<void> {
  for (const entry of entries) {
    const path = join(destination, entry.path);
    const stat = await lstat(path);
    if (entry.kind === "directory" && stat.isDirectory() && !stat.isSymbolicLink()) continue;
    if (
      entry.kind === "symlink" &&
      stat.isSymbolicLink() &&
      (await readlink(path)) === entry.target
    )
      continue;
    if (
      entry.kind === "file" &&
      stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size === entry.bytes &&
      (await fileHash(path)) === entry.sha256
    )
      continue;
    throw new Error("The local backup did not match the original app.");
  }
}

/** Ignore partial snapshots too, without changing any app file before verification. */
async function ignoreSnapshots(originals: string): Promise<void> {
  const path = join(originals, ".gitignore");
  const stat = await exists(path);
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new Error("Unsafe backup ignore file.");
  const before = stat ? await readFile(path) : Buffer.alloc(0);
  if (before.toString("utf8").trimEnd().split(/\r?\n/).at(-1) === "*") return;
  const file = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile("\n*\n");
  } finally {
    await file.close();
  }
}

/** This is the only app file changed, after the source and snapshot have both been verified. */
async function keepPrivate(root: string, staging: string, entries: Entry[]): Promise<void> {
  const original = entries.find((entry) => entry.path === ".gitignore");
  const path = join(root, ".gitignore");
  const stat = await exists(path);
  if (original?.kind === "symlink" || (stat && (!stat.isFile() || stat.isSymbolicLink()))) {
    throw new Error("The app's ignore file is not a regular file.");
  }
  const before = stat ? await readFile(path) : Buffer.alloc(0);
  if (
    (original?.kind === "file" && (!stat || hash(before) !== original.sha256)) ||
    (!original && stat)
  )
    throw new Error("The app's ignore file changed during the backup.");
  if (before.toString("utf8").trimEnd().endsWith(`\n${IGNORE}`)) return;
  const temporary = join(staging, "ignore.tmp");
  await writeFile(temporary, Buffer.concat([before, Buffer.from(`\n${IGNORE}\n`)]), {
    flag: "wx",
    mode: stat ? stat.mode & 0o777 : 0o644,
  });
  try {
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Preserve a local app before Claude adapts it. Never runs Git, setup, or a network request. */
export async function backupOriginal(folder: string): Promise<PreparationBackup> {
  let staging: string | undefined;
  try {
    const root = await realpath(folder);
    const ignore = await exists(join(root, ".gitignore"));
    if (ignore && (!ignore.isFile() || ignore.isSymbolicLink()))
      throw new Error("The app's ignore file is not a regular file.");
    for (const relative of [".clodable", ".clodable/local", ORIGINALS]) {
      await privateFolder(join(root, relative));
    }
    const originals = join(root, ORIGINALS);
    await chmod(originals, 0o700);
    await ignoreSnapshots(originals);
    const id = randomUUID();
    staging = join(originals, `.incomplete-${id}`);
    await mkdir(staging, { mode: 0o700 });
    const files = join(staging, "files");
    await mkdir(files, { mode: 0o700 });
    const before = await inventory(root);
    for (const entry of before.entries) await copyEntry(root, files, entry);
    await verifyCopy(files, before.entries);
    if (JSON.stringify(await inventory(root)) !== JSON.stringify(before)) {
      throw new Error("The app changed during the backup. Stop other edits and try again.");
    }
    const manifest = `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), ...before }, null, 2)}\n`;
    await writeFile(join(staging, "manifest.json"), manifest, { flag: "wx", mode: 0o600 });
    await writeFile(
      join(staging, "complete.json"),
      `${JSON.stringify({ manifestSha256: hash(manifest) })}\n`,
      {
        flag: "wx",
        mode: 0o600,
      },
    );
    const destination = join(originals, id);
    if (await exists(destination)) throw new Error("A backup already exists at this location.");
    await rename(staging, destination);
    staging = undefined;
    // Keep the verified original even if updating ignore rules fails afterwards.
    await keepPrivate(root, destination, before.entries);
    return {
      id,
      path: `${ORIGINALS}/${id}`,
      files: before.entries.filter((entry) => entry.kind !== "directory").length,
      bytes: before.entries.reduce(
        (sum, entry) => sum + (entry.kind === "file" ? entry.bytes : 0),
        0,
      ),
      completed: true,
    };
  } catch (error) {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
    const code = (error as NodeJS.ErrnoException).code;
    throw new ClodableError({
      code: "copy-failed",
      message: tr("Couldn't preserve your app before preparing it."),
      hint: tr("Your app has not been converted. Fix the local backup problem, then try again."),
      // System error messages can contain arbitrary file names. Never return their contents or paths.
      details: code
        ? `Local backup failed (${code}).`
        : error instanceof Error
          ? error.message
          : "Local backup failed.",
    });
  }
}
