# The Prompt — release verification, 18 October 2026

This is a diagnostic continuation for draft PR #377, not a production release certificate. Main `d3f9fcc1045026042f6bb9c0cd302ed0b7283127` was integrated as `b906b0d` without a tree/runtime change. Main was checked again before this report and still pointed to that SHA. Type reconciliation is `47fd3bf1c7d248bfbea674ede15bbea6fc8a9691`; the final four-file guard/test correction is `5df3c6fac34496026e0ed231df151ef3b40a15ee`.

The complete web run remains red. The comparison covers every failed case against the exact main snapshot, rather than extrapolating a sample. Reproduction on main is evidence of a shared failure, not proof of its production root cause or permission to waive it.

## Results and observation boundaries

| Check | Observed result | Source/time boundary |
| --- | --- | --- |
| Complete web Vitest, serial files | 13,850 passed / 335 failed / 1,114 skipped / 4 pending; 15,303 cases, 666 files (565 passed / 66 failed / 35 skipped) | Started on synchronized b906b0d before later type/guard corrections; not a final-head full rerun |
| Exact-main comparison | 85 files; 3,177 passed / 333 failed / 14 skipped, 3,524 cases | Independent d3f9fcc snapshot, same installed dependencies; three reports pooled without duplicate files |
| Failed-case comparison | 331 failures reproduced on main; four feature-only observations subsequently addressed below | Zero uncovered failed files, inconclusive cases or hook-only failed suites |
| Core news/content/publication, dispatch/auth, migration/security/registry | 666/666 PASS, 31 files, no skips | After type reconciliation; before the last explicit binary-env/guard correction |
| Affected suites after final correction | 47/47 PASS, no skips | Entire budget-retry-lifecycle, social-credentials and news-review/admission suites at 5df3c6f |
| Two scheduling timeout cases | 2/2 PASS; seven unselected cases | Fresh isolated serial fixture; unchanged implementation and original 20s/35s limits; not a full scheduling-file rerun |
| Complete web TypeScript | PASS, exit 0 | Repeated after final correction |
| Remotion Node/tsx tests | 143/143 PASS, no skips | After final correction and added voice regression |
| Editorial/news isolation contracts | Both PASS | After type reconciliation; subsequent changes did not alter the composition or contract implementation |
| Full Remotion TypeScript | RED: 22 diagnostic occurrences, all also present on exact main | Before: feature32 versus main24; eight feature-added diagnostics removed; two older SubtitleTrack diagnostics also removed by correct library declarations |
| Whitespace | git diff --check PASS | Independent reviewer also checked the four-file continuation |

The earlier broad run (13,799 passed / 377 failed) and sampled comparison remain historical in [the original failure report](the-prompt-news-review-broad-test-failures.md) and [preflight](the-prompt-news-review-release-preflight-20261018.md). They are not overwritten with these newer numbers.

## Four feature-only broad observations

1. `lib/social-launch/scheduling/worker.test.ts`: “Instagram final publish is refused if image verification crosses the ten-minute deadline” exceeded its 20-second test limit in the broad run. It passed on exact main and in the fresh controlled feature rerun, with no implementation or timeout change.
2. Same file: “processing Instagram containers yield to other jobs and remain eligible on later ticks” exceeded its 35-second limit. It also passed main and the fresh controlled feature rerun without changing code or limits. These observations support a timing-sensitive broad-run failure; they do not prove an application scheduling defect fixed.
3. `lib/qa/budget-retry-lifecycle.test.ts`: the old zero-producer inventory failed because the already-implemented private preview also mints a stable voice-spend identity. The closed inventory now names exactly `ideogram.ts` and `provider-preview-runtime.ts`. This does not add a generation path. Existing ordinary step2/step3 cron assertions still require no idempotency subject.
4. `lib/qa/social-credentials.test.ts`: a dynamic `process.env[` access in the binary selector tripped the global credential-boundary scan. Admission now explicitly selects `process.env.FFMPEG_PATH` or `process.env.FFPROBE_PATH`, preserving configured-path precedence and fallback. No credential guard allowlist was widened.

The private-preview inventory is justified by the existing owner-only, preview-enabled, source/quote/cap/stop checked flow which persists a unique claim before image/voice calls and treats ambiguous failures as terminal review-required. New tests call the actual orchestrator and transpiled runtime/store with substituted external provider/DB boundaries; they observe the stored claim before both providers and three image checkpoints before voice.

The voice-failure test observes one claim, image batch and voice attempt across repeated requests, with persisted `review_required`. Deliberately changing the actual orchestrator to retry the voice call produced 8 passes / 1 intended failure (two calls instead of one). Restoring exact production bytes produced 9/9 passes. This mutation verifies the new regression's sensitivity; provider billing, live PostgreSQL claim contention and a real browser reload are not proven by these boundary-substituted tests.

## Shared failures and compiler limits

All 331 shared failed cases are listed by exact file/name below and remain unresolved in this continuation. Five have different primary message text because the scanned inventory is larger on the feature: the middleware-membership assertion sees 2,117 versus 2,076 entries; four legacy-route membership assertions see 195 versus 192. The missing target assertion is the same in both sources. The report does not claim byte-identical messages or 331 distinct production bugs.

Full Remotion compilation is still red: seven original source/Root diagnostics and 15 dependency declaration diagnostics, all reproduced on main. The own fixes use ES2023 library declarations while retaining the ES2020 output target, an explicit numeric reduce accumulator and a mapped props alias compatible with Remotion inference. No broad component type widening or index signature was introduced. Both changed TSX files emit byte-identical runtime JavaScript compared with b906b0d when comments are excluded; approved scene timing, images, audio and continuous zoom are unchanged.

## Generated schema and installation boundary

The actual Supabase generator supplied only the news table plus seven public RPC definitions to the generated Database bridge. An AST comparison verified every pre-existing public member is unchanged; unrelated schema output was not replaced. Scoped JSON RPC contracts remain. [Type reconciliation details](the-prompt-news-review-type-reconciliation-20261018.md).

