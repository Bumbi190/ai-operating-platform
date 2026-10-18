# Atlas durable review storage — verification, 2026-10-18

The approved Plan 2 implements real PostgreSQL persistence and server-only role-bound review operations. **No running AI reviewer, model dispatch, operational code job, ready-for-human gate, UI, HTTP route or production integration was activated.** The migration was tested only in owned disposable local PostgreSQL containers; no hosted schema was changed.

## Source and approval

- Spec: docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md, approved 19:57 Europe/Stockholm.
- Plan: docs/superpowers/plans/2026-10-18-atlas-review-storage.md, approved by Andre at 20:53 Europe/Stockholm.
- Execution BASE: 01d759d47fb636dd7c3fba035834bcaac5590b5c.
- Branch: codex/atlas-code-worker-design-20261018. Existing isolated worktree preserved.
- Reviewed source HEAD: 23e62510d14128981a4da6ae0ca35e630f2160c4.
- Final verified source: 9976dc74a72d0b639ae595b133e12d5274892fff.
- No push, merge, deployment, broker enrollment, paid API call, dependency install or image pull occurred.

| Task | Local commit | Deliverable |
|---|---|---|
| 1 | 73be7ab | Closed aggregate, chronological reconstruction, role credentials |
| 2 | 54a5102 | Purpose-specific atomic storage RPCs, real PostgreSQL fixture and races |
| 3 | 093c79d | Server access, filtered role/project reads, key recovery |
| 4 | 23e62510d14128981a4da6ae0ca35e630f2160c4 | Cross-layer restart/retry flow, portable predecessor tests |
| Review fixes | 9976dc74a72d0b639ae595b133e12d5274892fff | Enforce admission file-count and numeric diff-byte ceilings independently in SQL; two self-consistent direct-RPC regressions prove rollback |

Migration: apps/web/supabase/migrations/20261018185809_atlas_code_review_storage.sql, created with the existing Supabase CLI 2.121.0 migration-new command. Source modules are apps/web/lib/atlas/code-work/review/storage/{types,prepare,credential,store,service,principal-read}.ts.

## Implemented boundary

Immutable stored config binds the actual parent admission, broker claim identity/fence, target declaration, required checks including test floors, fixed budget declarations/deadline and server-issued coordinator/worker identities. Each candidate gets a new server-issued reviewer actor/session and a fixed review-assignment claim, separate from the renewable broker lease.

Snapshots include available original brief/source/diff/check bodies and are validated by the existing pure contracts. Candidate 2 requires requested changes, changed evidence and a fresh reviewer session. Reports and messages are append-only; the entire aggregate can be reconstructed in command order and compared to its stored form. The private receipt metadata adds observedAtMs and payloadRef without duplicating evidence bodies.

A narrow compare-and-append SQL transaction independently checks immutable prefixes/config, role proof, phase/order, live parent authorization/claim/lease/fence, broker status/repository eligibility, version, counters and byte caps. Parent/job row locks serialize writes; a SHARE lock on the append-only authorization table makes concurrent revocation inserts serialize with validation. SQL also locks the broker status row for the live check. Direct DML is revoked, RLS is enabled, private helpers cannot be called by client/service roles, and public RPC execution is explicitly service-only with pinned search paths.

There are at most two candidates, two stored reports per candidate and twelve messages per job; the replay index has at most eighteen successful commands. The aggregate is capped at 1048576 canonical UTF-8 bytes in addition to existing 65536-context/32768-result/4096-message limits. Actual model dispatch caps and spend are not enforced here because no dispatcher runs.

32-byte role tokens are random, versioned and domain-separated by work/role/session before hashing. Only hashes reach SQL; ordinary job/operator/role projections contain no credential material. Bootstrap and freeze return newly issued raw tokens only to their trusted direct server caller. Exact replay returns no secrets. Explicit recovery rotates one matching role credential under current parent proof, invalidates its old token and changes no job version/history; it does not reconcile uncertain model dispatch.

