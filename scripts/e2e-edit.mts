/**
 * End-to-end check of inline text editing through the real toolbar UI:
 * edit a piece of text in the preview, check the source file changed, then edit it back and check
 * the file is byte-for-byte identical to how it started.
 *
 *   pnpm tsx scripts/e2e-edit.mts <baseUrl> <appRoot> "<original text>" "<new text>"
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

const [
  base = "http://127.0.0.1:5199",
  rootArg = "examples/lovable-vite",
  original = "Neighborhood bakery · Est. 2014",
  changed = "Neighborhood bakery · Since 2014",
] = process.argv.slice(2);
const root = resolve(rootArg);
const file = execFileSync("grep", ["-rl", "--include=*.tsx", original, join(root, "src")], {
  encoding: "utf8",
})
  .trim()
  .split("\n")[0]!;
const before = readFileSync(file, "utf8");
// Each edit leaves a request in the app's inbox. Only those go afterwards: an app Clodable set up
// keeps its .clodable folder, and whatever was waiting in its inbox.
const clodable = join(root, ".clodable");
const inbox = join(clodable, "inbox");
const hadClodable = existsSync(clodable);
const waiting = new Set(existsSync(inbox) ? readdirSync(inbox) : []);

async function edit(page: Page, from: string, to: string) {
  await page.keyboard.press("Alt+Shift+KeyE");
  const target = page.getByText(from, { exact: true }).first();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await page.keyboard.press("Meta+A");
  await page.keyboard.type(to, { delay: 5 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      document
        .querySelector("clodable-toolbar")
        ?.shadowRoot?.querySelector(".toast")
        ?.textContent?.includes("Text updated"),
    null,
    { timeout: 8000 },
  );
  await page.keyboard.press("Escape");
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForFunction(() =>
  document.querySelector("clodable-toolbar")?.shadowRoot?.querySelector(".dock"),
);

await edit(page, original, changed);
const middle = readFileSync(file, "utf8");
const changedOk = middle.includes(changed) && !middle.includes(original);
await page.waitForTimeout(1200); // HMR
await page.getByText(changed, { exact: true }).first().waitFor({ timeout: 8000 });
await edit(page, changed, original);
const after = readFileSync(file, "utf8");
await browser.close();
if (!hadClodable) rmSync(clodable, { recursive: true, force: true });
else if (existsSync(inbox)) {
  for (const name of readdirSync(inbox)) {
    if (!waiting.has(name)) rmSync(join(inbox, name), { force: true });
  }
}

console.log(`file: ${file.replace(`${root}/`, "")}`);
console.log(`edited in source: ${changedOk ? "yes" : "NO"}`);
console.log(`restored byte-for-byte: ${after === before ? "yes" : "NO"}`);
if (after !== before) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/clodable-e2e-before.txt", before);
  writeFileSync("/tmp/clodable-e2e-after.txt", after);
  try {
    console.log(
      execFileSync("diff", ["/tmp/clodable-e2e-before.txt", "/tmp/clodable-e2e-after.txt"], {
        encoding: "utf8",
      }),
    );
  } catch (error) {
    console.log((error as { stdout?: string }).stdout ?? String(error));
  }
}
process.exit(changedOk && after === before ? 0 : 1);