No migration was reapplied. Source `20261018083917_media_news_review_evidence.sql` remains 35,199 bytes, SHA256 `9cfd8807817878d492814cc29240114c3e3101ac8504651f377f375089b63e52`; the actual installed ledger is `20261018182224 / media_news_review_evidence`. A fresh production SELECT observed review rows0, admitted rows0, migration rows1. Canonical147/enforced133 and frozen14/30 sets remain unchanged. The completed source-only PR #404 and production deployment are separate from this feature preview.

## Independent review scope

A read-only independent review of 47fd3bf..5df3c6f found no introduced Critical, Important or Minor defects. It approved the bounded inventory reconciliation and explicit env rewrite and inspected actual orchestrator/runtime/store code. The reviewer checked clean status/HEAD and whitespace, ran no tests and performed no service mutations. Test/mutation numbers above are executor evidence, not independently rerun.

The reviewer explicitly declined to judge actual PostgreSQL durability/RLS, provider billing/reservations/stop enforcement, HTTP owner resolution, real reload/network concurrency, historical generation authorization/asset quality, live flags or whole-PR release readiness. Existing preview runtime and wrappers predate this four-file change. This is not a post-fix independent re-review of the earlier f921354 review packet.

## Reproduction and fixture isolation

Commands were run in this task's isolated feature worktree with Vitest2.1.9, TypeScript5.9.3 and the same installed dependencies for exact-main comparison. Git's GNU utilities were on PATH. The standard `node scripts/test-website-build-db.mjs` fixture creates real owned PostgreSQL databases and runs schema/fence/cancel preflights; each runner drops only its own database in finally.

- Full web: `node node_modules/vitest/vitest.mjs run --no-file-parallelism` from apps/web (resolved root binary), with JSON/default reporters.
- Web types: `tsc --noEmit` from apps/web.
- Affected suites: same serial Vitest command selecting `lib/qa/budget-retry-lifecycle.test.ts`, `lib/qa/social-credentials.test.ts`, `lib/social-launch/news-review/admission.test.ts`.
- Core: news-review/content/publication plus external-dispatch-stop/guards, media-script-authorization, platform-authority-closure, publish/youtube channel independence, youtube-project-oauth, migration guard/security and schema invariant suites.
- Remotion: `node --import tsx --test tests/*.test.ts tests/*.test.mjs` (explicit sorted expansion on Windows); full compiler uses its actual tsconfig without skipLibCheck.
- Main comparison: an independent exact-d3f9fcc Git snapshot; all failed-file assertions matched by relative filename and fullName, with paths/ANSI/stack-frame locations normalized for primary-message comparison.

The initial concurrent setup of the final two fixture runners failed the feature writer/cancel preflight with WEBSITE_RUN_CANCELLED; it did not run those two tests. The fixture's fixed advisory-lock probe lacks a database filter, an observed cross-fixture hazard when bootstrapping concurrently. This was not changed or presented as a proven sole root cause. After the baseline completed, the feature fixture was prepared serially and passed, then both original timeout cases passed. No helper or timeout relaxation was made.

Seven owned database cleanups returned exit0, including the initially failed setup. Other projects' databases, processes and worktrees were not modified. A compact machine comparison and hashes of the raw execution reports are retained in [verification evidence](the-prompt-news-review-release-verification-20261018.json).

## Remaining release work

PR #377 remains draft/unmerged. No real movie intake, media generation, new spending, scheduling, publication, trial activation or additional SQL was performed. The new flow remains dispatch-disabled. Ordinary pre-existing publishing schedules were not changed.

The authenticated Omnira UI check is blocked at the actual application login page on the separate preview origin; no account/session bypass or authenticated API success is claimed. Connector deployment-protection401 is distinct from an application API response. Continue with owner sign-in, then exact private playback/review and negative access checks on the final preview.

The approved movie remains a technical sample. Its original source passed48h at18:26 Stockholm on18 October; refetching does not reset that age. Fresh news with attributable image rights/evidence, implemented video transports, DST issue #378 and prospective per-platform24h/72h metrics #383 remain before a live-trial decision. Shared broad failures and Remotion compiler failures remain explicit verification limits; this report does not declare the feature release-ready.

## Complete broad failed-case appendix

Each name below is the exact fullName from the broad run. “Shared unresolved” means the same case failed on exact d3f9fcc. “Guard corrected” and “Timing rerun passed” describe the bounded follow-up above, not a new green full run.


### lib/architecture-knowledge/architecture-knowledge.test.ts

- **Shared unresolved** — Immutable artifact and runtime loader loads and verifies the committed artifact read-only

- **Shared unresolved** — Golden lexical retrieval and server citations routes How are Agents, Tools and Execution Resources registered? to Intelligence Fabric canonical material

- **Shared unresolved** — Golden lexical retrieval and server citations routes How are Credentials separated from Agent authority? to Intelligence Fabric canonical material

- **Shared unresolved** — Golden lexical retrieval and server citations routes How does multimodal production work? to Intelligence Fabric canonical material

- **Shared unresolved** — Golden lexical retrieval and server citations reaches provider-selection material in every canonical book that covers it

- **Shared unresolved** — Golden lexical retrieval and server citations supports exact section, chapter, book-title and requirement identifiers

- **Shared unresolved** — Golden lexical retrieval and server citations excludes wrong/old versions and returns explicit unavailability

- **Shared unresolved** — Golden lexical retrieval and server citations mints exact citations and rejects fabricated, stale or mismatched citations


### lib/architecture-knowledge/executive-knowledge.test.ts

- **Shared unresolved** — Generic artifact eligibility invariant accepts the committed artifact while Executive is active and approved

- **Shared unresolved** — Generic artifact eligibility invariant rejects an inactive source that reached the artifact

- **Shared unresolved** — Generic artifact eligibility invariant rejects an artifact source row that diverged from the registry

- **Shared unresolved** — Generic artifact eligibility invariant rejects an artifact source that is not registered at all

