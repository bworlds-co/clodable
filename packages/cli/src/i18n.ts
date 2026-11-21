import { resolveLocale, translate, type Values } from "@clodable/i18n";
import { cli } from "@clodable/i18n/cli";

export const currentLocale = () => resolveLocale(process.env.CLODABLE_LANGUAGE);

export function tr(source: keyof typeof cli, values?: Values): string {
  return translate(currentLocale(), cli, source, values);
}
