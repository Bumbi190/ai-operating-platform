# Web Studio: explicit reference analysis and design concepts

> Continue accepted Omnira masterplan v0.5 inside draft PR #368. Inline execution; one fresh read-only review after verification.

## Design and decisions
The saved user message and ordered immutable image manifest are the only source. An explicit operator action selects a saved message. Saving references remains free of inference. Read and revalidate private canonical bytes, message text and manifest binding before quoting, dispatch and disclosing a result. Images/comments are untrusted style data, never instructions or build authority.

A disabled-by-default ATLAS_REFERENCE_ANALYSIS_ENABLED gate additionally requires upload/save gates, the existing Anthropic key and H1_SPEND_GATE=1 (enforced, never shadow). Use existing governed Anthropic factory, project execution scope and existing budget reservation/settlement. Pin the already priced claude-haiku-4-5-20251001, 3072 output tokens. This is compatibility with the current pricebook, not a claim of lowest current market price. Quote the existing conservative whole-context ceiling, rounded up to ledger precision, never above a technical 10 SEK/job cap. A quote is not spend authorization: the operator explicitly confirms its exact token and maximum before any inference.

Persist a single job per saved message through service-role-only RPCs. Quote tokens expire after ten minutes. Atomically claim once; processing, failed and unknown outcomes never auto-retry or auto-fallback. Replayed completion reads the same stored result. A provider-dispatch ambiguity remains unknown for manual review; do not issue a second paid call. No database transaction spans network I/O. Recording an already paid outcome is allowed after pause; returning it still requires current ownership and source validity.

Downsize validated WebP bytes to 1536px inside, <=2 MiB/image and <=8 MiB total. Hash the exact provider payload and source binding. Require one structured output tool with a strict bounded schema: per-image visual observations, uncertainties, three fixed layout directions, literal six-digit palette values and a serif/sans choice. Model output never supplies HTML, URLs, executable CSS or approvals. Compile three responsive concepts using existing static layout templates and escaped placeholder copy. Label them layout concepts, with image placeholders. Existing plan/mockup approval gates remain required. No extra image generation spend.

## Implementation sequence
1. RED contract, request integrity and safe responsive concept tests; implement strict contract/rendering.
2. RED provider and orchestration tests; implement verified source loading, conservative quote, exact claim, governed provider adapter and durable outcome.
3. Add proposal-only SQL and isolated real-auth integration tests for quote/claim/replay/foreign access; extend Linux CI fixture only.
4. Wire authenticated same-origin API and scoped UI: select saved source, quote, confirm, refresh status, display analysis and three scriptless responsive concepts. No automatic inference/retry or build approval.
5. Run focused unit/browser/type checks and isolated CI; one fresh read-only reviewer, resolve material findings; update PR and Notion evidence.

## Validation and boundaries
Test real code and state transitions; mock provider/governance at named unit boundaries, never describe stub inference as real AI quality proof. Real Auth/Storage integration tests use the disposable Linux fixture, never hosted schemas or flags. Existing reference/browser tests stay intact. No local Docker stack (memory constraint), paid model inference, hosted SQL, production activation, customer contact or main merge this session.

Baseline 1e460d0: 124 targeted tests, 13 old browser tests, 3 real browser/Auth cases, 7 real Auth integration tests and 13 infrastructure guards passed. Full npm test remains red at unchanged mission-brief-v1 status-list assertion; do not call the whole suite green.

## Provider documentation checked 2026-10-30
https://platform.claude.com/docs/en/models/haiku-4-5/overview
https://platform.claude.com/docs/en/about-claude/model-deprecations
https://platform.claude.com/docs/en/build-with-claude/vision
API pin remains active, 200k context and $1/$5 per MTok as in existing pricebook. Current newer models are not silently introduced into global governance.

## Execution ledger
- Preflight reuse_existing / explicit_existing_pr, receipt .superpowers/vision-pr-preflight-20261030.json; clean existing worktree; main observed d0efe26.
- Detailed implementation follows accepted v0.5; no new user approval needed for reversible default-off code.
