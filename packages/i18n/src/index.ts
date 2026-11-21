export const languages = {
  en: ["english", "anglais"],
  fr: ["french", "français", "francais"],
} as const;

export type Locale = keyof typeof languages;
export type Values = Readonly<Record<string, string | number>>;
export type Catalog = Readonly<Record<string, string>>;

/** Claude accepts language names as well as locale codes. Only shipped catalogs are selected. */
export function resolveLocale(value: unknown): Locale {
  if (typeof value !== "string") return "en";
  const name = value.trim().toLowerCase();
  for (const [locale, aliases] of Object.entries(languages)) {
    if (name === locale || aliases.some((alias) => alias === name)) return locale as Locale;
    if (new RegExp(`^${locale}[-_][a-z0-9]+(?:[-_][a-z0-9]+)*$`).test(name))
      return locale as Locale;
  }
  return "en";
}

/** Replace placeholders once so values containing braces are kept verbatim. */
export function translate(
  locale: Locale,
  catalog: Catalog,
  source: string,
  values: Values = {},
): string {
  const template = locale === "fr" && Object.hasOwn(catalog, source) ? catalog[source]! : source;
  return template.replace(/\{([\w]+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}
