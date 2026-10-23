# Cross-tree migration replay inventory — 21 October 2026

This is a **local diagnostic inventory** at draft PR #504. It is not a
production migration plan, a repaired Supabase ledger, or proof that all SQL
replays. The local runner starts with `packages/db/full_schema_run_in_supabase.sql`,
then applies the canonical `apps/web/supabase/migrations` tree. The second
`supabase/migrations` tree contains 38 SQL files. The table pins their exact
bytes so a reviewer can identify what was considered. SHA-256 is for
provenance, not an endorsement to execute every file.

**Latest result:** `--mode=legacy-cross-tree-replay` passed on Hultgren's
isolated PostgreSQL 17.11 fixture: base schema, all 151 canonical web SQL
files exactly once, and 10 selected, byte-pinned root SQL files. The fixture
had no network, no published ports, and cron job launching disabled. Its owned
container was removed after the run. This establishes local SQL execution on
an empty synthetic database, not production data migration or role parity.

**22 October rerun:** After Docker Desktop recovered, the same isolated mode
with `--with-schedule-worker-replay` passed on PR #504's current commit. The
runner reported `CROSS-TREE APPLICATION WORKER PASS` and `CROSS-TREE REPLAY
PASS`. A separate Docker inspection confirmed that its named container no
longer exists. The worker used fake image bytes, a synthetic credential and
a fake Meta response; the fixture still does not prove a deployable role or
contact a real provider.

**22 October RPC boundary probe:** A second `NOLOGIN NOBYPASSRLS` role is
created only in a rollback transaction. Six scheduled worker RPCs are wrapped
as `SECURITY DEFINER` functions and granted to this role. The original bodies
are inaccessible under fixture names. The probe
checks that it has no direct INSERT, UPDATE or DELETE grants on the relevant
job, publication, event, project or token tables, cannot SELECT platform
tokens, and receives a permission error on a direct job UPDATE. It then
exercises receipt, peek, claim, authorize, prepare, claim-create and recovery
against a synthetic approved job through RPC. This is a SQL privilege
experiment, not a reviewed definer API, JWT identity or provider receipt
authentication. All role, function and data changes roll back.

The first RPC-only version accepted a caller-supplied `projectIds` array in
`claim` and `peek`. With elevated functions, that would let the caller select
another project's jobs despite lacking direct table grants. The revised
rollback probe seeds a principal-to-project scope table as the privileged
fixture owner; the RPC role cannot read or edit it. Wrappers read the `sub`
claim from the request and check each requested project or the job's project
before invoking the original body. A second synthetic project is rejected by
the first subject's `claim` and `peek`, while the allowed project's claim to
recovery path still passes. A missing subject is denied. This is a synthetic
mapping, not a deployed identity issuer. A deployable design must protect
signing keys, bind the subject to a trusted server principal, audit every
callable function and verify the production Data API boundary.

**22 October HTTP replay:** `--with-schedule-http-role-replay` replayed the
same full schema, then started cached PostgREST and Node images alongside
PostgreSQL on an owned, Docker-internal network with no published ports. A
short-lived synthetic JWT mapped through a temporary `authenticator` grant
to the test role. Two signed subjects share that role but map to separate
projects in the test scope table. Real PostgREST rejected the first subject's
foreign-project `claim` and `peek`, the second subject's receipt for the
first project's job, and a missing subject with SQLSTATE `42501`. The replay
now also checks the second subject against the first project's claimed job at
`authorize_write`, `step` (`prepare`) and `recover_checkpoint`: each must
return HTTP 403 and `SOCIAL_SCHEDULE_PROJECT_SCOPE_DENIED` before it can lock
or change the job. It also
rejected direct table POST and the inaccessible unchecked claim function,
while accepting allowed-project `peek`, `claim` and `receipt`. The SQL
transaction probe separately covered prepare, create and recovery. The HTTP
fixture used synthetic rows and tokens only; it did not
exercise a production signing key, real server identity, media/credential
clients, a provider response, or live Supabase. The runner removed its three
owned containers and internal network after the pass.

**22 October application HTTP replay:** The optional
`--with-schedule-http-worker-replay` flag extends the HTTP role probe after
requeuing its synthetic job. It runs the actual TypeScript `runScheduleTick`
with the Supabase JavaScript client's `rpc` method and custom test transport
calling Docker-internal PostgREST using the scoped role's synthetic JWT. The
media bytes, credential and Meta response are fake. The run reported
`CROSS-TREE POSTGREST APPLICATION WORKER PASS`
and `CROSS-TREE REPLAY PASS`; the job reached `published`. This closes the
local application-to-Data-API execution gap in the fixture. It does not bind
project scope to a trusted deployed identity, authenticate a provider
receipt, exercise live media or token access, or switch the production worker
from `service_role`. The fixture and its internal network were removed.
The rerun with the Supabase client passed `tsc --noEmit` and the full replay.

**Callable function inventory:** The HTTP fixture reads PostgreSQL's actual
function privileges after the test role is installed. It found 40 executable
functions in `public`: 32 return `trigger`, six are the scheduled worker's
`SECURITY DEFINER` RPCs, and two are `SECURITY INVOKER` text-to-integer rank
helpers (`action_phase_rank`, `media_job_state_rank`). The two helper bodies
are immutable SQL `CASE` expressions with no table access. The replay checks
the exact six RPCs, two helpers and trigger count, and fails if the surface
changes. This catalog check alone does not audit the six definer bodies
or their transitive calls; it is a regression guard, not a production grant
review. The full cross-tree HTTP role replay passed with the expanded
assertion on 22 October.

**Media and credential read boundary:** The same scoped role has no direct
`SELECT` privilege on `public.assets` or `public.platform_tokens`. The replay
checks those privileges in PostgreSQL and rejects HTTP GETs for both tables
through real PostgREST, while its authorized scheduling RPCs still work. This
does not exercise Storage signing, media bytes, credential resolution or an
actual split of the server keys. The production scheduled API still creates
two admin clients with the same `service_role` key, and the credential
resolver accesses its own privileged path; their separation remains a
deployment prerequisite.

**Scheduled RPC body review:** The six wrappers check the trusted fixture
subject against every requested project (`claim`, `peek`) or the persisted
job's project (`authorize_write`, `step`, `receipt`, `recover_checkpoint`)
before invoking the elevated original. The original `claim` filters candidate
jobs by the checked project IDs, while `peek` applies the same filter to its
read. `receipt` reads a job, its linked publication and the snapshot;
`authorize_write` locks the claim and reads scheduling authority. `step`
locks the claim, updates only its linked publication and job, and inserts
their events; recovery locks the same job and publication and may move an
incomplete provider attempt to `uncertain`. Both write paths call the signed
source gate for the job's project. Their helper reads include approval,
revision, asset, release evidence and project state. This is a review of the
fixture entry bodies and immediate call path in
`direct-write-gate-worker-integration-probe.sql`,
`direct-write-gate-worker-recovery-integration-probe.sql`, and
`20261018071209_social_schedule_batches.sql`, not a proof of every transitive
function or trigger. The `step` body accepts a caller supplied provider ID
and confirmation action after checking claim/version/state and field shape;
it does not authenticate a Meta receipt. Before deployment, the definer
call graph, all triggered writes, identity issuance and provider receipt
boundary still require review.

## Calendar ACL baseline — read-only comparison

On 21 October, the isolated cross-tree replay queried PostgreSQL's
`has_table_privilege` and `has_function_privilege` for 12 selected calendar
and credential operations. A separate read-only query of production project
`iboepohjwrhtgshrqaol` returned the same result for all 12: `service_role`
has the privilege, while `anon` and `authenticated` do not. All 12 objects
exist in both catalogs. The targets are publication and schedule INSERT/UPDATE,
their event INSERTs, reconciliation-proof INSERT, platform-token SELECT, and
EXECUTE on schedule step, manual publication step, reconciliation inspect,
and reconciliation complete. Production's four inspected functions are
`SECURITY INVOKER`, owned by `postgres`.

This matches the **current broad grant baseline**. It does not establish
that revoking `service_role` is safe. A second local run applied
`direct-write-gate-scheduled-full-role-candidate.sql` inside one transaction.
Its `social_schedule_full_publisher_fixture` gained the inspected schedule
UPDATE, publication INSERT, event INSERT, and schedule-step EXECUTE grants,
without platform-token SELECT. The corresponding `service_role` grants
were absent inside that transaction. The role and all grant changes were
rolled back; the runner confirmed the role no longer existed. The older
manual-step EXECUTE and direct reconciliation-proof INSERT remained granted
to `service_role` in this candidate, so this is a partial boundary. Privilege
checks do not prove that an approved job can complete or that other writers
will continue to work.

The separate `social_schedule_publisher_fixture` candidate also references
`calendar_source_gate_begin_probe(uuid)`, which is not part of the canonical
replay. An additional isolated transaction seeded an owner, project, content
revision, batch, approval decision, and claimed job, then installed the
reviewed source-gate and signed-lock candidates. The gate fixture's
`public.gen_random_bytes` and `public.hmac` qualifiers were adapted to
`extensions`, matching the replay's pinned pgcrypto install. It also granted
the new fixture role EXECUTE on the gate begin function. Direct job UPDATEs
from both `service_role` and the new role were denied; the latter had table
UPDATE but lacked the transaction-bound source proof.

The test then added a synthetic approved launch plan, destination binding,
image asset metadata, content revision and content approval. A temporary
revocation made the canonical `social_schedule_step` `prepare` action fail
with `SOCIAL_SCHEDULE_REVIEW_REQUIRED`. After rolling that revocation back,
`prepare` succeeded under the fixture role, created one requested
publication and one schedule event. A subsequent checkpoint moved the job
to `blocked`. The source revision went from 1 to 4: publication INSERT and
job UPDATE at prepare, then job UPDATE at checkpoint. The job version went
from 1 to 3. All synthetic rows, roles, trigger/function changes and grants
were rolled back. The image was metadata only; no image bytes, provider
request, credential, or provider receipt was involved.

A further savepoint tested the same canonical step with `claim_create`,
then `complete`. A malformed provider ID was rejected; a syntactically
valid caller-supplied ID and Facebook permalink marked the synthetic
publication and job `published`. That branch was rolled back before the
checkpoint test. **This is a demonstrated trust boundary:** SQL validates
the shape of a supplied receipt but cannot establish that Facebook returned
it. The writer credential and the worker's provider response handling must
carry that assurance. Do not describe this test as provider authentication.

