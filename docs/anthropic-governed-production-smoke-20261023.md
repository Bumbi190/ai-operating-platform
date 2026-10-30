# Anthropic — one-shot, governed production inference verification

**Status:** prepared for a single explicit operator action; no scheduled retry. This is not an instruction to run The Prompt's missed cron jobs.

## Prior proof

The operator used `GET https://app.omniraos.se/api/system/provider-check/anthropic` on Oct 23, 2026 and received `credentialStatus: "accepted"`, `inferenceVerified:false`, `billableGenerationPerformed:false`. The new protected Vercel Anthropic key is accepted for read-only model metadata, but this is NOT proof of inference or spending ledger.

## Controlled test

While signed into Omnira with the verified **platform-operator** account, open:

`https://app.omniraos.se/api/system/provider-check/anthropic/smoke`

The GET renders an inert consent page. Only the operator pressing **Kör ett budgetstyrt AI-test** POSTs to the provider.

- Verified operator Supabase session, strict same-origin POST; no caller-controlled model/prompt/options.
- **One fixed physical spend intent** `omnira-anthropic-production-smoke-20261023-v1`. Replays under enforced H1 budget gate fail closed; old intent cannot authorize a second dispatch. If the first attempt fails and is terminal in the reservation ledger, STOP — do not retry by inventing another key.
- Production **H1_SPEND_GATE must be strictly enabled**. The server refuses when the flag is disabled. The configured flag in the existing Vercel production metadata had value `1` before this feature.
- The canonical `getAnthropic` provider adapter performs a single pinned `claude-haiku-4-5-20251001` `messages.create` with `max_tokens=24` and a fixed very short test prompt.
- An independently priced, conservative worst-case token-window **budget reservation precheck must be no greater than 3 SEK**. The canonical spend system still calculates its own bound and enforces the project/global daily-weekly-monthly budgets; failure refuses the request. No advisory budget overrides are accepted by this route.
- Real cost is recorded by the existing `logLlmCost` under provider `anthropic`, agent `Provider Diagnostics`, operation `Anthropic Production Smoke`, budget project `ai-media-automation`. Verify durable `cost_events` and `spend_reservations` after the operator runs the test. If the ledger lacks actual cost evidence, do NOT claim full reconciliation, even if the response looks correct.
- Success means the provider completed a real non-streaming Haiku response with positive token usage. The actual generated text and Anthropic's raw error details are never returned. `billableGenerationPerformed=true` reflects a valid response with usage, not an assumption that the total project balance decreased by a precise amount.
- All other events, including the 06:30 news cron, morning briefing, Dream, social publishing, and Higgsfield video generation, are untouched.

## Responses

- `inference_verified` + HTTP 200: genuine inference succeeded. Check the operation-specific ledger row and release the incident only after separately verifying the scheduled news/briefing behavior.
- `inference_incomplete` + HTTP 502: a response may have been billed, but it did not meet test completion conditions.
- `spend_refused` + HTTP 409: budget or replay guard stopped further calls. No blind retries.
- `budget_gate_not_enforced` / `cost_ceiling_refused` + HTTP 503: no physical inference call was started.
- `provider_unavailable` + HTTP 503: ambiguous failure. The reservation is conservatively accounted if the request may have reached Anthropic; do not retry with a new identity.
- `access_denied` + HTTP 401/403: Omnira operator or origin gate refused the action.

**Operator consent gate:** GET is cost-free, POST is a real billable inference that the operator intentionally authorizes via the button. The endpoint is not a general prompt surface, cron or publishing API. The one-shot identity is intentionally fixed for this release.
