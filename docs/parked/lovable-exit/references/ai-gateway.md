# Lovable AI → the client's own provider key

Verified on 2026-10-10. Model lists change every few weeks, so re-check the gateway model list and the provider's model page before you pick IDs.

## Contents
- How Lovable apps call Lovable AI
- Find every AI call
- Choose the target
- Before/after: Supabase Edge Function
- Before/after: TanStack Start (TanStack AI adapter)
- Claude models: Anthropic Messages API
- Model ID mapping
- Non-chat features
- Secrets, rollout, verification
- Sources

## How Lovable apps call Lovable AI

- **Key.** Lovable "automatically generates and manages a `LOVABLE_API_KEY` for each project". It is write-only, rotatable, and uses the reserved `LOVABLE_` prefix. App + chat connectors use the same key, so removing it breaks connectors too (`connectors.md`).
- **Where the calls run.** Calls run server-side: in Supabase Edge Functions in older React + Vite apps, and in server code in TanStack Start apps (created from May 13, 2026). Claude models are only offered in TanStack Start apps.
- **Gateway.** The gateway is `https://ai.gateway.lovable.dev/v1`. Lovable's docs never publish this URL; it is confirmed by the gateway's own answer and by TanStack AI's Lovable adapter docs. Without a key, `POST /v1/chat/completions` returns 401 "Missing API key. Provide via Lovable-API-Key header or Authorization: Bearer token."
- **Request formats.** `GET https://ai.gateway.lovable.dev/v1/models` (public) lists each model's `supported_surfaces`:
  - `chat-completions` (OpenAI Chat Completions format) for Gemini and OpenAI models;
  - `responses` for OpenAI models;
  - `messages` (Anthropic Messages format) for Claude models;
  - `embeddings`, `image-generation` and `speech` for the matching models.
- **Model IDs.** IDs are `vendor/model`: `google/gemini-3.8-flash` (the current default), `openai/gpt-5.5`, `anthropic/claude-opus-5-5`.
- **Deprecated models.** They keep working until their gateway `expiration_date`. On 2026-10-10 the list showed `google/gemini-2.5-flash` and `google/gemini-2.5-flash-lite` expiring 2026-10-20, and `openai/gpt-5-mini` expiring 2026-12-11. An app still on those breaks at that date if it stays on Lovable, which makes this phase urgent:

```bash
curl -s https://ai.gateway.lovable.dev/v1/models | python3 -c 'import sys,json,datetime as d
for m in json.load(sys.stdin)["data"]:
    e=m.get("expiration_date"); print(m["id"], "deprecated" if m.get("deprecated") else "", d.date.fromtimestamp(e) if e else "")'
```

- **Errors and billing.** `429` is Lovable's per-workspace rate limit (requests per minute). `402` means the workspace is out of credits. Usage bills Lovable credits ("Run credits"); a 4-credit monthly AI grant is described as temporary. Lovable's own FAQ says a project cannot use its own key with the built-in connector: to bill your own provider account, "call the provider's API directly from a backend edge function, with your key stored as a secret".

## Find every AI call

```bash
git grep -nE 'ai\.gateway\.lovable\.dev|LOVABLE_API_KEY|Lovable-API-Key|@tanstack/ai-lovable|lovableText|createLovable'
git grep -hoE "[\"'\`](google|openai|anthropic)/[a-z0-9.-]+" | sort | uniq -c
```

For each call site, record in the log:
- file;
- feature (chat, summary, extraction, image, embedding, speech...);
- surface (chat/completions, responses, messages, images, embeddings, speech);
- model;
- streaming yes/no;
- whether it sends `tools` or `response_format`;
- how the frontend reads the reply. Lovable's streaming chat UIs usually parse OpenAI-style SSE (`data: {...choices[0].delta.content...}` and `data: [DONE]`).

## Choose the target

Default: the target that changes the least code.

| The app uses | Default target | Why |
|---|---|---|
| `google/*` chat models over chat/completions (most common) | Google Gemini API, OpenAI-compatible endpoint | Same request, response and SSE shape; drop the `google/` prefix |
| Several vendors, or the client wants to keep `vendor/model` IDs | OpenRouter (OpenAI-compatible) | Lovable's `google/*` and `openai/*` chat IDs exist there verbatim, except `openai/chat-latest` = `openai/gpt-chat-latest` |
| `openai/*` models | OpenAI API | Same Chat Completions shape. GPT-6 Astra and GPT-6.1 Sol need the Responses API for tool calling |
| `anthropic/*` models over `/v1/messages` | Anthropic Messages API | Same Messages shape: change URL, auth header and model ID |

