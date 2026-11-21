import { resolveLocale, translate, type Values } from "@clodable/i18n";
import { core } from "@clodable/i18n/core";

export const currentLocale = () => resolveLocale(process.env.CLODABLE_LANGUAGE);

export function tr(source: keyof typeof core, values?: Values): string {
  return translate(currentLocale(), core, source, values);
}