- **Shared unresolved** — Executive retrieval, citations and policy is an active knowledge source in the committed artifact

- **Shared unresolved** — Executive retrieval, citations and policy resolves FM.2 by exact front-matter identifier

- **Shared unresolved** — Executive retrieval, citations and policy resolves FM.2 from an implementation-scope query and a canonical Stage 1 query

- **Shared unresolved** — Executive retrieval, citations and policy resolves exact Executive chapter and section identifiers

- **Shared unresolved** — Executive retrieval, citations and policy answers a governance and authority query from Executive doctrine

- **Shared unresolved** — Executive retrieval, citations and policy mints a valid Executive citation and rejects every tampered variant

- **Shared unresolved** — Executive retrieval, citations and policy denies internal Executive knowledge to an unauthorized principal and allows an authorized one

- **Shared unresolved** — Executive retrieval, citations and policy excludes an inactive, superseded or wrong-version Executive source before ranking


### lib/project/lifecycle/store.test.ts

- **Shared unresolved** — owner lifecycle and real static worker fences atomically pauses, versions and replays transitions while restore preserves an unrelated pause

- **Shared unresolved** — owner lifecycle and real static worker fences refuses foreign, observer, stale and malformed commands and keeps history and folder requests

- **Shared unresolved** — owner lifecycle and real static worker fences archive winning the project lock fences snapshot and commit even with allow_pause

- **Shared unresolved** — owner lifecycle and real static worker fences commit winning the project lock finishes before archive and its verified artifact stays readable

- **Shared unresolved** — owner lifecycle and real static worker fences serializes actual claim and archive in both orders without claiming paused work

- **Shared unresolved** — owner lifecycle and real static worker fences never revives a skipped locked writer after restore and explicit project resume

- **Shared unresolved** — owner lifecycle and real static worker fences a project-first writer refuses a busy run without deadlocking canonical claim

- **Shared unresolved** — owner lifecycle and real static worker fences a project-first control refuses a busy run without deadlocking canonical claim

- **Shared unresolved** — owner lifecycle and real static worker fences retries a transient writer lock on the same artifact, but never retries an actual fence


### lib/qa/activity-stream.test.ts

- **Shared unresolved** — aktivitet · the rollback body is the body it replaced is pinned by hash


### lib/qa/atlas-chat.test.ts

- **Shared unresolved** — atlas chat · the route contract it speaks emits the transcript events and the two typed website effects

- **Shared unresolved** — atlas chat · the route contract it speaks does not observe a client abort — which is why there is no stop control


### lib/qa/atlas-knowledge-boundary.test.ts

- **Shared unresolved** — NO PRODUCTION CONSUMER — Phase 1 wires nothing the only importers are the operator harness and these QA tests

- **Shared unresolved** — PROJECTION SOURCE — a local boundary, never an Atlas one the only importers are the operator script and its QA suite


### lib/qa/atlas-knowledge-snapshot.test.ts

- **Shared unresolved** — golden artifacts — independently derived bytes documents.jsonl matches the golden byte for byte

- **Shared unresolved** — golden artifacts — independently derived bytes knowledge-manifest.json matches the golden byte for byte

- **Shared unresolved** — golden artifacts — independently derived bytes the identity preimage matches the golden byte for byte, with no trailing LF


### lib/qa/atlas-latency.test.ts

- **Shared unresolved** — Atlas latency · timing never becomes visible content keeps the visible reply fed only by text events

- **Shared unresolved** — Atlas latency · timing never becomes visible content does not touch the reply from the timing branch


### lib/qa/atlas-memory-dream-producers.test.ts

- **Shared unresolved** — 2B-2 · placement and boundaries no M4 recall can feed Dream — the producer closure has no recall seam


### lib/qa/atlas-memory-emit-durability.test.ts

- **Shared unresolved** — Slice 2A — no memory emit is ever detached every recordMemoryEvent call in production code is awaited, at exactly the known sites

- **Shared unresolved** — Slice 2A — no memory emit is ever detached the drain helper that emits workflow-action outcomes is itself awaited

- **Shared unresolved** — Slice 2A — no memory emit is ever detached the Slice 2B-1 emit helpers are awaited at exactly their known call sites


### lib/qa/atlas-memory-terminal-outcomes.test.ts

- **Shared unresolved** — 2B-1 · placement and boundaries in the workflow runtime only advance-completed.ts writes memory, and nothing reads it back


### lib/qa/autonomy-bind-guards.test.ts

- **Shared unresolved** — the atomic bind migration is the only EXEMPT bind migration after Phase 3B1A (M0, 3B1B2 M1, M2, M3, M4-A and M4-B are the reviewed successors)


### lib/qa/autonomy-license.test.ts

- **Shared unresolved** — Phase 2C — the migration does not collide with the chain it joins names itself so it sorts last in the current canonical set

- **Shared unresolved** — Phase 2C — hardening H7. the machine write seam is closed at the code level

- **Shared unresolved** — Phase 2C — review #2 proofs §9. no production runtime outside this module calls the RPC or drives the store

- **Shared unresolved** — Phase 2C — inertness 52. no other atlas subsystem consumes the licence MACHINERY


### lib/qa/autonomy-runtime-foundation.test.ts

- **Shared unresolved** — the Chapter 18 scale has exactly ONE declaration the scan actually reaches middleware.ts


### lib/qa/autonomy-trace-guards.test.ts

- **Shared unresolved** — migration discipline Phase 2C is byte-identical to its merged form — no historical edit

- **Shared unresolved** — migration discipline the new migration sorts after every pre-existing migration

- **Shared unresolved** — Phase 3B1A remains INERT no execution module consumes the trace or its writer


### lib/qa/budget-retry-lifecycle.test.ts

- **Guard corrected** — THE MEASURED REASON KEYS STAY DORMANT GUARD — no shipped call site passes an idempotency key


### lib/qa/budget-scopes.test.ts

