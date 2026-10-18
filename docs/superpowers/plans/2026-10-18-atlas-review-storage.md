# Atlas Durable Review Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The already selected Native method is preserved: root implementation, then one fresh independent whole-range review. Steps use checkbox syntax for tracking.

**Goal:** Persist version-bound review packets, separate role sessions, reports and job-scoped messages with atomic replay/stale-write protection, so a later authenticated dispatcher can resume them without inventing history.

**Architecture:** Add a server-only review repository alongside the existing code-work control plane. Existing pure review functions validate bounded aggregates; a purpose-specific PostgreSQL compare-and-append RPC independently checks role credential, current parent authorization/claim, immutable bindings, version and counters under the parent/job row locks. No production caller or model dispatcher is connected in this increment.

**Tech Stack:** Existing TypeScript, Vitest, Supabase/PostgreSQL, Node crypto; cached PostgreSQL 16 Docker image for disposable local tests, existing Supabase CLI. No new dependency.

**Spec:** docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md (approved 2026-10-18 19:57 Europe/Stockholm), supplementing docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md.

## Global Constraints

- This is Plan 2 under the already approved design. Plan 1 is committed through 6af4b1314ae80c3b88b6c8604988de9192bd446a, source through 486c0ed878c79414488bd08b7f59f25380c43966. Verify this ancestry and a clean tree before execution; record the actual execution BASE after this plan is committed.
- Preserve branch codex/atlas-code-worker-design-20261018 and the existing isolated worktree. Do not push, merge, deploy, apply a hosted migration, enroll a broker, install tools, pull images, or call paid model APIs.
- Scope: Omnira, one parent code job, one worker and one reviewer at a time. Reviewer/coordinator identities are server-issued role credentials, not evidence that actual independent processes/models have run.
- Spec limits: two worker iterations, eight changed files, 131072 diff bytes, 1200 seconds total; at most two review sessions, three model dispatches per session, twelve job-wide messages, 4096 UTF-8 bytes per message body, 65536 bytes per review context and 32768 bytes per result. Harsher job limits win.
- Persist at most one snapshot per candidate (1 or 2), one preliminary and one final report per candidate. Result replacement is forbidden. Actual dispatch/session spending enforcement remains a later dispatcher gate.
- Reuse review/{binding,snapshot,result,eligibility,messages}.ts, existing canonical hashes, actual repository identity and command registry. Preserve the test-floor and Windows denied-alias fixes.
- No reviewer grant, ready_for_human_review transition, new receipt class, integration, UI, HTTP route or runtime importer. Existing lifecycle remains unchanged and is not thereby a proven AI-review gate.
- Supabase service key and raw role credentials never enter model context, ordinary DTOs, audit logs or persisted JSON. Only domain-separated SHA-256 token hashes reach storage. Server-only does not itself authenticate a network caller.
- New storage is service-only with explicit revokes from PUBLIC, anon, authenticated and direct service-role DML; RLS on public tables. Mutations only through narrow RPCs. SECURITY DEFINER only where needed for this no-direct-DML pattern, pinned empty search_path, fully qualified objects, explicit service_role EXECUTE grants; private helpers receive no public execute grants.
- Trusted service code is inside the threat boundary. SQL guards do not protect against a compromised database owner/service key. Project reads must also pass resolveProjectAccess/assertProjectAllowed.
- Local test resources must have a plan-owned random suffix/label, no host port, --pull=never, no repository mount, no reuse of an existing container or hosted credentials. Delete only resources created by this test run.

## Research and verified starting points

