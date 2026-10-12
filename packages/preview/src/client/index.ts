import { installEarlyCapture } from "./errors.js";
import { type Surface, Toolbar } from "./toolbar.js";

/** Entry point of the browser bundle served at /__clodable/toolbar.js (development only). */
function boot() {
  if (window.__CLODABLE_MOUNTED__) return;
  window.__CLODABLE_MOUNTED__ = true;
  // Listen right away: an app that crashes while loading does so before the toolbar mounts.
  installEarlyCapture();
  const surface: Surface =
    location.pathname === "/__clodable/frame"
      ? "outer"
      : new URLSearchParams(location.search).has("__clodable_frame")
        ? "inner"
        : "app";
  // Mount after the app has hydrated, so server-rendered markup is never disturbed.
  const start = () => setTimeout(() => new Toolbar(surface).mount(), 0);
  if (document.readyState === "complete") start();
  else addEventListener("load", start, { once: true });
}

boot();
