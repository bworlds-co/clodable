/**
 * Screenshot helper for design review.
 *
 *   pnpm tsx scripts/shot.mts <url|file> <out.png> [--w 1280] [--h 800] [--clip x,y,w,h]
 *                             [--dark] [--full] [--wait 500] [--click "selector"]...
 *
 * Several --click flags run in order before the capture, which makes it easy to shoot a UI state.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const [target, out] = args;
if (!target || !out) {
  console.error("usage: shot.mts <url|file> <out.png> [options]");
  process.exit(1);
}
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const all = (name: string) =>
  args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));

const url = /^https?:/.test(target) ? target : pathToFileURL(resolve(target)).href;
const width = Number(flag("w") ?? 1280);
const height = Number(flag("h") ?? 800);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 2,
  colorScheme: args.includes("--dark") ? "dark" : "light",
});
await page.goto(url, { waitUntil: "networkidle" });
for (const selector of all("click")) {
  await page.locator(selector).first().click();
  await page.waitForTimeout(250);
}
await page.waitForTimeout(Number(flag("wait") ?? 300));
const clip = flag("clip")?.split(",").map(Number);
await page.screenshot({
  path: resolve(out),
  fullPage: args.includes("--full"),
  ...(clip ? { clip: { x: clip[0]!, y: clip[1]!, width: clip[2]!, height: clip[3]! } } : {}),
});
await browser.close();
console.log(`shot ${out}`);