- Existing adapters: apps/web/lib/atlas/code-work/control-plane/{store,types,principal-read,principal-write}.ts.
- Claim proof: apps/web/lib/atlas/code-work/claim-credential/{claim-credential,claim}.ts; broker authentication: apps/web/lib/atlas/code-broker/principal.ts; control-channel/operations.ts.
- SQL history: 20260819_atlas_authorizations.sql, 20260820_manager_tasks_work_packages.sql, 20260918095827_sdf1b1_code_work_control_plane.sql, 20260923150000_sdf1c1_trusted_broker_identity.sql, 20260924080000_sdf1c1b_broker_claim_credentials.sql, 20260924140000_sdf1c2_broker_control_channel.sql, all under apps/web/supabase/migrations.
- SQL tests already use real disposable databases and concurrent sessions; do not mistake their optional skips for verification on Windows. New tests use Docker psql transport, not a new psql install.
- Windows has cached postgres:16 and node:22-bookworm images; no psql on PATH. Supabase CLI 2.121.0 was read-only verified at C:/Users/Andre/AppData/Local/npm-cache/_npx/5ed57a240faae6e6/node_modules/@supabase/cli-windows-x64/bin/supabase.exe. Discover --help at execution; use this installed CLI to create the migration filename, never invent the timestamp.
- Official docs checked 2026-10-18: https://supabase.com/changelog (markdown endpoint rejected by retrieval; HTML fallback checked), https://supabase.com/docs/guides/database/functions, https://supabase.com/docs/guides/database/postgres/row-level-security, https://www.postgresql.org/docs/current/explicit-locking.html. Relevant current guidance is explicit function privileges/search_path and row-lock serialization. No new SDK feature is required.

## Review Focus

1. A response is lost after commit: the identical command returns the stored outcome once; changed content with its id conflicts, including after cancellation.
2. Two concurrent writers read the same head: only one new append wins, with no overwritten report, skipped sequence or thirteenth message.
3. Parent cancellation/revocation/fence change races validation: SQL rechecks live state while holding the parent lock before any new write; replay cannot revive execution.
4. Heartbeat extends the broker lease: frozen review identity remains stable, while expired/replaced parent claims still block. Do not hash a renewable lease timestamp into a frozen assignment.
5. A worker tries to read first-assessment context or submit a reviewer result using its own credential: role-filtered reads and role-bound writes refuse it; raw secrets cannot escape through operator reads.

## File map and shared interfaces

Create under apps/web/lib/atlas/code-work/review/storage/:
- types.ts: closed stored aggregate, append commands, proof/credential and result types.
- prepare.ts: pure derivation/validation of a proposed append from stored state; no client-supplied ExpectedReviewContext.
- credential.ts: server-only random role credentials and domain-separated hashing.
- store.ts: server-only adapter for purpose-specific RPCs.
- service.ts: server-only bootstrap and role-bound append/read service.
- principal-read.ts: authenticated project-scoped operator projection.
Create QA fixtures/sdf-review-storage-fixture.ts, fixtures/sdf-review-postgres.ts and suites sdf-review-storage-{prepare,sql,service,flow,boundary}.test.ts.
Create one CLI-generated atlas_code_review_storage migration; record its actual path in the ledger and final report.
Modify sdf-review-boundary.test.ts only to recognize the newly planned storage consumers; preserve its ban on operational callers and the pure-module import allowlist.

Shared types defined in Task 1:
- ReviewRoleCredential = { token:string }; RoleCredentialHash is a 64-lowercase-hex string. Raw credentials are response-only fields for the trusted dispatch caller; ordinary operator/role views never contain them.
- ParentReviewProof = { workId:string; claimId:string; fence:number; brokerId:string; brokerHostId:string; brokerTokenHash:string }. Internal only; never model input or operator output.
- StoredReviewJobV1 = { workId; projectId; version:number; config; candidates; messages; commands }. Config stores validated admission/hash, parent proof identity (excluding token hash), fixed requiredChecks/limits/budget declaration/deadline/targetHeadSha, coordinator and worker identities. Candidates contain version, distinct reviewer assignment and immutable snapshot, plus preliminary/final result or null. Messages is AgentMessageLedgerV1. Commands is the bounded replay index.
- ReviewStorageCommand = discriminated union:
  freeze { id:string; kind:'freeze'; snapshotInput:ReviewSnapshotInputV1 };
  report { id:string; kind:'report'; candidateVersion:1|2; result:ReviewModelResultV1 };
  message { id:string; kind:'message'; candidateVersion:1|2; recipientRole:ReviewRole; body:AgentMessageBodyV1 }.
  Sender, phase, assignment, context, timestamps, sequence and authority pins are never body choices.
