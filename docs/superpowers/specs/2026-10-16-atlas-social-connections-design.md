# Atlas social connections — Increment 2
Date: 2026-10-16. Base: main7ded1f5d36d21916a7551008c5fff1448251794b.
This implements the account-connection section of the already approved six-channel social launch design. André asked to continue after Increment1 shipped. Existing authorization covers development/tests/review/merge/deployment; no repeat integration approval is requested. Native implementation and one independent whole-branch reviewer preserve the existing execution method.

## Outcome and limits
An operator agrees the project channel plan with Atlas, approves its exact saved revision, and can connect an actual account to that project. Existing Instagram/Facebook/YouTube controls stay available. New LinkedIn company Page and Pinterest business account/owned board flows use provider consent and verified identity. X's OAuth/identity transport can be tested with fixtures, but all runtime X network calls stay blocked without a separately approved, enforced provider-spend policy.
No TikTok, paid model/media/provider test, credit purchase, subscription, budget increase, public test post, publishing dispatch or modification of The Prompt's publisher authority. Lumvy keeps its approved three-page preview.

## Verified starting facts
- Increment1 is PR358/main7ded1f5, deployed READY on app.omniraos.se.
- Production has exactly three active social bindings, IG/FB/YouTube, for The Prompt project a8a1b1f6-c222-4893-9399-b1fb3bc2fa52; no new channel/project is preassigned.
- Existing Vercel app env keys include Meta and YouTube clients. LinkedIn/Pinterest/X client keys are absent. Values were not printed.
- Five canonical tables constrain platform vocabulary: platform_tokens, social_account_bindings, social_credential_health, platform_credential_events, social_oauth_states. The last is specifically YouTube and remains unchanged.
- Legacy health dispatch defaults to YouTube after IG/FB; extending binding vocabulary therefore also requires explicit dispatch for new channels. Legacy token writers remain limited to their three platforms.
- X's official pricing page now loads: User Read costs USD0.010/resource; owned-read discounts list other explicit endpoints. No free identity probe is assumed.
- Pinterest's official generated Account model includes optional stable id. A missing id is a refusal, never a username fallback.

## Connection flow
1. Same-origin authenticated platform operator selects one owned project, approved plan revision, channel and expected active binding ID/null. A selected channel alone is insufficient.
2. Server creates 256-bit state, stores only its SHA256, pins operator/project/channel/approved revision/expected binding, and pins a registered HTTPS callback. X is refused before state creation or network work. PKCE S256 is mandatory for X, and retained for providers that support it; LinkedIn/Pinterest use confidential-client code exchange with state.
3. Callback checks current session/operator, consumes matching state exactly once within ten minutes, and rechecks project ownership. Raw provider code/error/token/secret is never logged or returned. Immediate redirect clears callback query, no-store and no-referrer.
4. Server exchanges code and verifies actual scopes/identity. LinkedIn uses token introspection plus approved ADMINISTRATOR organization ACLs and provider organization names. Pinterest requires stable business-account id, current username, and owned public boards (owner username must match the just-read account); no collaborator or first-result fallback. Pagination is bounded and overflow is an explicit refusal.
5. Tokens and safe candidates are staged server-only in the consumed intent. Browser receives safe candidate IDs/labels only. No account is bound merely because OAuth succeeded.
6. Operator chooses a provider-proven company Page or Pinterest board. SQL locks/rechecks owner, current approved plan and expected binding, then atomically supersedes/creates the canonical binding, stores credential and scopes/expiry, records audit/health, and clears staged secrets. A concurrent plan/account/project change fails closed. Same committed choice is idempotent; different choice conflicts.
7. Existing one-project-per-external-account invariant remains. Changing a board/account is a fresh explicit connection, never a silent update. Pinterest binds account ID, with board as destination metadata.

## Storage and boundaries
Reuse canonical social_account_bindings/platform_tokens/social_credential_health/platform_credential_events. Extend CHECK vocabularies only alongside implemented adapters. Add bounded fields to platform_tokens for binding fence, refresh token, granted scopes and selected destination, restricted to new OAuth platforms. Existing three token types/writers retain their behavior.
Add one RLS/server-only social_connection_intents table for state, expected references, transient grant and candidate inventory. No client table/RPC grants. Browser/API/Atlas read models never select secrets. Public routes accept closed bounded fields; principal, tokens, state hash, verifier and proof inventory are server-derived.
New SQL operations are SECURITY INVOKER with empty search_path and service-role execute only. SQL independently verifies owner and exact current approved revision; service-role transport is not authorization.

## Credentials and health
New credential reads are server-only and pin active binding ID and stored account ID before any provider read. Expired credentials show renewal required; no blind token-rotation retry or paid fallback. Refresh tokens are stored privately for a later governed refresh path; this increment renews through explicit reconnect.
Health dispatch is explicit by platform. X returns a closed cost-policy refusal without provider requests. LinkedIn/Pinterest identity checks verify the currently bound account/destination and recheck its binding. Health persistence fences the binding in SQL so stale checks cannot attest a replacement account. Existing cron identity/refresh/insight loops must not misroute new platforms to YouTube or Meta.
Connection verification never grants publication authority. Provider app access/tier and permission remain separate; a Pinterest Trial connection must not be presented as production publishing access.

## User interface
The project social page remains the planning entry. New connection controls appear under the relevant channel with truthful setup status: missing app configuration, operator required, plan review required, connect, choose destination, connected, renewal required, or X cost policy required. No token fields in chat or this panel; configuration instructions use provider consoles and server environment settings.
Use fixed public callback URLs under https://app.omniraos.se/api/social-connections/<provider>/callback. No request-host or user-supplied redirect.
On mobile390px controls fit; request responses and candidate choices are keyed to project/intent. A project change aborts/ignores previous work. Failed commit retains selection; stale intent requires a new consent attempt.

## Tests and release
Provider fixtures only: exact endpoints, scopes, confidential-client/PKCE construction, expiry, identity mismatch, missing IDs, pagination/overflow, 401/403/429/network failure, and zero runtime X requests. Real owned local Postgres: ACL/RLS, foreign project/operator, approved-plan fence, expired/replayed state, concurrent binding changes, atomic failure, exact retry, secret clearing and cross-project account uniqueness. HTTP tests check auth/operator/CSRF/closed fields and no secret output. Chromium verifies mobile choice/retry/project isolation without provider I/O. Shared SQL suites run sequentially.
Independent whole-branch review, final-head CI, locked merge and identical tree, production READY/app+queue aliases, production catalog and cost read. Actual provider activation requires client configuration and user consent and is reported separately.

## Sources checked 2026-10-16
- LinkedIn OAuth/introspection: https://learn.microsoft.com/en-us/linkedin/shared/authentication/token-introspection
- Organization ACL/roles: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role
- Versioning: https://learn.microsoft.com/en-us/linkedin/marketing/versioning (pin202604, supported minimum one year).
- Pinterest OAuth: https://developer.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
- Pinterest Account/BoardOwner models: https://github.com/pinterest/pinterest-python-generated-api-client/tree/main/docs
- X OAuth: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
- X pricing: https://docs.x.com/x-api/getting-started/pricing
