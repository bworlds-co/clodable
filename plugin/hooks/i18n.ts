import { type Locale, translate, type Values } from "../i18n/index.ts";
import { french } from "../i18n/mod.ts";

let locale: Locale = "en";

export const getLocale = (): Locale => locale;

export function setLocale(value: Locale): void {
  locale = value;
}

export const isMessage = (value: string, source: string): boolean =>
  value === source || value === translate("fr", french, source);

export const t = (source: string, values?: Values): string =>
  translate(locale, french, source, values);