- **Shared unresolved** — canonical comments describe the FINAL code states the invariant it actually implements, in the TOP-LEVEL header

- **Shared unresolved** — canonical comments describe the FINAL code gives the stale-open reason wherever stale replay is described


### lib/qa/cl-shadow.test.ts

- **Shared unresolved** — runContextShadow — fire-and-forget containment delivers a diff to the sink and resolves void (assembled context never escapes)


### lib/qa/content-center.test.ts

- **Shared unresolved** — content center · the rollback body is the body it replaced is pinned by hash, its own doc comment included


### lib/qa/delegation-mission-activation.test.ts

- **Shared unresolved** — Mission activation through an accepted Delegation ACTIVATES with an accepted current delegation plus a separate activate authorization

- **Shared unresolved** — Mission activation through an accepted Delegation the activate authorization is SEPARATE — acceptance does not substitute for it

- **Shared unresolved** — accepted-delegation availability is Mission- and version-specific a proof for Mission A does not answer for Mission B in the same project

- **Shared unresolved** — accepted-delegation availability is Mission- and version-specific a version-1 acceptance does not answer for version 2

- **Shared unresolved** — coverage: a narrowed envelope proves only what it covers (§21.13) an envelope carrying one tool does not prove the mission other tool

- **Shared unresolved** — the underlying availability source still has to say yes a throwing source fails closed rather than propagating

- **Shared unresolved** — the underlying availability source still has to say yes caches nothing — a revocation between two evaluations changes the answer

- **Shared unresolved** — live Mission invalidation collapses the proof (§21.14) a revoked APPROVE authorization invalidates the proof

- **Shared unresolved** — live Mission invalidation collapses the proof (§21.14) a governing Decision that stops governing invalidates the proof

- **Shared unresolved** — live Mission invalidation collapses the proof (§21.14) a non-operational project mode invalidates the proof

- **Shared unresolved** — R2 — a terminal Mission ends the handoff (§21.27) a failed Mission makes the accepted delegation unusable


### lib/qa/desktop-commander-unlicensed.test.ts

- **Shared unresolved** — nothing in production can reach the host the declaration is imported by no production module


### lib/qa/execution-contract-propagation.test.ts

- **Shared unresolved** — every governed spend supplies an explicit execution contract all runtime withGovernedSpend calls pass `execution`

- **Shared unresolved** — every governed spend supplies an explicit execution contract only the sanctioned provider modules call the boundary at all

- **Shared unresolved** — every governed spend supplies an explicit execution contract nothing defaults, coalesces or invents an execution contract

- **Shared unresolved** — every governed spend supplies an explicit execution contract test-only fixtures never leak into runtime code

- **Shared unresolved** — OPERATOR_INTERACTIVE is the only stop bypass, so its construction is allowlisted only the allowlisted files construct it

- **Shared unresolved** — classification follows authentication, not filenames cron-only execution paths declare AUTONOMOUS

- **Shared unresolved** — every runtime GLOBAL_ONLY is reviewed and justified no unreviewed file constructs GLOBAL_ONLY

- **Shared unresolved** — ExecutionStoppedError does not leak operator-authored text nothing reads a StopDecision’s observed prose outside the authority


### lib/qa/executive-brief-apex.test.ts

- **Shared unresolved** — EI-S1.5A — no shared-secret Executive Brief read surface exists no Executive Intelligence READ route authorizes on the shared secret

- **Shared unresolved** — EI-S1.5A — no shared-secret Executive Brief read surface exists leaves CRON_SECRET intact for unrelated scheduler routes


### lib/qa/executive-intelligence-schema-activation.test.ts

- **Shared unresolved** — EI-S1.6A — Executive Intelligence schema activation bundle keeps the legacy EI companion count at exactly 83 enforced migrations


### lib/qa/global-design-tokens.test.ts

- **Shared unresolved** — global design · every token a stylesheet needs exists scans the real stylesheets, including the surfaces that carried the defect

- **Shared unresolved** — global design · every token a stylesheet needs exists no CSS module uses a shadcn HSL triple bare as a colour


### lib/qa/handlarborsen-visual-pulse.test.ts

- **Shared unresolved** — Handlarborsen overview hierarchy places charts after KPI and before secondary pulse, collapsing only the breakdown


### lib/qa/legacy-v1-api-removed.test.ts

- **Shared unresolved** — drift-guard — manifest ↔ filsystem varje manifestpost har en route-fil

- **Shared unresolved** — auth-kärnan behålls — Familje-Stunden är beroende av den /business/leads är fortfarande registrerad

- **Shared unresolved** — auth-kärnan behålls — Familje-Stunden är beroende av den /business/campaigns är fortfarande registrerad

- **Shared unresolved** — auth-kärnan behålls — Familje-Stunden är beroende av den /business/revenue är fortfarande registrerad

- **Shared unresolved** — auth-kärnan behålls — Familje-Stunden är beroende av den /chat/tts är fortfarande registrerad


### lib/qa/licensed-bind-m4b-guards.test.ts

- **Shared unresolved** — M4-B is the last migration and leaves the exempt bind untouched no migration after M4-B, and M4-B does not redefine the exempt bind


### lib/qa/marketing-review.test.ts

- **Shared unresolved** — marketing review · the rollback body is the body it replaced is pinned by hash, its own doc comment included

- **Shared unresolved** — marketing review · the rollback body is the body it replaced the client component it renders is untouched

- **Shared unresolved** — marketing review · rendered surface and layout the controls stay visible without the shared foreground token


### lib/qa/memory-vnext.test.ts

- **Shared unresolved** — Minne vNext · generation and frozen legacy pins the mechanically moved legacy body

- **Shared unresolved** — Minne vNext · generation and frozen legacy keeps the existing API and Memory helpers byte-identical


### lib/qa/mission-brief-v1.test.ts

- **Shared unresolved** — Canonical vocabulary (§20.11, §20.98) supports all sixteen §20.98 statuses in the public type


### lib/qa/money-overview.test.ts

