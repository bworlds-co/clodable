import { type Locale, translate } from "@clodable/i18n";
import { core } from "@clodable/i18n/core";
import { currentLocale } from "../i18n.js";
import type { MoveCheck } from "./state.js";

export interface CheckMessage {
  source: string;
  values?: Readonly<Record<string, string | number | CheckMessage>>;
}

export function renderCheckMessage(message: CheckMessage, locale: Locale): string {
  const values = Object.fromEntries(
    Object.entries(message.values ?? {}).map(([key, value]) => [
      key,
      typeof value === "object"
        ? renderCheckMessage(value, locale)
        : typeof value === "number"
          ? value.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")
          : value,
    ]),
  );
  return translate(locale, core, message.source, values);
}

/** Persist the source wording and parameters so a later session can use another language. */
export function checkLabel(
  source: keyof typeof core,
  values?: CheckMessage["values"],
): Pick<MoveCheck, "label" | "labelMessage"> {
  const labelMessage: CheckMessage = { source, ...(values ? { values } : {}) };
  return { label: renderCheckMessage(labelMessage, "en"), labelMessage };
}

export function checkDetail(
  source: keyof typeof core,
  values?: CheckMessage["values"],
): Pick<MoveCheck, "detail" | "detailMessage"> {
  const detailMessage: CheckMessage = { source, ...(values ? { values } : {}) };
  return { detail: renderCheckMessage(detailMessage, "en"), detailMessage };
}

export function countMessage(n: number, one: string, many = `${one}s`): CheckMessage {
  return { source: `{count} ${n === 1 ? one : many}`, values: { count: n } };
}

const storedLabels: Readonly<Record<string, readonly (keyof typeof core)[]>> = {
  tables: ["All {0} and their {1} are there", "{0} didn't copy fully"],
  people: ["{0} can sign in as before", "{0} of {1} came over"],
  rules: ["Every access rule is in place", "Some access rules are missing"],
  links: [
    "Links between tables and automatic actions are in place",
    "Some links or automatic actions are missing",
  ],
  access: ["Your app can reach its tables as before", "Your app can't reach some of its tables"],
  counters: ["New rows will save cleanly", "Some counters are behind"],
  "old-backend": [
    "The checked database functions and webhooks no longer name the old backend",
    "{0} still call Lovable Cloud",
  ],
  extensions: ["Database extensions are on", "Some database extensions are off"],
  files: [
    "Some files are missing",
    "Some file folders are missing",
    "All {0} are there",
    "{0} ready for your files",
  ],
  api: [
    "Your app's API is ready",
    "Your app's API sees every table",
    "Your app's API doesn't see some tables yet",
  ],
};

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function recordedCount(value: string): string | number | CheckMessage {
  if (/^[\d,]+$/.test(value)) return Number(value.replaceAll(",", ""));
  const count = value.match(/^([\d,]+) (.+)$/);
  const source = count ? `{count} ${count[2]}` : "";
  return count && Object.hasOwn(core, source)
    ? { source, values: { count: Number(count[1]!.replaceAll(",", "")) } }
    : value;
}

function recordedLabel(check: MoveCheck): CheckMessage | undefined {
  for (const source of storedLabels[check.id] ?? []) {
    const keys = [...source.matchAll(/\{(\d+)\}/g)].map((match) => match[1]!);
    const pattern = source
      .split(/\{\d+\}/)
      .map(escapePattern)
      .join("(.+?)");
    const match = check.label.match(new RegExp(`^${pattern}$`));
    if (!match) continue;
    return {
      source,
      values: Object.fromEntries(keys.map((key, i) => [key, recordedCount(match[i + 1]!)])),
    };
  }
  return undefined;
}

/** Only known check copy is translated; table names, raw diagnostics and user notes are preserved. */
export function presentMoveCheck(check: MoveCheck): MoveCheck {
  const locale = currentLocale();
  const message = check.labelMessage ?? recordedLabel(check);
  let detail = check.detailMessage ? renderCheckMessage(check.detailMessage, locale) : check.detail;
  if (locale === "fr" && detail && !check.detailMessage) {
    if (check.id === "people") {
      const match = detail.match(
        /^(.+) sign in without a password \(Google and the like, or invited\)\.$/,
      );
      if (match)
        detail = renderCheckMessage(
          {
            source: "{0} sign in without a password (Google and the like, or invited).",
            values: { "0": recordedCount(match[1]!) },
          },
          locale,
        );
    }
    if (check.id === "access") {
      detail = detail
        .split("; ")
        .map((part) => {
          const match = part.match(/^(.+) for (.+): (.+)$/);
          return match
            ? translate(locale, core, "{table} for {role}: {privileges}", {
                table: match[1]!,
                role: match[2]!,
                privileges: match[3]!,
              })
            : part;
        })
        .join("; ");
    }
    if (["tables", "files", "rules", "links"].includes(check.id)) {
      detail = detail
        .split("; ")
        .map((part) => {
          const missing = part.match(/^(.+): missing$/);
          if (missing) return translate(locale, core, "{name}: missing", { name: missing[1]! });
          const wrong = part.match(/^(.+): wrong access$/);
          if (wrong) return translate(locale, core, "{name}: wrong access", { name: wrong[1]! });
          const counts = part.match(/^(.+): (\d+) of (\d+) (rows|files)$/);
          if (counts)
            return translate(
              locale,
              core,
              counts[4] === "rows"
                ? "{name}: {actual} of {expected} rows"
                : "{name}: {actual} of {expected} files",
              {
                name: counts[1]!,
                actual: Number(counts[2]).toLocaleString("fr-FR"),
                expected: Number(counts[3]).toLocaleString("fr-FR"),
              },
            );
          const rules = part.match(
            /^(access rules|protected tables|triggers|links between tables) in (.+): (\d+) of (\d+)$/,
          );
          if (rules)
            return translate(locale, core, `${rules[1]} in {schema}: {actual} of {expected}`, {
              schema: rules[2]!,
              actual: rules[3]!,
              expected: rules[4]!,
            });
          const appTriggers = part.match(
            /^the app's triggers on sign-ins and files: (\d+) of (\d+)$/,
          );
          if (appTriggers)
            return translate(
              locale,
              core,
              "the app's triggers on sign-ins and files: {actual} of {expected}",
              { actual: appTriggers[1]!, expected: appTriggers[2]! },
            );
          return part;
        })
        .join("; ");
    }
  }
  return {
    ...check,
    ...(message ? { label: renderCheckMessage(message, locale) } : {}),
    ...(detail ? { detail } : {}),
  };
}
