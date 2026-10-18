/**
 * The device stage: the app inside a phone or tablet frame, served at /__cloclod/frame.
 * Media queries behave exactly as on a real device, because the app runs in an iframe of that width.
 */
import { FRAME_PARAM, SCREENS } from "./shared.js";

export interface Device {
  id: "phone" | "tablet";
  label: string;
  width: number;
  height: number;
  radius: number;
}

export const DEVICES: Record<Device["id"], Device> = {
  phone: { id: "phone", label: "Phone", ...SCREENS.phone, radius: 46 },
  tablet: { id: "tablet", label: "Tablet", ...SCREENS.tablet, radius: 28 },
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function framePage(options: {
  device: Device["id"];
  path: string;
  landscape: boolean;
  css: string;
}): string {
  const device = DEVICES[options.device];
  const width = options.landscape ? device.height : device.width;
  const height = options.landscape ? device.width : device.height;
  const safePath =
    options.path.startsWith("/") && !options.path.startsWith("//") ? options.path : "/";
  const separator = safePath.includes("?") ? "&" : "?";
  const src = `${safePath}${separator}${FRAME_PARAM}=1`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(device.label)} preview</title>
<style>
${options.css}
html, body { height: 100%; margin: 0; }
body {
  background: radial-gradient(120% 90% at 50% 0%, var(--cl-bisque) 0%, var(--cl-paper) 60%);
  font: 13px/18px var(--cl-font-ui);
  color: var(--cl-ink);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.stage { position: relative; display: grid; place-items: center; width: 100%; height: 100%; padding: 72px 24px 24px; box-sizing: border-box; }
.fit { position: relative; }
.device {
  position: absolute; top: 0; left: 0;
  width: ${width}px; height: ${height}px;
  border-radius: ${device.radius}px;
  background: #0d0b09;
  padding: ${device.id === "phone" ? 12 : 14}px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 1px 0 1px rgba(255,255,255,.06) inset, var(--cl-shadow-lg), 0 40px 80px -30px rgba(60,38,20,.45);
  transform-origin: 0 0;
  transition: transform var(--cl-slow) var(--cl-ease-out);
  box-sizing: content-box;
}
.screen { width: 100%; height: 100%; border: 0; border-radius: ${device.radius - 12}px; background: #fff; display: block; }
@media (prefers-reduced-motion: reduce) { .device { transition: none; } }
</style>
</head>
<body data-cloclod-stage="${device.id}" data-landscape="${options.landscape}">
<main class="stage">
  <div class="fit" id="fit">
    <div class="device" id="device" role="region" aria-label="${escapeHtml(device.label)} preview, ${width} by ${height}">
      <iframe class="screen" id="screen" title="Your app at ${width} pixels wide" src="${escapeHtml(src)}"></iframe>
    </div>
  </div>
</main>
<script>
  (function () {
    // Scale with a transform (the app inside keeps its real width, so its breakpoints stay true),
    // and size a wrapper to the scaled box, so the layout centers what you actually see.
    var device = document.getElementById("device");
    var fit = document.getElementById("fit");
    var bezel = ${device.id === "phone" ? 12 : 14} * 2;
    var outerW = ${width} + bezel;
    var outerH = ${height} + bezel;
    function resize() {
      var s = Math.min(1, (innerHeight - 104) / outerH, (innerWidth - 56) / outerW);
      s = Math.max(0.2, s);
      device.style.transform = "scale(" + s + ")";
      fit.style.width = outerW * s + "px";
      fit.style.height = outerH * s + "px";
    }
    addEventListener("resize", resize);
    resize();
  })();
</script>
</body>
</html>`;
}