- CommandResult = { outcome:'appended'|'replayed'; jobVersion:number; commandId:string; productionAuthority:false }.
- PrepareResult = { expectedVersion:number; commandId:string; commandHash:string; next:StoredReviewJobV1; outcome:'appended'|'replayed' }.
- Store outcomes are ok/replayed/conflict/not_live/not_permitted/unavailable. The bootstrap config carries admission/target/check/limits/fixed budget/deadline declarations from trusted server code; it is not a user request and is validated against the locked parent admission. There is no source of actual spent/reserved money yet: no spend or reservation is asserted. Preparation uses zero observations only in this execution-disabled increment, and later activation must replace them with trusted accounting.
- No raw SQL error detail or existence distinction leaves the service.
- Aggregate storage ceiling is 1048576 canonical UTF-8 bytes, checked before copying/SQL commit; the existing per-artifact/context/result/message ceilings remain stricter. Commands store hashes/receipt metadata only, not duplicate report bodies.
- CommandReceipt = {id:string;kind:'freeze'|'report'|'message';role:ReviewRole;actorId:string;sessionId:string;candidateVersion:1|2;commandHash:string;jobVersion:number}. Derive the logical hash from the full closed command plus assigned role/actor/session under domain atlas.code_review_storage_command.v1.
- Replay index ceiling is 18 successful commands: two freeze + four report + twelve message. Rejected attempts consume no replay slots. Same id is unique for the whole job and hash binds kind, body, role/session and candidate; no timestamp in the logical command hash.

## Task 1: Define validated storage preparation and role credentials

**Files:** storage/{types,prepare,credential}.ts; fixtures/sdf-review-storage-fixture.ts; sdf-review-storage-prepare.test.ts.
**Consumes:** existing buildReviewSnapshot, bindReviewResult, appendReviewMessage and structural/live validators.
**Produces:** validateStoredReviewJob(input:unknown):CodeWorkValidation<StoredReviewJobV1>; prepareReviewAppend(job:StoredReviewJobV1, command:unknown, actor:{role:ReviewRole;actorId:string;sessionId:string}, observation:{nowMs:number;parentLive:boolean}):CodeWorkValidation<PrepareResult>; issueReviewRoleCredential(workId:string,role:ReviewRole,sessionId:string,random?:(n:number)=>Buffer):{credential:ReviewRoleCredential;tokenHash:string}; hashReviewRoleCredential(workId:string,role:ReviewRole,sessionId:string,credential:unknown):string|null.

- [ ] Write failing tests for missing preparation module; assert closed commands reject extra identity/context fields, malformed input and role mismatch. Worker cannot freeze/report; atlas alone freezes, reviewer alone reports; messages follow existing role rules.
- [ ] Add exact replay tests: same command id/body/role/session yields replay even when parentLive=false; changed body, kind, candidate or actor conflicts. Lookup replay only after role credential authentication at the service/SQL boundaries.
- [ ] Add first-assessment tests: report phases progress null->preliminary->final, no second preliminary/final; no messages to reviewer before a preliminary report through any sender, not only worker. Final closes candidate discussion. Candidate 2 requires candidate 1 final changes_requested, a changed snapshot and a new reviewer session; no candidate 3 or reopen.
- [ ] Add immutable assignment test for Review Focus 4: review assignment has a NEW server-issued review claim id and fixed expiry <= job deadline/authorization expiry, separate from renewable parent broker claim. Heartbeat extension alone does not change snapshot/assignment; parentLive=false still rejects new append. Do not change Plan 1 DTO semantics or recycle the broker's renewable expiresAt.
- [ ] Run prepare suite; observe RED for absent behavior, not a syntax or fixture failure.
- [ ] Implement closed types, complete stored-aggregate validation and bounded copying with the existing validators. Stored role bindings/config supply context; current time/live flag is a trusted observation for preparation only, not proof that the SQL transaction can skip its own checks.
- [ ] Implement 32-byte cryptographic random tokens with versioned base64url syntax and role/work/session domain-separated hashes; tests verify wrong role/session/work, malformed tokens, and that tokenHash contains no raw credential.
- [ ] Run prepare suite GREEN; commit only Task 1 files.

## Task 2: Persist atomic review aggregates in real PostgreSQL

