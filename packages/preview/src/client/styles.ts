import { cssVariables } from "@clodable/design";

/** Everything lives in a shadow root: nothing leaks into the app, and the app's CSS can't reach in. */
export const styles = `
${cssVariables({ selector: ":host" })}
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483000;
  font: 13px/18px var(--cl-font-ui);
  color: var(--cl-ink);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  --dock-bg: color-mix(in oklab, var(--cl-paper) 88%, transparent);
  --dock-border: color-mix(in oklab, var(--cl-slip-strong) 70%, transparent);
}
* { box-sizing: border-box; }
.ic { display: inline-flex; width: 18px; height: 18px; flex: none; }
.ic svg { display: block; }
button { font: inherit; color: inherit; background: none; border: 0; margin: 0; padding: 0; cursor: pointer; }
button:focus-visible, [tabindex]:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--cl-focus);
  outline-offset: 2px;
}
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ── Dock ─────────────────────────────────────────────────────────── */
.dock-wrap {
  /* No transform here: it would trap the fixed-position pebble inside this box. */
  position: fixed; left: 0; right: 0; bottom: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  pointer-events: none;
}
.dock {
  pointer-events: auto;
  display: flex; align-items: center; gap: 2px;
  height: 46px; padding: 0 5px;
  background: var(--dock-bg);
  -webkit-backdrop-filter: blur(18px) saturate(1.5);
  backdrop-filter: blur(18px) saturate(1.5);
  border: 1px solid var(--dock-border);
  border-radius: var(--cl-radius-pill);
  box-shadow: var(--cl-shadow-lg);
  animation: rise var(--cl-slow) var(--cl-spring) both;
}
@keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.97); } }
.sep { width: 1px; height: 22px; background: var(--cl-slip); margin: 0 5px; flex: none; }
.backend { padding: 0 6px 0 2px; color: var(--cl-ash); font-size: 12px; font-weight: 500; white-space: nowrap; }
.brand {
  width: 36px; height: 36px; border-radius: 50%;
  display: grid; place-items: center;
  transition: transform var(--cl-fast) var(--cl-ease-out), background var(--cl-fast);
}
/* The clod hops; turning or scaling it would blur its pixels. */
.brand:hover { background: var(--cl-bisque); transform: translateY(-1px); }
.brand[aria-expanded="true"] { background: var(--cl-bisque); }
.tool {
  height: 36px; padding: 0 12px 0 10px;
  display: inline-flex; align-items: center; gap: 7px;
  border-radius: var(--cl-radius-pill);
  color: var(--cl-ink); font-weight: 500; letter-spacing: -0.005em;
  transition: background var(--cl-fast), color var(--cl-fast);
  white-space: nowrap;
}
.tool:hover { background: var(--cl-bisque); }
.tool[aria-pressed="true"] { background: var(--cl-clay-soft); color: var(--cl-clay-text); }
.tool .key {
  font: 500 10.5px/16px var(--cl-font-ui); color: var(--cl-ash);
  padding: 0 5px; border-radius: 5px; background: var(--cl-bisque); margin-left: 2px;
}
.tool[aria-pressed="true"] .key { background: color-mix(in oklab, var(--cl-clay) 14%, transparent); color: var(--cl-clay-text); }
.icon-btn {
  width: 36px; height: 36px; border-radius: 50%;
  display: grid; place-items: center; color: var(--cl-ash);
  transition: background var(--cl-fast), color var(--cl-fast);
}
.icon-btn:hover { background: var(--cl-bisque); color: var(--cl-ink); }

/* Device switcher: a segmented control with a sliding thumb. */
.devices { position: relative; display: flex; align-items: center; height: 36px; padding: 3px; border-radius: var(--cl-radius-pill); background: var(--cl-bisque); }
.devices .thumb {
  position: absolute; top: 3px; left: 3px; width: 34px; height: 30px; border-radius: var(--cl-radius-pill);
  background: var(--cl-paper); box-shadow: var(--cl-shadow-sm), 0 0 0 1px var(--cl-slip);
  transition: transform var(--cl-base) var(--cl-ease-out);
}
.devices button { position: relative; width: 34px; height: 30px; border-radius: var(--cl-radius-pill); display: grid; place-items: center; color: var(--cl-ash); transition: color var(--cl-fast); }
.devices button:hover { color: var(--cl-ink); }
.devices button[aria-checked="true"] { color: var(--cl-ink); }

/* Narrow screens (and the phone frame): icons only. */
@media (max-width: 560px) {
  .tool .label, .tool .key { display: none; }
  .tool { padding: 0; width: 36px; justify-content: center; }
  .dock-wrap { bottom: 10px; }
}

/* Minimized: a single clod in the corner. */
.pebble {
  pointer-events: auto;
  position: fixed; right: 16px; bottom: 16px;
  width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--dock-bg);
  -webkit-backdrop-filter: blur(18px) saturate(1.5);
  backdrop-filter: blur(18px) saturate(1.5);
  border: 1px solid var(--dock-border);
  box-shadow: var(--cl-shadow-md);
  animation: rise var(--cl-slow) var(--cl-spring) both;
  transition: transform var(--cl-fast) var(--cl-ease-out);
}
.pebble:hover { transform: translateY(-2px); }

/* ── Hint above the dock ──────────────────────────────────────────── */
.hint {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 8px;
  height: 30px; padding: 0 12px 0 10px;
  background: var(--cl-ink); color: var(--cl-paper);
  border-radius: var(--cl-radius-pill);
  font-size: 12px; font-weight: 500;
  box-shadow: var(--cl-shadow-md);
  animation: rise var(--cl-base) var(--cl-ease-out) both;
}
.hint .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cl-clay); box-shadow: 0 0 0 0 var(--cl-clay); animation: pulse 1.8s var(--cl-ease-out) infinite; }
.hint.ask .dot { background: var(--cl-cobalt); }
.hint kbd { font: 500 11px/16px var(--cl-font-ui); padding: 0 5px; border-radius: 4px; background: color-mix(in oklab, var(--cl-paper) 16%, transparent); }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--cl-clay) 60%, transparent); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }

/* ── Menu ─────────────────────────────────────────────────────────── */
.menu {
  pointer-events: auto;
  position: fixed; min-width: 248px; padding: 6px;
  background: var(--cl-paper); border: 1px solid var(--cl-slip); border-radius: var(--cl-radius-lg);
  box-shadow: var(--cl-shadow-lg);
  animation: pop var(--cl-base) var(--cl-ease-out) both;
  transform-origin: bottom left;
}
@keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.98); } }
.menu .head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 10px; }
.menu .head b { font: 600 14px/18px var(--cl-font-display); letter-spacing: -0.01em; }
.menu .head span { display: block; color: var(--cl-ash); font-size: 12px; }
.menu hr { border: 0; border-top: 1px solid var(--cl-slip); margin: 4px 2px; }
.menu-item {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 7px 8px; border-radius: var(--cl-radius-md); text-align: left; color: var(--cl-ink);
}
.menu-item:hover, .menu-item:focus-visible { background: var(--cl-bisque); outline: none; }
.menu-item .ic { color: var(--cl-ash); }
.menu-item .shortcut { margin-left: auto; color: var(--cl-ash); font-size: 11.5px; }

/* ── Highlights ───────────────────────────────────────────────────── */
.hl {
  position: fixed; pointer-events: none;
  border-radius: 6px;
  transition: top 70ms linear, left 70ms linear, width 70ms linear, height 70ms linear, opacity var(--cl-fast);
}
.hl.edit-hover { outline: 1.5px dashed var(--cl-clay); outline-offset: 3px; background: color-mix(in oklab, var(--cl-clay) 5%, transparent); }
.hl.editing { outline: 2px solid var(--cl-clay); outline-offset: 3px; box-shadow: 0 0 0 6px color-mix(in oklab, var(--cl-clay) 16%, transparent); }
.hl.ask-hover { outline: 1.5px solid var(--cl-cobalt); outline-offset: 2px; background: color-mix(in oklab, var(--cl-cobalt) 7%, transparent); }
.hl.saved { outline: 2px solid var(--cl-celadon); outline-offset: 3px; background: color-mix(in oklab, var(--cl-celadon) 12%, transparent); animation: fade 900ms var(--cl-ease-out) forwards; }
.hl.locked { outline: 1.5px dashed var(--cl-ash); outline-offset: 3px; }
@keyframes fade { 60% { opacity: 1; } to { opacity: 0; } }
.chip {
  position: fixed; pointer-events: none;
  display: inline-flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 8px 0 6px; border-radius: var(--cl-radius-pill);
  font-size: 11.5px; font-weight: 600; white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis;
  color: #fff; background: var(--cl-clay);
  box-shadow: var(--cl-shadow-sm);
}
.chip.ask { background: var(--cl-cobalt); }
.chip.locked { background: var(--cl-ash); }
.chip .ic { width: 14px; height: 14px; }
.chip .muted { font-weight: 500; opacity: .85; overflow: hidden; text-overflow: ellipsis; }

/* ── Popovers: edit bar, composer, notices ────────────────────────── */
.pop {
  pointer-events: auto;
  position: fixed;
  background: var(--cl-paper); color: var(--cl-ink);
  border: 1px solid var(--cl-slip); border-radius: var(--cl-radius-lg);
  box-shadow: var(--cl-shadow-lg);
  animation: pop var(--cl-base) var(--cl-ease-out) both;
}
.editbar { display: flex; align-items: center; gap: 6px; padding: 5px; border-radius: var(--cl-radius-pill); }
.editbar .note { color: var(--cl-ash); font-size: 12px; padding: 0 6px 0 8px; white-space: nowrap; }
.btn {
  height: 30px; padding: 0 12px; border-radius: var(--cl-radius-pill);
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 600; font-size: 12.5px; white-space: nowrap;
  transition: background var(--cl-fast), color var(--cl-fast), transform var(--cl-fast);
}
.btn:active { transform: translateY(1px); }
.btn.primary { background: var(--cl-clay); color: var(--cl-on-clay); }
.btn.primary:hover { background: var(--cl-clay-hover); }
.btn.primary[disabled] { opacity: .55; cursor: default; }
.btn.ghost { color: var(--cl-ink); }
.btn.ghost:hover { background: var(--cl-bisque); }
.btn .kbd { font-weight: 500; opacity: .75; font-size: 11px; }
.spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.composer { width: 340px; padding: 12px; }
.composer .target { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: var(--cl-ash); font-size: 12px; min-width: 0; }
.composer .target .badge { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px 0 6px; border-radius: var(--cl-radius-pill); color: var(--cl-cobalt); background: var(--cl-cobalt-soft); font-weight: 600; }
.composer .target .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer textarea {
  width: 100%; min-height: 64px; max-height: 160px; resize: none;
  font: 14px/20px var(--cl-font-ui); color: var(--cl-ink);
  padding: 10px 12px; border-radius: var(--cl-radius-md);
  border: 1px solid var(--cl-slip-strong); background: var(--cl-paper);
  transition: border-color var(--cl-fast), box-shadow var(--cl-fast);
}
.composer textarea::placeholder { color: var(--cl-ash); }
.composer textarea:focus { outline: none; border-color: var(--cl-cobalt); box-shadow: 0 0 0 3px color-mix(in oklab, var(--cl-cobalt) 20%, transparent); }
.suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 2px; }
.suggestion {
  height: 26px; padding: 0 10px; border-radius: var(--cl-radius-pill);
  border: 1px solid var(--cl-slip); color: var(--cl-ink); font-size: 12px;
  transition: background var(--cl-fast), border-color var(--cl-fast);
}
.suggestion:hover { background: var(--cl-bisque); border-color: var(--cl-slip-strong); }
.actions { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 12px; }
.actions .left { margin-right: auto; color: var(--cl-ash); font-size: 11.5px; }

.notice { width: 300px; padding: 14px; }
.notice h3 { margin: 0 0 4px; font: 600 14px/19px var(--cl-font-ui); }
.notice p { margin: 0; color: var(--cl-ash); font-size: 12.5px; line-height: 18px; }

/* ── Errors ───────────────────────────────────────────────────────── */
/* The app can't show anything: a quiet sheet over the page, and the story in plain words. */
.error.screen {
  pointer-events: auto;
  position: fixed; inset: 0;
  display: grid; place-items: center;
  padding: 32px 24px 112px;
  overflow: auto;
  background: color-mix(in oklab, var(--cl-paper) 94%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  backdrop-filter: blur(12px) saturate(1.2);
  animation: sheet var(--cl-base) var(--cl-ease-out) both;
}
@keyframes sheet { from { opacity: 0; } }
.error.screen .error-body { width: min(440px, 100%); animation: rise var(--cl-slow) var(--cl-ease-out) both; }
/* Something broke, but the page still works: a small note above the dock. */
.error.note {
  pointer-events: auto;
  width: min(400px, calc(100vw - 24px));
  padding: 14px 14px 14px 16px;
  background: var(--cl-paper); border: 1px solid var(--cl-slip); border-radius: var(--cl-radius-lg);
  box-shadow: var(--cl-shadow-md);
  animation: rise var(--cl-slow) var(--cl-spring) both;
}
.error.still, .error.still .error-body { animation: none; }
.error .head { display: flex; align-items: center; gap: 10px; }
.error .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--cl-oxide); }
.error .spinner { flex: none; width: 12px; height: 12px; margin: 0 -2px; border-width: 1.75px; color: var(--cl-clay); }
.error h3 { flex: 1; margin: 0; font: 600 14px/20px var(--cl-font-ui); letter-spacing: -0.01em; }
.error .close {
  flex: none; width: 28px; height: 28px; margin: -4px -6px -4px 0; border-radius: 50%;
  display: grid; place-items: center; color: var(--cl-ash);
  transition: background var(--cl-fast), color var(--cl-fast);
}
.error .close:hover { background: var(--cl-bisque); color: var(--cl-ink); }
.error .why { margin: 4px 0 0 18px; color: var(--cl-ash); font-size: 13px; line-height: 19px; text-wrap: balance; }
.error .why strong { color: var(--cl-ink); font-weight: 600; }
.error .actions { justify-content: flex-start; gap: 4px; margin: 12px 0 0 18px; }
.error .more { padding: 0 8px 0 12px; gap: 4px; color: var(--cl-ash); }
.error .more:hover { color: var(--cl-ink); }
.error .more .ic { transition: transform var(--cl-base) var(--cl-ease-out); }
.error .more[aria-expanded="true"] .ic { transform: rotate(180deg); }
.error .details {
  margin: 14px 0 0 18px; padding: 10px 12px; max-height: 220px; overflow: auto;
  background: var(--cl-bisque); border: 1px solid var(--cl-slip); border-radius: var(--cl-radius-md);
  font: 11.5px/17px var(--cl-font-mono); color: var(--cl-ink); user-select: text;
}
.error .details[hidden] { display: none; }
.error .details p { margin: 0; word-break: break-word; }
.error .details .where { color: var(--cl-ash); }
.error .details .frame { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--cl-slip); font: inherit; color: var(--cl-ash); white-space: pre; overflow-x: auto; }
.error.screen h3 { font-size: 22px; line-height: 28px; letter-spacing: -0.02em; }
.error.screen .close { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; margin: 0; }
.error.screen .why { margin-top: 6px; font-size: 14.5px; line-height: 22px; }
.error.screen .actions { margin-top: 20px; }
.error.screen .btn { height: 34px; font-size: 13px; }
.error.screen .btn.primary { padding: 0 16px; }

/* ── Toasts ───────────────────────────────────────────────────────── */
.toasts { display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
.toast {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 14px 0 10px;
  background: var(--cl-ink); color: var(--cl-paper);
  border-radius: var(--cl-radius-pill);
  font-size: 12.5px; font-weight: 500;
  box-shadow: var(--cl-shadow-md);
  animation: rise var(--cl-base) var(--cl-ease-out) both;
}
.toast .ic { color: var(--cl-celadon); }
.toast.warn .ic { color: var(--cl-ochre); }
.toast.leaving { animation: leave var(--cl-base) var(--cl-ease-in-out) forwards; }
@keyframes leave { to { opacity: 0; transform: translateY(6px); } }

/* ── Device bar (frame page) ──────────────────────────────────────── */
.devicebar { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); pointer-events: auto; }
.devicebar .size { padding: 0 6px 0 12px; color: var(--cl-ash); font: 500 12px/18px var(--cl-font-ui); font-variant-numeric: tabular-nums; white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
`;
