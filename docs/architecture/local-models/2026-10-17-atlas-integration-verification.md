# Atlas local text integration — verification in progress

Date: 2026-10-17. Branch: `codex/atlas-local-text-integration-20261017`.
Base: `3349c8a421b42c95408439c99ba5fb75722a7b6e` (verified main).
Approved spec and plan are under `docs/superpowers/`. Execution method: Native.
This is an implementation record, not pilot/production admission.

## Implemented and observed

- Isolated Windows worktree; only own pilot files and five named documents imported from `7d62d44`. Other worktrees and their dirty files were not changed.
- Shared strict ESM/TypeScript request, claim, result and signed-envelope contracts; input hash includes contract/schema versions and exact source without Unicode normalization.
- Eight contract tests: RED before implementation, then 8/8 PASS on Linux and Windows. Web TypeScript check exits 0.
- UTF-8 transport and stdin decode reject invalid byte sequences instead of introducing replacement characters.
- New bounded inference uses an explicit raw prompt, source JSON with control-marker escaping, fixed schema, 4096 context and 384 output reserve. It never relies on undocumented debug rendering as tokenization.
- Operator-only GGUF verifier checks complete artifact SHA-256, tokenizer/pretokenizer and all 256 GPT-2 byte symbols before allowing a byte-token upper bound. Metadata reads are bounded; unknown metadata/artifacts deny eligibility.
- Ten new gap/evidence tests: RED before implementation, then 10/10 PASS. Explicit Windows suite: 88/88 PASS across 11 files, zero skips.
- Actual three model files were fully hashed on the desktop. Coverage verified for Qwen3 8B (qwen2) and Qwen3.5 4B/9B (qwen35).
- Each model ran one controlled raw-mode diagnostic and one bounded classification on synthetic invoice-support text; each bounded result was `{"label":"support"}`. Each reported context length 4096, bounded token use and `INPUT_TOO_LARGE` for 3000 emoji code points. These six generations are operator context probes, not expanded quality admission.
- The owned loopback runtime was stopped after the probes. No autostart, credentials, power, network, default model, merge or deploy was changed.

| Candidate | GGUF artifact SHA-256 | Byte-coverage evidence SHA-256 |
| --- | --- | --- |
| Qwen3 8B | a3de86cd1c132c822487ededd47a324c50491393e6565cd14bafa40d0b8e686f | 4e34e0e83e06f034f40c43dc9ef133a49cdc064b4bc96cc096a69a2c4786cd31 |
| Qwen3.5 4B | a9d0a3e1d8c91732a3812becd31f8d4a8ff57414903f226306069f0437e2ac50 | ea4f6a7e84e0ae953f1d1f8eb69d2f0682c4bb2d9d9600cce71d2e2a76cc3797 |
| Qwen3.5 9B | 02d45dc1cf451ba2475ac33b301c2dd8f985abe4c182ce04a1f2f5bf0260278d | 990a58b611d6de30f2147b4d70c775f7c3db75c95382a99542c6388cef05a61a |

## Broader web baseline

The full existing Vitest command ran against the new main-based worktree: 12,679 passed, 399 failed, 1,326 skipped; 428 files passed, 100 failed, 33 skipped. It is NOT a green web baseline. Named failures are retained in the ignored execution ledger artifacts and will be summarized after environment checks. Initial examples:

- `lib/website-build/api.test.ts` and related build/social suites require a prepared isolated SQL fixture and `WEBSITE_BUILD_TEST_DATABASE_NAME`.
- `lib/qa/leads-dual-accept.test.ts` requires GNU grep on PATH.
- `lib/qa/leads-legacy-auth-removed.test.ts` calls Unix find, while the Windows default resolves FIND.
- `lib/qa/executive-intelligence-schema-activation.test.ts` expects 96 companion migrations and observes 114 before any integration migration.
- `lib/trading/session-calendar/import-discipline.test.ts` has a Windows-sensitive source scan.

The new contracts are not imported by existing execution paths; existing migration files are unchanged. These blockers must remain visible, and work on other governance/build branches is not copied or repaired implicitly.

## Decisions and remaining gates

