# The Prompt — read-only Higgsfield inspection diagnostics (24 October 2026)

## Evidence and scope

On 24 October 2026 at approximately 09:13 Stockholm time, an authenticated operator screenshot of `app.omniraos.se` showed **The Prompt: Ansluten**, but the `Läs saldo och testpris` action returned the generic **Saldo och testpris kunde inte läsas just nu** warning with unknown balance and quote. A read-only production Supabase query confirmed the The Prompt connection is still connected, identity-verified, and encrypted. Vercel production's grouped error list and the `higgsfield`-filtered runtime logs had no actionable error; the route catches errors and previously returned only a generic UI message. This is **not** evidence that the account needs reconnecting.

The separately connected ChatGPT Higgsfield application successfully read **1,170 credits** and quoted **4 credits** for `grok_video_v15_lite`, 4 seconds, 720p, 9:16, without submitting generation. That separate application connection is **not proof** that Omnira's project-bound OAuth/MCP session has passed the identical read-only flow.

## Minimal safe diagnostics added

- The existing operator/project-protected `POST /api/media/higgsfield/inspect` continues to require signed-in platform operator authority, project ownership, a matching origin, and an exact `project_id` body.
- Read-only operations are tagged internally with **closed, locally authored** phases: `connect`, `list_tools`, `tool_schema`, `balance`, `model`, `quote`, `consistency`.
- The existing `HiggsfieldError` exposes only its established finite failure codes, plus one optional phase to the authorized route. No provider messages, tool outputs, model prompts, OAuth tokens, user identifiers, project IDs, headers or raw thrown errors are returned as diagnostics.
- The server writes an operator-only, sanitized `[higgsfield-inspect] read_failed` warning with exactly `code` and `stage`, no extra metadata. It intentionally catches unknown exceptions as `provider_unavailable/unknown`.
- The Settings panel preserves a known connected state for recoverable 503 errors, offers retry, and shows a human-readable explanation alongside a closed `code/stage` diagnostic; unknown/untrusted strings become `unknown` and are never reflected. Reconnect-required and unauthorized cases retain their previous fail-closed controls.

**No changes to** paid generation, purchases, video cron, quotas, model selection, still-image fallback, OAuth storage, grants, migration ledger, or account credentials.

## Post-release read-only acceptance

1. Confirm the exact PR merge SHA is on the Vercel **production READY** deployment before testing; verify no other deployments or migrations are in flight.
2. In Omnira Settings under **The Prompt**, click **Läs saldo och testpris** once, on the configured canonical origin. Do **not** reconnect, disconnect or generate while diagnosing.
3. Success: show numerical balance and the fixed four-second price, with a timestamp. This alone is a read-only inspection success, **not** paid video generation readiness.
4. On failure: copy only the small **Felsökningskod** (`code/stage`), or retrieve matching recent sanitized Vercel runtime warning `[higgsfield-inspect] read_failed`. Do not transmit a browser session, credentials or user/provider response body.
5. Diagnose by phase: `connect` = MCP session establishment; `list_tools/tool_schema` = provider tools schema; `balance/model/quote` = that specific fixed no-charge read; `consistency` = concurrent connection version update.
6. Fix the diagnosed root cause in a **new isolated branch**, with failing-first tests and independent review. Never weaken OAuth origin/project authorization or add a generation fallback.

Because the failure phase was previously hidden, the root cause of the live production error is **not yet proven**. Treat this change as instrumentation that safely disambiguates the exact failing step, not a claim that balance+quote is already fixed.
