/**
 * End-to-end check of "Try to fix" through the real toolbar: break the home page with an import of
 * a file that doesn't exist, check the error card shows while the page is open and after a reload
 * (when the page stays blank), then fix it and check the page comes back on its own. The page file
 * is restored byte-for-byte at the end, whatever happens.
 *
 *   pnpm tsx scripts/e2e-errors.mts <baseUrl> <appRoot>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

const [base = "http://127.0.0.1:5199", rootArg = "examples/lovable-vite"] = process.argv.slice(2);
const file = join(resolve(rootArg), "src/pages/Index.tsx");
const healthy = readFileSync(file, "utf8");
const broken = healthy
  .replace(
    'import Testimonials from "@/components/Testimonials";',
    'import Testimonials from "@/components/Testimonials";\nimport Reviews from "@/components/Reviews";',
  )
  .replace("<Testimonials />", "<Testimonials />\n        <Reviews />");
if (broken === healthy) throw new Error(`Couldn't find the testimonials in ${file}`);

const card = (page: Page) =>
  page.evaluate(() => {
    const el = document
      .querySelector("cloclod-toolbar")
      ?.shadowRoot?.querySelector(".error") as HTMLElement | null;
    return el ? el.innerText.replace(/\s+/g, " ").trim() : null;
  });
const pageText = (page: Page) =>
  page.evaluate(() => document.getElementById("root")?.innerText.trim().length ?? 0);

const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto(base, { waitUntil: "load" });
  await page.waitForFunction(() =>
    document.querySelector("cloclod-toolbar")?.shadowRoot?.querySelector(".dock"),
  );

  // Claude breaks the page while it's open: the card shows, and the page keeps what it had.
  writeFileSync(file, broken);
  await page.waitForTimeout(3000);
  check("card while the page is open", (await card(page))?.includes("Reviews") ?? false);
  check("page kept its content", (await pageText(page)) > 0);

  // The page loads already broken: blank, and the card still explains why.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2500);
  check("card after a reload", (await card(page))?.includes("Reviews") ?? false);

  // The fix lands: the page comes back by itself, without the card.
  writeFileSync(file, healthy);
  await page.waitForTimeout(4000);
  check("card gone after the fix", (await card(page)) === null);
  check("page back after the fix", (await pageText(page)) > 0);
} finally {
  writeFileSync(file, healthy);
  await browser.close();
}

for (const [name, ok] of results) console.log(`${name}: ${ok ? "yes" : "NO"}`);
const restored = readFileSync(file, "utf8") === healthy;
console.log(`restored byte-for-byte: ${restored ? "yes" : "NO"}`);
process.exit(results.every(([, ok]) => ok) && restored ? 0 : 1);
