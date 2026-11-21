import { type Locale, resolveLocale, translate, type Values } from "@clodable/i18n";
import { type PreviewMessage, previewFrench } from "@clodable/i18n/preview";
import { api } from "./api.js";

const LOCALE_KEY = "clodable:locale";

export function locale(): Locale {
  try {
    return resolveLocale(sessionStorage.getItem(LOCALE_KEY));
  } catch {
    return "en";
  }
}

export function t(source: PreviewMessage, values?: Values): string {
  return translate(locale(), previewFrench, source, values);
}

export function onLocaleChange(update: () => void): void {
  addEventListener("clodable:locale", update);
  addEventListener("storage", (event) => {
    if (event.key === LOCALE_KEY || event.key === null) update();
  });
}

let watching = false;
let latestRequest = 0;

/** Reopened previews read the owning conversation's current language, without a shared preference. */
export async function refreshLocale(): Promise<void> {
  try {
    const id = sessionStorage.getItem("clodable:conversation");
    if (!id || !/^[\w-]{1,64}$/.test(id)) return;
    const previous = sessionStorage.getItem(LOCALE_KEY);
    const request = ++latestRequest;
    const response = await api.locale(id);
    if (
      request !== latestRequest ||
      sessionStorage.getItem("clodable:conversation") !== id ||
      sessionStorage.getItem(LOCALE_KEY) !== previous ||
      typeof response.locale !== "string"
    )
      return;
    const next = resolveLocale(response.locale);
    if (next === previous) return;
    sessionStorage.setItem(LOCALE_KEY, next);
    dispatchEvent(new CustomEvent("clodable:locale"));
  } catch {
    // Older preview servers and transient failures keep the last language supplied by Claude.
  }
}

export function watchLocale(): void {
  if (watching) return;
  watching = true;
  addEventListener("focus", () => void refreshLocale());
  void refreshLocale();
}
