# Live execution lease and local stop guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking. Preserve the already selected Native method: root implements; one fresh independent final reviewer; one material RED→GREEN fix pass; defer minor findings; no second review.

**Goal:** Give the authenticated broker a current, claim-bound, strictly parsed execution-lease observation and a fail-closed local stop signal, without activating sandbox jobs, models, patches or publication.

**Architecture:** Add a purpose-specific SQL/HTTP execution-lease operation over the existing signed broker channel. Its transaction reuses the credential-bearing heartbeat and validates current authorization, broker eligibility and WorkPackage pins before projecting metadata. A separate broker client and monotonic local guard consume that projection; neither imports or invokes the Windows helper.

**Tech Stack:** Existing TypeScript/Next.js broker protocol, PostgreSQL RPC/RLS and Vitest; installed Node/Git/Docker only. No new dependencies.

**Spec:** docs/superpowers/specs/2026-10-18-atlas-first-code-job-design.md, sections Körslinga och modell / Tester, resultat och avbrott; and docs/superpowers/specs/2026-10-18-atlas-independent-review-design.md, sections Budget, stopp och återhämtning / Genomförandeordning. Both existing approved specifications travel with this plan.

## Intent, evidence and scope

André wants Atlas to carry out a bounded code task and have a separate agent review the result before ordinary project code changes. The immediate missing link is current job authority at the broker, not another general permission system. Success for THIS increment is a genuine server-side lease check, an authenticated bounded reply, and deterministic prevention of local progression after authority loss. It is not yet a running code worker.

Read-only baseline verified2026-10-19 after André's12:42:43 Europe/Stockholm continuation: branch codex/atlas-code-worker-design-20261018 clean at dee524ec42c6aefea779144e33b7646fce393988; verified source752fba9. Previous355/355 and actual42/42 are historical evidence, not tests run by this planning step.

Existing operational-client.ts supports discover/claim/recover/heartbeat. The credential-bearing atlas_code_work_heartbeat already locks the run, checks claim/fence/broker/host/token hash, cancellation, authorization and runtime cap, renews at most90seconds, and writes lease_renewed. It does not provide a purpose-specific context projection or an active local stop guard. Existing native helper stdin closes before execution and has no cooperative parent-control stream. The fixed image runner differs from the npm command registry; this plan neither changes that registry nor pretends those invocations are equivalent.

Selected approach: one metadata/stop boundary now, then a separately reviewed cooperative native bridge, then worker/reviewer/model/evidence integration. Alternatives rejected: wrapping the current helper with child.kill (can skip graceful cleanup), and combining model/patch/native activation in this increment (too many independent authority boundaries). The approved overall design and selected method are retained; no new feature-design approval is needed to write this plan. This new written implementation plan still needs review before code changes.

## Global Constraints

- Existing job maxima: two worker iterations, eight changed files,131072diff bytes,1200seconds total,300seconds per registered command; no relaxation.
- Independent review limits remain two sessions,three dispatches/session,twelve4096-byte messages,65536-byte review context,32768-byte result. No reviewer/model dispatch is implemented here.
- No paid Omnira model call, subscription change, dependency installation, image pull/build, production DB/migration, push, merge, PR creation, deploy or operational CLI command.
- No sandbox create/start/upload, host code execution or project-code writes by the product. No new real worktree; retain existing c435e423 proof and native attempt tombstones.
- Metadata API is disabled by default under ATLAS_CODE_WORK_EXECUTION_LEASE_ENABLED; require exact string "true" to enable. Its client/guard have no operational caller. Missing flag gives generic503/no-store without DB access; local handler tests explicitly enable it.
- Never edit historical migrations, command registries, frozen image/runner/profile or the previous proof. Add one new migration file; apply it only to this increment's own temporary PostgreSQL test environment.
- Raw claim token remains in memory/request only, never logs/receipts/response/SQL. SQL receives only brokerClaimTokenHash(workId,token).
- Serial signed request counters belong to one broker-wide owner. New client accepts an allocated counter; guard receives nextCounter from that owner. No implicit reset, parallel independent counter source, credential recovery or mutation retry.
- Preserve the current Native method and one independent final review. Planning self-review is inline; do not dispatch planning subagents.
- Plan scratch: .superpowers/sdd/2026-10-19-live-execution-lease, with matching progress.md identity; never recreate/delete predecessor scratch. Git-backed report/evidence and native/real proof remain after this scratch is removed.

## Review Focus

