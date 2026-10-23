# Atlas — governed model failover P0 (2026-10-23)

Status: local review branch codex/atlas-model-failover-20261023. NOT deployed, NOT activated, NO paid inference performed.

## Incident and diagnostic
- The Prompt News Hunter, Dream, and morning briefing failed on earlier deployments with confirmed Anthropic 401 `invalid x-api-key`.
- The user later visited the protected Anthropic credential-check endpoint and saw "denied". The app's status `access_denied` means Omnira rejected the Supabase platform-operator session BEFORE calling Anthropic. It does NOT prove a newly created Anthropic credential is invalid.
- The check requires a signed-in account listed in `PLATFORM_OPERATOR_EMAILS` or the fallback `BREVO_ADMIN_EMAIL`. Never relax the operator gate to make diagnostics pass; verify the correct account and deploy configuration.
- A key configured in Vercel is not proof Anthropic accepts it or has prepaid API credit. A Claude/ChatGPT personal subscription cannot substitute for API credits.

## New model routing contract
- Server-only and disabled unless `ATLAS_TEXT_FAILOVER_ENABLED=true` is explicitly deployed.
- New routing additionally requires `H1_SPEND_GATE=1` (actual hard enforcement), an OpenAI API credential and an EXACT trusted autonomous task identity.
- Supported at this stage: News Hunter / Analyze News, CFO Briefing / Morning Briefing, Dream / Dream Analysis. Other task types are not silently granted an extra model request.
- Dream uses actual project-budget identity if and only if enabled and the execution scope matches the project; otherwise its previous cost attribution is unchanged.
- For verified Anthropic 401 authentication_error `invalid x-api-key`, verified 400 `credit balance is too low...`, or a locally absent Anthropic API key, choose ONE existing governed OpenAI `gpt-5.4-mini` completion. The existing OpenAI spend boundary re-evaluates project budget, global pause, project stop and provider eligibility.
- No fallback for 429, 5xx, timeouts, missing provider response, malformed output, unknown dispatch, a stop/budget refusal or unclear billing. These errors need reconciliation/manual handling instead of possibly double charging.
- Incomplete/refused secondary result is rejected; there is never a third model or hidden retry.
- Existing `MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED` feature and legacy media credit recovery are retained. Newly connected Dream/CFO jobs do not inherit those legacy paid fallback permissions when the new flag is OFF.
- No publishing, scheduled job replay, changes to calendars, schema migration, local Ollama ingress, new API key storage, browser subscription usage or autonomous workflow changes.

## Costs / rollout gate
- Current verified Supabase project_budgets: The Prompt monthly 700 SEK, weekly 400 SEK and daily 100 SEK; Familje-Stunden monthly 500 SEK, with daily and weekly columns unset. These legacy ceilings are HIGHER than the desired cheap Atlas operation. No budgets are changed by this PR.
- Confirm the owner-approved project-specific incremental reserve ceilings BEFORE enabling the flag. Ensure `H1_SPEND_GATE=1` is effective in the deployed production environment.
- Do not enable in the same action as merging the code. Deploy with default disabled, inspect full GitHub CI and Vercel logs, confirm platform operator identity and current key status through the safe route, then enable only on separate explicit cost approval.
- With the feature enabled, the next standard scheduled text job can transparently select the reserve on deterministic failures, and its provider usage should be visible in cost_events. Do not replay failed news/dream runs or duplicate publications.
- The local Ollama/NVIDIA models require an attested, authorized and network-reachable broker; Vercel is not authorized to reach the user's PC simply because Ollama is installed. Add this as a separate architecture review.
- A full automatic model selector for every Omnira agent, rich tools, images and voice remains out of scope.

## Verification
- 65 / 65 unit and boundary tests green across the new router, existing media fallback, wiring checks and Anthropic metadata endpoint.
- Strict scoped TypeScript compilation PASS with a development-only alias to the local monorepo contract package. The authoritative full CI `npm ci` and web typecheck must still run on GitHub.
- Model API and user credentials were NOT probed here. The code is safe to ship disabled; turning it on is a separate paid-operation authorization.