- **Shared unresolved** — pengar · the rollback body is the body it replaced is pinned by hash


### lib/qa/monthly-release-v2.test.ts

- **Shared unresolved** — v1 is registered in production and must not move MUTATION — the v1 YAML still hashes to the pinned upstream value

- **Shared unresolved** — v2 is vendored, never authored here the vendored YAML matches the pinned upstream hash

- **Shared unresolved** — v2 is vendored, never authored here the committed JSON is the generated form of the vendored YAML


### lib/qa/muapi-media-provider.test.ts

- **Shared unresolved** — nothing generates media on its own exactly ONE governed module calls a generation method

- **Shared unresolved** — nothing generates media on its own no route, cron or workflow calls a generation method


### lib/qa/platform-credential-events.test.ts

- **Shared unresolved** — Settings S0 · platform_credential_events migration — append-only and server-only RLS on, no policy, every client grant revoked, and the service role holds SELECT and INSERT only

- **Shared unresolved** — Settings S0 · platform_credential_events migration — append-only and server-only touches no other object and carries no data statement

- **Shared unresolved** — Settings S0 · platform_credential_events — the search_path follow-up pins the append-only function's search_path, and does nothing else


### lib/qa/project-command-center.test.ts

- **Shared unresolved** — project command center · legacy rollback keeps the legacy body byte-identical to the page it replaced

- **Shared unresolved** — project command center · Marknadsplatsstatistik link the view renders it as a plain link, with no project name of its own


### lib/qa/project-workspace-vnext.test.ts

- **Shared unresolved** — project workspace B1 · generation and legacy rollback keeps the six legacy route bodies byte-for-byte from the reviewed base

- **Shared unresolved** — project workspace B1 · generation and legacy rollback moves the exact workflow editor behind /edit without changing its implementation

- **Shared unresolved** — project workspace B1 · generation and legacy rollback keeps the previous output component and deletion endpoint untouched while stating whole-run deletion


### lib/qa/provider-dispatch-certainty.test.ts

- **Shared unresolved** — no consumer of ProviderDispatchUnknownError weakens it none converts the ambiguity into a not-dispatched claim


### lib/qa/release-gate-proof-workflow.test.ts

- **Shared unresolved** — the proof definition is vendored, minimal and read-only the vendored file matches its pinned source hash

- **Shared unresolved** — single-remote-read authority the ONLY writer of AUTOMATED evidence is the executor


### lib/qa/review-queue.test.ts

- **Shared unresolved** — phase 11 · scope, authority and boundaries adds no endpoint, no migration and no schema change

- **Shared unresolved** — phase 11 · the legacy rollback is the page that shipped the legacy body is the previous page verbatim — pinned by hash


### lib/qa/sdf1b2-code-work-operator-plane.test.ts

- **Shared unresolved** — SDF-1B2 read isolation and no-execution boundary keeps migration 80 byte-identical


### lib/qa/sdf1c-broker-claim-credential.test.ts

- **Shared unresolved** — SDF-1C1B migration and structural boundary adds no route, no broker CLI command and no execution/model code


### lib/qa/sdf1c-trusted-broker.test.ts

- **Shared unresolved** — SDF-1C1 repository, secret and no-execution boundary exposes only enrollment and identity diagnostics, never execution capability


### lib/qa/sdf1c2-broker-control-channel.test.ts

- **Shared unresolved** — SDF-1C2 structural boundary exposes exactly the six purpose-specific broker routes and no generic boundary


### lib/qa/sdf1c3-isolation-integration.test.ts

- **Shared unresolved** — SDF-1C3A real Git: the preparation substrate against a synthetic repository, with the real toolchain prepares an isolated worktree at the pinned commit and stays inside the approved parent


### lib/qa/sdf1c3-isolation-substrate.test.ts

- **Shared unresolved** — SDF-1C3A trusted toolchain: git and docker are never chosen by a caller resolves only from fixed absolute candidates and issues an unforgeable-by-shape tool

- **Shared unresolved** — SDF-1C3A trusted toolchain: git and docker are never chosen by a caller refuses relative, missing, non-regular, non-executable, group/other-writable, foreign-owned and unsafe-ancestor candidates

- **Shared unresolved** — SDF-1C3A trusted toolchain: git and docker are never chosen by a caller follows a symlink to its real target and judges the target (a link cannot launder trust)

- **Shared unresolved** — SDF-1C3A trusted toolchain: git and docker are never chosen by a caller the runner refuses a tool object that did not come from the resolver

- **Shared unresolved** — SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment only a broker-made command can run, and run() takes nothing but the command (no env, args or executable)

- **Shared unresolved** — SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment never enables a shell and runs exactly the trusted executable with direct argv

- **Shared unresolved** — SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment does not inherit the parent environment: secrets in process.env never reach a child

- **Shared unresolved** — SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment bounds stdout/stderr before returning

- **Shared unresolved** — SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a timeout kills the child (TERM, then KILL) and reports timedOut

- **Shared unresolved** — SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment logs nothing and never puts a command line or secret in a result or thrown message

- **Shared unresolved** — SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a planted user gitconfig, hooks, filters and credential helper are unreachable (real git)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) prepares a worktree at exactly the pinned commit with a closed, path-free result

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) is deterministic: same work → same branch, directory and hashes

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts only trusted structured input; the caller cannot choose branch, directory, parent or arguments

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (uppercase)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (39 chars)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (41 chars)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (abbreviated)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (a ref name)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (non-hex)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (option-like)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (empty)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a pin that is not a commit object present locally (missing, blob, tree, annotated tag) and never fetches

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) returns STALE_BASE, exactly and without fetching, when the approved base ref moved

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) needs no network at all (an unreachable origin cannot matter)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong remote

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong host

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses file remote

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses plain path remote

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses credentials in URL

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses sub-path

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts SCP, ssh and case-different forms of the SAME identity, and refuses a second identity or a missing remote

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (filter driver) before creating anything

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (fsmonitor) before creating anything

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (hooksPath) before creating anything

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (credential helper) before creating anything

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (include) before creating anything

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (ssh command) before creating anything

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (shell alias) before creating anything

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked, non-directory, non-canonical or non-repository root, and a linked worktree used as root

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked or non-canonical worktree parent and never creates it

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses every collision without touching the existing state (path, dangling link, file, branch, worktree)

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) a worktree elsewhere already holding the branch or the path is a conflict

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) does not follow a symlink planted in the future target path