- Skill helper resource paths were unavailable through the skill provider; the owned ignored ledger records task BASE, preflight interface scan, RED/GREEN, commits and rulings manually.
- The plan guessed a nonexistent `workers/local-models/tests/` directory. Existing tests are adjacent to modules plus `scripts/runtime.test.mjs`; explicit test-file arrays now assert the file count.
- An empty-array baseline attempt discovered the whole repo with the wrong Node runner before dependency installation. That run is invalid evidence; the explicit 78-test original pilot baseline supersedes it.
- A Vite deprecation warning tripped PowerShell's native-stderr error policy on the first web attempt. Command-local CMD redirection fixed the runner; no application or shared machine setting was changed.
- Raw-mode prompt behavior is new and requires expanded task qualification and independent quality review. Previous offline approvals never admit this adapter automatically.
- Signed Windows identity, queue/policy, review/fallback, Atlas status/UI, incidents/retention and supervised startup remain plan tasks. No project is admitted or locally routed yet.
- Native final branch review, actual governed cloud metering, full synthetic Atlas-to-GPU-to-review receipt and approved crash/reboot pilot remain outstanding.

## Queue foundation (Task 3)

CLI 2.121.0 generated `20261017090351_atlas_local_text.sql`. Eight dedicated RLS tables and service-only invoker RPCs are tested in a labelled, network-isolated postgres:16 container with no published ports or real data. The repository has no complete initial core-schema migration/configuration, so a minimal explicit parent-contract fixture and the existing canonical `stop_state` body were used. This proves this migration's behavior, not full repository migration replay.

Fresh database replay: `LOCAL_TEXT_SQL_PASS`, covering exact idempotent receipt, changed-source refusal, cross-owner refusal, raw-column and authenticated/anonymous mutation/RPC denial, immutable source/selection, unreviewed output hidden, duplicate/late completion, purged-source retry and unknown-dispatch hold. Two independent concurrent sessions with two queued jobs on one device produce exactly one claim and one null response (1/1 test PASS). Nine TypeScript store tests PASS; `npm --prefix apps/web run typecheck` exits 0.

Persistence consumes an explicit SelectionDecision as a fourth enqueue argument; it never invents model selection. A closed typed RPC bridge avoids overwriting whole-schema generated types with this minimal fixture schema. Vitest now explicitly includes local-text tests. Raw payload expiry is five minutes before the job deadline to give the later purge maintenance a margin; that maintenance is not implemented/activated yet.

## Signed worker identity (Task 4)

Windows real-key tests: a current-user CNG P-256 key with ExportPolicy=None signs the fixed v1 protocol; Node verifies IEEE-P1363/SHA-256 signatures. Private export is denied. Every test key is explicitly named as a test and removed in finally. No persistent enrolled device/key was installed. Helper processes receive only a small OS environment allowlist, excluding provider/connector credentials. Explicit file counters advance atomically before requests and refuse stale locks, corrupt/exhausted state or silent reinitialization.

The signature now includes a canonical HTTPS origin. A regression test first showed that an otherwise valid request could be replayed to another deployment origin; origin binding in the header and immutable paired record closes that gap. This is a pre-activation refinement to wire v1. These software identities are not remote/hardware attestation.

One SQL operation atomically consumes the monotonic counter/nonce and performs the closed worker operation, rechecking key/build/status/expiry/scope. Two simultaneous SQL sessions using the same counter accept exactly one request. Fresh replay produced LOCAL_TEXT_SQL_PASS and LOCAL_TEXT_IDENTITY_SQL_PASS. Registration stays pending, enrollment proves possession without self-approval, owner approval requires the exact fingerprint/version, and foreign/stale approvals and revoked keys are refused. Both concurrency tests pass.

Current test evidence: shared/Windows identity/counter tests 13/13 PASS (no Windows skips); server local-text tests 27/27 PASS; web typecheck exits 0. Routes are present with ATLAS_LOCAL_TEXT_ENABLED disabled by default; tests verify no worker dispatch while disabled. Owner mutation routes use the canonical platform-operator session and same-origin checks. Revocation remains available as an owner control when new-work activation is disabled. No production flag or database was changed.

Replay/counter admission happens in the same SQL transaction as the operation; verifyWorkerRequest alone yields no dispatch authority. Reconciliation still refuses to clear unknown physical outcomes until the later owned-runtime evidence adapter exists. Model/profile admission, complete outbound worker, semantic review, Atlas UI and live startup are still outstanding.

