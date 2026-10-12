/**
 * Shoots every toolbar state against a running example (see scripts/dev-example.mts).
 *   pnpm tsx scripts/toolbar-shots.mts [baseUrl] [outDir]
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5199";
const out = resolve(process.argv[3] ?? "docs/design/shots/toolbar");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function open(
  path: string,
  scheme: "light" | "dark" = "light",
  width = 1280,
  height = 820,
): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  page.on("pageerror", () => {});
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    document
      .querySelector("clodable-toolbar")
      ?.shadowRoot?.querySelector(".dock, .pebble, .devicebar"),
  );
  await page.waitForTimeout(450);
  return page;
}

const shot = (
  page: Page,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
) => page.screenshot({ path: resolve(out, `${name}.png`), ...(clip ? { clip } : {}) });

// 1. Idle: the dock at rest.
let page = await open("/");
await shot(page, "01-idle");
await shot(page, "01b-dock", { x: 340, y: 740, width: 600, height: 80 });

// 2. Edit mode: hover a heading, then edit it.
await page.keyboard.press("Alt+Shift+KeyE");
const heading = page.locator("h1").first();
const box = (await heading.boundingBox())!;
await page.mouse.move(box.x + 60, box.y + 30);
await page.waitForTimeout(300);
await shot(page, "02-edit-hover");
await page.mouse.click(box.x + 60, box.y + 30);
await page.waitForTimeout(500);
await shot(page, "03-editing");
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.close();

// 3. A dynamic text (a bake's name from an array): the locked notice.
page = await open("/");
await page.locator("#bakes").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.keyboard.press("Alt+Shift+KeyE");
const bake = page.getByText("Butter Croissant", { exact: true }).first();
const b = (await bake.boundingBox())!;
await page.mouse.click(b.x + 20, b.y + b.height / 2);
await page.waitForTimeout(600);
await shot(page, "04-locked");
await page.close();

// 4. Point & ask.
page = await open("/");
await page.keyboard.press("Alt+Shift+KeyA");
const cta = page.locator("main a").first();
const c = (await cta.boundingBox())!;
await page.mouse.move(c.x + 30, c.y + c.height / 2);
await page.waitForTimeout(300);
await shot(page, "05-ask-hover");
await page.mouse.click(c.x + 30, c.y + c.height / 2);
await page.waitForTimeout(500);
await page.keyboard.type("Make this button bigger and use our green");
await shot(page, "06-composer");
await page.close();

// 5. Menu.
page = await open("/");
await page.locator("clodable-toolbar").locator(".brand").click();
await page.waitForTimeout(350);
await shot(page, "07-menu");
await page.close();

// 6. A crash: the Try to fix card.
page = await open("/__error-test");
await page.waitForTimeout(500);
await shot(page, "08-error");
await page.close();

// 7. Phone frame.
page = await open("/__clodable/frame?device=phone&path=%2F");
await page.waitForTimeout(1200);
await shot(page, "09-phone");
await page.close();

// 8. Dark mode, and minimized.
page = await open("/", "dark");
await shot(page, "10-dark-dock", { x: 340, y: 740, width: 600, height: 80 });
await page.locator("clodable-toolbar").locator('[aria-label="Hide Clodable tools"]').click();
await page.waitForTimeout(400);
await shot(page, "11-minimized", { x: 1080, y: 700, width: 200, height: 120 });
await page.close();

await browser.close();
console.log(`shots in ${out}`);