1. A valid old claim reply arrives after cancel, a newer refusal or a stopped guard: it cannot restore local liveness or change job/pins. Task2 strict parsing and Task3 deferred-response tests.
2. Authorization, broker eligibility or WorkPackage pins change between authentication and use: SQL must serialize the relevant observations; a changed/missing parent cannot yield a lease. Task1 guards and Task4 real SQL races.
3. Wall clock jumps, suspension or a slow/hung body make an expired reply look fresh: use conservative monotonic elapsed time, streaming bounds and an end-to-end deadline; no positive window from a late reply. Task2/3 timed tests.
4. Two local operations consume counters concurrently, or a lost reply triggers recovery/replay: one inflight guard refresh, caller-owned ordered counters, immediate stop on ambiguous failure and no auto-retry. Task2/3 tests.
5. A caller mistakes lease metadata for code permission or replaces the fixed command/profile: no runtime imports, new CLI, raw file context, model call, command registration, publication or ready-state transition exists here. Task4 AST/importer and route boundary tests.

## File map and exact contracts

Create server files:
- apps/web/lib/atlas/code-broker/execution-lease/{types,projection,store,service,handler}.ts
- apps/web/app/api/atlas/code-work/broker/execution-lease/route.ts
- apps/web/supabase/migrations/20261019110000_atlas_code_work_execution_lease.sql

Create broker files:
- apps/code-broker/src/protocol/{execution-lease-contracts,execution-lease-client,bounded-json}.ts
- apps/code-broker/src/runtime/execution-lease-guard.ts

Create QA:
- apps/web/lib/qa/sdf-execution-lease-{projection,http,client,guard,sql,boundary}.test.ts
- apps/web/lib/qa/fixtures/sdf-execution-lease-fixtures.ts
- apps/web/lib/qa/fixtures/sdf-execution-lease-postgres.ts
Modify no operational consumer. Existing principal/heartbeat/response-order/admission/path validators are reused; their public behavior stays fixed.

HTTP POST path is exactly /api/atlas/code-work/broker/execution-lease, no query. Request is the exact four-key heartbeat body {workId,claimId,fence,claimToken}, <=1024UTF8 bytes/depth4, rejecting unknown/missing/duplicate decoded keys and invalid UTF8. It may name no broker/host/project/repo/base/policy/path/command. Authenticate the EXACT raw body with authenticateBrokerRequest before semantic DTO parsing. Reject non-POST/query paths and always Cache-Control:no-store. Generic failures only:503 disabled/unavailable,413 bound,400 invalid_request,401 broker_auth_rejected,409 lease_not_live; no underlying SQL error/credential/body echo.

Success is exactly {ok:true,lease:ExecutionLeaseV1}. Failure is exactly {ok:false,error:<one closed code>}; non-2xx can never be parsed as success.

ExecutionLeaseV1 exact keys:
- schema:"atlas.code_work_execution_lease.v1"
- binding:{workId,repositoryId,pinnedBaseSha,admissionHash,claimId,fence}, identical canonical value constraints to the existing workspace binding.
- projectId:canonical UUID.
- authorityPins:{missionId,missionVersion,missionHash,delegationEnvelopeId,delegationHash,workPackageId,workPackageHash}; UUID ids,positive safe missionVersion,lowercase64hex hashes.
- state:claimed|preparing|working|testing; stateVersion:positive safe integer.
- serverNowMs,leaseUntilMs,authorizationExpiresAtMs,runtimeExpiresAtMs:nonnegative safe integer UTC epoch milliseconds. Every expiry>serverNowMs; leaseUntilMs<=both other expiries; remaining lease<=90000ms.
- productionAuthority:false.

No raw admission, source, objective, files, credentials, reviewer session, worker self-report or caller-selected scope leaves this endpoint. A lease confirms only this bound claim's currently observed mandate; it neither changes that mandate nor proves local HEAD, current target ref, file containment, model budget, test success or publication authority.