The application is not yet wired for this role. The schedule route passes
distinct scheduler and media clients to `runScheduleTick`, but both currently
use the `service_role` key. The earlier full publisher role candidate is
`NOLOGIN`, has no deployable
credential, and revokes the existing service role's job DML and step
EXECUTE. Applying it as-is would interrupt the current worker. The cutover
needs an explicit, server-only writer identity and coordinated worker/SQL
permissions, with the old paths tested before any revocation.

## Observed dependency edges

| Producer | Consumer | Evidence/status |
| --- | --- | --- |
| web `20260520_media_tables.sql` | web `20260520_media_images.sql` | The named files sort in the wrong dependency order; hash-pinned local exception already tested. |
| root `20260601_media_insights.sql` | web `20260602_atlas_bi_foundation.sql` | PostgreSQL first reported missing `media_insights`; the pinned root file let the isolated replay advance. |
| root `20260528_pg_cron_setup.sql` | web `20260614091000_h1p5_runs_claim_id.sql` | PostgreSQL next reported missing `omnira_cron`; the pinned root file let the isolated replay advance. This root file schedules jobs and needs the runner's isolated cron bootstrap. |
| root `20260609_dream_issues_ledger.sql` | web `20260617160200_backfill_dream_issues.sql` | PostgreSQL had reported missing `public.dream_issues`. The pinned root file and the web backfill both passed in the offline fixture. It also backfills from `public.memories` and references `public.manager_tasks`, both declared in the base schema. |
| root `20260603_cron_heartbeat.sql` | web `20260623_150300_atlas_collector_cron.sql` | Previously missing at the seed `INSERT`; the pinned root file creates it and schedules a heartbeat job. Passed with cron launching disabled and network isolated. |
| root `20260609_manager_task_dream_link.sql` | web `20260820_manager_tasks_work_packages.sql` | Adds `source` and `source_key` columns used in a later CHECK constraint. Passed. |
| web `20260829_workflow_instance_core.sql` | web `20260829_workflow_attested_evidence.sql` | Lexical order placed the table alteration before `workflow_evidence` creation. A hash-pinned local order exception passed. |
| web `20260830_workflow_action_binding.sql` | web `20260830_action_failure_model.sql` | Lexical order placed the failure index before `runs.workflow_instance_id` creation. A hash-pinned local order exception passed. |
| root `20260603_durable_runs.sql` | web `20260830_workflow_action_binding.sql` | Adds `runs.max_attempts`, among other run columns/functions and schedules. Passed offline. |
| root `20260602_g1_multitenant_platform_tokens.sql` | web `20260914120300_platform_tokens_project_binding.sql` | Adds `platform_tokens.project_id`; passed with no real credentials in the fixture. |
| root `20260528_pass_a_safeguards.sql` | web `20260831_budget_scopes.sql` | Creates `platform_config`; also has cleanup UPDATEs, which targeted no production rows in this empty fixture. Passed. |
| root `20260602_atlas_growth_account_snapshots.sql` | web `20260914120400_social_account_bindings_the_prompt_evidence.sql` | Creates account snapshots. The later conditional evidence block saw no project/credentials in the fixture, so its live-data path remains unproven. |
| root `20260602_stripe_intelligence_revenue_snapshots.sql` | web `20261002190000_survival_input_epoch.sql` | Creates revenue snapshots before the later trigger and TRUNCATE guard. Passed. |

These edges passed in the local fixture. The root `manager_task_dream_link`
file was not necessary for the June Dream backfill, but proved necessary for
the later August work-package constraint.

## Root file inventory

`fixture` means exercised in the isolated runner; `hold` means **not selected for replay**.
Flags are a static text scan for cron registration, network calls, destructive
DML/DDL, or secret/role text; absence of a flag is no safety guarantee.

| Root SQL file | SHA-256 | Status | Static flags |
| --- | --- | --- | --- |
| `20260520_background_music.sql` | `7c82e72f226c901dfc01757d8f87141951019a95b78928d9605abc4da073f0d8` | hold | — |
| `20260520_render_columns.sql` | `d20eea131d22da77ed8d9911c078fd935b13c20bf3afb5ab2fd9477321f38223` | hold | — |
| `20260521_composition_column.sql` | `45697a7d462328e02b83bb3ac3af767478bdeddfeaebe0f3d7cce283089b4b8f` | hold | — |
| `20260522_evaluation_memory.sql` | `4d65ccfbc36f442252fc960064f1d635acd245e746dd8cb0c3602ccae541afb6` | hold | — |
| `20260522_evaluation_memory_fix.sql` | `773e3ff16a641a4b39b48a7c2508035cb7ff04314b9fbef678fd949ed07d2a11` | hold | delete/drop |
| `20260522_instagram_columns.sql` | `5120f86021749a052b5b943137f50aa6b52c7dc73705cb9697911c0782c56958` | hold | — |
| `20260528_pass_a_safeguards.sql` | `4665ac611487c0d833914c2b2e40de11b2e0433e9ed89d172b9b0e463e4c0c04` | fixture | — |
| `20260528_pg_cron_setup.sql` | `22569e22cd61cef171ad3be914a02d3e7d013a787304ce6904f09a24218d0967` | fixture | cron, HTTP |
| `20260529_comment_replies.sql` | `b7ca35d9faf4fd8de49462114a9408e1e638de0c875d41dc409e83af224b8e3d` | hold | cron, HTTP |
| `20260530_news_items_dedup.sql` | `03bf61045429c669d65ce71224d683b0092fdae634ac01a1396102cc7976f4d0` | hold | delete/drop |
| `20260531_pg_cron_competitors.sql` | `6bd1378905fe40a8a44cca6404903ce2d9209fd0213193648c6d86fd86d24db9` | hold | cron |
| `20260601_briefing_cron.sql` | `9cac5528028be6a9c804d12e8f9acd0f584dd1e6ca4b8436a9f8e757a8ff24a8` | hold | cron |
| `20260601_business_metrics.sql` | `db527f4a5e1749ff2b5db63a8514c2a44eb201c31badb7cd1ec0360511f8a035` | hold | — |
| `20260601_insights_cron.sql` | `5f955734a29463131853e00b4546eb3df9146259bb5c658d992619f7458f2c9b` | hold | cron |
| `20260601_media_insights.sql` | `b3cad2590764175d104db1f6f62a48b2b63915e95fc3f0ee4020233e2ee941dd` | fixture | — |
| `20260602_atlas_growth_account_snapshots.sql` | `f035e5ff0e1b03d85a61463da8f1f0398445545544abf748d07beeee55617bb9` | fixture | — |
| `20260602_atlas_growth_opportunities.sql` | `a1f5c3d0b2246606f40dba90a43c20dd19e43ecd87aa2bcb40e20d1e1c3f40a8` | hold | — |
| `20260602_atlas_growth_script_topic_format.sql` | `0eb5d380aba51e0ecabbe9fa8e2c846c5fd4d553fa634cd973e077bc69504e51` | hold | — |
| `20260602_g1_multitenant_platform_tokens.sql` | `88a3f8e1f95cf3334dbedc11edb924a316d630ea52f7d47458665766db712d98` | fixture | — |
| `20260602_stripe_intelligence_revenue_snapshots.sql` | `941d578548f895e5087c201502bcc34c8cf9e8b90f422d7b35dbcffc764e833e` | fixture | — |
| `20260603_cron_heartbeat.sql` | `f3c28dcd9bd031098bed10f86817f7e4bb55d5b03193199e102ffeae9bcbd831` | fixture | cron, secret/role |
| `20260603_durable_runs.sql` | `a189659945447189022e96bb8a26a5cb4e0e26fb321c9f56a02d0b6e44da7ee4` | fixture | cron, secret/role |
| `20260603_marketing_engine_foundation.sql` | `90ab8c043371e706db0c304dcee1085f184d3779572dc5b94518b2bb16371b60` | hold | — |
| `20260603_pipeline_retry.sql` | `ac9a45ed5fd058d16d9b501822bd4d7b95125dfdcd810bb1db3120f9f6008283` | hold | cron |
| `20260603_token_health.sql` | `df760a6c0675c6294e3762ca68bca31cb4e429992934bfca76e81644d51dd625` | hold | cron, secret/role |
| `20260606_bug_monitoring_foundation.sql` | `a45e337163f1c281778b068969c066adfff91c41e29de4a61afb6e0379dc9460` | hold | secret/role |
| `20260606_killswitch_cancel.sql` | `e8c7a7bb9fb1594f612c4077eb80d6113050d5487f91d56c2b18d921f7f3a111` | hold | secret/role |
| `20260606_pr2_route_webhook_isolation.sql` | `5b6368cb8545e089094540e2d3809de495f54daccb4ff2820a2ef289679cff70` | hold | — |
| `20260608_project_media_settings.sql` | `32f6ed9d38aa58f7768d37d42b15ebfcfaea57ee7f82c3f166ade34467452bb5` | hold | — |
| `20260609_dream_issues_ledger.sql` | `efc2b09e75c60fb8d14bcafdf4bcf2712e7d28e2107336634487d18fb9510089` | fixture | — |
| `20260609_manager_task_dream_link.sql` | `c1fb7723f386343e61f9f81297f6e0eb2622dde1d703d348298e7c57b22a767a` | fixture | — |
| `20260611_atlas_actions.sql` | `c2ef6b952f5b84f169fa5ce8836e1ce7382f85553758daaf6fc84758ae7fb7f5` | hold | — |
| `20260614_cron_guardian.sql` | `7e0d85d872c0ac4c94f8c0e88577adf92d54c49d9141bf17c6c4e2f518e4161f` | hold | cron |
| `20260629_120000_atlas_intelligence.sql` | `6c8fc2c33f26a812685e9f401c88c19dfa290b4de28dc550ac826b524750299f` | hold | — |
| `20260629_120100_atlas_entities.sql` | `62ebde75d231bbc6df8187e2db61313b2f853810351d85e142831fd782816006` | hold | — |
| `20260629_200000_atlas_intelligence_cron.sql` | `88e780c416a4b6f283510cd23cbf9897014baa9a1d152f12b7c5a003f4d66090` | hold | cron |
| `20260706_stage1_memory_foundation.sql` | `614082ddfe5d0f33c586d0f79b59a53776a9ae119f5cde99144e7dd6f16d3259` | hold | — |
| `20260707172102_enable_public_rls_for_internal_tables.sql` | `e53cdcff2cc26fa22c19b3d42c180bf20c44596b06b173e6b5bf9308e742f3b5` | hold | secret/role |


