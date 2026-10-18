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

/** A step's mark in the list: done, the one to do now, one for later, one that needs a look. */
export const STEP_MARK: Record<string, string> = {
  done: "✓",
  next: "●",
  later: "·",
  attention: "!",
};

export type MoveMethod = "careful" | "quick";

/** A part of the move, with the steps the CLI listed in it. */
export interface MoveStage<Step> {
  id: string;
  title: string;
  about: string;
  steps: Step[];
}

/**
 * The move's steps in their stages, in the CLI's order. Getting ready happens beside the live
 * app; going live is the one moment it changes. The look at the app's code comes before them all.
 */
export function stagesOf<Step extends { id: string }>(
  steps: Step[],
  method: MoveMethod | undefined,
): Array<MoveStage<Step>> {
  const kinds = [
    {
      id: "backend",
      title: "Get ready: your new backend",
      about:
        "A working copy of your data, people and backend, on your own Supabase. Your live app stays on Lovable.",
      steps: ["connect", "create", "export", "copy", "files", "functions", "try"],
    },
    {
      id: "website",
      title: steps.some((x) => x.id === "services")
        ? "Get ready: your website, emails and services"
        : "Get ready: your website and emails",
      about:
        "Your site on your own Netlify, using the working copy. Your live app stays on Lovable.",
      steps: ["netlify", "site", "emails", "services", "google"],
    },
    {
      id: "golive",
      title: "Go live",
      about:
        method === "quick"
          ? "Your app moves over in one go, with your data as of your export."
          : "Your live app moves over. It pauses for a few minutes, so nothing people write is lost.",
      steps: ["freeze", "final-export", "final-copy", "golive", "domain", "lovable"],
    },
  ];
  const stages: Array<MoveStage<Step>> = [];
  for (const step of steps) {
    if (step.id === "facts") continue;
    const kind = kinds.find((x) => x.steps.includes(step.id));
    const current = stages.at(-1);
    if (kind && current?.id !== kind.id) {
      stages.push({ id: kind.id, title: kind.title, about: kind.about, steps: [step] });
    } else if (current) current.steps.push(step);
    else stages.push({ id: "move", title: "", about: "", steps: [step] });
  }
  return stages;
}

/** How much the move asks of the builder, in one line. */
export const MOVE_LEVELS: Record<string, string> = {
  simple: "A simple move: Cloclod does nearly everything, and you click a few buttons.",
  "some-steps": "A move with a few steps for you, each one guided.",
  "needs-help": "A move where some parts are best done with someone technical.",
};

/** Who does each part of the move. */
export const MOVE_WHO: Record<string, string> = { clodable: "Cloclod", you: "You", help: "Help" };