SQL function:
public.atlas_code_work_execution_lease(p_work_id uuid,p_claim_id uuid,p_fence bigint,p_broker_id text,p_broker_host_id text,p_broker_token_hash text) returns jsonb; security definer,set search_path=''; revoke PUBLIC/anon/authenticated,grant only service_role; all introduced helpers private/ungranted.
Lock order for this transaction: atlas_authorizations SHARE table lock; run FOR UPDATE; matching broker FOR SHARE; matching manager_tasks WorkPackage FOR SHARE. This follows the existing review parent/live order. Existing broker revoke locks only broker/enrollment, not run. Bound statement/lock timeouts to3seconds; failed/deadlocked/unavailable checks produce no lease and are not retried automatically.
Before heartbeat: verify active/unexpired broker, exact host/allowed repo and the full claim tuple/hash. Require live run/token expiry and no terminal/cancel. Re-read the current WorkPackage row matching project,id/hash,mission id/version/hash and delegation id/hash; validate its stored JSON pins, action/tool, read/write attenuation and denials against immutable admission with the existing resource grammar. A changed package, action, scope or pin fails even if an Authorization grant remains.
Call the existing six-argument heartbeat INSIDE these locks. Its settled cancellation/timeout row is NOT success. Recheck active state/claim/expiries, compute admission hash with the canonical SQL function and project only ExecutionLeaseV1 using one final clock_timestamp. Refusals never publish a raw run. Heartbeat may record its existing lease_renewed receipt; do not invent a new evidence class, state progression or ready result.

Server functions and internal dependencies:
ExecutionLeaseStore has read(input:{workId:string;claimId:string;fence:number;brokerId:string;brokerHostId:string;brokerTokenHash:string}):Promise<unknown>. createExecutionLeaseStore():ExecutionLeaseStore in store.ts maps only these six fields to the new RPC through createAdminClient; no raw token or caller-supplied RPC name. ExecutionLeaseDeps={store?:ExecutionLeaseStore}. ExecutionLeaseHandlerDeps={enabled?:()=>boolean;auth?:Parameters<typeof authenticateBrokerRequest>[2];service?:typeof executionLeaseForBroker}; actual route supplies none. Internal handler parsing performs fatal UTF8 and duplicate-aware JSON validation rather than borrowing the old lossy parser.
projectExecutionLease(value:unknown):ExecutionLeaseV1|null validates the complete SQL projection with exact keys.
executionLeaseForBroker(broker:StoredBroker,body:HeartbeatBody,deps?:ExecutionLeaseDeps):Promise<{status:'live';lease:ExecutionLeaseV1}|{status:'not_live'}>; derive broker/host from principal, hash token, call only the new RPC; correlate binding work/claim/fence with input, repository with principal allowlist.
handleExecutionLeaseRequest(request:Request,deps?:ExecutionLeaseHandlerDeps):Promise<NextResponse>; actual route uses fixed dependencies and flag; seams internal/test only. Do not add to the old four-operation handler or its parsers.

Broker functions:
parseExecutionLease(value:unknown):ExecutionLeaseV1 throws on any malformed/extra/missing nested field.
readBoundedJsonResponse(response:Response,signal:AbortSignal):Promise<unknown>; <=16384UTF8 bytes/depth8, fatal UTF8 decoding, duplicate decoded-key rejection, bounded stream read and reader cancellation on failure. No reuse of the old unbounded response.json path.
readExecutionLease(ctx:OperationalContext,counter:number,claim:ClaimHandle,signal:AbortSignal):Promise<OperationResult<ExecutionLeaseRead>>;
ExecutionLeaseRead={status:'live';lease:ExecutionLeaseV1}|{status:'unavailable';reason:'request_failed'|'invalid_response'|'lease_not_live'}.
Sign/serialize once with existing canonicalRequestPayload/signer, exact fixed path, existing assertOperationalOrigin, redirect:error, no URL/body selector. Link caller cancellation with a fixed3000ms end-to-end deadline covering signing,fetch,headers,stream and parsing. Refuse every non-2xx success body, wrong work/claim/fence, HTTP mismatch, redirect, invalid envelope and over-bound body. All failures are generic and carry no raw response/token.

Guard:
createExecutionLeaseGuard(input:{claim:ClaimHandle;expected:{projectId:string;binding:ExecutionLeaseV1['binding'];authorityPins:ExecutionLeaseV1['authorityPins']}},deps:ExecutionLeaseGuardDeps):ExecutionLeaseGuard.
Guard exposes readonly signal:AbortSignal, checkpoint():Promise<'live'|'stopped'>, stop():void. Dependencies are monotonicNow:()=>number, wallNow:()=>number (discontinuity detection only), read:(counter:number,signal:AbortSignal)=>Promise<OperationResult<ExecutionLeaseRead>>, nextCounter:()=>number and an internal timer scheduler. No job-selected callback, command, filesystem, native process or model dependency.
Initially no liveness. checkpoint starts/joins one inflight read. Accept only a strictly newer counter and identical expected project/binding/pins, nondecreasing stateVersion and no backwards live-state movement (testing→working is legal). A terminal/refused/ambiguous/malformed read permanently aborts the signal. Every accepted observation supplies a conservative local validity window:
remaining=min(10000,leaseUntilMs-serverNowMs,authorizationExpiresAtMs-serverNowMs,runtimeExpiresAtMs-serverNowMs)-roundTripMonotonicMs-1000.
Require finite positive remaining, measured before request through response validation. A monotonic deadline/timer enforces expiration; refresh every5000ms while live, one inflight read. On each checkpoint and completion verify current monotonic time again, so suspension cannot revive a stale timer. Wall clock never lengthens validity: compare elapsed wall time with monotonic elapsed time at every checkpoint/reply/timer; an absolute discrepancy>1000ms, a backwards/nonfinite monotonic observation or nonfinite wall observation permanently stops the guard. This catches suspension even on a clock that pauses during sleep, and clock changes conservatively stop rather than extend a permit. No wall-clock authority, no retry after failure/stop, no restart after stop and no late reply clearing AbortSignal. stop aborts inflight network and disposes timers. A later native bridge must consume signal cooperatively and retain independent cleanup; this guard alone cannot terminate today's native helper or authorize late result publication.