## Review boundaries and next gate

Several held root files create tables mentioned in later web SQL (for example
`atlas_actions` and `token_health`), but those mentions did not block this
empty-data replay. Others schedule live jobs,
change permissions, or overlap later canonical migrations (`atlas_entities`,
`atlas_intelligence`, memory foundation). Text references do not prove an
execution dependency: conditional SQL and schema-qualified names require a
PostgreSQL result and object-by-object review. Do not merge all 38 histories
by filename or infer production completeness from this inventory.

The local replay now passes 13/13 ordering tests and the whole selected SQL
sequence. The 12-operation calendar ACL baseline matches the read-only
production catalog snapshot. A separate synthetic queued-job branch now
exercises the signed `claim`: the proposed role fails when its EXECUTE grant
on `calendar_source_gate_try_begin_probe` is temporarily removed. The worker's
`social_schedule_authorize_write` likewise fails when its grant is removed.
The candidate now grants both functions, plus `peek`, `receipt`, and checkpoint
recovery. After restoring the transaction-local grants, the restricted role claims the job,
authorizes the write, prepares the publication, begins a synthetic Facebook
create, reauthorizes, and runs checkpoint
recovery on the same claim. The job and publication become `uncertain` with
`receipt_unavailable`; the source revision advances once per changed row.
The entire branch is rolled back. The other scheduled
publication path starts with an already claimed job; it checks
`prepare`, `claim_create`, `complete`, and `checkpoint` within transactions
that are rolled back. A separate recovery branch turns a publishing Facebook
publication uncertain with `receipt_unavailable` and rolls back. A malformed provider
ID is rejected, while a caller-supplied, valid-shaped but fabricated ID can
mark a publication as published. The candidate reconciliation inspector is
also probed against an uncertain Facebook publication: direct proof INSERT
by `service_role` is denied; the inspector can create a source-versioned
proof for a fabricated candidate of the expected shape. These SQL checks
cannot authenticate a Facebook response. The server worker must establish
provider origin and keep its writer identity isolated before any cutover.

Code review of the current server path found that scheduled `complete` follows
`MetaManualProvider.facebook()`/`publish()`: those calls use a fixed HTTPS
Graph host, reject redirects, bound and parse the response, and check the
Facebook composite Page ID. The reconciliation API requires the resolved
operator; its service lists candidates via the Page credential and re-reads
the selected post from Graph before `reconciliation_complete`. The SQL
functions cannot distinguish those server-controlled calls from a direct
invocation by the same broad `service_role`. The fabricated candidate above
demonstrates that precise database trust gap, not a failure of the normal
provider-response parser. It also cannot prove a live Meta response or the
production credential path.

The test role now has project `SELECT` plus column-scoped `UPDATE(id)` for
the `SELECT ... FOR UPDATE` lock used by the signed functions. The replay
rejects an attempted project-name edit under that role. A test-only trigger
rejects an attempted project-key edit, including an unreferenced row, while
preserving the row lock. This remains a candidate fixture rather than a
production role definition. The role candidate still needs a reviewed,
complete permission design.

The replay asserts EXECUTE for every scheduler RPC used by the worker
(`claim`, `authorize_write`, `step`, `peek`, `receipt`, `recover_checkpoint`)
and both signed source-gate functions. The optional
`--with-schedule-worker-replay` mode commits synthetic rows inside the owned,
networkless container, then invokes the real TypeScript `runScheduleTick`
through a restricted-role RPC adapter. A fake Meta response yields one
Facebook POST and a `published` job. The test mocks the dispatch stop check
and image bytes, uses a synthetic credential, and removes the owned container
afterward. The existing TypeScript suite's separate shared Docker fixture is
not touched by this mode.

The default replay connects the SQL claim and recovery path inside one
transaction. The optional application replay exercises a fake provider
receipt, but does **not** load real media bytes, contact Meta, or establish a
deployable identity. It does not cover the other 28 root
files, existing production rows, authentic Supabase migration ledger entries,
or the proposed calendar writer's deployed operation. The
current worker still uses one `service_role` client for claim, guard, step,
and recovery, whereas the proposed NOLOGIN role is only a transaction-local
fixture. Applying the candidate revokes on their own would interrupt the
worker. The next gate is coordinated worker identity and credential wiring,
an enforceable boundary around the existing provider receipt handling, and
the actual server identity and credential path. Separately,
production's missing May baseline still prevents a fresh Supabase branch from
reconstructing the installed schema. None of these local experiments alters
production, the production migration ledger, or its guard.

Identity cutover needs a separate, reviewed Data API credential that maps to
the scheduling role, plus `authenticator` role membership and an isolated
PostgREST RPC proof. Supabase documents custom `role` JWTs and the client
`accessToken` option; a secret API key alone still maps to `service_role`.
The current fixture role is **not** the role to expose through that credential:
it has `BYPASSRLS`, direct `UPDATE` on jobs and publications, and `INSERT` on
publication and event tables because the canonical worker functions are
`SECURITY INVOKER`. The source gate proves transaction ordering, but it does
not confine a holder of those grants to the reviewed provider and step flow.
The cutover design must remove direct write authority from the callable role
or enforce that boundary separately, then prove the resulting RPC flow and
negative direct-write cases through PostgREST before any revocation.
The rollback-only RPC role above demonstrates one possible SQL permission
boundary. A production version needs review of the complete `SECURITY DEFINER`
call graph, input and project authorization, grant and RLS behavior, plus
provider receipt authentication; a callable definer function can still
perform an unauthorized transition if its input checks are insufficient.
The scheduled API now passes distinct client objects to the worker: the
scheduler client handles claims, authorizations and steps; the media client
handles image verification, including `assets` reads and signed Storage URLs.
Both are still created with the same `service_role` key, so this is code
plumbing rather than a security boundary. The credential resolver reads
platform tokens elsewhere. Media and credential paths need their own narrowly
authorized server boundary before revoking `service_role` schedule writes.
No JWT signing key, Supabase secret, role membership or production switch is
created by this replay.

## RPC trigger surface and transitive review — 22 October (test-only)

The isolated cross-tree fixture now reads `pg_trigger` and `pg_proc` for
`projects`, `social_schedule_jobs`, `social_publications`, both
publication/schedule event tables, the reconciliation-proof table, and the
fixture source-revision table. The observed user-defined trigger map has **13
entries**: five on `projects`, four signed source-gate BEFORE/AFTER triggers
on jobs/publications, and four append-only event guards. There were no
user-defined triggers on the reconciliation-proof or source-revision probe
tables at this point of the RPC-only fixture. A project `SELECT ... FOR
UPDATE` lock is not a project-row `UPDATE` and does not fire its triggers.

The HTTP replay's catalog guard now requires those exact table/trigger/function
bindings, each trigger function's `SECURITY DEFINER` mode, enabled state,
the fixture owner and empty function `search_path`. It also pins the
`pg_trigger.tgtype` event/timing bits for all eight jobs/publications/events
triggers, so changing a signed BEFORE guard to an AFTER guard or weakening an
event immutability guard fails this diagnostic. The fixture owner check is
local to the pinned PostgreSQL image; it is not a production owner claim.
The existing separate callable-role guard still sees 40 public EXECUTE
privileges: six definer worker wrappers, two rank helpers, and 32 functions
returning `trigger`. Trigger functions are not ordinary callable RPCs.

**Direct-read boundary (follow-up):** The rollback-only SQL role has no
`SELECT` grants on `projects`, jobs, publications, their event tables,
schedule batches/decisions, reconciliation proofs, or content posts/revisions.
The SQL privilege assertions now cover those ten tables, in addition to the
existing denied `assets`, `platform_tokens` and principal scope reads.
The isolated PostgREST run also rejected `GET ?select=*` against all twelve
business/media tables, while allowing the subject-scoped scheduling RPCs.
This does not test actual Storage object signing, Facebook/Instagram account
credential resolution, or production role membership; the media client still
uses `service_role` in production.

The immediate **reviewed source path** is project/subject-scoped wrapper
to the renamed worker body. `claim` can call
`calendar_source_gate_try_begin_probe`, `social_schedule_authority`,
and `social_schedule_snapshot`; `step`, authorization and checkpoint
recovery use a locked-claim helper and source gate; `receipt` and `peek`
read scoped job state. `social_schedule_authority` reaches
`social_schedule_item_guard`, `social_content_active`, requirements,
approved content, and image **metadata** from `assets`. Changed job and
publication rows invoke the signed gate BEFORE/AFTER triggers, and
event-row INSERTs target append-only tables. Those nested calls execute
with the wrapper's elevated authority in this fixture, not the caller's
direct grants.

**Boundary:** This is a catalog drift guard and partial source trace, not a
complete transitive `SECURITY DEFINER` review. It does not prove that every
helper's body, trigger side-effect, dynamic SQL reference, default grant or
historical production row is safe. It neither authenticates a real Meta
receipt nor isolates real media/token access. The synthetic JWT issuer and
project mapping exist only inside the rolled-back fixture. Production still
uses `service_role`; the missing May migration baseline, 28 unselected root
migrations, real server credential split, and coordinated cutover remain
blockers. No deployment, migration, production role, real queue or Meta call
is performed by this step.

