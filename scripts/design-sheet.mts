/**
 * Renders the design system (logo, palette, icons) to docs/design/sheet.png, so the design can be
 * reviewed by eye. Run it with `pnpm tsx scripts/design-sheet.mts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  cssVariables,
  type IconName,
  icons,
  lockupSvg,
  logoSvg,
  palette,
  svgIcon,
} from "../packages/design/src/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "docs/design");
mkdirSync(out, { recursive: true });

const swatches = (scheme: "light" | "dark") =>
  Object.entries(palette[scheme])
    .filter(([k]) => k !== "scrim")
    .map(
      ([name, value]) =>
        `<div class="sw"><div class="chip" style="background:${value}"></div><b>${name}</b><span>${value}</span></div>`,
    )
    .join("");

const iconGrid = (Object.keys(icons) as IconName[])
  .map((n) => `<div class="ic">${svgIcon(n, { size: 20 })}<span>${n}</span></div>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${cssVariables()}
body{margin:0;font:13px/18px var(--cl-font-ui);background:var(--cl-paper);color:var(--cl-ink);padding:40px;width:1120px}
h1{font:600 30px/36px var(--cl-font-display);margin:0 0 4px;letter-spacing:-.4px}
h2{font:600 13px/18px var(--cl-font-ui);text-transform:uppercase;letter-spacing:.08em;color:var(--cl-ash);margin:36px 0 12px}
.row{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.tile{border-radius:14px;padding:22px;display:flex;gap:22px;align-items:center}
.sw{display:grid;grid-template-columns:28px 1fr;column-gap:10px;align-items:center;width:250px;margin:4px 0}
.sw .chip{grid-row:span 2;width:28px;height:28px;border-radius:8px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.sw span{color:var(--cl-ash);font-family:var(--cl-font-mono);font-size:11px}
.grid{display:flex;flex-wrap:wrap;gap:2px 8px}
.ic{display:flex;align-items:center;gap:8px;width:170px;padding:6px 0}
.ic svg{color:var(--cl-ink)}
.dark{background:#15110E;color:#F3EEE7}
.dark .ic svg{color:#F3EEE7}
</style></head><body>
<div class="row" style="justify-content:space-between"><div>${lockupSvg({ height: 48 })}</div><div style="color:var(--cl-ash)">Design system · v0.1</div></div>
<h2>Mark</h2>
<div class="row">
  <div class="tile" style="background:var(--cl-paper);box-shadow:inset 0 0 0 1px var(--cl-slip)">${[16, 24, 32, 48, 96].map((s) => logoSvg({ size: s })).join("")}</div>
  <div class="tile" style="background:#15110E">${[16, 24, 32, 48, 96].map((s) => logoSvg({ size: s })).join("")}</div>
</div>
<h2>Palette · light</h2><div class="grid">${swatches("light")}</div>
<h2>Palette · dark</h2><div class="grid tile dark">${swatches("dark")}</div>
<h2>Icons · 20px · 1.6 stroke</h2><div class="grid">${iconGrid}</div>
<div class="grid tile dark" style="margin-top:12px">${iconGrid}</div>
</body></html>`;

writeFileSync(resolve(out, "sheet.html"), html);
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "load" });
await page.screenshot({ path: resolve(out, "sheet.png"), fullPage: true });
await browser.close();
console.log("wrote docs/design/sheet.png");