The initial reviewer read excludes agent discussion; after its own saved preliminary assessment it can read directed messages for that candidate. Workers cannot read reviewer reports or submit them. Project-scoped operator reads use existing principal/project access before privileged storage access. No production route/client/broker runtime imports the storage module.

## Fresh verification

**403/403 tests passed across 19 files with no skips** and ATLAS_REVIEW_SQL_REQUIRED=1 after the review fix. The post-fix run took 205.70 seconds in Vitest (209.15 seconds process time). The earlier pre-review gate was 401/401.

| Suite group | Tests |
|---|---:|
| New storage preparation | 20 |
| New storage SQL | 17 |
| New storage service | 9 |
| New storage real-DB flow | 3 |
| New storage structural boundary | 4 |
| Plan 1 review regressions | 174 |
| Existing admission/control/operator/broker TS regressions | 176 |
| Total | 403 |

Both required TypeScript checks finished with observed exit code 0: web 142.56 seconds after the fix; broker was rerun after the fix and also passed (the pre-review run was 4.98 seconds). The Vite CJS deprecation warning is an existing baseline warning, not a failure. No full-repository or paid CI run was made.

Commands:
```powershell
$env:ATLAS_REVIEW_SQL_REQUIRED='1'
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-review-storage-prepare.test.ts lib/qa/sdf-review-storage-sql.test.ts lib/qa/sdf-review-storage-service.test.ts lib/qa/sdf-review-storage-flow.test.ts lib/qa/sdf-review-storage-boundary.test.ts lib/qa/sdf-review-binding.test.ts lib/qa/sdf-review-snapshot.test.ts lib/qa/sdf-review-result.test.ts lib/qa/sdf-review-messages.test.ts lib/qa/sdf-review-contract-flow.test.ts lib/qa/sdf-review-boundary.test.ts lib/qa/sdf1a-code-work-contracts.test.ts lib/qa/sdf1b-code-work-control-plane.test.ts lib/qa/sdf1b-control-plane-boundary.test.ts lib/qa/sdf1b2-code-work-operator-plane.test.ts lib/qa/sdf1c-broker-claim-credential.test.ts lib/qa/sdf1c-broker-identity-id.test.ts lib/qa/sdf1c-trusted-broker.test.ts lib/qa/sdf1c2-broker-control-channel.test.ts --maxWorkers=2 --minWorkers=2
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit
```

Observed RED->GREEN:
1. Task 1 failed on missing prepare module; preparation/credential tests then passed.
2. Task 2 failed on absent initialize RPC after fixture setup was corrected; SQL transaction/role/order/race cases passed. Connecting to PostgreSQL's temporary initialization server and using wrong predecessor WorkPackage field names were fixture errors, not claimed product RED.
3. Task 3 failed on absent service module; service access/retry/recovery cases then passed.
4. Full real-DB composition exposed an SQL precedence error in candidate-2 content comparison. Explicitly parenthesizing snapshot extraction fixed the observed failing two-candidate flow.
5. The larger focused gate exposed two untouched predecessor Windows test defects: raw CRLF hash vs canonical Git LF bytes, and backslash vs POSIX path expectations. Baseline proof showed the old SQL file's canonical checkout bytes equal its execution-BASE Git blob, SHA256 54484f5af5d7addbb36729353ecc9f0213c9ec52d5b67bd4f5d015d29d60caa5. Test-only normalization retained that exact content pin and unchanged exact importer allowlist; 42/42 cases then passed.
6. The independent reviewer reproduced a self-consistent nine-file direct RPC freeze under an eight-file admission limit. Two new direct-RPC tests then failed because both excessive file count and excessive declared diffBytes were accepted (review-red.log exit 1, 2 failed; other tests intentionally filtered). Adding independent SQL admission ceilings made both pass in the final unfiltered 403/403 gate; each also asserts the unchanged aggregate and only the two original role credentials.