**Files:** CLI-generated migration; fixtures/sdf-review-postgres.ts; sdf-review-storage-sql.test.ts.
**Consumes:** Task 1 persisted types/command hashing, existing canonical SQL/hash/authorization functions and parent tables.
**Produces:** service-only RPCs atlas_code_review_initialize(p_work_id uuid,p_parent_proof jsonb,p_config jsonb,p_roles jsonb), atlas_code_review_read(p_work_id uuid), atlas_code_review_apply(p_work_id uuid,p_role text,p_session_id text,p_token_hash text,p_expected_version bigint,p_command jsonb,p_command_hash text,p_next jsonb,p_new_reviewer jsonb). All return jsonb. p_roles contains server-issued atlas/worker identity/session/credential hashes only; candidate reviewer credentials arrive in the validated freeze delta.

- [ ] Discover installed CLI help and run migration new atlas_code_review_storage with --workdir apps/web; record actual generated filename. No hosted connection or migration push.
- [ ] Build owned Docker fixture using cached postgres:16, --pull=never, no host ports/mounts. Execute psql through docker exec -i with ON_ERROR_STOP=1 and stream SQL via stdin; never shell-interpolate SQL or print secrets. Per-test databases/roles and concurrent exec sessions are allowed only inside this container.
- [ ] Fixture applies the actual predecessor SQL history listed above, creates minimal project/agent/task fixtures following sdf1c2-broker-control-channel-sql.test.ts, and creates a live authorized claimed parent using the real RPCs. Fail if ATLAS_REVIEW_SQL_REQUIRED=1 and Docker/DB is unavailable; no skipped required SQL cases.
- [ ] Write SQL RED tests for absent tables/RPCs. Then create public.atlas_code_review_jobs (one bounded aggregate row/work, version and immutable config) plus private role-credential rows; revoke direct DML and enable RLS. Public read RPC is service-only and never returns credentials.
- [ ] Implement initialize as an internal server bootstrap: verify authenticated broker identity/status/host/repository and exact broker claim token hash under the parent lock; synchronize existing Authorization V1; require nonterminal live parent, no cancellation, live runtime/lease and matching admission/work/project. Server-issued fixed config/roles must be closed, distinct, bounded and immutable. Exact retry with same init contents is idempotent, changed config conflicts; never return raw credentials from SQL. Initialize reserves only atlas/worker identities and hashes; reviewer identities/hashes are added atomically at freeze as Task 3 specifies. All parent-proof hash checks use the existing stored credential format, not a new hash of that hash.
- [ ] Implement apply with a single lock order: parent run -> review job -> role credential. Recheck live broker/host/repository, effective authorization, current parent claim/fence/lease, cancellation, runtime and review deadline in this transaction. The role credential must match role/session/work/assignment and not be revoked; a parent proof is not a reviewer credential.
- [ ] Authenticating a retained role credential permits an inert exact replay after parent stop; it never permits a new append. Revoked credentials cannot retrieve a replay. Then compare expected version; apply only version+1 with one matching command receipt. Verify immutable prefix/config, exact permitted delta, role restrictions, <=2 candidates, <=2 reports/candidate, <=12 messages, contiguous sequence, <=18 command receipts and byte ceilings. Recompute the command hash from closed p_command plus authenticated stored role/actor/session; derive command id/kind/candidate from it and match the single delta and new receipt. Recompute canonical aggregate pins with actual stored JSON; never trust a client-provided phase or counter.
- [ ] SQL guards must enforce phase/order/role/limits independently of TypeScript; semantic artifact validation stays in trusted prepare code. Direct service-role DML, update/delete/truncate history, helper execution by anon/authenticated, and unknown JSON keys must fail. No broad predecessor grants or policy edits.
- [ ] Add Focus 1-3 races: two same-id commits produce one effect; different-id same-version yields one winner/one conflict; two competing twelfth messages never create a thirteenth. Race revoke/cancel/fence replacement against append; the serial order must leave no later successful append. Stop/replay does not change parent lifecycle or job version.
- [ ] Run required SQL suite GREEN with no skips; record counts, actual image and resource cleanup. Commit migration, fixture and tests.

