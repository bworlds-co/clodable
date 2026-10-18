/**
 * Runs an example app with Cloclod's preview toolbar, straight from source.
 *   pnpm tsx scripts/dev-example.mts [lovable-vite|lovable-tanstack] [port]
 */
import { resolve } from "node:path";
import { startDevServer } from "../packages/preview/src/index.ts";

const name = process.argv[2] ?? "lovable-vite";
const port = Number(process.argv[3] ?? 5199);
const server = await startDevServer({
  root: resolve(import.meta.dirname, "../examples", name),
  port,
  host: "127.0.0.1",
});
console.log(`ready ${server.urls.join(" ")}`);
process.on("SIGTERM", () => server.close().then(() => process.exit(0)));
