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

If tools/list does not expose the exact supported balance/models_get/estimate_video_cost schemas, inspection reports unsupported_server_schema. It never substitutes a generation tool with a get_cost argument. Unknown credit values stay unknown.

The panel's temporary-unavailable status does not prove a disconnected account: inspect the closed server error and operational logs without revealing provider payloads. A missing schema/key/flag is a configuration refusal. A revoked grant requires Anslut igen. An unverified provider identity cannot be used for paid activation.

## Disconnect and rollback

Koppla från removes local access atomically, invalidates pending callbacks, then attempts remote refresh-token revocation. Failure of the remote request does not restore local credentials. To disable new reads/consent, set HIGGSFIELD_MCP_ENABLED=false; explicit disconnect remains available when the callback origin and DB are configured.

Rollback application code without deleting credential tables or historical assets. Keep the encryption key protected while stored credentials remain. No still-image or publishing rollback is necessary because these paths were not changed.

## Verification in this branch

- Unit tests: config, encryption, persistence refusal, SDK OAuth flow, actual Next handlers, read-only tool path, refresh/disconnect and panel controller/SSR.
- SQL tests: real isolated PostgreSQL 17, denied client CRUD/RPC, RLS, actor binding, replay/expiry, CAS, refresh lease and disconnect behavior.
- UI: actual compiled React panel in Playwright, desktop/mobile, zero credit balance and unavailable backend. API responses are stubbed; this is not a live authenticated OAuth smoke.
- Full-suite/build results and final review will be recorded in the PR; no blanket green claim follows from focused tests.

## Explicit later work

Credit reservation/redovisning, generation, canonical clip admission, scene manifest, step3/step4 rendering, cost-triggered image fallback, desktop export and daily video activation are outside this first delivery. Proposed future credit ceilings are 20/reel, 40/svenskt dygn, 1000/rullande 30 dygn and 100 in reserve. They are not active settings.