## Task 3: Connect trusted server preparation, role writes and project reads

**Files:** storage/{store,service,principal-read}.ts; sdf-review-storage-service.test.ts; boundary tests.
**Consumes:** Tasks 1-2, createAdminClient, resolveProjectAccess/assertProjectAllowed, existing broker principal/claim conventions.
**Produces:** createReviewStorageStore(db?):ReviewStorageStore with initialize/read/apply methods matching Task 2; initializeReviewStorage(input:{parentProof:ParentReviewProof;config:unknown},deps?):Promise<{status;job:StoredReviewJobV1|null;credentials:{atlas:ReviewRoleCredential;worker:ReviewRoleCredential}|null}>; applyReviewStorageCommand(input:{workId:string;role:ReviewRole;sessionId:string;credential:unknown;command:unknown},deps?):Promise<{status;result:CommandResult|null;reviewerCredential:ReviewRoleCredential|null}>; readReviewStorageForOperator(projectId:string,workId:string,deps?):Promise<{status;view:ReviewOperatorView|null}>; readReviewStorageForRole(input:{workId;role;sessionId;credential},deps?):Promise<{status;view:ReviewRoleView|null}>.

- [ ] Write RED service tests with injected store/auth/clock/random dependencies, including denied project returning no data, malformed credential, wrong role/session and lost DB response.
- [ ] Initialization is a trusted SERVER INTERNAL operation, not a user/network DTO. It mints pairwise distinct actor/session ids and credentials for atlas/worker plus each candidate's reviewer at freeze time; never accept identities/hashes from model text. Worker/coordinator are job-wide, reviewer credentials are candidate-scoped. Store reviewer hashes before accepting that candidate atomically; extend initialize/apply role insertion within the same RPC, never a separate partial write.
- [ ] Define the reviewer role creation delta in types.ts and RPC apply (separate SQL-only argument p_new_reviewer jsonb; no raw token or credential hash inside snapshot/aggregate): atlas freeze may atomically add exactly one fresh reviewer assignment+credential hash for that candidate. Freeze cannot reuse another role/session; failed/conflicting freeze persists no credential. Raw reviewer token is returned only to the trusted direct bootstrap/dispatch caller, never to the worker. Freeze snapshotInput is internal evidence input: service constructs its binding/assignment from stored config and fresh issued identities, rejects caller-supplied identity conflicts, and hashes the resulting internal command for storage.
- [ ] Implement adapter projections/error mapping, no generic table upsert. Service authenticates credentials, loads stored aggregate, calls Task 1 prepare, then CAS RPC. No blind conflict/timeout retry: return conflict/unavailable so a caller can reconcile by command id; exact caller retry is safe.
- [ ] Add internal recoverReviewRoleCredential(input:{parentProof:ParentReviewProof;role:ReviewRole;sessionId:string},deps?):Promise<{status;credential:ReviewRoleCredential|null}> for a lost issuance response. RPC atlas_code_review_rotate_credential(p_work_id uuid,p_parent_proof jsonb,p_role text,p_session_id text,p_new_hash text) authenticates the live parent broker proof and matching active assignment under the same parent/job/credential locks; it replaces only that role hash, revoking the previous token, without changing job version, snapshot, counters or identity. Never recover a stopped/stale/revoked assignment. This operation is trusted coordinator-only, with no network route. Test lost initialize/freeze responses, successful recovery, old-token refusal, concurrent rotation leaving only the last token live and no duplicate append/dispatch. A later dispatcher must reconcile uncertain model dispatch separately before any retry.
- [ ] Keep role tokens separate from StoredReviewJob/CommandResult and explicit read DTOs. The live role reader authenticates through a purpose-specific SQL role-read path (not the operator read RPC); add atlas_code_review_read_for_role(p_work_id,p_role,p_session_id,p_token_hash), applying the same stored role proof and first-assessment filtering in SQL.
- [ ] Review Focus 5 tests: reviewer initial view includes original brief/source/diff/check artifacts, excludes worker messages and explanations; worker cannot read reviewer-only material or write a report. After saved preliminary, reviewer may read directed messages for its own candidate. Role views never return command replay metadata, other credentials or an unrelated candidate. Operator view requires project access and can see reports/log for that work.
- [ ] Update existing structural boundary test only for these new storage consumers; still no routes/runtime/UI imports. Add AST tests that service/storage exports cannot be imported by client code and no model, broker execution, lifecycle transition or provider dispatch is called.
- [ ] Run service/prepare/boundary tests GREEN and web typecheck; commit Task 3.

