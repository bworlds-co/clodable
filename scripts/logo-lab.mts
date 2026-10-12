/** Logo exploration: renders mark variants at several sizes to docs/design/shots/logo-lab.png. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const out = resolve(import.meta.dirname, "../docs/design/shots");
mkdirSync(out, { recursive: true });

/** An open arc of a rotated ellipse, from `a0` to `a1` degrees (measured on the unrotated ellipse). */
function arc(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number) {
  const r = (rot * Math.PI) / 180;
  const pt = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)];
  };
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return `M${f(x0!)} ${f(y0!)}A${rx} ${ry} ${rot} ${large} 1 ${f(x1!)} ${f(y1!)}`;
}

const CLODS = {
  round:
    "M34.6 6.4c13.9.7 23.9 12 23.4 26.4-.5 14.8-12 25.2-26.9 24.7C16.5 57 5.6 46.4 6.1 31.9 6.6 17.3 19.8 5.7 34.6 6.4z",
  lumpy:
    "M20 9.5C28.5 4.6 44.2 5.2 52.2 13.1c7.2 7.1 8.2 19.7 5.2 29.6-3.1 10.2-12.7 16.3-25.4 15.8C18.9 58 8.5 50.6 6.3 38.6 4.1 26.4 10.8 14.8 20 9.5z",
  stone:
    "M17.5 12.5C25.2 6.2 41.5 4.6 50.6 11.8c8.6 6.8 9.6 20.7 6.4 30.4-3.3 10.1-13.8 16.7-26.3 16.1C17.4 57.7 7.4 50.3 5.9 38.8 4.5 28.3 10.4 18.3 17.5 12.5z",
};

function whorl(
  cx: number,
  cy: number,
  rot: number,
  rings: Array<[number, number, number, number]>,
) {
  return rings.map(([rx, ry, a0, a1]) => arc(cx, cy, rx, ry, rot, a0, a1));
}

const PRINT_A = whorl(30, 34, -28, [
  [4.2, 6.2, 110, 420],
  [8.8, 12.4, 150, 470],
  [13.6, 18.8, 190, 490],
  [18.6, 25.2, 220, 470],
]);
const PRINT_B = whorl(31, 33, -32, [
  [3.6, 5.4, 90, 400],
  [7.8, 10.8, 140, 455],
  [12.2, 16.4, 175, 480],
]);

type Variant = { name: string; clod: string; prints: string[]; stroke: number; dent?: boolean };
const variants: Variant[] = [
  { name: "A lumpy + whorl", clod: CLODS.lumpy, prints: PRINT_A, stroke: 2.6 },
  { name: "B stone + whorl", clod: CLODS.stone, prints: PRINT_A, stroke: 2.6 },
  { name: "C lumpy + dent + whorl", clod: CLODS.lumpy, prints: PRINT_B, stroke: 2.4, dent: true },
  { name: "D stone + bold whorl", clod: CLODS.stone, prints: PRINT_B, stroke: 3.2 },
];

function mark(v: Variant, size: number, clay: string, groove: string, id: string) {
  const dent = v.dent
    ? `<ellipse cx="31" cy="33" rx="15" ry="20" transform="rotate(-32 31 33)" fill="${groove}" opacity=".16"/>`
    : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><defs><clipPath id="${id}"><path d="${v.clod}"/></clipPath></defs><path d="${v.clod}" fill="${clay}"/><g clip-path="url(#${id})">${dent}<g fill="none" stroke="${groove}" stroke-width="${v.stroke}" stroke-linecap="round">${v.prints.map((d) => `<path d="${d}"/>`).join("")}</g></g></svg>`;
}

let n = 0;
const rows = variants
  .map(
    (v) => `<div class="row"><div class="name">${v.name}</div>
  <div class="tile light">${[16, 24, 32, 64, 128].map((s) => mark(v, s, "#B9502B", "#FBF8F3", `c${n++}`)).join("")}</div>
  <div class="tile dark">${[16, 32, 64, 128].map((s) => mark(v, s, "#E5764F", "#15110E", `c${n++}`)).join("")}</div></div>`,
  )
  .join("");

const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#FBF8F3;font:13px system-ui;width:1150px">
<style>.row{display:flex;gap:16px;align-items:center;margin-bottom:16px}.name{width:150px;color:#6B6158}.tile{display:flex;gap:18px;align-items:center;padding:16px 20px;border-radius:14px}.light{background:#fff;box-shadow:inset 0 0 0 1px #E7DED2}.dark{background:#15110E}</style>${rows}</body></html>`;
writeFileSync(resolve(out, "logo-lab.html"), html);
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.screenshot({ path: resolve(out, "logo-lab.png"), fullPage: true });
await browser.close();
console.log("ok");