The actual PostgreSQL flow recreates the store/service between calls through candidate 1, preliminary report, question/answer, requested changes, candidate 2 with new reviewer, preliminary and final passed. Parent lifecycle remains claimed throughout: storing review evidence grants nothing. Lost initialize/freeze response cases reconcile once and recover a role key explicitly. SQL tests cover duplicate/concurrent append, competing twelfth messages, authorization revocation, broker revoke, fence replacement, heartbeat, stale-token refusal, rollback and denied mutation/reads.

The owned Docker fixtures used cached postgres:16 with --pull=never, no network, no host port, no repository mount and no production credentials. Containers have random plan-owned names and cleanup is limited to those names. After the required run, docker ps filtered by label omnira.plan=atlas-review-storage returned no containers. Only the plan-owned CLI process was stopped after it created the migration file.

## Independent review

One fresh independent whole-range review by gpt-6-astra high covered BASE 01d759d47fb636dd7c3fba035834bcaac5590b5c..HEAD 23e62510d14128981a4da6ae0ca35e630f2160c4, all 17 changed files, approved spec/plan and ledger. Findings: **0 Critical, 1 Important, 0 Minor**.

The Important finding was accepted by effect: a trusted service caller bypassing TypeScript could commit a hashed over-limit freeze that later aggregate reconstruction rejected, preventing normal service append/replay/operator read. There is no exposed route exploit claim. The reviewer independently reproduced the nine-file case in a plan-owned disposable real PostgreSQL container, exited 0 and confirmed cleanup. Its suggested same-boundary diffBytes audit was independently reproduced by the implementer's second failing regression.

Both admission ceilings were fixed in the single material fix pass, covered by observed RED->GREEN and the required fresh whole focused gate/typechecks. No repeated review was dispatched, as specified by the approved plan. No additional review finding is unresolved.

## Rulings I made, in execution order