## Task 5: task capabilities and admission
Selector excludes unqualified, stale, drifted, unlicensed or unadmitted candidates before ranking. Preselection has no admission; enqueue binds the selected project admission. Initial choices: 4B classify/extract, 8B summarize; 9B classify can be reused warm only at equal quality with deadline eligibility. Total operating cost is unknown (null), not zero. Review/fallback readiness and price/budget evidence are required; caps alone do not authorize spending.
Server catalog is intentionally empty pending Task12 independent qualification. Owner API cannot submit qualification or owner/status fields; it selects a server catalog hash and explicit source hashes. Active admission evidence is immutable; revocation remains possible with feature off. Atomic start checks current admission, stop state, signed health and exact model/runtime/adapter/config tuple. Queued same-admission renewal appends history without modifying a decision or retrying started work.
Validation: selector RED4, admission API RED4; server GREEN36/36, tsc exit0. Local PostgreSQL migration plus queue/identity/policy functional tests and two independent-session claim/counter races PASS. New policy SQL exercises runtime drift, 45-second freshness, unknown license, foreign/stale owner, immutable admission, stale-selection history, adapter drift before start, old model claim and revocation. This is isolated synthetic SQL evidence; no production admission or paid dispatch.

## Task 6: outbound bounded worker
Signed requests use one fixed HTTPS origin, durable serialized counters and no transparent wire retry. Acknowledged, freshly revalidated start precedes the only inference. Heartbeat renewal is15 seconds, local execution has a90-second total deadline, health is bounded3 seconds. No local control listener is introduced. An expired never-started claim is fenced and may be requeued; running or unknown dispatch becomes reconciling and holds its device. No unverified proofRef can clear it; kernel termination reconciliation remains dependent on the owned Task11 supervisor.
Exact completed payloads may be replayed after acknowledgment loss without repeating inference. Recovery source/result is protected with Windows CurrentUser DPAPI in bounded atomic files and removed at expiry, retaining an unresolved metadata hold. This is current-user protection, not an OS sandbox. Claims expose no later deadline than the raw payload deadline. Unknown inference errors retain the runtime lock; fully received responses retain known termination even if a later identity probe fails.
The bounded adapter requests all GPU layers (num_gpu999), fixed4096 context and384 output. Before/after task inference it requires one loaded model with exact digest, size_vram equal to size,4096 context, pinned runtime executable, owned PID+creation time+Windows SID+loopback listener and NVIDIA owned runner PID. Code dependencies are hashed including contract/context/identity/process helpers. GGUF SHA and byte coverage are verified at startup; artifact identity/metadata and manifest digest are checked again at dispatch. These checks do not attest against another process acting as the same Windows user. The changed GPU configuration requires fresh Task12 quality qualification.
Real opt-in CLI proof: isolated synthetic HTTPS server -> actual CNG verifier -> real PostgreSQL RPCs -> owned RTX3060/Ollama0.40.5 -> bounded Qwen3.5 4B -> reviewing receipt with result null/pending review. Job b0d8eddf-29c0-46a2-a4ad-46c2815ba063; attempt d54dd4c9-c441-4351-a775-87fe52091611; model sha256:d8b0f5e9760cd1682034f292d7ef72ec46f432149be0df7574bf2d6e92e38c04. Adapter93691bf58a6d47a4f78f457a3e9d6d6cd300c6f27ea0d03858590e2c7350d3a0; configuration d164196eebbd153cc1609b79f64cba354181b94f064cad8b710ef5ee65235204.78.6 seconds includes full artifact startup verification; this is not a warm latency benchmark or model admission. Source/task/review fields in the SQL fixture are synthetic transport scaffolding, not independently qualified evidence. Cloud calls0. Ephemeral CNG key and worker recovery/config files were removed; owned test runtime was stopped and no11434 listener remained. No production schema/device/admission/configuration changed.
Validation: shared+Windows-worker29/29 PASS; pilot91/91 PASS; web36/36 PASS (opt-in GPU test separately1/1 PASS); tsc exit0. Isolated migration/queue/identity/policy/lease SQL and two-session claim/counter races PASS. Real native-helper regression exposed missing PATHEXT in the credential-free environment: RED before, GREEN after allowing that ordinary Windows setting; no cloud/connector secrets were added. Route params aligned to the pinned Next14 API. Full web baseline blockers remain as documented.
