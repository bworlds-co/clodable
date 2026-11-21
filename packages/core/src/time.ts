import { currentLocale, tr } from "./i18n.js";

/** Human time: relative for recent moments, absolute otherwise. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < 45_000) return tr("just now");
  if (diff < HOUR) return tr("{count} min ago", { count: Math.max(1, Math.round(diff / MINUTE)) });
  if (diff < DAY && then.getDate() === now.getDate())
    return tr("{count} h ago", { count: Math.round(diff / HOUR) });
  if (diff < 2 * DAY) return tr("yesterday at {time}", { time: formatClock(then) });
  return formatAbsolute(iso, now);
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString(currentLocale() === "fr" ? "fr-FR" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Oct 10, 2:14 PM"; adds the year when it isn't this year. */
export function formatAbsolute(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = date.toLocaleDateString(currentLocale() === "fr" ? "fr-FR" : "en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${day}, ${formatClock(date)}`;
}
