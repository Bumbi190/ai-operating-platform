# Provider preflight: correct the default Claude 4.6 spend bound

Continuation of Web Studio acceptance on the existing PR368 branch, baseline d963ff2. No provider key was read from a file, no model call, allowance reset, production database write, flag activation or deployment was performed.

## Finding and primary sources

The current canonical context-window table and its test fixture both assumed 200,000 input tokens for claude-sonnet-4-6 and claude-opus-4-6, claiming that 1M required a beta header. Anthropic's current official context-window documentation states that 1M is the default for both, with no beta header. Its release notes date general availability at standard pricing to March 13, 2026. The existing estimator reserves against the provider's maximum possible input, so its old bound was too low. This is an accounting authority bug, independent of the small size of the intended CTA prompt.

Sources read 2026-11-05:
- https://platform.claude.com/docs/en/build-with-claude/context-windows
- https://platform.claude.com/docs/en/models/sonnet-4-6/overview
- https://platform.claude.com/docs/en/release-notes/overview

## Change and observed red/green

Only the two affected context entries increase to 1,000,000. Haiku and other model entries, rates, beta/tool/cache refusals, qualified-input evidence, reservation/settlement logic and provider selection are unchanged. Existing Opus price-book values are conservative relative to the current public rate; they are not reduced in this fix. The production impact after deployment is a higher reservation requirement; some calls previously admitted may now refuse until the existing budget or separately verified qualified-input path covers the request. No budget is raised here.

The existing independent metering proof is updated with published literal input bounds. Before production changes, 56/58 passed and the two meaningful proofs failed: Sonnet reserved 6.9301 versus 32.13 SEK maximal metered cost; Opus reserved 34.65 versus 160.65 SEK, at the test's explicit 10.5 FX and 4,000-output cap. These are local price-book proof figures, not invoices.

After the fix, 127/127 passed across m0-spend-ceiling (58), m0-durable-spend (28), run-bound-provider-spend (28) and anthropic-governed-smoke (13). Those tests exercise real estimators/metering and boundary logic with controlled database/provider dependencies; no actual provider success is claimed. The full shared-fixture application suite is not run, to preserve unrelated existing local databases. A fresh owned real Auth/SQL/worker/drain regression is recorded separately below.

## Two-call scenario for the attended CTA test

The no-network calculation is saved in docs/validation/website-provider-book-quote-20261105.json, including source hashes. Using the current worker's 2,000-output interpretation cap and 300-output copy cap, Sonnet's current local price book gives USD3.03 and USD3.0045 conservative model-window ceilings (USD6.0345 total). With the explicit local scenario FX10.5, upward-rounded SEK reservations total 63.3623. This is not the expected bill, a live rate/remaining-balance check, captured exact request payload, or dispatch permission. The already approved nonrenewing USD10 allowance remains the original single allowance and must not be duplicated into a new disposable database. Actual requests must be bound and repriced against current authoritative rates and remaining original allowance before dispatch; failures/unknown outcomes count under its existing policy.

The local integration environment intentionally has no provider credentials or provider egress. Successful AI interpretation/copy, real settlement and hosted acceptance remain outstanding. The production Demo Motors budget, approvals and pause state are untouched by this work.

Fresh real-backend regression completed 2026-11-05T14:06:16.235Z, exit 0: 53/53 parent and 140/140 route/worker checks passed, including real zero-budget refusal, reservation concurrency/replay and terminal drain refusal with retained preview. Archived as docs/validation/website-real-auth-window-20261105.json; the prior drain receipt remains unchanged. All four owned containers and the internal network were removed, and subsequent labelled-resource/temporary Next-directory inventories were empty. git diff --check passed. No full application typecheck, shared-fixture suite or browser rerun is claimed.