## Task 4: Prove restart/replay flow and finish the increment

**Files:** sdf-review-storage-flow.test.ts; docs/verification/2026-10-18-atlas-review-storage.md.
**Consumes:** actual Task 3 service through a narrow real-PostgreSQL fixture adapter, not a mocked transaction.
**Produces:** verified persistence/recovery increment, local commits and report.

- [ ] Add full real-DB flow: initialize -> freeze candidate 1 -> save preliminary -> directed question/answer -> final changes_requested -> freeze changed candidate 2 with fresh reviewer -> final passed after its own preliminary. Recreate service/store between calls, proving persisted state is sufficient. Operator projection keeps reports and old messages visible; role reads stay filtered.
- [ ] Prove packet mutation, stale base/admission/policy/check floor, wrong project/session/fence, duplicate conflicting command, missing artifacts, stale candidate and late stopped result all fail closed. Record Git/test authenticity as still deferred, not proven by fixture data.
- [ ] Run five new storage suites plus the six Plan 1 review suites and predecessor TS suites sdf1a-code-work-contracts, sdf1b-code-work-control-plane, sdf1b-control-plane-boundary, sdf1b2-code-work-operator-plane, sdf1c-broker-claim-credential, sdf1c-broker-identity-id, sdf1c-trusted-broker and sdf1c2-broker-control-channel. Use npm exec --workspace=apps/web -- vitest run <exact named lib/qa/*.test.ts paths> --maxWorkers=2 --minWorkers=2; ATLAS_REVIEW_SQL_REQUIRED=1 must make new SQL/flow tests run, with no required skips. No full-repository or paid CI run.
- [ ] Run node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false and broker equivalent with apps/code-broker/tsconfig.json; verify actual exit codes. Run git diff --check and inspect scope.
- [ ] One fresh independent whole-range review on the most capable available model, preserving Native method. Supply spec, plan, exact BASE/HEAD, tests, all rulings and deferred operational boundaries. Critical/Important: one fix pass, each observed RED->GREEN plus green focused gate; minors documented, no repetitive re-review.
- [ ] Report exact tests/typechecks/review, local schema/resource cleanup, replay/race evidence, all rulings and remaining gates. Commit locally; preserve branch/worktree. Delete only this plan's owned scratch ledger after durable report commit.

## Self-review and handoff boundary

Coverage: immutable available evidence, version-bound roles/results, append-only directed communication, project reads, stop/race/restart/idempotency are this increment. Model/session execution, actual initial-context independence, paid dispatch reservations/spend, Windows protected worktree/sandbox, current Git/test provenance, lifecycle-ready gate, UI and integration remain future plans. No operational code job is enabled.

The stored budget is a fixed declaration, not an actual reservation. Because no model dispatch is wired, this increment cannot spend. Future activation must attach trusted cost accounting and target-head evidence; self-consistent fixture data does not establish these facts.

The new review assignment claim is separate from the renewable broker lease. Fixed assignment expiry and parent lease are checked together; copying each heartbeat expiry into an immutable snapshot would unnecessarily invalidate reviews.

Server role credentials authenticate a stored role at this internal boundary. They do not establish independent machines/models, and no HTTP transport exposes these operations. Host/broker authentication remains a future caller prerequisite, not a client-supplied principal object.

Task 1 owns shared type/signature definitions, Task 2 the atomic database contract, Task 3 actual server access/projection, Task 4 cross-layer proof. Candidate-2 creation and reviewer credential insertion are part of a single freeze transaction, not independent writes. Test transport is owned/local and cannot silently fall back to production.

Self-review: no product edit or migration has been started by this plan. Written plan review precedes execution; Native remains selected. The approved spec already covers this scope, so a second design-approval cycle is unnecessary.
