import { currentLocale, tr } from "../i18n.js";

const nouns = {
  table: ["{count} table", "{count} tables"],
  row: ["{count} row", "{count} rows"],
  person: ["{count} person", "{count} people"],
  message: ["{count} message", "{count} messages"],
  file: ["{count} file", "{count} files"],
  "file folder": ["{count} file folder", "{count} file folders"],
  "database function or webhook": [
    "{count} database function or webhook",
    "{count} database function or webhooks",
  ],
  "database secret": ["{count} database secret", "{count} database secrets"],
  "secret key": ["{count} secret key", "{count} secret keys"],
  function: ["{count} function", "{count} functions"],
  setting: ["{count} setting", "{count} settings"],
  "backend function": ["{count} backend function", "{count} backend functions"],
} as const;

export function count(n: number, one: string, many = `${one}s`): string {
  const forms = nouns[one as keyof typeof nouns];
  const number = n.toLocaleString(currentLocale() === "fr" ? "fr-FR" : "en-US");
  return forms
    ? tr(forms[n === 1 ? 0 : 1], { count: number })
    : `${number} ${n === 1 ? one : many}`;
}