- **Shared unresolved** — SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) verifies after creation and, on any failed check, keeps the workspace (explicit_cleanup_only) and says so

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives verifies canonical roots only

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives reads existing files only when no segment is a symlink and the realpath is the lexical path

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives a write-intent check additionally refuses hardlinks and non-regular files

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives verifies a prospective create against its deepest existing ancestor

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses NUL

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses newline

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses tab

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses DEL

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses parent traversal

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses embedded traversal

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses absolute

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses double slash

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses dot segment

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses trailing slash

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses backslash

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses windows drive

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses empty

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses surrounding space

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses non-NFC (NFD é)

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses .git

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses nested .git

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses .GIT case

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses .env

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses .env.local

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses .ENV.production

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses .ssh

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses .aws

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses secrets dir

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses pem

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses key

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses service account

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives refuses not a string

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives accepts ordinary NFC unicode names

- **Shared unresolved** — SDF-1C3A real-filesystem containment primitives opens for reading with O_NOFOLLOW and refuses a final component that became a symlink

- **Shared unresolved** — SDF-1C3A SandboxSpec and Docker command construction refuses every docker verb outside the closed set and every malformed target

- **Shared unresolved** — SDF-1C3A Docker host proof (VM-backed Docker Desktop required for production) derives the daemon socket only from a fixed host-side list (no DOCKER_HOST, no remote, no other socket)

- **Shared unresolved** — SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution adds no broker route, and the route set is exactly the 1C2 control channel

- **Shared unresolved** — SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution only the approved isolation modules can ISSUE an InfraCommand: brokerCommand is not reachable from any other production module


### lib/qa/social-credentials.test.ts

- **Guard corrected** — social credentials · no consumer reaches a credential any other way no deployed code names a retired environment credential or a global account identity


### lib/qa/spend-financial-decoupling.test.ts

- **Shared unresolved** — §14 · each flag has exactly ONE production reader H1_SPEND_GATE is read only in spend-gate-flag.ts

- **Shared unresolved** — §14 · each flag has exactly ONE production reader H1_FINANCIAL_EXECUTION is read only in financial-execution-flag.ts


### lib/qa/survival-funding-sql.test.ts

- **Shared unresolved** — funding · the declaration and its reader semantics starts UNDECLARED — NULL is the absence of a declaration, with no default

- **Shared unresolved** — funding · the declaration and its reader semantics a positive declaration is stored exactly, and audits one SET

- **Shared unresolved** — funding · the declaration and its reader semantics ZERO is a KNOWN declaration, never a clear

- **Shared unresolved** — funding · the declaration and its reader semantics NEGATIVE is a KNOWN declaration — the sign is not this schema's policy

- **Shared unresolved** — funding · the declaration and its reader semantics CLEAR persists NULL, and is distinguishable from a zero declaration

- **Shared unresolved** — funding · the declaration and its reader semantics re-setting the SAME value writes nothing — no audit trail of non-events

- **Shared unresolved** — funding · the declaration and its reader semantics the RESPONSE equals current truth and the audit row, exactly

- **Shared unresolved** — funding · invalid input is refused at the boundary refuses NaN and both infinities

- **Shared unresolved** — funding · invalid input is refused at the boundary refuses an absent actor — the ledger cannot record an anonymous change

- **Shared unresolved** — funding · invalid input is refused at the boundary none of those probes changed the declaration or wrote an audit row

- **Shared unresolved** — funding · the declaration is persisted EXACTLY, never rounded ACCEPTS every exactly-representable shape

- **Shared unresolved** — funding · the declaration is persisted EXACTLY, never rounded REFUSES anything that would be silently rounded

- **Shared unresolved** — funding · the declaration is persisted EXACTLY, never rounded REFUSES anything outside the numeric(12,4) range

- **Shared unresolved** — funding · the declaration is persisted EXACTLY, never rounded ACCEPTS trailing zeros, which is not precision loss

- **Shared unresolved** — funding · the declaration is persisted EXACTLY, never rounded the no-op comparison uses the CANONICAL stored value

- **Shared unresolved** — funding · the actor must be a canonical authenticated human ACCEPTS the canonical user:<uuid> shape

- **Shared unresolved** — funding · the actor must be a canonical authenticated human REFUSES machine-shaped and malformed actors through the RPC

- **Shared unresolved** — funding · the actor must be a canonical authenticated human REFUSES the same shapes at the TABLE, not only at the RPC

- **Shared unresolved** — funding · the actor must be a canonical authenticated human a refused actor leaves the declaration and the ledger untouched

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton exists, and holds exactly the singleton row

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton is the ONLY place the declaration lives — platform_config does not carry it

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton has RLS on and ZERO policies, so no client can read it through a policy

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton grants anon and authenticated NOTHING

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton grants service_role SELECT and nothing else

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton refuses every direct write by service_role

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton refuses every direct write by anon and authenticated

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton the canonical RPC is the ONLY writer that can exist — and it works

- **Shared unresolved** — funding · current truth is a SERVER-ONLY singleton the singleton constraint refuses a second row even from the owner

- **Shared unresolved** — funding · the change and its evidence are atomic every change writes EXACTLY ONE audit row, and every audit row has a change

- **Shared unresolved** — funding · the change and its evidence are atomic the ledger is NOT the current truth — clearing it would not change the declaration