Do not ship Anthropic's OpenAI-compatibility layer to production. Anthropic says it "is not considered a long-term or production-ready solution for most use cases".

| Provider (OpenAI-compatible) | `AI_BASE_URL` | Model example | Key |
|---|---|---|---|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash` | Google AI Studio API key |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.5` | OpenAI API key |
| OpenRouter | `https://openrouter.ai/api/v1` | `google/gemini-3.8-flash` | OpenRouter API key |
| Vercel AI Gateway | `https://ai-gateway.vercel.sh/v1` | `vendor/model` | Vercel AI Gateway key |

All of these use `Authorization: Bearer <key>`. Google labels its OpenAI compatibility "still in beta", so test streaming and any `tools` or `response_format` use on staging.

## Before/after: Supabase Edge Function

Before: a typical Lovable-generated function, abridged from a public Lovable repo:

```ts
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "google/gemini-3-flash-preview",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
  }),
});
if (resp.status === 429) { /* "Rate limited" */ }
if (resp.status === 402) { /* "Add credits to your workspace" */ }
return new Response(resp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
```

After: provider-neutral. Only the key, URL and model lines change; the body and the stream pass-through stay:

```ts
const AI_API_KEY = Deno.env.get("AI_API_KEY");
const AI_BASE_URL = Deno.env.get("AI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemini-3-flash-preview";
if (!AI_API_KEY) throw new Error("AI_API_KEY is not configured");

const resp = await fetch(`${AI_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: AI_MODEL,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
  }),
});
if (!resp.ok) {
  console.error("AI provider error", resp.status, await resp.text());   // never log the key
  // 402 was Lovable's "out of credits"; providers use their own codes. Return a neutral message.
}
return new Response(resp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
```

```bash
# Values come from a file outside the repo (mode 600); never put them on a committed line
npx supabase secrets set --env-file "$W/ai.staging.env" --project-ref <staging-ref>
# $W/ai.staging.env contains: AI_API_KEY=..., AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai, AI_MODEL=gemini-3-flash-preview
```

Switching provider later is then a secrets change, with no code change. Remove user-facing text that mentions Lovable credits.

## Before/after: TanStack Start (TanStack AI adapter)

```ts
// Before
import { chat } from "@tanstack/ai";
import { lovableText } from "@tanstack/ai-lovable";          // reads LOVABLE_API_KEY
const stream = chat({ adapter: lovableText("google/gemini-3.8-flash"), messages });

// After (Gemini)
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";            // reads GOOGLE_API_KEY, then GEMINI_API_KEY
const stream = chat({ adapter: geminiText("gemini-3.8-flash"), messages });
```

```bash
npm install @tanstack/ai-gemini && npm uninstall @tanstack/ai-lovable   # uninstall only when no import remains
```

| Target | Package / function | Env var | Model example |
|---|---|---|---|
| OpenAI | `@tanstack/ai-openai` / `openaiText` | `OPENAI_API_KEY` | `gpt-5.5` |
| Anthropic | `@tanstack/ai-anthropic` / `anthropicText` | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` |
| OpenRouter | `@tanstack/ai-openrouter` / `openRouterText` | `OPENROUTER_API_KEY` | `google/gemini-3.8-flash` |

Model IDs are typed: TypeScript rejects IDs the adapter doesn't know, so run the type check. Set these variables as **server** environment variables on the new host. Never use a `VITE_` prefix, which would ship the key to browsers.

## Claude models: Anthropic Messages API

If the code calls the gateway's `/v1/messages`, change three things:
- the URL becomes `https://api.anthropic.com/v1/messages`;
- the auth header becomes `x-api-key: <key>` (Anthropic now documents `Authorization: Bearer` as primary; `x-api-key` is "still supported"), plus `anthropic-version: 2023-06-01`;
- the model ID loses its prefix: `anthropic/claude-opus-5-5` becomes `claude-opus-5-5`.

```ts
const resp = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1024, system: systemPrompt, messages }),
});
const data = await resp.json();
const text = data.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
```

`max_tokens` is required, and the system prompt is a top-level field (there is no `system` role). Don't assume `content[0]` is text: it can be a thinking block. Moving a chat/completions feature to Claude also changes the streaming events, so the function must translate them or the frontend parser must change. Prefer an OpenAI-compatible target when the frontend parses OpenAI SSE.

## Model ID mapping

Rule: strip the `vendor/` prefix for direct providers. OpenRouter keeps the prefix but writes Claude versions with dots. Check every ID on the provider's model page before deploying.

| Lovable gateway ID | Direct ID | OpenRouter ID |
|---|---|---|
| `google/gemini-3.8-flash` | `gemini-3.8-flash` (Gemini) | `google/gemini-3.8-flash` |
| `google/gemini-3-flash-preview` | `gemini-3-flash-preview` | same as Lovable |
| `google/gemini-2.5-flash` (expires on Lovable 2026-10-20) | `gemini-2.5-flash`, no Google shutdown date announced | `google/gemini-2.5-flash` |
| `openai/gpt-5.5` | `gpt-5.5` (OpenAI) | `openai/gpt-5.5` |
| `openai/gpt-5-mini` (expires 2026-12-11) | OpenAI lists `gpt-5.6-terra` as replacement | check |
| `anthropic/claude-opus-5-5` | `claude-opus-5-5` (Anthropic) | `anthropic/claude-opus-5.5` |
| `anthropic/claude-haiku-4-5` | `claude-haiku-4-5` | `anthropic/claude-haiku-4.5` |

## Non-chat features

- **Embeddings**: keep the same embedding model when you change provider (for example `google/gemini-embedding-2` → Gemini `gemini-embedding-2`). Otherwise re-embed every stored vector: vectors from different models are not comparable. Check the dimension matches the `vector(n)` column.
- **Images**: Lovable's image models map to the provider's image API (Gemini through `/images/generations` on the OpenAI-compatible endpoint, or OpenAI Images). Response shapes differ, so test upload and display.
- **Speech, transcription, live voice, video, music**: each one is a small rewrite against the provider's own API. List them in the inventory and estimate each separately.

## Secrets, rollout, verification

1. Put the code change on the migration branch. The client's own key goes into staging secrets (Edge Functions) or host environment variables (TanStack Start). Set a usage limit or alert in the provider console if it offers one.
2. Verify on the staging deployment:
   - every AI feature works;
   - streaming renders token by token;
   - a bad key gives a clean error;
   - the requests appear in the provider's usage dashboard.
3. `git grep -nE 'ai\.gateway\.lovable\.dev|LOVABLE_API_KEY|@tanstack/ai-lovable'` returns nothing, except comments you deliberately keep.
4. After cutover, Lovable's AI usage for the project drops to zero (**Workspace settings → Plans & credit usage → Usage details → Run credits**).

## Sources
- Lovable, AI features for your app (LOVABLE_API_KEY, models, 429/402, credits, FAQ): https://docs.lovable.dev/features/ai
- Lovable, What migrates and how (AI features row): https://docs.lovable.dev/tips-tricks/external-deployment-hosting#what-migrates-and-how
- Lovable, Secrets (write-only, Rotate, reserved prefixes): https://docs.lovable.dev/features/secrets
- Lovable AI gateway model list (public, live): https://ai.gateway.lovable.dev/v1/models
- TanStack AI, Lovable adapter (gateway URL, `lovableText`): https://tanstack.com/ai/latest/docs/adapters/lovable ; packages on npm: https://www.npmjs.com/package/@tanstack/ai-lovable , https://www.npmjs.com/package/@tanstack/ai-gemini , https://www.npmjs.com/package/@tanstack/ai-openai , https://www.npmjs.com/package/@tanstack/ai-anthropic , https://www.npmjs.com/package/@tanstack/ai-openrouter
- Google, Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai ; deprecations: https://ai.google.dev/gemini-api/docs/deprecations
- OpenAI, Chat Completions: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create ; models: https://developers.openai.com/api/docs/models ; deprecations: https://developers.openai.com/api/docs/deprecations ; GPT-6 Astra notes: https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra
- Anthropic, API overview (headers): https://platform.claude.com/docs/en/api/overview ; Messages API: https://platform.claude.com/docs/en/api/messages ; OpenAI SDK compatibility (not for production): https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk ; models: https://platform.claude.com/docs/en/models/overview
- OpenRouter quickstart: https://openrouter.ai/docs/quickstart
- Vercel AI Gateway, OpenAI-compatible API: https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions
- Supabase, Edge Function secrets (read immediately, no `SUPABASE_` prefix): https://supabase.com/docs/guides/functions/secrets
- Lovable-generated gateway functions in public repos (pattern observed 2026-10-10, GitHub code search, sign-in required): https://github.com/search?q=%22ai.gateway.lovable.dev%2Fv1%2Fchat%2Fcompletions%22&type=code
