/**
 * Cuts the mascot drawings used by the README out of the character sheets (docs/design/mascot), and
 * composes GitHub's link preview. Run: pnpm tsx scripts/mascot-assets.mts
 *
 * The sheet's cream paper becomes transparent where it touches the edge of a crop, so the drawings
 * sit on GitHub's light and dark pages alike, while enclosed paper (the browser's white screen) stays.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { cssVariables, wordmarkSvg } from "../packages/design/src/index.ts";

const root = resolve(import.meta.dirname, "..");
const sheets = resolve(root, "docs/design/mascot");
const out = resolve(root, "docs/assets/mascot");
mkdirSync(out, { recursive: true });

/** Where each drawing sits on its sheet: x, y, width, height in the sheet's pixels. */
const POSES: Record<string, [sheet: string, box: [number, number, number, number]]> = {
  hello: ["views-and-adventures.png", [65, 459, 270, 214]],
  ask: ["can-take-shape.png", [126, 114, 292, 184]],
  preview: ["can-take-shape.png", [625, 99, 290, 211]],
  // Stops above the "Publish" label.
  publish: ["can-take-shape.png", [1140, 72, 226, 242]],
  undo: ["can-take-shape.png", [136, 391, 290, 221]],
  bridge: ["can-take-shape.png", [1069, 421, 374, 191]],
  "still-shaping": ["can-take-shape.png", [1075, 724, 354, 198]],
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas></canvas>");
// tsx names functions with a __name helper, which the page doesn't have.
await page.evaluate("window.__name = (f) => f");

for (const [name, [sheet, box]] of Object.entries(POSES)) {
  const data = readFileSync(resolve(sheets, sheet)).toString("base64");
  const png = await page.evaluate(
    async ({ data, box }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const [x, y, w, h] = box;
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      const im = ctx.getImageData(0, 0, w, h);
      const d = im.data;
      // The paper's color: the median of the crop's border.
      const border: number[][] = [];
      for (let i = 0; i < w; i++) border.push([i, 0], [i, h - 1]);
      for (let j = 0; j < h; j++) border.push([0, j], [w - 1, j]);
      const channel = (c: number) =>
        border
          .map(([i, j]) => d[((j as number) * w + (i as number)) * 4 + c] as number)
          .sort((a, b) => a - b)[border.length >> 1] as number;
      const paper = [channel(0), channel(1), channel(2)];
      const far = (o: number) =>
        Math.abs((d[o] as number) - paper[0]!) +
        Math.abs((d[o + 1] as number) - paper[1]!) +
        Math.abs((d[o + 2] as number) - paper[2]!);
      // Flood the paper in from the edges; the outline stops it.
      const SOLID = 70;
      const seen = new Uint8Array(w * h);
      const queue: number[] = [];
      for (const [i, j] of border) {
        const p = (j as number) * w + (i as number);
        if (!seen[p] && far(p * 4) < SOLID) {
          seen[p] = 1;
          queue.push(p);
        }
      }
      while (queue.length) {
        const p = queue.pop() as number;
        const i = p % w;
        const j = (p - i) / w;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          const q = nj * w + ni;
          if (!seen[q] && far(q * 4) < SOLID) {
            seen[q] = 1;
            queue.push(q);
          }
        }
      }
      // Paper turns transparent; the soft edge keeps its ink without the paper mixed in.
      const CLEAR = 12;
      for (let p = 0; p < w * h; p++) {
        if (!seen[p]) continue;
        const o = p * 4;
        const a = Math.min(1, Math.max(0, (far(o) - CLEAR) / (SOLID - CLEAR)));
        if (a === 0) {
          d[o + 3] = 0;
          continue;
        }
        for (let c = 0; c < 3; c++)
          d[o + c] = Math.min(255, Math.max(0, ((d[o + c] as number) - (1 - a) * paper[c]!) / a));
        d[o + 3] = Math.round(a * 255);
      }
      ctx.putImageData(im, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1] as string;
    },
    { data, box },
  );
  writeFileSync(resolve(out, `${name}.png`), Buffer.from(png, "base64"));
}

// GitHub's link preview: 1280 x 640, the mascot saying hello beside the name and the promise.
const hello = readFileSync(resolve(out, "hello.png")).toString("base64");
const preview = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await preview.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
${cssVariables({ scheme: "light" })}
body { margin: 0; width: 1280px; height: 640px; display: flex; align-items: center; justify-content: center; gap: 72px;
  background: radial-gradient(120% 120% at 20% 0%, #FFF6EE 0%, var(--cl-paper) 45%, #F3EDE4 100%); font-family: var(--cl-font-ui); color: var(--cl-ink); }
.words { display: grid; gap: 22px; max-width: 560px; }
.promise { font-size: 34px; line-height: 44px; font-weight: 500; letter-spacing: -0.4px; }
.small { font-size: 22px; line-height: 30px; color: var(--cl-ash); }
</style></head><body>
<img src="data:image/png;base64,${hello}" width="405" alt="">
<div class="words">${wordmarkSvg({ height: 76 })}
  <div class="promise">Shape your app with Claude.<br>Publish when you're happy.</div>
  <div class="small">Claude Code made simpler for every builder.<br>Own your infra. Open source.</div>
</div></body></html>`);
await preview.screenshot({ path: resolve(root, "docs/assets/social-preview.png") });

await browser.close();
console.log(`mascot drawings in ${out}, link preview in docs/assets/social-preview.png`);
