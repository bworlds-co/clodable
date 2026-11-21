import { describe, expect, test } from "claude-code/testing";
import { githubSignInOutput } from "../hooks/github.ts";

describe("GitHub browser sign-in output", () => {
  test("finds a device code split anywhere across chunks", () => {
    const text = "! First copy your one-time code: A1B2-C3D4\n";
    for (let split = 0; split <= text.length; split++) {
      const output = githubSignInOutput();
      const first = output.push("stderr", text.slice(0, split));
      const second = output.push("stderr", text.slice(split));
      expect(second ?? first).toEqual({ code: "A1B2-C3D4", copied: false });
    }
  });

  test("updates copied status when that phrase arrives later", () => {
    const output = githubSignInOutput();
    expect(output.push("stdout", "One-time code (ABCD-1234) ")).toEqual({
      code: "ABCD-1234",
      copied: false,
    });
    expect(output.push("stdout", "copied to clip")).toBeUndefined();
    expect(output.push("stdout", "board\n")).toEqual({ code: "ABCD-1234", copied: true });
    expect(output.push("stderr", "Waiting for approval\n")).toBeUndefined();
  });

  test("doesn't join different streams into a code or a failure", () => {
    const output = githubSignInOutput();
    output.push("stdout", "One-time code: ABCD-");
    expect(output.push("stderr", "1234\nexpired_")).toBeUndefined();
    output.push("stdout", "token\n");
    expect(output.failure({ code: 1 }).kind).toBe("unknown");
  });

  test("handles terminal styling split over chunks", () => {
    const output = githubSignInOutput();
    output.push("stderr", "Code: \u001b[3");
    expect(output.push("stderr", "2mABCD-1234\u001b[0m\n")).toEqual({
      code: "ABCD-1234",
      copied: false,
    });
  });

  test("recognizes only reported expiration, not a generic timeout", () => {
    for (const text of ["expired_token", "The device code has expired."]) {
      const output = githubSignInOutput();
      output.push("stderr", text);
      expect(output.failure({ code: 1 }).kind).toBe("expired");
    }
    for (const text of ["context deadline exceeded", "timeout", "code expires in 15 minutes"]) {
      const output = githubSignInOutput();
      output.push("stderr", text);
      const failure = output.failure({ code: 1 });
      expect(failure.kind).toBe("unknown");
      expect(failure.message).not.toContain("expired");
    }
  });

  test("distinguishes declined authorization from network and local permission errors", () => {
    const denied = githubSignInOutput();
    denied.push("stderr", "access_denied");
    expect(denied.failure({ code: 1 }).kind).toBe("denied");
    const network = githubSignInOutput();
    network.push("stderr", "dial tcp: lookup github.com: no such host");
    expect(network.failure({ code: 1 }).kind).toBe("network");
    const local = githubSignInOutput();
    expect(local.failure(undefined, new Error("spawn gh EACCES: permission denied")).kind).toBe(
      "unknown",
    );
    expect(local.details()).toContain("local permission");
  });

  test("records spawn failure and successful command with unconfirmed account separately", () => {
    const missing = githubSignInOutput().failure(undefined, new Error("spawn gh ENOENT"));
    expect(missing.details).toContain("couldn't be found");
    expect(missing.details).toContain("couldn't start or finish");
    const unconfirmed = githubSignInOutput().failure({ code: 0 });
    expect(unconfirmed.kind).toBe("unknown");
    expect(unconfirmed.details).toContain("connected account wasn't confirmed");
    const interrupted = githubSignInOutput().failure({ code: null, signal: "SIGTERM" });
    expect(interrupted.details).toContain("interrupted");
  });

  test("classifies a failed verification request without claiming the code expired", () => {
    const failure = githubSignInOutput().failure(
      { code: 0 },
      new Error("request failed: ECONNRESET"),
    );
    expect(failure.kind).toBe("network");
    expect(failure.details).toContain("connected account wasn't confirmed");
  });

  test("keeps useful failure facts without retaining credentials or codes in diagnostics", () => {
    const output = githubSignInOutput();
    output.push("stderr", "Code: ABCD-1234\nAuthorization: Bearer opaque-private-value\n");
    output.push("stderr", "https://person:private-password@github.com/?token=unknown-secret\n");
    output.push("stderr", "ghp_0123456789SECRET\nHTTP 503: service unavailable\n");
    const failure = output.failure({ code: 1 }, "custom error with another-private-value");
    expect(failure.kind).toBe("network");
    expect(failure.details).toContain("temporarily unavailable");
    for (const secret of [
      "ABCD-1234",
      "opaque-private-value",
      "private-password",
      "unknown-secret",
      "ghp_0123456789SECRET",
      "another-private-value",
    ]) {
      expect(output.details()).not.toContain(secret);
      expect(failure.details).not.toContain(secret);
      expect(failure.message).not.toContain(secret);
    }
  });

  test("continues parsing after huge output without returning huge diagnostics", () => {
    const output = githubSignInOutput();
    output.push("stdout", `opaque-secret-${"x".repeat(100_000)}\n`);
    expect(output.push("stderr", "One-time code: ABCD-1234\n")).toEqual({
      code: "ABCD-1234",
      copied: false,
    });
    output.push("stderr", `${" ".repeat(100_000)}\nerror: expired_token\n`);
    const failure = output.failure({ code: 1 });
    expect(failure.kind).toBe("expired");
    expect(failure.details.length < 1000).toBe(true);
    expect(failure.details).not.toContain("opaque-secret");
  });
});
