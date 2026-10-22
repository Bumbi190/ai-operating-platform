# Higgsfield MCP: read-only connection rollout

Scope: project-bound OAuth plus balance/model/price inspection. No generation adapter is registered, no media cron changes, no purchases, no automatic top-up. Existing still-image reels continue.

## Configuration

- HIGGSFIELD_MCP_ENABLED: unset/false disables OAuth and inspection. Enable only in the intended deployment.
- HIGGSFIELD_OAUTH_REDIRECT_URI: exact HTTPS deployment callback, ending /api/media/higgsfield/oauth/callback. Never infer it from request host. Explicit local development permits localhost/127.0.0.1 HTTP.
- MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY: fresh 32-byte key, standard base64, provisioned directly into protected server configuration. Never paste it into chat, commit it, or prefix it NEXT_PUBLIC_. Keep it stable for existing encrypted connections; changing it requires an explicit credential migration or reconnect.

No Higgsfield API key or dollar-balance setup is needed. OAuth consent belongs to this application, not the ChatGPT plugin. Generation remains disabled even after connection.

## Before deployment

1. Review migration 20261022075921_higgsfield_mcp_readonly.sql and its SQL tests. Apply only to the intended environment after review; this branch does not apply production schema.
2. Configure the three server values securely. Do not expose credentials through status endpoints or browser logs.
3. Deploy the reviewed branch. Open vNext Settings as the platform operator who owns the target project.
4. Select Anslut Higgsfield in that project's block, then complete Higgsfield's OAuth consent. The callback returns to Settings. Decline or session expiry requires a fresh start.
5. Select Läs saldo och testpris. This reads balance, model parameters and a fixed quote for Grok Imagine Video 1.5 Lite, 4 seconds, 720p, 9:16, one output. It cannot submit a generation.
6. Record balance before and after the quote and confirm no generation job appeared. This live smoke has NOT been performed for Omnira yet; the necessary OAuth connection does not exist in this worktree.

## Protocol and refusal behavior

Resource metadata resolves to https://clerk.higgsfield.ai; root MCP proxy metadata is not an automatic fallback. Only the fixed MCP and Clerk origins are accepted. Credentials are encrypted with project/kind/record identity in authenticated data. State expires after 10 minutes and is consumed once.

If tools/list does not expose the exact supported balance/models_get/estimate_video_cost schemas, inspection reports unsupported_server_schema. It never substitutes a generation tool with a get_cost argument. Unknown credit values stay unknown. Inspection uses a shared absolute 20-second provider deadline across refresh and MCP, with explicit SDK cancellation and transport closure. Rejected credential responses are sanitized before SDK error parsing.

The panel's temporary-unavailable status does not prove a disconnected account: inspect the closed server error and operational logs without revealing provider payloads. A missing schema/key/flag is a configuration refusal. A revoked grant requires Anslut igen. An unverified provider identity cannot be used for paid activation.

## Disconnect and rollback

Koppla från removes local access atomically, invalidates pending callbacks, then attempts remote refresh-token revocation. Failure of the remote request does not restore local credentials. To disable new reads/consent, set HIGGSFIELD_MCP_ENABLED=false; explicit disconnect remains available when the callback origin and DB are configured.

Rollback application code without deleting credential tables or historical assets. Keep the encryption key protected while stored credentials remain. No still-image or publishing rollback is necessary because these paths were not changed.

## Verification in this branch

- Unit tests: config, encryption, persistence refusal, SDK OAuth flow, actual Next handlers, read-only tool path, refresh/disconnect and panel controller/SSR.
- SQL tests: real isolated PostgreSQL 17, denied client CRUD/RPC, RLS, actor binding, replay/expiry, CAS, refresh lease and disconnect behavior.
- UI: actual compiled React panel in Playwright, desktop/mobile, zero credit balance and unavailable backend. API responses are stubbed; this is not a live authenticated OAuth smoke.
- Exact full-suite/build results, independent review and decisions: [verification report](theprompt-higgsfield-verification.md). No blanket green claim follows from focused tests.

## Explicit later work

Credit reservation/redovisning, generation, canonical clip admission, scene manifest, step3/step4 rendering, cost-triggered image fallback, desktop export and daily video activation are outside this first delivery. Proposed future credit ceilings are 20/reel, 40/svenskt dygn, 1000/rullande 30 dygn and 100 in reserve. They are not active settings.

## 2026-10-22 follow-up: migration guard and read-only inspection recovery

- Prior to this review, PR #514 CI failed because its migration lacked a `SERVER_ONLY` pending-table classification and canonical SQL/enforced counts were not reconciled. Both are corrected in the follow-up branch commit; the entries remain `created_not_live` until the intended deployment's migration is actually applied and its effective catalog inspected. **Do not add these to the live table map before verified deployment.**
- The production-ledger guard is intentionally fail-closed for `higgsfield_mcp_readonly`. Historical ledger fixtures were not rewritten; hypothetical fixtures can include the migration but do **not** prove it is applied. Keep the deployment release blocked if the actual ledger lacks it.
- During an authenticated inspection, `tools/list` 401 is normalized to the existing connection refresh path (subject to the CAS lease, single retry and common deadline). If refresh cannot recover the grant, the operator must reconnect; no generation may occur.
- A transient inspection error can be retried with **Läs saldo och testpris** without reloading the page. The UI clears stale credit figures, reports temporary unavailability, and never treats it as permission to generate. Authentication/authorization failures do not preserve an asserted connected state.
- Before any environment changes: verify intended Supabase/Vercel project and deploy target, protected variable names and presence **without printing values**, migration order and a rollback plan. Never write encryption keys into the repository or chat. Verify schema RLS/grants and provider credits after reviewed activation.
- Read-only feature defaults to disabled. The current release does not install video budgets, video jobs, media schedules, rendering, credit reservation, spend transactions or external asset transfer.

## Coordinated release is mandatory (2026-10-22 follow-up)

Read [the coordinated deployment preflight](theprompt-higgsfield-coordinated-release.md) **before** applying any production database change. The actual v2 guard was exercised against the 174 production migration names. Old main + new DB FAILS with an unknown `higgsfield_mcp_readonly` ledger name; new PR + old DB FAILS with a missing migration. Only the two matching code/database combinations PASS. Plan merge, migration and Vercel redeploy together, preserving a known READY deployment during the planned red-build window. Never enable `MIGRATION_GUARD_OVERRIDE` to hide this.

Use vNext Settings from the **exact HTTPS origin configured by `HIGGSFIELD_OAUTH_REDIRECT_URI`**. Mutating provider routes reject a different browser Origin even if another Omnira domain points at the same Vercel app. This is an intentional CSRF boundary; a secondary domain will require a canonical redirect or explicit reviewed multi-origin design, not a weaker origin check.
