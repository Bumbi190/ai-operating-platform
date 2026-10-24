# Calendar human story approval and start — 2026-10-24

Implemented locally on the existing calendar branch, based on b68af7c. No hosted SQL, push, deployment, credential change or real provider request was performed.

## Behavior and authority

The calendar can prepare an individually human-approved saga job for an owned canonical monthly-release v2 instance in content_generation. The review pins action/evidence identity, brief and prompt, Anthropic, the compiled story model and output limit, and a hard maximum SEK reservation derived from the existing price book. It expires after15 minutes. Preparation grants nothing.

The owner explicitly checks consent and selects Godkänn och starta. An authenticated-only SQL RPC derives auth.uid and project ownership, then atomically records a grant, one pending bound run and distinct immutable human provenance. The run enters the existing claim/drain/action executor. Queued is shown as queued, never as completed. The calendar work-block time is not a generation/publication schedule.

New service-only request creation accepts only server-derived scope. The browser cannot choose a provider, model, amount, principal or raw authorization target. Same-origin, strict body fields and private/no-store are enforced. Human provenance is neither an exempt observation nor an autonomy licence; the unsupported unattended story policy and licensed-bind V1 set are unchanged.

The execution authorization's existing schema1 target pins a combined scope hash and request UUID as attempt group. Readiness recomputes the current action/brief/prompt/provider scope, verifies the immutable approval and current owner, and checks the live grant. The new human branch reads its run-bound ledger history and folds the canonical isEffectiveNow core after that scope proof; it does not depend on the session-bound principal reader, which cannot authorize a cron/drain. No generic authorization endpoint is widened. It runs again at pre-dispatch. The provider wrapper compares its live hard ceiling with approved consent before reserving. Increased price refuses cleanly without reservation, provider invocation or fabricated ambiguity. The existing budget reservation, stop, fencing and single SDK-attempt path remain in force.

Request→run binding is unique across all run statuses. Simultaneous approvals and terminal replay return the same run. Owner-scoped status discovery restores a receipt after reload. An uncertain/partial/evidence-pending result stays needs_review and exposes no new-run action. A safely failed/cancelled result can receive a new separately reviewed and approved request; no automatic paid retry is introduced.

## Verification

- **360 tests passed across 21 focused unit/integration suites.** Includes real executor→story handler→Anthropic wrapper offline tests: unchanged scope reaches exactly one run-bound reservation and SDK stub; increased price reaches neither reservation nor SDK and stays non-ambiguous; evidence drift refuses before dispatch. Database/accounting transports, stop checkpoint and SDK are simulated; the canonical live-authorization fold, target, scope, price/cap, handler and outcome logic run. Missing/expired/revoked/conditional/wrong-target grants fail without any browser-principal seam.
- **26 browser tests passed**, including explicit unchecked consent, cap/model disclosure, lost approval-response retry with the same identity, recovered receipt after reload, mobile sizing and no new-run option for unknown results. The two affected browser tests passed again after the final copy/status changes. Screenshot inspected at390px.
- **Full177 recovered migration ledger replay plus the new migration passed on isolated PostgreSQL17.** The same previously documented baseline adaptations remain explicit; this is not hosted schema parity. Existing16 owner-provenance,8 responsibility and10 workflow-link SQL cases passed.
- **29 new real SQL cases passed**, including hash parity, service/foreign-owner refusal, no client DML, concurrent same-request approval producing one run, active-run exclusion, terminal replay, pause, ownership/state drift through real workflow transitions, rollback with neither grant nor provenance, expired request, immutable single attempt and no spend/evidence from merely approving. Synthetic expiry was shaped only by the fixture owner; client update privileges are denied. Commit-deadline and Survival fencing use the existing tested primitives; this increment does not claim a new exhaustive Survival race matrix.
- Local replay container had no network, published ports or host mounts; cron job launching was disabled; container removed. No real saga text or paid dispatch occurred.
- Independent architectural/code review found no remaining blockers. Its receipt-recovery/new-review findings were addressed.
- TypeScript retains only three pre-existing lambda-render errors: missing @remotion/lambda/client and two unknown region properties. No changed-file errors.
- Two broader existing guard failures remain outside this change: autonomy-runtime-foundation's Windows path membership check for middleware.ts, and provider-dispatch-certainty's lexical scan treating an immediate ElevenLabs ambiguity rethrow as a downgrade. The affected runtime lines were unchanged. Their other cases passed; they are not included in the 360 green focused-test count.

Evidence: docs/validation/calendar-human-story-replay-20261024.json. Run reproduction from repo root with DOCKER_BIN pointing to Docker and GOMAXPROCS=2: node apps/web/scripts/verify-calendar-full-ledger-local.mjs --schema-baseline --human-story. No hosted credentials required.

## Release boundary

CLI-created migration: apps/web/supabase/migrations/20261024172905_human_story_start.sql. Existing later pending calendar174000/174001 migrations are independent of this substrate. Apply the required reviewed migrations before deploying code that selects the new run binding column. Generated Supabase types do not yet include the new tables/RPCs, so their transport cast is confined to the new server adapter. Regenerate types against the approved target schema during release.

Hosted advisors were not run against unchanged production as a substitute for examining this local schema. Local verification tests actual ACLs, row isolation, immutable records and authenticated-only RPCs; deployment still requires target-schema advisor/privilege review and live acceptance. Current Supabase [function security documentation](https://supabase.com/docs/guides/database/functions) and [changelog](https://supabase.com/changelog) were checked; no new SDK/API convention is introduced.

Financial execution and enforced budget flags are not activated by this change. A real owned v2 instance, project budget, healthy stop/Survival state, deployment, cron/drain availability and provider configuration must be verified before live use. No provider key was requested, printed or changed. Later material generation and publication remain separate capabilities.
