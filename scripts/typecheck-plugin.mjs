// The plugin's typecheck needs Claude Code's own declarations, which Claude Code writes beside the
// plugin when it loads it (`claude --plugin-dir ./plugin`, interactive). They're Anthropic's, so the
// repository doesn't carry them: without them (a fresh clone, CI), the plugin's typecheck is skipped.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const types = "plugin/.claude-plugin/types/claude-code/index.d.ts";
if (!existsSync(types)) {
  console.log(
    `Skipping the plugin's typecheck: ${types} isn't there. Load the plugin once with \`claude --plugin-dir ./plugin\` to have it.`,
  );
  process.exit(0);
}
const tsc = existsSync("node_modules/.bin/tsc") ? "node_modules/.bin/tsc" : "tsc";
const run = spawnSync(tsc, ["-p", "plugin/tsconfig.json"], { stdio: "inherit" });
process.exit(run.status ?? 1);