- **Shared unresolved** — funding · the change and its evidence are atomic concurrent setters serialise: the predecessor each records is the real one

- **Shared unresolved** — funding · the audit ledger cannot be rewritten refuses UPDATE

- **Shared unresolved** — funding · the audit ledger cannot be rewritten refuses DELETE

- **Shared unresolved** — funding · the audit ledger cannot be rewritten refuses TRUNCATE

- **Shared unresolved** — funding · the audit ledger cannot be rewritten refuses a direct INSERT by service_role, and by anon

- **Shared unresolved** — funding · the audit ledger cannot be rewritten closes the event vocabulary, so a row cannot name an event no reader interprets

- **Shared unresolved** — funding · exactly one current source, and history is never it the setter reads and writes the singleton, and never platform_config

- **Shared unresolved** — funding · exactly one current source, and history is never it the setter never reads the ledger to decide what is declared now

- **Shared unresolved** — funding · exactly one current source, and history is never it no function anywhere reads the ledger as current funding truth

- **Shared unresolved** — funding · exactly one current source, and history is never it the declaration column exists on exactly ONE table in the schema

- **Shared unresolved** — funding · least privilege anon and authenticated can neither read the ledger nor call the setter

- **Shared unresolved** — funding · least privilege service_role reads the ledger and executes the boundary, and writes neither table

- **Shared unresolved** — funding · least privilege the setter is SECURITY DEFINER with a fixed empty search_path

- **Shared unresolved** — funding · least privilege the ledger sequence is revoked from every role

- **Shared unresolved** — funding · scope completeness, answered without exposing anything is TRUE only when the set contains every project

- **Shared unresolved** — funding · scope completeness, answered without exposing anything is FALSE for a subset — a single project is never the platform

- **Shared unresolved** — funding · scope completeness, answered without exposing anything is FALSE for the empty set and for NULL

- **Shared unresolved** — funding · scope completeness, answered without exposing anything returns ONE BOOLEAN — never a row, an id or a count

- **Shared unresolved** — funding · scope completeness, answered without exposing anything is unmoved by a project added outside the caller set

- **Shared unresolved** — funding · a declaration moves nothing else reserves no spend, changes no stop, and issues no authorization

- **Shared unresolved** — funding · a declaration moves nothing else does not clear a pause that is already set

- **Shared unresolved** — funding · a declaration moves nothing else Phase 2A history is untouched by a funding change


### lib/qa/survival-history-sql.test.ts

- **Shared unresolved** — survival history · contract creates exactly one table, and grants write to nobody

- **Shared unresolved** — survival history · contract denies INSERT to every role while letting the boundary INSERT

- **Shared unresolved** — survival history · the recording boundary is hardened is SECURITY DEFINER with an empty, fixed search_path

- **Shared unresolved** — survival history · the recording boundary is hardened PUBLIC, anon and authenticated cannot execute it

- **Shared unresolved** — survival history · the recording boundary is hardened service_role holds EXECUTE and nothing broader

- **Shared unresolved** — survival history · the recording boundary is hardened has no autonomy, actor or provenance parameter at all

- **Shared unresolved** — survival history · the recording boundary is hardened refuses a human or arbitrary actor, even on a direct INSERT

- **Shared unresolved** — survival history · the recording boundary is hardened the RPC writes the canonical machine identity, whatever the observer

- **Shared unresolved** — survival history · the recording boundary is hardened derives provenance from the version, and refuses every mismatched pair

- **Shared unresolved** — survival history · the recording boundary is hardened the RPC takes no provenance argument at all

- **Shared unresolved** — survival history · the recording boundary is hardened refuses an impossible state/ceiling pair on a direct INSERT

- **Shared unresolved** — survival history · the recording boundary is hardened refuses a policy identity no derivation implements

- **Shared unresolved** — survival history · the recording boundary is hardened service_role cannot write the table or the sequence directly

- **Shared unresolved** — survival history · the recording boundary is hardened a real anon session is refused, and the boundary is reachable as itself

- **Shared unresolved** — survival history · records transitions, not polling noise records exactly one baseline for the first observation

- **Shared unresolved** — survival history · records transitions, not polling noise records nothing when the same state is observed again

- **Shared unresolved** — survival history · records transitions, not polling noise records exactly one transition when the state really changes

- **Shared unresolved** — survival history · records transitions, not polling noise keeps event_seq as the chain order and goes back to NORMAL

- **Shared unresolved** — survival history · records transitions, not polling noise answers `unchanged` for a no-op rather than inserting

- **Shared unresolved** — survival history · from_state is never the caller’s refuses a direct INSERT whose from_state does not follow the ledger

- **Shared unresolved** — survival history · from_state is never the caller’s refuses a second baseline for a project that already has history

- **Shared unresolved** — survival history · from_state is never the caller’s refuses a transition that does not change the state

- **Shared unresolved** — survival history · append-only, enforced by the database refuses UPDATE

- **Shared unresolved** — survival history · append-only, enforced by the database refuses DELETE

- **Shared unresolved** — survival history · append-only, enforced by the database refuses TRUNCATE

- **Shared unresolved** — survival history · closed vocabularies closes the event, state, ceiling, funding and policy-identity vocabularies

- **Shared unresolved** — survival history · closed vocabularies seeds a project with history so the CHECKs, not the guard, are under test

- **Shared unresolved** — survival history · closed vocabularies refuses a value outside each closed set, by CHECK

- **Shared unresolved** — survival history · closed vocabularies refuses an unsupported to_state at the boundary, before anything is written

- **Shared unresolved** — survival history · closed vocabularies the declared amount is biconditional with KNOWN — all four cases

- **Shared unresolved** — survival history · closed vocabularies ACCEPTS negative remaining headroom — an overspent scope is valid evidence

- **Shared unresolved** — survival history · closed vocabularies refuses a negative limit, burn rate or runway

- **Shared unresolved** — survival history · closed vocabularies refuses an unknown event type, which can only arrive by direct INSERT

