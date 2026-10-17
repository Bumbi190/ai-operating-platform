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
