// The move off Lovable as the panel shows it: the plain facts and words its steps share. No $ here.

/** The AI providers an app's AI features can move to, and where each one's keys are made. */
export const AI_PROVIDERS = {
  openrouter: {
    label: "OpenRouter (the same models Lovable uses)",
    name: "OpenRouter",
    keys: "https://openrouter.ai/settings/keys",
  },
  gemini: {
    label: "Google Gemini",
    name: "Google Gemini",
    keys: "https://aistudio.google.com/apikey",
  },
  openai: { label: "OpenAI", name: "OpenAI", keys: "https://platform.openai.com/api-keys" },
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;

/** Where Lovable's data export starts: the same clicks before the pause and after it. */
export const EXPORT_CLICKS = [
  "In Lovable: More → Cloud → Overview → Advanced settings.",
  "Under Export project data, click Export data, then Export on the Database card, then Start export.",
];

/**
 * The query that shows Lovable Cloud's service key, run in Lovable, so private files can be read
 * once.
 */
export const SERVICE_KEY_QUERY =
  "select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key';";

/** A size against Supabase's plan limits: "1.2 GB", "340 MB", never "0 MB". */
export const sizeOf = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/**
 * A domain as the builder typed it, cleaned up: "https://Example.com/about" → "example.com".
 * `bare` also drops a leading "www.", for where emails come from. Undefined when it isn't one.
 */
export function typedDomain(input: string, { bare = false } = {}): string | undefined {
  let domain = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "");
  if (bare) domain = domain.replace(/^www\./, "");
  domain = domain.replace(/\/.*$/, "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain) ? domain : undefined;
}

/** The setting a connected service's own key goes in: "Google Sheets" → "GOOGLE_SHEETS_API_KEY". */
export const connectorSetting = (name: string) =>
  `${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