- **Shared unresolved** — survival history · closed vocabularies refuses an unknown project, fail-closed

- **Shared unresolved** — survival history · the observation survives the round trip preserves reasons, gaps, ceiling, funding and the distinct funding states

- **Shared unresolved** — survival history · the observation survives the round trip keeps UNAVAILABLE distinct from UNDECLARED

- **Shared unresolved** — survival history · the observation survives the round trip stores declared funding when KNOWN, and only then

- **Shared unresolved** — survival history · the observation survives the round trip keeps MRR a SIGNAL — it never becomes runway, and runway stays unknown without funding

- **Shared unresolved** — survival history · the observation survives the round trip records the observation instant separately from the write instant

- **Shared unresolved** — survival history · the observation survives the round trip refuses an occurred_at in the future

- **Shared unresolved** — survival history · concurrency cannot duplicate a logical transition two concurrent FIRST observations produce ONE baseline

- **Shared unresolved** — survival history · concurrency cannot duplicate a logical transition two concurrent observers of the SAME change produce ONE transition

- **Shared unresolved** — survival history · concurrency cannot duplicate a logical transition a retry of the same observation is idempotent

- **Shared unresolved** — survival history · recording changes neither spend nor the stop leaves the automation pause and the spend ledger untouched


### lib/qa/system-health.test.ts

- **Shared unresolved** — phase 12 · authority is preserved, never re-created adds no endpoint, migration or schema change

- **Shared unresolved** — phase 12 · the legacy rollback is the page that shipped the legacy body is the previous page verbatim — pinned by hash


### lib/qa/vnext-intelligence-graph.test.ts

- **Shared unresolved** — phase 18 · the legacy rollback is the page that shipped renders the legacy canvas byte-identically to origin/main 430259e

- **Shared unresolved** — phase 18 · the legacy rollback is the page that shipped keeps the legacy client markup byte-identical

- **Shared unresolved** — phase 18 · the legacy rollback is the page that shipped moves the previous page body verbatim into IntelligenceGraphLegacy

- **Shared unresolved** — phase 18 · the legacy rollback is the page that shipped leaves the legacy inspector file untouched

- **Shared unresolved** — phase 18 · layout, scale and motion is exactly as tall as the vNext shell leaves it, not the legacy CommandBar height

- **Shared unresolved** — phase 18 T2a · shell geometry measures the floating corner from the activity peek and the Atlas launcher

- **Shared unresolved** — phase 18 T2a · shell geometry goes fullscreen with the header, where the shell chrome is gone

- **Shared unresolved** — phase 18 T3b · release hardening opts only Live Operations into the G-27 last-safe guard

- **Shared unresolved** — phase 18 T3b · release hardening keeps mobile list-first, System Map, Replay and legacy rollback contracts intact


### lib/qa/website-build-drain.test.ts

- **Shared unresolved** — website build dispatch through actual drain route and SQL requires_cron_auth_before_any_build

- **Shared unresolved** — website build dispatch through actual drain route and SQL dispatches_website_kind_without_touching_legacy_handlers

- **Shared unresolved** — website build dispatch through actual drain route and SQL invalid_artifact_is_terminal_without_automatic_paid_retry

- **Shared unresolved** — website build dispatch through actual drain route and SQL in_flight_unknown_waits_for_reconciliation_and_never_looks_like_an_active_build


### lib/qa/workflows-definition-familje-stunden.test.ts

- **Shared unresolved** — vendored definition — provenance the vendored YAML matches the pinned upstream hash

- **Shared unresolved** — vendored definition — provenance the committed JSON is the generated form of the vendored YAML


### lib/social-launch/scheduling/worker.test.ts

- **Timing rerun passed** — Instagram final publish is refused if image verification crosses the ten-minute deadline

- **Timing rerun passed** — processing Instagram containers yield to other jobs and remain eligible on later ticks


### lib/trading/market-data/import-discipline.test.ts

- **Shared unresolved** — the contract boundary is identity, never a provider symbol the domain definitions each still exist exactly once


### lib/trading/market-view/import-discipline.test.ts

- **Shared unresolved** — no Node builtin is reachable at runtime from the market-view package proves it across the whole transitive value-import closure


### lib/trading/provider-normalization/recorded-adapter.test.ts

- **Shared unresolved** — a transcript gap fails closed never branches on a provider message anywhere in the package


### lib/trading/replay/import-discipline.test.ts

- **Shared unresolved** — no Node builtin is reachable at runtime from the replay package proves it across the whole transitive value-import closure

- **Shared unresolved** — Stage 1.5 boundaries reads no wall clock on a trading-state path


### lib/trading/session-calendar/import-discipline.test.ts

- **Shared unresolved** — AD. an answer cannot depend on where or when it runs names an explicit timeZone on every formatter it builds


### lib/website-build/api.test.ts

- **Shared unresolved** — website build API authorization and durable results unknown_artifact_is_404_and_export_is_private_verified_utf8


### lib/website-build/chat-tools.test.ts

- **Shared unresolved** — Website build through actual authenticated chat tool loop model-supplied confirmation cannot approve or start


### lib/website-build/studio/api.test.ts

- **Shared unresolved** — studio HTTP boundary creates a private real owner workspace and recovers a repeated response


### lib/website-build/studio/budget.test.ts

- **Shared unresolved** — explicit studio budgets and billable project identity requires a budget for the exact owned studio conversation and keeps replay idempotent


### lib/website-build/studio/loader.test.ts

- **Shared unresolved** — studio project and conversation identity loads a selected studio conversation with its missing budget and no invented desktop


### lib/website-build/studio/store.test.ts

- **Shared unresolved** — owner-bound studio creation in real PostgreSQL recovers a lost creation response without another project, agent or conversation

- **Shared unresolved** — owner-bound studio creation in real PostgreSQL rolls back project creation when agent insertion fails

- **Shared unresolved** — owner-bound studio creation in real PostgreSQL gives authenticated users owner-only SELECT and no mutation or RPC bypass
