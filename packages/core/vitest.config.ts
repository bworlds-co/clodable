import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "core",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
