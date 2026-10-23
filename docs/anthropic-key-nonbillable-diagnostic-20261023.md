# Omnira — Anthropic credential acceptance check (2026-10-23)

This is a single **operator-authenticated, non-generating** diagnostic for the Anthropic API key stored as `ANTHROPIC_API_KEY` in the running Vercel environment.

## Why

On 22–23 October 2026 Omnira's news cron, Dream and morning briefing received Anthropic `401 authentication_error: invalid x-api-key`. The operator then replaced the API key in protected Vercel Production+Preview variables and Vercel redeployed, but no new inference or provider request was observed in the fresh deployment. A valid environment variable and a READY deployment do not prove the remote API accepts the key.

## Control

Open **`https://app.omniraos.se/api/system/provider-check/anthropic`** while signed in as Omnira's platform operator. This route performs one `GET https://api.anthropic.com/v1/models?limit=1` with the **server-side deployed** key. The models API is metadata-only; it does not invoke model inference, publish content, change credentials or spend generation tokens. It reads no other Omnira project data.

- `credentialStatus: "accepted"` + HTTP 200: Anthropic accepted the deployed API key for the models endpoint; **this does not prove** a paid text completion can execute, that the configured AI model is available, or that an individual scheduled workflow succeeds.
- `invalid_key` + HTTP 502: Anthropic explicitly rejected the key with 401. Do not retry blindly; check the workspace/key in Claude Platform and Vercel's protected value.
- `forbidden` + HTTP 503: The provider rejected model listing with 403; do not claim the key is valid for inference.
- `not_configured` + HTTP 503: no key in the running environment.
- `unavailable` + HTTP 503: timeout/429/5xx/unclassified response; no credential-validity claim.
- HTTP 401/403 + `access_denied`: Omnira's own authorization refused the request (not an Anthropic response).

The response always states `inferenceVerified:false` and `billableGenerationPerformed:false`. Provider response bodies, raw errors, API keys and authorization headers are **never returned or logged**. The endpoint is guarded by the existing verified Supabase platform-operator authority, uses no caller-controlled external URL or request headers, refuses redirects, times out after eight seconds and marks responses private/no-store/noindex.

## Release and incident rules

Keep `MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED` OFF unless the user separately approves API fallback costs. No old cron jobs, Dream cycles, briefings or publications should be replayed as an implicit part of this credential check.

After one authenticated `accepted` result, re-check the new Vercel production deployment, the account's available prepaid balance, and the next normal scheduled Anthropic requests. Only close incident [#518](https://github.com/Bumbi190/ai-operating-platform/issues/518) after a governed inference and downstream outcome have also been verified.