## Task 1: Atomic server projection and authenticated HTTP boundary

**Consumes:** existing heartbeat, authenticated StoredBroker, admission hash/path/WorkPackage grammar. **Produces:** SQL RPC, ExecutionLeaseV1 and server functions above.

- [ ] Write failing projection/http tests: exact projection; unknown/duplicate keys and invalid UTF8; revoked principal; auth before DTO; wrong broker/host/project/repository/claim/fence; cancelled/expired/terminal settlement; removed/changed WorkPackage scope/pins; absent flag makes zero DB calls; no-store and no secret/raw-run fields. For a returned scope mismatch assert status not_live, not a partially usable lease.
- [ ] Run projection/http files and observe genuine missing-contract/behavior RED, not a skipped suite.
- [ ] Implement the one new migration and fixed server modules/route. Use the established lock order and SQL resource_covers logic for CURRENT WorkPackage scopes; no read-then-heartbeat gap or borrowing the review job's budget/config as authority.
- [ ] Run these tests GREEN and web typecheck. Commit Task1. Task4 supplies actual PostgreSQL execution/race evidence; do not label SQL runtime verified yet.

## Task 2: Strict purpose-specific broker client

**Consumes:** Task1 DTO/path and existing OperationalContext,ClaimHandle,canonical signer. **Produces:** fixed signed client, strict local parser, bounded JSON reader.

- [ ] Write client tests first. Assert signed body===sent body; fixed path/origin/redirect policy; counters returned unchanged; false/missing status; duplicate escaped keys; depth9;16384/16385byte bodies; invalid/truncated UTF8; wrong work/claim/fence; claimToken/tokenHash absent in results/errors. Slow signing/headers/body must stop at3000ms and make at most one send. Aborted signing that resolves later must never dispatch fetch.
- [ ] Observe RED, then implement the three protocol files without altering the existing four-operation client.
- [ ] Run GREEN with existing sdf1c2-broker-control-channel.test.ts and broker typecheck. Commit Task2.

## Task 3: Monotonic local liveness and irreversible stop

**Consumes:** Task2 read result and caller-owned serial counters. **Produces:** ExecutionLeaseGuard with the exact interface/timing formula above.

- [ ] Write fake-clock/deferred-read RED tests: initial checkpoint required; one read for two concurrent checkpoints; accepted matching renewal; wrong project/pin/base/admission/fence; backwards stateVersion; stale/equal response counter; wall clock jumps in either direction, advancing-monotonic suspension and paused-monotonic/advancing-wall suspension; roundtrip consuming the entire window; network timeout/503/refusal; external stop during read; late success after stop; expiry during a simulated operation; no timers/read after stop. Assert aborted signal and no later live checkpoint.
- [ ] Include full boundaries: server remaining90000 and roundtrip0 => local9000ms, refresh at5000ms; remaining1000 => stopped; remaining3000 with roundtrip2500 => stopped. Testing→working is allowed without relaxing other pins.
- [ ] Observe RED. Implement guard only; no callback executor, helper/CLI import or production scheduler. Stop is terminal even if a later response claims a longer lease.
- [ ] Run guard/client GREEN and broker typecheck. Commit Task3. State explicitly that native cooperative cancellation is the next increment, not proven by an AbortSignal unit test.

## Task 4: Real SQL negatives/races, closed boundaries and durable handoff

**Consumes:** Tasks1–3; existing review PostgreSQL bootstrap/proposal fixtures as reference. **Produces:** real SQL proof, bounded full gate, final report.

