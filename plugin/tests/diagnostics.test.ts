import { describe, expect, test } from "claude-code/testing";
import { safeToolDetails } from "../hooks/diagnostics.ts";

describe("safe local tool diagnostics", () => {
  test("explains a malformed proxy without revealing its credentials or address", () => {
    const details = safeToolDetails(
      "Node.js download failed (exit 5): curl: (5) Unsupported proxy syntax in 'http://example-user:example-password@private-proxy.example:invalid': Port number was not a decimal number",
    );
    expect(details).toContain("proxy configuration is invalid");
    expect(details).toContain("exit code 5");
    expect(details).toContain("curl error 5");
    for (const privateText of ["example-user", "example-password", "private-proxy", "http://"])
      expect(details).not.toContain(privateText);
  });

  test("does not copy tokens, device codes, paths or arbitrary diagnostic text", () => {
    const input = [
      "Authorization: Bearer opaque-credential-value",
      "GH_TOKEN=ghp_privatevalue GITHUB_TOKEN=github_pat_privatevalue",
      "device code: ABCD-1234",
      "/Users/private-person/private-project/secrets.json",
      "https://private.example/?token=unknown-private-value",
    ].join("\n");
    const details = safeToolDetails(input);
    expect(details).toBe("The tool reported an unrecognized failure. No raw output was included.");
  });

  test("keeps known repair facts without copying accompanying secrets", () => {
    for (const [error, expected] of [
      ["The download didn't match its checksum", "expected checksum"],
      ["curl: (6) Could not resolve host", "look up the download server"],
      ["ECONNRESET", "network connection failed"],
      ["TLS handshake timeout", "network request timed out"],
      ["x509: certificate signed by unknown authority", "secure connection"],
      ["HTTP 503", "temporarily unavailable"],
      ["EACCES: permission denied", "local permission"],
      ["spawn ENOENT", "couldn't be found"],
      ["No Node.js download is available for unknown", "isn't available for this system"],
      ["No supported Node.js was found", "supported Node.js runtime"],
      ["The downloaded Node.js could not run", "couldn't run on this computer"],
      ["PATH couldn't be read", "left unchanged"],
      ["xcrun: error: invalid active developer path", "Apple's command line tools are missing"],
      ["command line tools are already installed", "already installed"],
      ["Xcode license has not been accepted", "license to be reviewed"],
      ["couldn't unpack it", "couldn't be fully unpacked"],
      ["The check didn't finish", "complete usable result"],
      ["Git is not usable", "failed its readiness check"],
      ["process was interrupted: SIGTERM", "interrupted before it finished"],
    ]) {
      const details = safeToolDetails(`${error}: private-value ghp_secret\n`);
      expect(details).toContain(expected);
      expect(details).not.toContain("private-value");
      expect(details).not.toContain("ghp_secret");
    }
  });

  test("reports validated exit codes without echoing the surrounding output", () => {
    expect(safeToolDetails("private executable exited with code 127: secret")).toBe(
      "The tool reported exit code 127.",
    );
    expect(safeToolDetails("exitCode: 3221225781 private-path")).toBe(
      "The tool reported exit code 3221225781.",
    );
    expect(safeToolDetails("exit 9999999999 secret")).toContain("unrecognized failure");
  });

  test("retains its safe facts when sanitizing again at the help boundary", () => {
    const details = safeToolDetails(
      "Node.js download failed (exit 5): curl: (5) Unsupported proxy syntax in 'http://user:secret@proxy:invalid'",
    );
    expect(safeToolDetails(details)).toBe(details);
    expect(safeToolDetails(`${details}\nprivate-value`)).toBe(details);
  });

  test("handles split scanning boundaries and limits excessive diagnostic output", () => {
    const details = safeToolDetails(`${" ".repeat(4090)}checksum mismatch${" ".repeat(20_000)}`);
    expect(details).toContain("expected checksum");
    const many = safeToolDetails(Array.from({ length: 1000 }, (_, i) => `exit ${i}`).join("\n"));
    expect(many.split("\n").length <= 24).toBe(true);
    expect(many.length < 2000).toBe(true);
  });
});
