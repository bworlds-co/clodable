# App connectors, payments and other Lovable-managed services

Verified on 2026-10-10.

## Contents
- What does not export
- Find every connector
- Connector types and what to do
- Rewrite a gateway call to the provider's own API
- App user connectors (each end user's own account)
- Built-in payments (Stripe, Paddle)
- Lovable-managed emails
- Other "Managed by Lovable" services
- Verification
- Sources

## What does not export

Lovable's migration table says: "App + chat connectors and app user connectors run through Lovable and keep working while the project uses the built-in backend (Cloud). Connections are not exported. When the backend moves, replace those calls with your own integration for each provider. Chat connectors (MCP servers) work only in the project chat, so nothing moves."

Gateway connectors keep credentials on Lovable's side: they are "not visible in project settings or accessible to workspace admins". You cannot extract them. Every integration needs new credentials created by the client at the provider.

## Find every connector

```bash
git grep -nE 'connector-gateway\.lovable\.dev|X-Connection-Api-Key|Lovable-API-Key|api\.lovable\.dev'
git grep -nE 'LOVABLE_API_KEY'
```

Cross-check with the UI:
- **More → Connectors** inside the project lists the linked connections.
- The workspace **Connectors** page shows each connection's **Linked projects**.
- In **More → Cloud → Secrets**, connector-managed secrets carry no badge and offer **Manage connection** in their menu.

Record each connector in the log: provider, type, operations used, scopes, and whether it is **Managed by Lovable**.

## Connector types and what to do

| Type (Lovable name) | How it runs | What to do |
|---|---|---|
| App + chat connector | One shared account; most route through `connector-gateway.lovable.dev` | Client creates an API key or OAuth app at the provider; rewrite the calls (next section) |
| App user connector | Each end user's own account; tokens stored in Lovable's gateway | Build your own OAuth flow; every end user reconnects once |
| Chat connector (MCP server) | Only in Lovable's project chat while building | Nothing to move. Optionally set up the same MCP server in Claude Code |
| **Managed by Lovable** option | Lovable-owned credentials, billed in Lovable credits | Client signs up with the provider and uses its own key |
| Built-in payments | Stripe or Paddle connectors | See "Built-in payments" |

## Rewrite a gateway call to the provider's own API

Public Lovable-generated code shows the pattern. The gateway path mirrors the provider's API path, and the request carries `LOVABLE_API_KEY` plus an opaque connection key. Lovable does not document this, so read each call site before changing it.

```ts
// Before: through Lovable's gateway
await fetch("https://connector-gateway.lovable.dev/resend/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": RESEND_API_KEY,      // opaque Lovable connection key, not a Resend key
    "Content-Type": "application/json",
  },
  body: JSON.stringify(email),
});

// After: straight to the provider with the client's own key
await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },  // now a real Resend key
  body: JSON.stringify(email),
});
```

Some generated code wraps an SDK's `fetch` and swaps the provider host for the gateway (for example `https://api.stripe.com` for `https://connector-gateway.lovable.dev/stripe`). Remove the wrapper and let the official SDK call the provider with the client's key.

For each connector:
1. The client creates the credential at the provider, with the narrowest scope that covers the operations in use. Use separate test credentials for staging if the provider offers them.
2. Store it as a Supabase secret (Edge Functions) or a server environment variable on the host (TanStack Start). Never use a `VITE_` prefix.
3. Rewrite the call: provider base URL, the provider's auth header, and no more `LOVABLE_API_KEY` or `X-Connection-Api-Key`. Keep the request bodies.
4. Account for limits that change. Lovable's gateway allowed up to 1,000 requests per minute per connector per project; the provider's own limits now apply. Update any IP allowlist that named Lovable's gateway ranges.
5. Test on staging, then log it.

## App user connectors (each end user's own account)

- Each end user's tokens are stored "encrypted in the connector gateway", tied to that user. They cannot be exported, so **every end user has to reconnect once**. Put this in the client notice.
- If the client registered its own OAuth app (for example GitHub or Notion), its redirect URI includes Lovable's gateway callback `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`. Add the new app's callback URL; remove Lovable's only after sign-off.
- Replace the gateway with your own OAuth flow:
  - an authorize redirect;
  - a callback route (Edge Function or server route) that exchanges the code;
  - per-user token storage that only server code can read (a table with no `anon`/`authenticated` access, or encrypted values);
  - a refresh, and a "reconnect" prompt when the refresh token is invalid.

## Built-in payments (Stripe, Paddle)

- Lovable's built-in payments "run through the workspace's Stripe and Paddle connectors". Lovable creates the provider account (Stripe asks the client to **claim** it), provisions API keys, webhook secrets and environment variables, and registers **two webhook endpoints per environment**:
  - the app's own endpoint, for example `https://<ref>.supabase.co/functions/v1/payments-webhook?env=live`, or `https://<project>.lovable.app/api/public/payments/webhook?env=live` on TanStack Start apps;
  - Lovable's monitoring endpoint `https://api.lovable.dev/projects/<project-id>/payments-webhook/<environment>`.
- Products, prices, customers and subscriptions live in the client's provider account, so nothing there needs migrating. Make sure the client has full dashboard access, and claim the Stripe account if that hasn't been done.
- Older React + Vite apps' built-in payments "always require the built-in backend (Cloud)", so after the move they run on your own integration.
- Steps:
  1. The client creates its own API keys: test keys for staging, live keys for production.
  2. Replace connector calls with the provider's SDK.
  3. Add a new webhook endpoint at the provider that points at the new backend's handler, and store its signing secret as a secret. Make the handler idempotent, because providers retry and you may replay events.
  4. Check checkout, subscription activation and cancellation on staging in test mode.
  5. During the cutover, switch live traffic to the new endpoint. Use the provider's event log to resend any events that landed in the old backend during the window.
- Do not delete or disable Lovable's endpoints, and do not click **Disconnect payments** in Lovable, before sign-off. Disconnecting is permanent: it deletes Lovable's keys and webhook secrets and attempts to delete the webhooks it registered. It "does not close or modify your Paddle or Stripe account" and does not cancel subscriptions.

## Lovable-managed emails

- Lovable sends auth emails and app emails from the client's domain (usually `notify.<domain>`). It sets up SPF, DKIM and DMARC itself, and "No external email provider accounts or API keys are required". After the move these emails stop, so they must be replaced before cutover.
- Steps:
  1. The client picks an email provider and verifies the sending domain (new DNS records).
  2. Set Supabase custom SMTP for auth emails (`cloud-to-supabase.md`, section 8).
  3. Rewrite app-email sending to the provider's API and copy the templates.
  4. Lovable added unsubscribe links to app emails automatically; keep an equivalent.
- Remove Lovable's email DNS records only after sign-off.

## Other "Managed by Lovable" services

- **Managed connectors** such as Firecrawl, Perplexity or Parallel use Lovable-owned credentials and bill Lovable credits. The client signs up with the provider and uses its own key.
- **Managed social sign-in** (Google, Apple, Microsoft): the client needs its own OAuth credentials (`cloud-to-supabase.md`, section 8).
- **Lovable workspace identity reuse**: internal apps that recognize Lovable workspace members with no login page need a real sign-in method after the move. Flag this early, because it changes the user experience.

## Verification

- `git grep -nE 'connector-gateway\.lovable\.dev|X-Connection-Api-Key|LOVABLE_API_KEY'` returns nothing.
- Each integration works on staging with the client's credentials, and the requests appear in the provider's dashboard.
- Webhook deliveries show 2xx responses in the provider's event log.
- Log one row per connector: `replaced`, `owner`, `tested on staging`.

## Sources
- Lovable, What migrates and how (App connectors row): https://docs.lovable.dev/tips-tricks/external-deployment-hosting#what-migrates-and-how
- Lovable, App + chat connectors (types, gateway, LOVABLE_API_KEY): https://docs.lovable.dev/integrations/app-connectors
- Lovable, App user connectors (gateway token storage, callback URL): https://docs.lovable.dev/integrations/app-user-connectors
- Lovable, Chat connectors (MCP): https://docs.lovable.dev/integrations/chat-connectors
- Lovable, Integration security (credentials, 1,000 req/min, IP ranges, key rotation): https://docs.lovable.dev/integrations/security
- Lovable, Payments (accounts, webhooks, disconnect effects): https://docs.lovable.dev/features/payments
- Lovable, Custom emails: https://docs.lovable.dev/features/custom-emails
- Lovable, Secrets (connector-managed secrets): https://docs.lovable.dev/features/secrets
- Gateway pattern in public Lovable-generated code (observed 2026-10-10, not documented by Lovable; GitHub code search, sign-in required): https://github.com/search?q=%22connector-gateway.lovable.dev%22&type=code
- Dreamlit exporter page ("auth and app emails stop sending after you cut over"): https://dreamlit.ai/tools/lovable-cloud-to-supabase-exporter
