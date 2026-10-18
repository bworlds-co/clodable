import { describe, expect, it, vi } from "vitest";
import { GhCli } from "../src/github/gh.js";

describe("retrying only the intended hosting run", () => {
  for (const variant of ["failed", "running", "success", "wrong-sha", "other-workflow"]) {
    it(variant, async () => {
      const gh = new GhCli("/unused");
      vi.spyOn(gh, "repo").mockResolvedValue({
        owner: "builder",
        name: "app",
        url: "https://github.com/builder/app",
        defaultBranch: "main",
        isPrivate: true,
      });
      // Stub the subprocess boundary, retaining the adapter's API selection and request logic.
      const boundary = gh as unknown as {
        run(args: string[]): Promise<{ exitCode: number; stderr: string; stdout: string }>;
      };
      const run = vi.spyOn(boundary, "run").mockImplementation(async (argv) => {
        return {
          exitCode: 0,
          stderr: "",
          stdout: argv.includes("POST")
            ? ""
            : JSON.stringify({
                workflow_runs: [
                  {
                    id: 42,
                    head_sha: variant === "wrong-sha" ? "newer" : "intended",
                    path:
                      variant === "other-workflow"
                        ? ".github/workflows/ci.yml"
                        : ".github/workflows/clodable-netlify.yml",
                    status: variant === "running" ? "in_progress" : "completed",
                    conclusion: variant === "success" ? "success" : "failure",
                  },
                ],
              }),
        };
      });
      const result = await gh.retryDeployment("intended");
      expect(result).toBe(
        variant === "failed" ? "started" : variant === "running" ? "running" : false,
      );
      const writes = run.mock.calls.filter((args) => (args[0] as string[]).includes("POST"));
      expect(writes).toHaveLength(variant === "failed" ? 1 : 0);
      if (variant === "failed")
        expect(writes[0]?.[0]).toEqual([
          "api",
          "--method",
          "POST",
          "repos/builder/app/actions/runs/42/rerun",
        ]);
    });
  }
});