1. Remote skill shell scripts were unavailable; use an explicit BASE/brief/RED/GREEN/commit ledger instead. Cost if wrong: manual evidence bookkeeping can omit a step; commits and outputs are cross-checked.
2. Add observedAtMs and payloadRef to private receipt metadata so the complete aggregate can be reconstructed chronologically without storing duplicate bodies. Cost if wrong: the new private storage shape is narrower than the plan's sketch.
3. Narrow the service freeze input to evidence without client-selected binding/assignment and reuse a stored assignment for exact retry. Cost if wrong: callers must use this narrower internal DTO rather than the full pure-contract input.
4. Lock the append-only authorization table in SHARE mode before parent/job/credential locks and lock broker status during live checks. Parent locking alone does not serialize an authorization insert. Cost if wrong: authorization writes serialize briefly during these bounded transactions.
5. Read existing effective Authorization V1 under that lock instead of calling a synchronizer that changes parent lifecycle. Cost if wrong: a rejected review write returns stop/unavailable without settling the parent; existing maintenance retains that responsibility.
6. Add purpose-specific internal observe/authenticate-role RPCs, deriving current DB time/live observations and authenticating before privileged aggregate loading. Cost if wrong: two extra service calls precede append; SQL still checks atomically.
7. The code-reviewer template resource could not be retrieved through the skill provider; supply an equivalent concrete whole-range review brief. Cost if wrong: manual template equivalence could omit a review instruction.
8. Normalize only CRLF checkout representation and path separators in the two predecessor tests that fail on Windows. Cost if wrong: newline representation is not the pinned content-immutability assertion; actual SQL content and importer set remain exact.
9. Installed CLI advisor support was discovered, but its local/linked modes cannot target the approved no-network/no-host-port fixture without selecting another stack or changing the test boundary. Keep the actual local privilege/RLS/immutability negative tests as evidence, without claiming managed advisor coverage. Cost if wrong: generic managed security/performance advisor results are not established.
10. Reviewer declined to judge actual independent model/process execution and initial-context delivery. Ruling: No dispatcher is connected; stored role filtering is delivered, running independent reviewers are not. Cost if wrong: future dispatcher could violate actual context independence.
11. Reviewer declined to judge paid dispatch counts, reservations and spend enforcement. Ruling: Only immutable budget declarations are stored; no paid dispatch exists. Cost if wrong: activation without trusted accounting could overspend.
12. Reviewer declined to judge authenticity/freshness of current git state, source and command/test receipts. Ruling: Fixtures prove persistence contracts, not real provenance. Cost if wrong: activation with synthetic/self-asserted evidence could accept stale or fabricated work.
13. Reviewer declined to judge protected windows worktree and sandbox execution. Ruling: Storage performs no code execution; sandbox remains a prerequisite. Cost if wrong: future code execution could escape its intended workspace.
14. Reviewer declined to judge ready-for-human-review lifecycle enforcement, ui, integration, merge or deployment readiness. Ruling: No ready transition or integration is wired; review evidence alone grants nothing. Cost if wrong: a later caller might incorrectly treat a saved passed report as integration authority.
15. Reviewer declined to judge external transport/caller authentication. Ruling: Operations remain trusted server-internal with no HTTP route. Cost if wrong: future exposure without authenticated caller binding could grant unauthorized access.
16. Reviewer declined to judge compromised database-owner/service-key resistance. Ruling: The owner/service remains trusted; current controls protect normal bounded operations. Cost if wrong: a compromised privileged principal can bypass the intended boundary.
17. Reviewer declined to judge managed supabase security/performance advisors and hosted compatibility. Ruling: Only disposable local PostgreSQL was authorized and exercised. Cost if wrong: hosted schema interactions or advisor findings remain unknown.
18. Reviewer declined to judge exhaustive timing schedules, load/performance and every malformed sql payload. Ruling: Code review, named race tests and targeted direct-RPC regressions are accepted for this increment. Cost if wrong: untested schedules or payloads may expose additional defects.

## Deferred minors

None were found in this independent review. Previously documented Windows host/identity minors belong to the predecessor work and remain outside this storage plan.

## Remaining gates

| Capability | Actual evidence |
|---|---|
| Durable packets/reports/messages, bounded atomic replay and role checks | Implemented, real local PostgreSQL and TS tests |
| Project-scoped operator reads and initial-reviewer message filtering | Implemented and tested |
| Independent running reviewer/model with fresh context | Not connected; a stored role is not model independence |
| External authenticated transport and registered dispatch | Not connected; bootstrap/recovery remain trusted server-internal |
| Runtime cost reservation/spend/dispatch accounting | Budget declarations only; zero cost observations are not actual reservations |
| Current Git/test evidence provenance | Synthetic fixtures only; broker/sandbox receipts still required |
| Protected Windows workspace and real sandbox execution | Separate prerequisite before operational code jobs |
| Lifecycle-ready gate, user status/approval surface | Not connected; existing lifecycle unchanged |
| PR/merge/deploy/integration | Not enabled |

The trusted service/database owner remains inside the security boundary. These controls do not defend against a compromised service key or database owner. The wider repository suite and non-Windows platforms were not established by this focused phase. The predecessor Windows host/identity minor findings remain outside scope. No live-functionality claim follows from these tests.

## Handoff

Next step: prepare the bounded implementation plan for a protected Windows workspace and a real isolated health probe, as required by the approved design. Registered worker/reviewer model dispatch, cost accounting and the lifecycle-ready gate come after their prerequisite evidence. Keep this storage branch local and the worktree intact.

After the durable report commit, remove only .superpowers/sdd/2026-10-18-atlas-review-storage, checking its first-line plan identity before deletion. Preserve sibling workspaces. The high-level Atlas status is synchronized separately in Notion after commit; this report does not expose credentials or sensitive raw data.
