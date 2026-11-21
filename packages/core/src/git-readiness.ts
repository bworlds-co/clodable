import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ClodableError, type ErrorInfo } from "./errors.js";
import { commandPath, exec } from "./exec.js";
import { tr } from "./i18n.js";

type GitReadiness = { ok: true; executable: string } | { ok: false; error: ErrorInfo };

const PROBE_MS = 5_000;

function unavailable(reason: string, detail: string, install = false): GitReadiness {
  return {
    ok: false,
    error: {
      code: "tools-unavailable",
      message: tr("Saving needs Git to work on this computer."),
      hint: install
        ? tr("Run `xcode-select --install`, finish Apple's installation, then check again.")
        : tr("Ask Claude to check Git on this computer, then press Check again."),
      details: `Git readiness: ${reason}\n${detail}`.trim(),
    },
  };
}

/** Check usability without letting Apple's placeholder open an unsolicited installer. */
export async function gitReadiness(cwd: string): Promise<GitReadiness> {
  const executable = await commandPath("git", cwd);
  if (!executable)
    return unavailable("not-found", "Git was not found on PATH.", process.platform === "darwin");

  const resolved = await realpath(resolve(cwd, executable)).catch(() => executable);
  if (process.platform === "darwin" && resolved === "/usr/bin/git") {
    // This query is safe without developer tools. Invoking git (even --version) isn't.
    const selected = await exec("/usr/bin/xcode-select", ["--print-path"], {
      cwd,
      timeout: PROBE_MS,
    });
    const directory = selected.stdout.trim();
    // DEVELOPER_DIR accepts either Xcode.app or its Contents/Developer directory.
    const locations = [directory, join(directory, "Contents/Developer")];
    const installed =
      selected.exitCode === 0 &&
      directory.length > 0 &&
      (
        await Promise.all(
          locations.map((location) =>
            access(join(location, "usr/bin/git"), constants.X_OK).then(
              () => true,
              () => false,
            ),
          ),
        )
      ).some(Boolean);
    if (!installed)
      return unavailable(
        "apple-tools-unavailable",
        `${executable}\n${selected.stderr || selected.stdout || "No usable developer directory."}`,
        selected.exitCode !== 0 && !process.env.DEVELOPER_DIR,
      );
  }

  const version = await exec(executable, ["--version"], { cwd, timeout: PROBE_MS });
  if (version.exitCode !== 0 || !/^git version\s+\S+/m.test(version.stdout))
    return unavailable(
      "probe-failed",
      `${executable} --version (exit ${version.exitCode})\n${version.stderr || version.stdout}`,
    );
  return { ok: true, executable };
}

export async function requireGit(cwd: string): Promise<string> {
  const readiness = await gitReadiness(cwd);
  if (!readiness.ok) throw new ClodableError(readiness.error);
  return readiness.executable;
}
