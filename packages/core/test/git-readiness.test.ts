import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandPath, exec } from "../src/exec.js";
import { Git } from "../src/git.js";
import { gitReadiness } from "../src/git-readiness.js";

vi.mock("../src/exec.js", async (original) => {
  const actual = await original<typeof import("../src/exec.js")>();
  return { ...actual, commandPath: vi.fn(actual.commandPath), exec: vi.fn(actual.exec) };
});
const actual = await vi.importActual<typeof import("../src/exec.js")>("../src/exec.js");
const platform = process.platform;
let dir: string;
let bin: string;
let log: string;

async function program(name: string, body: string) {
  const path = join(bin, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return path;
}

beforeEach(async () => {
  vi.mocked(commandPath).mockImplementation(actual.commandPath);
  vi.mocked(exec).mockImplementation(actual.exec);
  dir = await mkdtemp(join(tmpdir(), "clodable-git-probe-"));
  bin = join(dir, "bin");
  log = join(dir, "git.log");
  await mkdir(bin);
  await writeFile(log, "");
  await symlink("/bin/sh", join(bin, "sh"));
  vi.stubEnv("PATH", bin);
  vi.stubEnv("GIT_PROBE_LOG", log);
  vi.stubEnv("DEVELOPER_DIR", undefined);
});

afterEach(async () => {
  Object.defineProperty(process, "platform", { value: platform });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function appleGit(selection: string, exit = 0) {
  Object.defineProperty(process, "platform", { value: "darwin" });
  const git = await program(
    "git",
    'printf "%s\\n" "$*" >> "$GIT_PROBE_LOG"; echo "git version 2.50.0"',
  );
  const select = await program("xcode-select", `printf '%s\\n' '${selection}'; exit ${exit}`);
  vi.mocked(commandPath).mockResolvedValue("/usr/bin/git");
  vi.mocked(exec).mockImplementation((command, args, options) => {
    if (command === "/usr/bin/git") return actual.exec(git, args, options);
    if (command === "/usr/bin/xcode-select") return actual.exec(select, args, options);
    throw new Error(`Unexpected command in Apple probe: ${command}`);
  });
}

describe.skipIf(platform === "win32")("Git readiness", () => {
  it("rejects missing Git and a failing executable without invoking repository commands", async () => {
    expect(await gitReadiness(dir)).toMatchObject({
      ok: false,
      error: { code: "tools-unavailable" },
    });
    await program(
      "git",
      'printf "%s\\n" "$*" >> "$GIT_PROBE_LOG"; echo "broken tools" >&2; exit 1',
    );
    await expect(new Git(dir).isRepo()).rejects.toMatchObject({
      code: "tools-unavailable",
      details: expect.stringContaining("broken tools"),
    });
    expect(await readFile(log, "utf8")).toBe("--version\n");
  });

  it("never invokes the Apple shim when developer tools are absent or incomplete", async () => {
    await appleGit("No developer directory", 1);
    expect(await gitReadiness(dir)).toMatchObject({
      ok: false,
      error: { hint: expect.stringContaining("xcode-select --install") },
    });
    await appleGit(join(dir, "incomplete"));
    expect(await gitReadiness(dir)).toMatchObject({
      ok: false,
      error: { hint: expect.stringContaining("Ask Claude") },
    });
    expect(await readFile(log, "utf8")).toBe("");
  });

  it.each(["CommandLineTools", "Xcode.app/Contents/Developer"])(
    "checks functional Git after selecting %s",
    async (location) => {
      const selected = join(dir, location);
      await mkdir(join(selected, "usr/bin"), { recursive: true });
      await writeFile(join(selected, "usr/bin/git"), "", { mode: 0o755 });
      await appleGit(selected);
      expect(await gitReadiness(dir)).toEqual({ ok: true, executable: "/usr/bin/git" });
      expect(await readFile(log, "utf8")).toBe("--version\n");
    },
  );

  it("keeps a broken DEVELOPER_DIR as a repair problem", async () => {
    vi.stubEnv("DEVELOPER_DIR", join(dir, "missing-Xcode.app"));
    await appleGit("Invalid developer directory", 1);
    expect(await gitReadiness(dir)).toMatchObject({
      ok: false,
      error: { hint: expect.stringContaining("Ask Claude") },
    });
    expect(await readFile(log, "utf8")).toBe("");
  });

  it("accepts DEVELOPER_DIR pointing at an Xcode application bundle", async () => {
    const application = join(dir, "Xcode-beta.app");
    await mkdir(join(application, "Contents/Developer/usr/bin"), { recursive: true });
    await writeFile(join(application, "Contents/Developer/usr/bin/git"), "", { mode: 0o755 });
    vi.stubEnv("DEVELOPER_DIR", application);
    await appleGit(application);
    expect(await gitReadiness(dir)).toEqual({ ok: true, executable: "/usr/bin/git" });
  });

  it("recognizes an Apple shim through a relative PATH symlink", async () => {
    await appleGit("No developer directory", 1);
    await symlink("/usr/bin/git", join(bin, "apple-git"));
    vi.mocked(commandPath).mockResolvedValue("bin/apple-git");
    expect(await gitReadiness(dir)).toMatchObject({ ok: false });
    expect(await readFile(log, "utf8")).toBe("");
  });

  it("accepts working standalone Git without checking Apple's tools", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const git = await program("git", 'echo "git version 2.50.0"');
    expect(await gitReadiness(dir)).toEqual({ ok: true, executable: git });
    expect(vi.mocked(exec).mock.calls.map(([command]) => command)).toEqual([git]);
  });

  it("retries a failed probe on the same instance and shares successful checks", async () => {
    await program("git", "exit 1");
    const git = new Git(dir);
    await expect(git.isRepo()).rejects.toMatchObject({ code: "tools-unavailable" });
    await program(
      "git",
      'printf "%s\\n" "$*" >> "$GIT_PROBE_LOG"; if [ "$1" = --version ]; then echo "git version 2.50.0"; else echo true; fi',
    );
    expect(await Promise.all([git.isRepo(), git.isRepo()])).toEqual([true, true]);
    expect((await readFile(log, "utf8")).match(/--version/g)).toHaveLength(1);
  });

  it("bounds a hanging functional probe", async () => {
    await program("git", "exec /bin/sleep 30");
    const started = Date.now();
    expect(await gitReadiness(dir)).toMatchObject({
      ok: false,
      error: { code: "tools-unavailable" },
    });
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
