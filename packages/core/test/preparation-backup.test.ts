import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backupOriginal } from "../src/preparation-backup.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), rename: vi.fn(actual.rename) };
});
const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

const roots: string[] = [];
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "clodable-original-")));
  roots.push(root);
  return root;
}
async function put(root: string, path: string, contents: string | Buffer) {
  await fs.mkdir(dirname(join(root, path)), { recursive: true });
  await fs.writeFile(join(root, path), contents);
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(fs.open).mockImplementation(actualFs.open);
  vi.mocked(fs.rename).mockImplementation(actualFs.rename);
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("preparing a local app: preserving the original", () => {
  it("preserves hidden, untracked, binary and environment files before changing ignore rules", async () => {
    const root = await fixture();
    const files = {
      "index.html": "<!doctype html><button>Keep my app</button>",
      "assets/photo.bin": Buffer.from([0, 255, 2, 10]),
      ".env.local": "SECRET_FOR_BACKUP_TEST=keep-private\n",
      ".hidden/settings.json": '{"keep":true}',
      ".gitignore": "# Original rules\r\n.env*\r\n",
      "dist/only-copy.html": "An old static app can have its only source here",
      ".claude/settings.json": '{"language":"French"}',
    };
    for (const [path, contents] of Object.entries(files)) await put(root, path, contents);
    await put(root, ".clodable/local/private-state.json", "not app source");
    const result = await backupOriginal(root);
    const snapshot = join(root, result.path);
    expect(result.completed).toBe(true);
    expect(result.files).toBe(Object.keys(files).length);
    for (const [path, contents] of Object.entries(files)) {
      expect(await fs.readFile(join(snapshot, "files", path))).toEqual(Buffer.from(contents));
    }
    expect(existsSync(join(snapshot, "files/.clodable/local"))).toBe(false);
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(await fs.readFile(join(root, ".gitignore"), "utf8")).toBe(
      `${files[".gitignore"]}\n/.clodable/local/\n`,
    );
    const manifest = await fs.readFile(join(snapshot, "manifest.json"));
    const complete = JSON.parse(await fs.readFile(join(snapshot, "complete.json"), "utf8"));
    expect(complete.manifestSha256).toBe(createHash("sha256").update(manifest).digest("hex"));
    expect(JSON.stringify(result)).not.toContain("keep-private");
    expect(manifest.toString()).not.toContain("keep-private");
    expect((await fs.stat(join(root, ".clodable/local/original"))).mode & 0o777).toBe(0o700);
  });

  it("keeps every original on retry and excludes existing snapshots and Git metadata", async () => {
    const root = await fixture();
    await put(root, "index.html", "first version");
    await put(root, ".git/identity", "untouched");
    const first = await backupOriginal(root);
    await put(root, "index.html", "builder's next version");
    const second = await backupOriginal(root);
    expect(second.path).not.toBe(first.path);
    expect(await fs.readFile(join(root, first.path, "files/index.html"), "utf8")).toBe(
      "first version",
    );
    expect(await fs.readFile(join(root, second.path, "files/index.html"), "utf8")).toBe(
      "builder's next version",
    );
    expect(existsSync(join(root, second.path, "files/.git"))).toBe(false);
    expect(existsSync(join(root, second.path, "files/.clodable/local"))).toBe(false);
    expect(await fs.readFile(join(root, ".git/identity"), "utf8")).toBe("untouched");
  });

  it("preserves symlinks as links without reading or copying their external targets", async () => {
    const root = await fixture();
    const outside = await fixture();
    await put(outside, "secret.txt", "outside secret");
    await fs.symlink(outside, join(root, "linked-folder"));
    await fs.symlink("missing-target", join(root, "broken-link"));
    const result = await backupOriginal(root);
    const copied = join(root, result.path, "files");
    expect((await fs.lstat(join(copied, "linked-folder"))).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(join(copied, "linked-folder"))).toBe(outside);
    expect(await fs.readlink(join(copied, "broken-link"))).toBe("missing-target");
    const manifest = await fs.readFile(join(root, result.path, "manifest.json"), "utf8");
    expect(manifest).not.toContain("secret.txt");
    expect(manifest).not.toContain("outside secret");
  });

  it("only excludes dependency folders that contain recognizable installation metadata", async () => {
    const root = await fixture();
    await put(
      root,
      "node_modules/.package-lock.json",
      JSON.stringify({ lockfileVersion: 3, packages: {} }),
    );
    await put(root, "node_modules/react/index.js", "installed code");
    await put(root, "old/node_modules/.package-lock.json", "not installation metadata");
    await put(root, "old/node_modules/my-work.txt", "irreplaceable");
    const result = await backupOriginal(root);
    const copied = join(root, result.path, "files");
    expect(existsSync(join(copied, "node_modules"))).toBe(false);
    expect(await fs.readFile(join(copied, "old/node_modules/my-work.txt"), "utf8")).toBe(
      "irreplaceable",
    );
  });

  for (const redirect of [
    ".clodable",
    ".clodable/local",
    ".clodable/local/original",
    ".gitignore",
  ]) {
    it(`rejects a symlink at ${redirect} without changing the app or its destination`, async () => {
      const root = await fixture();
      const outside = await fixture();
      await put(root, "index.html", "original");
      await fs.mkdir(dirname(join(root, redirect)), { recursive: true });
      await fs.symlink(outside, join(root, redirect));
      await expect(backupOriginal(root)).rejects.toMatchObject({ code: "copy-failed" });
      expect(await fs.readFile(join(root, "index.html"), "utf8")).toBe("original");
      expect(await fs.readdir(outside)).toEqual([]);
    });
  }

  it("does not edit source or ignore rules when a copy fails, and retries cleanly", async () => {
    const root = await fixture();
    await put(root, "index.html", "original");
    await put(root, ".gitignore", "original-ignore\n");
    const failed = vi.mocked(fs.open).mockImplementation(async (path, ...args) => {
      if (String(path).endsWith("/files/index.html"))
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      return actualFs.open(path, ...args);
    });
    await expect(backupOriginal(root)).rejects.toMatchObject({
      code: "copy-failed",
      details: "Local backup failed (ENOSPC).",
    });
    expect(await fs.readFile(join(root, ".gitignore"), "utf8")).toBe("original-ignore\n");
    expect(await fs.readFile(join(root, "index.html"), "utf8")).toBe("original");
    expect(await fs.readdir(join(root, ".clodable/local/original"))).toEqual([".gitignore"]);
    failed.mockImplementation(actualFs.open);
    expect((await backupOriginal(root)).completed).toBe(true);
  });

  it("detects concurrent source changes before allowing preparation", async () => {
    const root = await fixture();
    await put(root, "index.html", "before");
    await put(root, ".gitignore", "keep-this\n");
    let sourceReads = 0;
    vi.mocked(fs.open).mockImplementation(async (path, ...args) => {
      if (String(path) === join(root, "index.html") && ++sourceReads === 3) {
        await fs.writeFile(join(root, "index.html"), "someone else's new work");
      }
      return actualFs.open(path, ...args);
    });
    await expect(backupOriginal(root)).rejects.toMatchObject({ code: "copy-failed" });
    expect(await fs.readFile(join(root, "index.html"), "utf8")).toBe("someone else's new work");
    expect(await fs.readFile(join(root, ".gitignore"), "utf8")).toBe("keep-this\n");
    expect(await fs.readdir(join(root, ".clodable/local/original"))).toEqual([".gitignore"]);
  });

  it("retains the verified original if making the app ignore it fails afterwards", async () => {
    const root = await fixture();
    await put(root, "index.html", "original");
    await put(root, ".gitignore", "original-ignore\n");
    vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (String(to) === join(root, ".gitignore"))
        throw Object.assign(new Error("read only"), { code: "EACCES" });
      return actualFs.rename(from, to);
    });
    await expect(backupOriginal(root)).rejects.toMatchObject({ code: "copy-failed" });
    expect(await fs.readFile(join(root, ".gitignore"), "utf8")).toBe("original-ignore\n");
    const originals = join(root, ".clodable/local/original");
    const [snapshot] = (await fs.readdir(originals)).filter((name) => !name.startsWith("."));
    expect(snapshot).toBeDefined();
    expect(await fs.readFile(join(originals, snapshot!, "files/.gitignore"), "utf8")).toBe(
      "original-ignore\n",
    );
    expect(existsSync(join(originals, snapshot!, "complete.json"))).toBe(true);
    expect((await fs.readFile(join(originals, ".gitignore"), "utf8")).trim()).toBe("*");
  });
});