References: [Supabase Postgres roles](https://supabase.com/docs/guides/database/postgres/roles),
[custom JWTs and `accessToken`](https://supabase.com/docs/guides/auth/jwts),
[custom role membership](https://supabase.com/docs/guides/storage/schema/custom-roles),
[API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Scoped scheduler identity client probe — 22 October (no production wiring)

A **test-only** `scoped-client-fixture.ts` factory now uses
`createClient<Database>` with a publishable fixture key and Supabase
`accessToken` callback instead of a service-role key. It is invoked from
the isolated real TypeScript worker / PostgREST HTTP replay, never from
`socialScheduleTickApi`. The factory refuses every non-`test` environment;
it does not read any production signing key, create JWTs or add grants.
The server route still initializes both client objects using `createAdminClient`.

The fixture checks a pinned expected subject, `social_schedule_rpc_only_fixture`
role, issuer `omnira-schedule-fixture`, `aud=authenticated`, timestamp
bounds, the pinned synthetic HTTPS endpoint and `sb_publishable_` key syntax before sending a
JWT via `Authorization`. No session persists and requests use `no-store`. The returned object is
an RPC-only, six-method allowlisted facade: it exposes no `.from()`,
`.storage` or `.auth` and refuses unchecked/manual/reconciliation RPCs.
The canonical `Database` type does not yet include these fixture RPCs, so
one internal cast is isolated behind this facade; this is not a type-safe
production permission cutover.
**Decoding claims in TypeScript does not verify a signature.** The owned
PostgREST service now verifies RS256 JWTs against an ephemeral public JWK
with a pinned `kid`; only the isolated replay runner holds the private key.
A role-tampered but not re-signed JWT must yield HTTP 401. Earlier HS256
results predate this follow-up and are not evidence for the asymmetric path.
The SQL scoped-role helper now also refuses a correctly signed JWT with
an unexpected `iss` / `aud`, or malformed `sub`, with SQLSTATE 42501;
per-subject project ownership checks remain mandatory.

Do not copy this factory or issuer into production. A deployable
credential split needs an independently trusted server-only issuer, short
JWT lifetime, bounded rotation/revocation, role and subject binding from
non-caller-controlled identity, and a reviewed PostgREST credential path.
Supabase's publishable key alone is **not** an identity and cannot prevent
someone with a signing key from forging a privileged `role` claim.
The existing direct table/trigger and Meta-receipt gaps still block
cutover. No scheduled real work, token, storage object or Meta API is used.

Relevant docs:
[Supabase JWT accessToken](https://supabase.com/docs/guides/auth/jwts),
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

**Observed isolated result (22 October):** The cross-tree replay with
`--with-schedule-http-role-replay --with-schedule-http-worker-replay`
passed `CROSS-TREE RPC-ONLY ROLE PASS`,
`CROSS-TREE POSTGREST ROLE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS`. The TypeScript worker saw one fake Facebook
POST through the RPC-only facade and committed only synthetic rows in
the owned internal-network fixture. The runner cleaned its containers
and network. Five scoped-client tests plus two scheduled API tests
passed (7/7); the ordinary `worker.test.ts` suite requires its own
separate, unstarted database fixture and was not independently
validated in this step. Full project `tsc --noEmit` has no reported
calendar-file errors, but cannot pass in the borrowed local dependency
tree because `@remotion/lambda/client` is missing and two dependent
`region` types are unresolved in `lib/media/lambda-render.ts`.
No CI workflow or production resource was changed.

## Asymmetric schedule JWT boundary — 22 October (RS256 follow-up)

The isolated HTTP role replay has replaced its shared HS256 test secret
with a newly generated ephemeral **RSA-2048 key pair**. The trusted
runner keeps the private key in its own process memory and signs
short-lived fixture JWTs with `alg=RS256` and a pinned `kid`.
The owned PostgREST v16.4 container receives **only the public JWK** in
`PGRST_JWT_SECRET` as a one-key JWKS; `PGRST_JWT_AUD` is set to
`authenticated`. The actual TypeScript worker receives a signed JWT
via the test transport, **not** the signing key, and continues using the
RPC-only `accessToken` facade with no Storage, Auth or direct table API.

**Measured:** With the same 151 web + 10 selected root migrations,
the isolated runner completed `CROSS-TREE RPC-ONLY ROLE PASS`,
`CROSS-TREE POSTGREST ROLE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS`, and
`CROSS-TREE REPLAY PASS`. It rejected a changed JWT payload without a
new signature (401), an unknown signing-key `kid` (401), and a signature
from a different RSA private key using the expected `kid` (401). A
correctly signed JWT with the wrong issuer was rejected by the
fixture SQL wrapper (403/42501). The original foreign-project,
missing-subject, direct-DML and 12-table-read denial checks also
passed. An allowed subject's synthetic worker completed exactly one
simulated Facebook call and reached `published`. No real Meta call was
made; the test JWT cannot authorize any production environment.
The local containers and internal network were removed afterward.

**Deployment decision is still OPEN.** This tests vanilla PostgREST's
public-JWK verifier, not Supabase-hosted custom OIDC onboarding or
privileged custom-role issuance. Supabase currently recommends managed
asymmetric signing keys; private Supabase-managed signing keys are not
automatically available to an external scheduler. Its custom OIDC path
requires HTTPS issuer discovery, asymmetric JWTs with `kid`, and trusted
JWKS. A real identity issuer must authenticate the scheduler *before*
issuing short-lived, fixed-role, project-scoped tokens, ensure that its
private key is not accessible to the worker or general web routes,
establish rotation/revocation and audit trails, and prove the custom
role's actual hosted Data API grants in a safe environment. No signing
secret should be copied from Supabase to the web cron route. The
production API still instantiates two `createAdminClient()` objects.

**Reviewed media/credential path:** `runScheduledPublication` invokes
`resolvePublicationCredential` and `executeApprovedPublication`.
`publication/credentials.ts` delegates Facebook/Instagram account
credentials to `lib/media/social-credentials`. Its media verification
calls `verifyPublicationImage(mediaDb,...)`, which directly reads
`public.assets`, requests a 60-second Storage signed URL, then
validates downloaded JPEG bytes and checksum. These operations are
intentionally *outside* the scoped scheduling-RPC role. The current
production `mediaDb` still uses `service_role`, and the credential
resolver has a separate existing token consumer. A reviewed
project/account-bound media-and-credential broker is required before
the final permission cutover; replacing the scheduler client alone is
not sufficient.

**Other production blockers:** A caller-supplied valid-shaped Meta post
ID still does not authenticate provider origin in SQL; the broader
privileged definer/helper/trigger graph is not fully audited; the May
media baseline and historical migration ledger are unreconciled.
Keep this PR as draft and do not deploy the fixture functions, roles,
JWT issuer, grants or revokes. No live queued jobs, external images,
real provider credentials or other production resources are exercised.

References:
[PostgREST asymmetric JWT verification](https://docs.postgrest.org/en/v12/references/auth.html),
[Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys),
[Supabase custom OIDC](https://supabase.com/docs/guides/auth/third-party/custom-oidc).

## Scheduled media/account scope probe — 22 October (test-only, no cutover)

This follow-up adds `apps/web/lib/social-launch/scheduling/approved-media-scope-fixture.ts`
and its unit tests. The synthetic `isolated-worker-replay.test.ts` now
opens this scope **only after the real scheduled `social_schedule_authorize_write`
SQL RPC succeeds**, using the `projectId` and `leaseExpiresAt` from the
server-returned claimed job. The scope is bound to the approved project,
Facebook/Instagram channel, account ID, binding ID, image asset ID and
SHA-256. Stable values are copied at construction so later mutations of
the caller's snapshot cannot expand access. Neither the raw media client
nor token store is exposed as a method of the returned fixture object.

The scope's two operations are `resolveCredential(projectId,channel)`
and `verifyImage(mediaDb,projectId,asset)`. A foreign project, channel,
asset ID, asset hash, unknown media-client object, expired claim lease,
or account/binding mismatch is refused *before* the delegated synthetic
media/credential backend is invoked. The project is checked against the
independent SQL claim snapshot, not a caller-selected project. The
underlying resolver result is checked again before returning a token to
the legacy publication executor. No application route uses this
test-only facade; the canonical `worker.ts`, `api.ts` and SQL migrations
were not modified.

**Important SQL projection detail found by the full replay:** The
canonical `social_schedule_revision` projects the stored
`revision.binding` JSON with `accountId` and `label`, but not always
an embedded `id`. The actual `revision.binding_id` column is checked
against `item.bindingId` by the canonical `social_schedule_item_guard`
before `authorize_write` returns. The fixture accepts this trusted
SQL projection, rejects a *present but mismatched* embedded binding ID,
and still validates the external account ID. An initial over-strict
fixture version returned a safe `blocked` result; this was diagnosed
against the pinned SQL seed, fixed with a separate regression test, and
the complete integration was rerun successfully. Do **not** generalize
this allowance to untrusted caller-provided snapshots.

**Observed isolated result:** Six media-scope tests passed, covering
success, foreign project/channel/asset/media client, wrong credential,
expired lease, malformed snapshot, immutability, and the canonical SQL
binding projection. The existing five scoped-RPC client tests and two
calendar API tests also passed in targeted checks. The owned cross-tree
replay again passed `CROSS-TREE POSTGREST ROLE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS`, using real PostgREST calls and the actual
TypeScript scheduled worker. The approved synthetic Facebook job reached
`published` after exactly one fake Meta POST; the media and token
backends were each consulted once. Post-completion probes of foreign
project/channel/asset were refused without additional backend calls.
No real image bytes, Storage request, account credentials, Meta request
or production job were touched. Owned containers/network were removed.

**This is an application-layer probe, NOT a production permission
boundary.** The existing worker still receives a `ManualCredential`
with the raw token and still accepts a media-client argument; production
still builds two `service_role` clients. The test-only media backend is
synthetic and does **not** exercise real Storage signing, actual account
attestation or a separately hosted privileged broker. A deployable
boundary must separate privileged asset reads, short-lived signed
Storage URLs and page-token resolution behind server-only, project- and
approved-job-bound operations. Before cutover, decide how to prevent
the scheduler from receiving reusable Meta tokens, bind every media
request to a fresh SQL authorization and immutable publication identity,
audit revocation and races, and prove both valid and denied paths using
realistic but synthetic media through an isolated backend. The existing
unverified Meta receipt origin, missing May media migration baseline
and full definer/trigger audit remain blockers. No role, grant, route,
migration, runtime credential or dispatch flag changed.

Full local TypeScript `tsc --noEmit` remains blocked by the same three unrelated Remotion `lambda-render.ts` errors in the borrowed dependency tree; no errors were reported in the changed calendar files.

## Privileged Facebook publication broker contract — 22 October (test-only)

The follow-up introduces `apps/web/lib/social-launch/scheduling/privileged-publication-broker-fixture.ts`
and a separate fixture test. This is an **in-process test-only HTTP Request
handler**, not an independently deployed broker. It rejects construction
unless `NODE_ENV=test`, binds an ephemeral broker authorization secret
to the synthetic `https://broker-fixture.invalid/v1/facebook-photo`
endpoint, and exposes **only** `handle(Request)`. A local test also
sends actual HTTP requests over `127.0.0.1` to exercise a transport
adapter. No external network endpoint is called.

The browser/cron-facing payload is deliberately limited to the job
`claim` (`jobId`, `claimId`, `version`), `publicationId`, caption
and existing media-capability URL. It **never accepts caller-supplied
project IDs, account IDs, credential values, Storage paths or media
bytes** as authority. The broker uses an injected trusted
`authorizeClaim` callback backed by the real
`social_schedule_authorize_write` RPC and the job's receipt, checks
that the authoritative publication is in `publishing` state, belongs
to the current claim and approved binding, matches the caption and
media-capability URL, and that the lease is still live. It uses the
previously tested project/asset-bound media scope **inside the private
handler**. After image and credential resolution it repeats the SQL
authorization, checking job, source manifest, approval, image, account
and binding again before the synthetic provider call. All refused
responses use generic error codes and expose no token.

The isolated actual TypeScript worker replay is wired through this
fixture: the worker's `ManualCredential.token` is a **non-Meta opaque
test reference**, while the private mock provider sees the synthetic
account token only inside the broker handler. The worker-side provider
is a facade that forwards a narrowly shaped request to the broker
handler. A matching synthetic Facebook post ID is returned in the
existing provider response format, keeping the canonical worker,
executor, DB migrations and production route unchanged. This tests
the intended boundary, but does **not** make the existing production
worker token-free: its real `resolvePublicationCredential` still
returns a raw Meta token and both production DB clients still use
`service_role`.

One attempted publish per `jobId|claimId` is permitted per handler
instance: both an `inFlight` guard and a consumed-attempt set prevent
parallel and repeated sends. An unknown provider outcome does not
release the attempt; a restart would, so this is **not durable
idempotency**. Before a provider call, any revoked source, changed
approval/account/media, lost claim version or expired lease fails
closed. The broker's response is a provider-shaped fake receipt, **not
authenticated Meta evidence**. Production needs a separate process
or service identity, server-side credential storage, a durable unique
dispatch-intent ledger, legitimate provider receipt provenance,
and proper ambiguous-outcome reconciliation. Instagram's
container-create/status/publish lifecycle is **not included** in this
Facebook-only candidate.

**Verified:** The 9 broker tests passed, including auth failures,
wrong account/publication/claim, malformed SQL authority, revoked
approval between reads and dispatch, concurrency, unknown provider
outcome, expired lease, no token exposure, and a local loopback HTTP
request. Combined with the prior 6 media-scope tests, 5 scoped client
tests and 2 API tests: **22/22**. The isolated real TypeScript
`runScheduleTick` with RS256/PostgREST role, synthetic approved job,
private broker provider and fake Facebook response passed
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS`; exactly one fake provider call occurred,
with no extra backend read on disallowed reuse. The existing
cross-tree ACL/trigger role checks also passed. All owned Docker
resources were removed by the runner. The unrelated Remotion
`lambda-render.ts` dependency/type errors still prevent a green
repository-wide `tsc --noEmit`; the new calendar files caused no
TypeScript errors in that run.

This probe adds **no production endpoint, environment secret,
database role, credential, migration, grant, Meta call, scheduled
queue execution or deployment**. Keep PR #504 as a draft. The
historical May migration baseline, broad definer/trigger graph,
provider-authenticated receipt boundary, Storage signing authority,
private service isolation and durable dispatch idempotency are
unresolved cutover blockers.

## Durable provider dispatch reservation — 22 October (test-only)

The prior broker candidate used an in-memory `attempted` set, which
disappeared on process restart. This follow-up adds a SQL-only
`lib/calendar/scheduled-broker-durable-intent-probe.sql` candidate,
**not a production migration**. It is installed only inside the owned
PostgreSQL cross-tree HTTP fixture. It creates
`social_schedule_dispatch_intents_fixture` with primary key
`job_id`, a separate unique constraint on `publication_id`, and
`provider_outcome='unknown'` on admission. The fixture has RLS
enabled and no direct SELECT/INSERT/UPDATE/DELETE grants to public,
`anon`, `authenticated`, `service_role`, the calendar-worker role,
or the new broker role.

A separate `NOLOGIN NOBYPASSRLS` role,
`social_schedule_broker_intent_fixture`, is explicitly granted EXECUTE on the
`social_schedule_dispatch_try_begin_fixture(jsonb,uuid)` admission
function. The function runs as the reviewed fixture's owner with an
empty search path, checks the verified PostgREST JWT role, issuer,
audience and subject-to-project binding, calls the canonical scoped
`social_schedule_authorize_write` for a still-owned job claim, and
checks the approved scheduled Facebook image-publication identity,
account and binding. It atomically inserts with `ON CONFLICT DO
NOTHING RETURNING`; the first committed request yields `true`,
any subsequent request for that job or publication yields `false`.
The broker identity cannot run scheduler-step RPCs, read the ledger
or impersonate another project's subject; the scheduler identity
cannot call the reservation RPC at all.

The private test broker now requires a `reserveIntent` dependency.
It calls this **after** the second current SQL authorization check,
but **before** the provider POST. An explicit `false` causes a
denial; a lost reservation acknowledgment is treated as unavailable
with **no** subsequent provider dispatch. The existing in-memory
attempt gate remains as defense in depth only. The current
`isolated-worker-replay.test.ts` uses a separate RS256-signed JWT
for the broker role and sends reservation calls through the internal
PostgREST gateway in independent HTTP/database transactions. The
simulated Meta provider checks a second reservation from a fresh
database transaction *while the first publication is still in
flight*. The second request returns `false` and no second Meta
request is made. The cross-tree runner independently verifies the
committed row count is **1** and that its provider outcome remains
`unknown`. Its negative tests verify worker cannot reserve, broker
cannot step scheduled jobs or directly read the table, foreign
principal cannot reserve, and an unprepared job produces
`SOCIAL_SCHEDULE_CONFLICT` without any reservation. This is the
specific database durability check absent from earlier in-memory
broker unit tests.

**Verified after correcting the precise negative HTTP expectation:**
24/24 targeted unit/API tests passed. The full 151-web + 10-root
cross-tree replay passed `CROSS-TREE BROKER INTENT ACL PASS`,
`CROSS-TREE POSTGREST ROLE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS`. All provider responses were synthetic,
Meta was never contacted, and owned containers/internal network
were cleaned up. The negative early-reserve SQL deliberately raises
`SOCIAL_SCHEDULE_CONFLICT`/HTTP 400, not the 403 of an identity
denial; both are refusals and neither creates an intent.

**Security boundary and remaining limitations:** This is an
at-most-once attempt, **not** exactly-once delivery. A database
reservation committed just before a process crash may prevent a post
that was never actually sent; automatic retry is intentionally
disabled, and a human/independently verified reconciliation path is
required. A real service requires a durable migration, a hardened
broker identity and deployment, controlled JWT issuance, verified
Storage and Facebook token isolation, transaction/fault/recovery
testing, provider-origin receipt attestation and Instagram's
multi-stage workflow. The existing `service_role` clients and
production routes are untouched. No production SQL/grants,
configuration, Meta credentials, scheduled jobs or provider calls
are changed; do not deploy the fixture as-is.

**TypeScript note:** The full local `tsc --noEmit` still reports only the three unrelated `lib/media/lambda-render.ts` Remotion dependency/type errors inherited from the borrowed local dependency tree; it reported no errors in the new calendar SQL-adapter and broker test files. The normal SQL and HTTP tests were run against the isolated owned PostgreSQL instance, not Supabase production.

## Safe unresolved-Meta review queue — 22 October (fixture only, no production wiring)

A new **test-only** `lib/calendar/scheduled-broker-review-queue-probe.sql`
creates `social_schedule_broker_review_fixture` as a separate
`NOLOGIN NOBYPASSRLS` role, distinct from both the scheduled worker
and the privileged broker dispatch-intent role. The role receives
an explicit EXECUTE grant on the
`social_schedule_dispatch_review_fixture(uuid)` read-only entry point.
Inherited PUBLIC function privileges remain outside this limited proof.
No direct SELECT/INSERT/UPDATE on the durable intent table, no token
reads, no scheduled write RPC, no broker reserve RPC, and **no**
`social_publication_reconciliation_complete` execution are granted.
The function is `STABLE SECURITY DEFINER` with an empty
`search_path`, explicitly revokes PUBLIC/anon/authenticated/service
execution, checks the *verified* PostgREST JWT role/issuer/audience
and subject-to-project binding through the existing fixture helper,
and limits output to the first 25 project-bound dispatch intents
still recorded as `provider_outcome='unknown'`.

The projection returns only job and publication IDs, reservation
timestamp, internal job state, provider outcome and a literal
`reviewStatus='needs_authenticated_meta_evidence'`. Both the top
level and every item say `automaticRetryAllowed=false`; the
top-level `reviewAction='operator_inspect_provider'` is a
description, **not an enabled action**. The response deliberately
omits credentials, provider tokens, storage paths, image URLs,
privileged claims, raw provider IDs and the original Facebook
response. It has no mutation endpoint. It does **not** verify Meta;
in particular, an existing SQL job state `published` does not
turn an intent with `unknown` outcome into a confirmed Meta receipt.

The canonical code already has a separate operator-authorized
manual Facebook reconciliation path:
`publication/reconciliation/service.ts` resolves a project-bound
Facebook credential, lists and re-reads provider candidates and
requires a manual image confirmation; its
`publication/reconciliation/api.ts` enforces operator and project
access. That existing route is **not wired** to the new read-only
fixture, is not being claimed to authenticate all provider receipts,
and was not modified. A future reviewed implementation must link
these without letting Atlas invent a provider proof, grant itself
completion privileges or silently retry a reserved job.

**Observed in isolated PostgreSQL 17 / PostgREST replay:**
The review queue was empty before the synthetic provider attempt.
A separate RS256-signed reviewer JWT for the owned project could
read it, while scheduler/broker JWTs and a foreign-project
reviewer were denied. A foreign reviewer's own empty project was
visible only to that identity. The reviewer could not read the
private intent table, reserve a publication, or call the existing
finalize RPC. After the single synthetically published Facebook
job had committed a durable intent, a new HTTP/database
transaction read **exactly one** review item, with
`databaseJobState='published'`, `providerOutcome='unknown'`
and `reviewStatus='needs_authenticated_meta_evidence'`.
A second read gave the same result. A request adding a fabricated
`providerId` and `confirmed=true` was rejected and did not
change the intent. The runner passed
`CROSS-TREE BROKER REVIEW ACL PASS`,
`CROSS-TREE BROKER REVIEW QUEUE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS` using **only** local synthetic data.
The prior 24 targeted TypeScript unit/API tests also passed; the
full local `tsc --noEmit` remains blocked by the three unrelated
Remotion `lambda-render.ts` errors in the borrowed dependency tree.

**Important limitations:** This is a 25-item test-only read
projection, with no pagination, UI, durable operator notification
or deployment. It is not a complete reconciliation workflow
and does not prove a real Meta provider ID or whether an unknown
request did or did not publish. The underlying durable intent
remains irrevocably `unknown`, so the safe behavior is to
**stop automatic retries and request human/provider review**.
Production still has broader `service_role` clients and unreviewed
definer/trigger transitivity, an unresolved May media migration
baseline, an unfinished broker isolation/issuer path, and missing
Meta-authenticated receipt provenance. Keep PR #504 as draft:
no schema migrations, SQL privileges, client credentials, actual
publication, Meta network request or CI workflows were applied
to production.

## Operator-only Facebook review handoff — 23 October (fixture, no production wiring)

This follow-up acknowledges a real compatibility boundary in the
**existing** application. `SocialReconciliationPanel.tsx` is shown
only when `social_publications.state='uncertain'` on Facebook;
`publication/reconciliation/service.ts` itself returns no provider
candidates unless the publication is `uncertain`. Meanwhile, the
isolated synthetic broker test can leave a job and publication
`published` while the independently persisted broker intent still
says `provider_outcome='unknown'`. Those two states MUST NOT be
presented as a confirmed Meta receipt or routed directly to the
existing reconciliation completion path. The production
`SocialPublicationPanel.tsx` still calls `published` confirmed,
so the production UI must be updated in a separately approved
cutover rather than quietly overriding current app behaviour here.

The **test-only** SQL projection in
`lib/calendar/scheduled-broker-review-queue-probe.sql` now
includes `postId` and `publicationState` from the
same-project `social_publications` record, alongside the
existing `databaseJobState`, immutable unknown provider outcome,
job/publication IDs and the false automatic-retry flag. Its
top-level `reviewAction` is generalized to
`operator_review_provider_evidence`, which means advisory text,
NOT an enabled action. These fields are read-only, do not
provide a token, caption, photo URL, candidate ID or trusted
provider attestation, and do not grant more SQL rights.

`lib/social-launch/scheduling/review-handoff-fixture.ts`
requires the exact, project-matching scoped PostgREST response
shape with valid IDs and timestamps, no extra command/receipt
fields, `providerOutcome='unknown'`, and explicit
`automaticRetryAllowed=false` at all levels. It fails
closed on duplicate IDs, forged confirmation, changed project,
unknown states, or more than 25 rows. Each read-only review case
is converted into Swedish operator guidance:
- If the actual publication is `uncertain` and `postId` exists,
  it identifies the existing manual Facebook inspection panel as
  **potentially available to an authenticated operator** and
  supplies its read-only project/post/publication scope; no API
  invocation is made.
- If the publication is `published`, `missing`, or any other
  state, it requires **separate operator verification** and
  explicitly marks the legacy completion panel incompatible.
  The fact that SQL reports `published` never changes the
  Meta-evidence state to verified.
All cases prohibit automatic retry, Meta confirmation, and
new publishing from this handoff.

`components/social-launch/ScheduledMetaReviewFixture.tsx`
is a passive Swedish React preview of these cases. It has
no buttons, links, forms, network requests or handlers; it is
not mounted in any live route, menu, calendar, or Atlas tool.
There is no Atlas background job, user notification, Meta
query, privileged completion, or UI activation in this change.

Unit tests verify both publication-status branches, rejection
of fake proof/actions, project isolation, missing records,
the 25-item nonpaginated limit, HTML preview without controls,
and refusal outside `NODE_ENV=test`. An additional integration
test uses a base64-transported copy of the **actual isolated
PostgREST review query result**, not a fabricated client
record; the full replay must prove the rendered case still
labels the Meta result unverified even if the SQL job and
publication both say `published`. Existing operator-only
`/api/social-publication-reconciliation` and
`SocialReconciliationPanel` remain unmodified.

**Before production:** A reviewed endpoint/UI must require the
logged-in operator and project binding; an explicit operator action
may invoke the *existing* inspection only where its state and
authority checks are applicable. A separate, independently
attested Meta-proof path is still required for an internal
`published` / broker-`unknown` mismatch. A reserved Facebook
dispatch must never be silently retried; human confirmation
cannot be synthesized by Atlas or turned into a broker write.
The historical May media migration baseline, provider receipt
provenance, durable workflow review UX, dedicated service
credentials and full privileged SQL call graph are not resolved
by this fixture.

**Observed final local verification (23 October):** The five targeted
Vitest files passed **30 tests**, with the one conditional
real-PostgREST-handoff test skipped outside the isolated runner.
The complete 151-web + 10-root cross-tree replay then passed
`CROSS-TREE REVIEW HANDOFF UI PASS`,
`CROSS-TREE BROKER REVIEW QUEUE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS` (exit 0). In the replay the conditional
handoff test ran against the *actual* verified PostgREST read-only
projection and rendered the Swedish preview with no operator action.
All database changes were confined to disposable local Docker
resources. Full project `tsc --noEmit` reports only the three
pre-existing Remotion dependency/type errors in
`lib/media/lambda-render.ts`, no new calendar-file errors. This
does NOT establish real Meta delivery or production readiness.

## Operator-authorized Facebook evidence discovery — 23 October (test-only)

The previous read-only queue can show `published` in the SQL job and
publication while `provider_outcome='unknown'` in the independent
durable dispatch-intent ledger. Existing production manual Facebook
reconciliation only inspects candidate posts when the publication
state is `uncertain`; reusing its `complete` operation for this
published/unknown mismatch would be incorrect. **Neither Atlas
nor a caller may infer a provider-confirmed receipt from the SQL
state or a candidate list.**

This follow-up introduces an **isolated, unmounted, test-only**
`scheduling/operator-meta-evidence-fixture.ts` handler, protected
by a trusted/injected operator identity callback, requiring an active
platform operator and exact project access. The request can identify
only an existing project, job and publication in the scoped reviewer
inbox; arbitrary credential, project override, provider proof, action
or completion fields are refused before any privileged read.
A trusted server adapter must read the PostgREST scoped review queue
and the current publication/revision snapshot. The handler requires
that both independently agree on project, job, publication, post,
Facebook channel, saved revision hash and publication state. It
handles only `published` or `uncertain` evidence requests, and it
never writes any SQL row or calls a publishing provider.

The private adapter obtains a scoped Facebook account credential and
uses the existing `publication/reconciliation/provider.ts`
`listFacebookCandidates` implementation. That path issues only
`GET /{pageId}/published_posts` with a private Page token; the
token never enters the browser/worker response, link or query
parameters. The implementation considers only the first 50 posts,
revalidates account ID, exact caption, request-time window, numeric
photo ID, composite Page post ID, Facebook permalink origin and
Facebook CDN image origin, and presents at most 10 safe candidates.
A candidate is **not** a proof: an operator must compare actual
images/text/account in Facebook. Zero matches are **not evidence of
nonpublication**, since permissions/pagination/availability can
hide a post. Before returning the candidate preview, the handler
rechecks the authenticated operator identity and read-only queue;
stale/revoked identities or changed publication state invalidate
the result. Provider errors are reduced to generic unavailable
responses without token or provider output leaks.

A second **unmounted** component,
`components/social-launch/ScheduledMetaEvidenceFixture.tsx`,
renders the safe candidate list and existing Facebook links in
Swedish without buttons, form actions, completion, scheduling or
Meta POST. There is no live route, Atlas skill, production secret,
calendar action or user notification. The existing operator-only
reconciliation API and `SocialReconciliationPanel` are untouched.
A subsequent separately approved decision path must use trusted
freshly re-read provider evidence and an explicit operator action;
no auto-finalization or retry is authorized here.

Negative tests exercise caller-injected `publish`/confirmation
fields, foreign projects/claims, nonoperators, changed account
binding, altered revision, invalid provider origin, lost operator
authorization during the Meta read, changed review state during
the request, provider outage, production-mode refusal, and
read-only HTML rendering. The positive test uses the existing
Facebook candidate parser with an **entirely mocked** Graph
`published_posts` response and proves only a GET with private
credential is issued. No real Meta API requests are made.

The cross-tree replay includes a conditional test reading the
**actual scoped PostgREST review JSON** from the owned database
after the synthetic schedule job. The publication snapshot for that
conditional read is still **synthetic**; this is not a verified
live provider or a real backend adapter. The runner must check
that the independent intent remains `unknown` and that no
additional publication row or Meta call is created. A production
design needs a real identity-checked inspector service, independent
read-only account credential broker, durable audit of operator
reads, provider-bound and operator-confirmed attestation, review
UI routing and updated producer/consumer authority. PR #504
remains DRAFT with no deployable credentials or grants.

**Final isolated results:** In normal local mode, 6 targeted
Vitest suites passed **40 tests**; two conditional replay-only tests
were skipped, as designed. The cross-tree PostgreSQL/PostgREST
runner subsequently passed
`CROSS-TREE OPERATOR FACEBOOK EVIDENCE PASS`,
`CROSS-TREE BROKER REVIEW QUEUE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS`, and
`CROSS-TREE REPLAY PASS` (exit code 0). The conditional
operator-evidence test consumed the real scoped review response,
but used a **synthetic publication snapshot and mocked Meta GET**.
The persistent dispatch-intent row stayed `unknown` and there
were no new writes or second provider dispatch. The full
`tsc --noEmit` has the same three unrelated existing Remotion
`lib/media/lambda-render.ts` errors from the borrowed dependencies;
no errors were reported for the changed evidence files.

This is **candidate discovery, not proof attestation or
production-ready manual completion**. Do not attach the new
review UI to a route, Calendar or Atlas automation until
separate authenticated operator access, privileged Meta read
isolation, logged operator actions and post-verification durable
state transitions have their own reviewed boundaries.

## Durable, operator-scoped human observation audit — 23 October (test-only)

The next isolated safety gate is an **append-only human observation
ledger**, implemented only as
`apps/web/lib/calendar/scheduled-operator-review-audit-probe.sql`
and loaded into the owned disposable PostgreSQL/PostgREST replay. This
is NOT a migration, runtime endpoint, deployed role or an Atlas
approval integration.

### Separation and admissible claims

The independently provisioned, `NOLOGIN NOBYPASSRLS`
`social_schedule_operator_review_fixture` role receives EXECUTE
on `social_schedule_operator_review_append_fixture(jsonb)` ONLY
as an explicitly privileged operator action. The test's RSA-signed
JWT includes a distinct synthetic operator `sub`. A separate
administrator-seeded
`social_schedule_operator_scope_fixture(operator_id,project_id,active)`
mapping must show active operator access; normal scheduler/broker/
read-only reviewer JWTs cannot append. The mapping and audit tables
have RLS enabled and no direct DML grants to the fixture roles,
service_role, anon, authenticated or PUBLIC. The `SECURITY DEFINER`
append function has an empty search path, checks role, issuer,
audience, subject UUID, active operator/project binding and the
existing immutable dispatch intent. All six input keys are required;
unexpected values, cross-project job IDs and claims of elevated
authority are denied.

The only permitted `observation` values are
`possible_match_observed`, `no_match_observed` and
`review_deferred`. A potential match requires a plausible
account-bound Page post ID, but that ID is still **operator-supplied,
not authenticated Meta evidence**. The other values require a
null candidate ID. No `confirmed`, `published`, `approve`,
`retry` or `providerAttested` input is accepted. Every stored
event has `evidence_class='human_observation_only'`,
`provider_attested=false` and
`automatic_retry_allowed=false`, all enforced by SQL checks.

### Durable/idempotent audit mechanics

Events store database-generated event ID and timestamp plus the
signed actor, project, job, publication, request UUID, observation
and optional candidate ID. A unique `request_id` supports
idempotent retry of the *same* operator note; reuse with a changed
payload is a hard conflict. Multiple distinct observations can be
appended without overwriting history. Explicit BEFORE
UPDATE/DELETE/TRUNCATE triggers forbid editing or erasing events
even when an elevated role accidentally issues DML in the isolated
fixture. This is **not cryptographically immutable WORM**: the
database owner/superuser could alter the schema or triggers.
A production design will need an independently maintained,
tamper-evident/event-stream audit if stronger integrity is
required. Direct table reads are not exposed to the operator
role. Atlas/reviewer consumption of safe summarized observations
remains a separate, not-yet-built read path.

Crucially, the append RPC **never changes**
`social_schedule_dispatch_intents_fixture.provider_outcome`,
`social_publications.state`, permissions or publication
authorization. It cannot execute Meta GET/POST, retry a previously
reserved publication, write a provider receipt or call the existing
`social_publication_reconciliation_complete` RPC. These observations
are *human statements for follow-up*, NOT a completed operator
decision proving that Meta did/did not publish.

### Isolated verification

The pinned 151-web + 10-selected-root migration replay with real
PostgREST verified a dedicated RSA-signed operator role, exact
operator mapping and denied identities, including scheduler,
broker, passive reviewer, non-operator and foreign-project subjects.
It denied writes before a durable dispatch intent exists. After
the synthetic worker reached `published` through a fake Meta
provider, the operator submitted a
`possible_match_observed` note with a **synthetic account-bound
candidate ID**; a second independent PostgREST request with the
same request UUID returned the same event rather than inserting
another row. Reusing the request UUID with different observation
was denied; an injected fake `provider_confirmed`, an extra
`providerAttested` field and a wrong-account candidate were
denied. A separate `no_match_observed` note was appended.
The persisted audit contained **exactly two human-only events**,
not any provider-attested record. Fixture UPDATE, DELETE and
TRUNCATE attempts raised the append-only trigger error. After
the administrator revoked the operator mapping, another signed
operator request was denied. The original dispatch intent count
remained one, `provider_outcome` remained `unknown`, and
the read-only review queue continued to deny retries.
`CROSS-TREE OPERATOR AUDIT ACL PASS`,
`CROSS-TREE OPERATOR AUDIT PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS` all completed with exit code 0. The test
uses no real Meta accounts/keys or external provider network.

### Remaining launch gates

This proof uses an ephemeral test signer and an administratively
seeded synthetic operator record, **not an actual user-click
verification or a deployable authorization service**. Before a real
operator can record a review, a trustworthy login/session, CSRF
protection, per-project operator checks, human confirmation UI,
audit read projection, optional tamper-evident archival and
transaction/revocation review are required. A distinct authenticated
Meta evidence provenance path must still adjudicate actual
publication results without re-enabling duplicate dispatch. The
existing production `service_role` clients, prior ability to
forge manual reconciliation evidence via broad service_role,
May migration reconciliation and the full privileged SQL call
graph remain unresolved. Keep PR #504 DRAFT; do not deploy this
test-only role, function or table.

## Operator history and explicit human note confirmation — 23 October (test-only)

This follow-up adds the missing **read-back** boundary for prior operator
observations and a **test-only interactive React preview**, without
exposing any real calendar route, actual Meta call, or production DB
migration.

The isolated SQL candidate
`lib/calendar/scheduled-operator-review-history-probe.sql`
creates a `STABLE SECURITY DEFINER` read-only function with an empty
search path and *explicitly limited EXECUTE privileges*. It requires
the separately signed `social_schedule_operator_review_fixture` role,
issuer, audience, UUID subject, administrator-maintained active
operator/project membership, and matching job/publication in the
unchanged `provider_outcome='unknown'` dispatch-intent table.
It returns only the latest 25 **human observations**, including
server-generated event/timestamp, actual operator UUID, observation
and optional candidate post ID. Every event explicitly says
`evidenceClass='human_observation_only'` and
`providerAttested=false`. The response cannot authorize a retry,
Meta receipt confirmation or publication. No direct ledger SELECT,
INSERT, UPDATE, DELETE or token privileges are granted to the operator.
A revoked operator is denied both new writes and history reads.
The entire fixture exists only in the owned disposable PostgREST
replay; its owner and callable transitive function inventory still
require a production audit.

`lib/social-launch/scheduling/operator-review-history-fixture.ts`
validates the exact, project/job/publication-bound JSON projection,
including UUIDs, timestamp, all observation fields and the
no-retry/no-confirmation flags. It refuses forged provider attestation,
cross-project results, duplicate event IDs, unexpected command keys,
fake/invalid timestamps and more than 25 entries, and labels each
observation in Swedish. Untrusted operator notes are never promoted
to Meta-confirmed evidence.

`lib/social-launch/scheduling/operator-review-ui-fixture.ts`
is an **unmounted server-only test handler**. It invokes the *existing*
Omnira `resolveProjectAccess` and `resolvePlatformOperator` guards,
including a verified identical signed-in user and active project
scope, along with the existing `assertSameOrigin` HTTP CSRF defense.
It allows only two exact operations, `read` and `record`, and
refuses injected actor IDs, provider proof IDs, publish commands or
extra fields. For `record` it requires a valid stable request UUID,
one of the three allowed human observations, correct candidate-ID
shape and an explicit `confirmHumanObservation=true`. The actual
signed operator identity is always derived from the session and passed
to the injected DB adapter; the caller **cannot** provide an actor ID.
The operator's session is rechecked before the privileged append and
before any response. The append response must say
`providerOutcome='unknown'`, `providerAttested=false`, and
no retry/finalization, and its **exact event ID** must be present in
the subsequently read signed operator history before reporting success.

`components/social-launch/ScheduledOperatorReviewPanelFixture.tsx`
is an unmounted Swedish client-side preview that renders human
observation history, three possible human notes, a candidate field
only for 'possible match', a required explicit confirmation checkbox,
a button disabled until valid, and a 'reload history' control.
It preserves its idempotency request UUID when an ambiguous send
fails, to avoid doubling the note. There are **no** publication,
receipt completion, Meta write, or approval buttons.

### Verification and limitations

The targeted Vitest check covers actual application session guard
invocation (with mocks of the auth return values), same-origin
denial, non-operator and foreign-project refusal, revoked access,
correctly bound SQL response, forged evidence, absent or mismatched
new event, strict form payloads, and rendered HTML showing a
disabled save button without human confirmation.

The complete cross-tree replay tests real PostgREST with a separately
RS256-signed operator JWT, verifies only that operator has EXECUTE
on the history function, and that other roles, wrong principal,
direct table access, and revoked operators are denied. It reads
exactly the two previously committed human-only events from the
disposable database, in descending event order, and then passes
that exact HTTP JSON to the same test-only UI handler validator
and React view. The published synthetic Facebook job still has
`provider_outcome='unknown'`, and its durable dispatch intent
remains reserved and non-retryable. Neither the operator note nor
the historic source can forge a Meta provider receipt.

**Still not production ready:** This is a preview with injected
transport callbacks and mocked login returns in unit tests. There
is no Next.js route mounting, real user-facing UI menu, configured
operator JWT issuer, browser-to-production signed-RPC adapter,
actual session-based operator rollout, Meta verification service,
or production migration. The existing production
`createAdminClient()` service-role consumers, the media migration
baseline and the privileged function/trigger transitive audit remain
open. PR #504 stays a draft; nothing here grants Atlas human
approval authority or deploys a public endpoint.

## Trusted operator session → scoped PostgREST RPC boundary — 23 October (test-only)

This follow-up adds a **test-only private RPC bridge**, not a production
JWT issuer or a deployed application route:
`apps/web/lib/social-launch/scheduling/operator-session-rpc-bridge-fixture.ts`.
The prior operator observation UI handler already rechecks
`resolveProjectAccess` and `resolvePlatformOperator` but previously
used injected store callbacks without proving that they could operate
under the intended SQL roles. This bridge supplies **only those three
callbacks**: `readQueue`, `readHistory`, and `appendNote`.

For **each** callback it independently rechecks the signed-in user
through the application's server-side Supabase Auth `getUser()` path,
project ownership, and configured platform-operator status, and
compares that server-derived user ID to the expected subject. It
refuses caller-selected projects, extra write fields, invalid
candidate IDs and unreviewed RPC names. The dispatch targets are
pinned:
- `social_schedule_dispatch_review_fixture` under
  `social_schedule_broker_review_fixture` (read-only review role)
- `social_schedule_operator_review_history_fixture` and
  `social_schedule_operator_review_append_fixture` under
  `social_schedule_operator_review_fixture` (human operator role).

The bridge takes **no signing key**. A distinct trusted identity
authority must provide a short-lived JWT via the injected private
`issueScopedToken(role,projectId,subject)` callback. Only the
private server-side transport receives that token; the bridge
does not return the bearer, a token-issuance API, raw `.rpc`,
`.from`, `.auth` or `.storage` to application/browser consumers.
The unmounted fixture rejects use outside `NODE_ENV=test`.

The bridge also checks the JWT **shape** before transport:
RS256, pinned `kid`, canonical issuer/audience, exact allowed
role, exact verified subject/project, bounded issued/not-before
and expiration, with a maximum lifetime of four minutes.
**Parsing an untrusted JWT is NOT signature verification.** In the
isolated integration PostgREST performs cryptographic signature
verification using its public JWKS; the private signer stays in
the *parent* Docker replay runner process, not the
Vitest/Next application process. Modified payloads cannot
substitute different authority without passing PostgREST's
independent RSA signature check.

An intentional limitation: the hosted Supabase third-party
Custom OIDC path requires an HTTPS OIDC discovery endpoint and
asymmetric keys with `kid`. Supabase's published examples
generally configure a JWT `role='authenticated'`. **The raw
PostgREST fixture using a custom role does NOT prove that a
hosted Supabase project would admit the same custom SQL role
or this issuer configuration.** Before any production rollout,
select a supported issuer and dedicated service deployment,
configure OIDC/JWKS trust, demonstrate hosted role/grant/RLS
behavior in a safe test environment, and define key rotation,
session revocation and private token delivery. Never put
the private signing key or a service-role key in a browser,
Next public bundle or ordinary cron endpoint.

### Verification intent

Unit tests cover operator/session/ownership denial **before
token issuance**, strict RPC allowlisting and request shapes,
short TTL, issuer/role/audience/subject/project/`kid` bounds,
mismatched roles, altered JWT payload, transport errors and
the absence of any token/signing API on the returned facade.
The integration test uses the actual scoped PostgREST
role-mapped JWTs signed by the **separate parent runner**,
replays a previously committed operator request ID
(idempotently), and checks the existing operator UI returns
a human-only observation history without changing the durable
Meta outcome. The runner must verify there are still exactly
two audit notes, one durable dispatch intent and
`provider_outcome='unknown'`.

All data, signing keys, mappings and Meta responses used
here are synthetic; no live session, hosted OIDC provider,
real Instagram/Facebook account, public UI route, Vercel
deployment, production migration, grant, JWT secret or
external provider call is created. The historical May media
baseline, transitive SQL definer/trigger audit, live
provider proof provenance, and hosted custom-role
feasibility remain separate launch blockers. Keep PR #504
a draft.

**Verified result, 23 October:** The targeted Vitest run passed
**55 tests** across eight suites (four replay-only tests intentionally
skipped in normal mode). The isolated full cross-tree
PostgreSQL/PostgREST replay completed with exit code 0 and specifically
reported `CROSS-TREE OPERATOR SESSION RPC BRIDGE PASS`,
`CROSS-TREE OPERATOR REVIEW UI PASS`,
`CROSS-TREE OPERATOR AUDIT PASS`, and
`CROSS-TREE REPLAY PASS`. The new conditional test used the private
parent-runner-signed reviewer and operator JWTs against actual owned
PostgREST. The application-side mock session first passed through the
existing Omnira project/operator guard functions; its UI handler
then called exactly three pinned RPCs via the private bridge.
PostgREST independently authenticated the signed tokens, and the
same operator note request ID returned the existing audit record
without adding a third event. The durable dispatch intent was still
one row, `provider_outcome='unknown'`, with automatic retry
disabled. No signing key entered the Vitest process.

The final local `tsc --noEmit` rerun had **only** the three previously
documented unrelated `lib/media/lambda-render.ts` Remotion
dependency/type errors; no new errors in the bridge or its tests.
`node --check` on the modified replay script and
`git diff --check` passed. No GitHub CI, production operation,
live Meta API request or migration was triggered. The owned Docker
resources were cleaned by the runner.

## Issuer key rotation proof — 23 October (isolated only)

See `docs/calendar-issuer-rotation-decision-20261023.md` for the
design, JWKS retirement test and the unresolved hosted Supabase OIDC
feasibility issue. Two ephemeral RSA key pairs were generated only in
the closed replay parent process; one owned PostgREST verifier was
reconfigured from two trusted public keys to the new key alone.
`CROSS-TREE OPERATOR JWT ROTATION PASS` and
`CROSS-TREE REPLAY PASS` completed with exit code 0.
The old JWT passed only during the trust-overlap and was denied
HTTP 401 after retirement; new JWT continued working.
Wrong `kid` and tampered subject were denied. Existing review and
dispatch-intent records stayed unchanged (`provider_outcome=unknown`,
two human-only notes, one locked intent). Local Node rotation tests
were 5/5 and calendar regression Vitest tests 55/55. All resources
were test-owned and cleaned, with no production route, SQL migration,
network exposure, Meta API request, hosted OIDC or CI execution.
Supabase's Custom OIDC uses HTTPS discovery and documents
`authenticated` as the signed-in role; raw PostgREST custom-role
success is not evidence that a hosted Supabase Data API will
accept custom operator roles. Supabase's third-party key discovery
may lag by up to 30 minutes. Keep PR #504 DRAFT.

## Native hosted-role operator alternative — 23 October (isolated only)

Read-only catalog checks of the existing AI Operating Platform
hosted Supabase project confirmed the standard `authenticated`
and `authenticator` roles and the `auth.sessions` fields needed
for strict session checks. No fixture custom operator role was
installed or SQL migrated in production. The new test-only
`lib/calendar/scheduled-authenticated-operator-role-probe.sql`
adds purpose-specific human-history and human-observation
`SECURITY DEFINER` RPCs callable by the standard
`authenticated` role. Each query independently requires
a signed native-style JWT, nonanonymous active `auth.sessions`
membership and an administrator-maintained active project/operator
mapping. Direct tables, raw sessions, provider tokens, the
privileged helper and receipt/finalization interfaces remain
inaccessible. The integration passed
`CROSS-TREE HOSTED AUTHENTICATED ACL PASS`,
`CROSS-TREE HOSTED AUTHENTICATED OPERATOR PASS` and
`CROSS-TREE REPLAY PASS` (exit code 0). Revoked, missing, expired
or mismatched synthetic sessions and foreign users/projects
failed closed; a session revoked before JWT expiry could not
read again. It reused the prior immutable two-item human audit
without adding a third item or unlocking the one durable
dispatch intent. This is only an isolated **alternative
feasibility test**, not a production RLS/definer/callgraph audit,
real Supabase Auth session validation, deployment, Meta verification
or hosted Data API permission rollout. See
`docs/calendar-hosted-authenticated-role-decision-20261023.md`.

## Native operator privileged SQL catalog audit — 23 October (test-only)

The new read-only catalog checker in
`apps/web/scripts/calendar-native-definer-surface.mjs` checks
the three native `SECURITY DEFINER` operator functions and four
RLS-protected fixture tables. It verifies function owner, volatility,
language, `search_path`, exact scoped EXECUTE grants (including
PUBLIC/anon/service/scheduler refusal), table RLS/direct privileges,
the explicitly referenced SQL object set and SHA-256 of the exact
PostgreSQL `pg_get_functiondef` text. All three fingerprints are
pinned, so changed function definitions now fail the replay pending
an explicit review. The native fixture's minimal `auth.sessions`
bootstrap was set to RLS enabled for defense in depth.

The first full replay captured baseline hashes, and a second
full replay with these hashes enforced completed successfully:
`CROSS-TREE REPLAY PASS`, exit code 0. Four native catalog-audit
unit tests passed, including intentional drift of **in-memory
catalog data** (permission changes, missing or altered functions,
search-path, dynamic SQL/reference injection, body fingerprints
and table privilege/RLS drift). The eight earlier calendar Vitest
suites passed 55/55 tests; the four environment-gated integration
tests ran in the full PostgREST replay. No destructive or rollback
DDL mutation test was run against the actual database, and no live
Supabase mutation was made.

A separate security decision report,
`docs/calendar-native-definer-audit-20261023.md`, records the
exact limited call/reference graph, normalized definition hashes,
and outstanding gaps. Read-only catalog checks of the hosted
AI Operating Platform project showed 116 public SECURITY DEFINER
functions, including eight callable by `authenticated` and seven
by `anon`. Seven are named trigger/guard functions. The eighth
(`atlas_grant_m4_execution_authorization`) was inspected and
contains project-owner, signed-in-user, target and pending-action
gates; this is not a confirmed vulnerability. The new native
operator RPCs still require a separate production-ready human
security review because Supabase warns about
`authenticated`-callable SECURITY DEFINER functions. Current
recommendation: keep PR #504 DRAFT; no production migration,
function grant, identity/Meta key or external publication.

## Calendar triggers and privileged callback-body gate — 23 October

The previous static catalogue of scheduled write-table triggers is
now upgraded to `apps/web/scripts/calendar-trigger-chain-audit.mjs`
with pinned `pg_get_triggerdef` hashes for **15** actual isolated
triggers and `pg_get_functiondef` hashes for their **eight** unique
callback functions, plus the HMAC/source-revision begin gate (one more
function). The observed and locked `CROSS-TREE TRIGGER CHAIN PASS`
inventory covers `projects`, `social_schedule_jobs`,
`social_publications`, `social_schedule_events`,
`social_publication_events` and the test-only human-observation
audit table. Five focused native tests passed (including negative
in-memory catalog mutation), all 55 existing calendar Vitest cases
passed, and the full PostgreSQL 17/PostgREST replay completed
`CROSS-TREE REPLAY PASS` with exit code 0 after checking the pinned
fingerprints. The audit is intentionally **bounded and static**:
dynamic SQL/unqualified callees and all canonical scheduler RPC
dependencies still need manual source review. The actual hosted
project still lacks the test-only calendar source-write gates.
See `docs/calendar-trigger-chain-audit-20261023.md` for trigger
semantics, observed production/fixture differences and remaining
release blockers. No production code/migrations, grants, Meta,
deployment or CI workflows were changed.

## Six scoped scheduler RPC → six private unchecked bodies — 23 October

`calendar-worker-rpc-callchain-audit.mjs` now locks the actual
isolated PostgreSQL `pg_get_functiondef` hashes, direct qualified
calls/references, owner, privilege grants and search paths for
**15** named privileged SQL functions: six externally scoped
scheduled-worker RPCs, six renamed internal elevated bodies, and
three subject/project guards. The six internal routines and all
three guard helpers lack direct EXECUTE access from the scoped
worker role. The code scanner correctly classifies qualified
`INSERT INTO public.table(...)` expressions as table operations,
not direct function calls. The first complete replay recorded
the actual source hashes; a second replay with all pins enforced
passed `CROSS-TREE WORKER RPC CHAIN PASS` and
`CROSS-TREE REPLAY PASS` (exit 0). Six native catalogue unit tests
and all 55 previous calendar Vitest tests passed; the four
conditional environment-only cases run in the owned SQL/PostgREST
replay. The work does **not** certify transitive helper code,
provider receipt authenticity or production privileges.
See `docs/calendar-worker-rpc-callchain-audit-20261023.md`
for the six wrapper mappings, seven unreviewed direct helper
names and remaining release gates. No CI, production grants,
migration, live Meta/API call or other development branch changed.
