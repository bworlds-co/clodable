import { FRAME_PARAM, ROUTES } from "../shared.js";
import { keepFetch } from "./api.js";
import { installEarlyCapture } from "./errors.js";
import { type Surface, Toolbar } from "./toolbar.js";

/** Entry point of the browser bundle served at /__cloclod/toolbar.js (development only). */
function boot() {
  if (window.__CLOCLOD_MOUNTED__) return;
  // Neither writable nor removable: no script of the page can start a second toolbar, one that
  // would send the token through a fetch the page had replaced.
  Object.defineProperty(window, "__CLOCLOD_MOUNTED__", { value: true });
  keepFetch();
  // Listen right away: an app that crashes while loading does so before the toolbar mounts.
  installEarlyCapture();
  const surface: Surface =
    location.pathname === ROUTES.frame
      ? "outer"
      : new URLSearchParams(location.search).has(FRAME_PARAM)
        ? "inner"
        : "app";
  // Mount after the app has hydrated, so server-rendered markup is never disturbed.
  const start = () => setTimeout(() => new Toolbar(surface).mount(), 0);
  if (document.readyState === "complete") start();
  else addEventListener("load", start, { once: true });
}

boot();