- [ ] Create the owned PostgreSQL fixture and SQL/boundary tests before running the new RPC. PostgreSQL16 must already be cached: fixed installed Docker CLI, observed immutable local image ID, --pull=never,--network=none, no ports/binds, own UUID name/labels, tmpfs PGDATA. No arbitrary ATLAS_SQL_TEST_URL or existing user's DB/container. Missing image/qualification is blocked evidence, never a skip/pull.
- [ ] Bootstrap only test roles/tables and listed canonical authorization/WorkPackage/control-plane/broker/credential/heartbeat migrations, plus the new migration. Seed a synthetic parent through the real derive/propose/authorize/claim boundaries. No actual device enrollment, live Omnira request or saved real proof mutation.
- [ ] Wire tests through a real RPC adapter into executionLeaseForBroker; mock-only DB results do not count as SQL proof. Verify positive projection, zero exported credential, owner/RLS/grants, wrong tuple/token, revoked/expired broker, expired lease, cancelled/terminal job, auth revoke/expiry, changed WorkPackage pins and reduced/denied scopes. Uniform refusal and no unauthorized lease renewal on precheck failure.
- [ ] Race revoke/cancel/scope change with lease retrieval and assert serializable before/after outcomes: a lease may win before a competing committed change, but every subsequent request must fail and the local10second cap still applies. No claim of instantaneous distributed cancellation. Check locks terminate within the bound; no automatic transaction retry.
- [ ] Boundary tests use AST/literal dynamic-import/require search to prove new guard/client have no operational caller; CLI remains generate|enroll|diagnostic; native remains five modes; command registry and frozen runner/profile/source-proof hashes unchanged. No result-publication/ready transition exists.
- [ ] Run the exact fifteen-file gate below with zero failures/skips/zero-test files, broker/web typechecks and git diff --check. Record actual SQL container/image/versions/exits, race outcomes, generic sample reply, current branch/main/proof/resource observations; stop/remove only the owned inspected PostgreSQL container and confirm absence. Each SQL test process owns one instance; keep its exact ID/labels and no daemon-wide cleanup. Repeated gates may create a fresh owned SQL fixture, never replay a source job.
- [ ] Commit Task4, then run required task-done verification against the committed source. Do not rerun the355-test predecessor gate: its deleted scratch receipts are deliberately absent, and no native runtime implementation changed. Previous355/355 and42/42 remain separately historical.
- [ ] Dispatch ONE fresh independent reviewer over implementation BASE..HEAD, both approved specs,this plan,every Ruling and all five Review Focus cases verbatim. Use the already selected capable review model; no implementation subagents. One material RED→GREEN fix pass and the same fifteen-file gate/both typechecks; document minors and every declined-to-judge ruling/cost; no second review.
- [ ] Commit docs/verification/2026-10-19-live-execution-lease.md and machine evidence; update and reread only this Atlas Notion track. Preserve local branch/proof/native tombstones. After durable handoff delete only identity-checked current plan scratch. No push/merge/deploy/live activation.

Exact gate from repo root:
~~~text
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-execution-lease-projection.test.ts lib/qa/sdf-execution-lease-http.test.ts lib/qa/sdf-execution-lease-client.test.ts lib/qa/sdf-execution-lease-guard.test.ts lib/qa/sdf-execution-lease-sql.test.ts lib/qa/sdf-execution-lease-boundary.test.ts lib/qa/sdf1a-code-work-contracts.test.ts lib/qa/sdf1b-code-work-control-plane.test.ts lib/qa/sdf1c-broker-identity-id.test.ts lib/qa/sdf1c-trusted-broker.test.ts lib/qa/sdf1c2-broker-control-channel.test.ts lib/qa/sdf-review-storage-service.test.ts lib/qa/sdf-review-storage-boundary.test.ts lib/qa/sdf-windows-source-boundary.test.ts lib/qa/sdf-windows-workspace-boundary.test.ts --maxWorkers=2 --minWorkers=2
node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
git diff --check
~~~

## Inline self-review and handoff

Coverage: current binding/authority→Task1/4; signed transport/stream limits→Task2; cancellation/freshness/ordering→Task3; real SQL/isolation/no activation→Task4. All five review-focus cases have explicit owning tests. This plan does not change global authority, model pricing/budget, command definitions, native cancellation or production integration; those remain separate later gates.

Keep the existing Native method. The user approved continuing the overall direction; this newly written plan is the concrete artifact to review before implementation. Do not ask them to choose a method again. No implementation/setup/test execution is authorized by this planning document itself.
