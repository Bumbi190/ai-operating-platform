# Atlas builder output and Studio context — 2026-10-15

The failed Lumvy run returned 6,000 output tokens, exactly the factory builder limit, and no valid package. The old runner discarded provider stop reasons, so historical truncation is strongly suggested, not retrospectively proven.

This change:
- Gives factory v2 builders a 12,000-token output allowance. A migration upgrades only the exact, unchanged v1 name/model/prompt/skills/config/provenance with a project-builder binding. Custom caps, prompts and extra config fields are preserved. Project budgets and approval decisions are not modified.
- Accepts one shared stylesheet in a static package, with optional page-specific overrides. Existing page-only packages retain their compiled output. Markup validation, preview CSP, artifact bounds and hashing remain enforced.
- Preserves Anthropic/OpenAI termination reasons and all Anthropic text blocks. The worker rechecks run authority and then rejects a truncated response as permanent MODEL_OUTPUT_TRUNCATED, without a second paid dispatch or an incomplete preview commit.
- Uses a dedicated Studio system prompt and the existing Studio tool allowlist. Full chat history, authenticated project binding, visible plan and viewed build references remain. Global executive snapshots and action/tool memory are omitted in this scoped workspace; ordinary Atlas paths are unchanged.
- Tells Studio not to promise free planning or invent provider availability. Design knowledge is already composed into the builder; Studio reads extra design material when a concrete question needs it.

Cost boundaries:
- Measured fake-provider context: 4,047 Studio system characters vs 12,247 on the ordinary full path (about 67% fewer characters). This is not a measured token or bill reduction and excludes conversation history and tool schemas.
- A larger output allowance permits a more expensive individual build response; it is a maximum, not mandatory usage. The existing governed reservation/settlement and monthly project budget still apply.
- No prompt caching is enabled: the existing spend boundary refuses cache writes until their billing multipliers can be bounded.
- Model remains Sonnet 4.6. This change does not implement DeepSeek/Ollama/Codex execution or automatic model routing.
- Implementation validation used deterministic provider responses, not billable model retries.

Verification:
- RED: shared CSS ignored/rejected; runner termination missing; a provider-marked truncated package was incorrectly committed; new factory allowance expected 12,000 but returned 6,000.
- 153 DB-free assertions in 10 files pass, including real POST route behavior, transcript continuity, global-path invariance, cost authorization, artifact validation and governed provider boundaries.
- Real PostgreSQL complement: 16 worker + 7 Studio store + 2 exact-factory migration assertions pass. The owned local DB is website_test_1792066644371 in the labeled atlas-live-build container; no production SQL fixture was used.
- Standalone workspace typecheck passed. Chromium: all 10 workspace cases pass with zero retries and the existing 30-second per-test limit. The original monolithic voice case hit the cumulative 30-second limit on this branch; a separate exact-base474bbdd replay failed earlier because a fixture commit raced persisted chat feedback. The test now waits for actual feedback/control receipts and separates voice and control scenarios; no product timeout changed.
- The full repository suite was not rerun for this bounded patch; its previously documented Windows baseline remains red. This is not a whole-suite green claim.

Migration: 20261015122500_atlas_builder_output_allowance_v2.sql. Replaces the existing private creation function with the same signature and privileges, accepts the prior v1 envelope for rolling deployment compatibility, and adds no table or grant. Canonical migration counters move from 119/105 to 120/106. Exact production apply/release evidence belongs in the PR.
