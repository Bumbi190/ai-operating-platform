# The Prompt review packet: broad web regression results

This records the actual complete broad Vitest run on Windows after the main synchronization. It is not a clean-suite or production-release claim. The final narrow input and repeatable-account fixture fixes are separately verified by the final scoped rerun.

Command from apps/web:

`node ../../node_modules/vitest/vitest.mjs run --no-file-parallelism --reporter=default --reporter=json --outputFile=../../.superpowers/sdd/2026-10-18-the-prompt-video-review-packet/task5-full-web-final.json`

## Actual totals

| Metric | Count |
| --- | ---: |
| numTotalTests | 15294 |
| numPassedTests | 13799 |
| numFailedTests | 377 |
| numPendingTests | 1114 |
| numTodoTests | 0 |
| numTotalTestSuites | 3363 |
| numPassedTestSuites | 3156 |
| numFailedTestSuites | 207 |
| numPendingTestSuites | 0 |
| success | False |

Suite totals above are Vitest JSON counters (nested describe suites may contribute); file-level failures are listed below. New feature results, typecheck, Remotion and exact migration release limits are in [the validation report](the-prompt-news-review-validation.md).

## Subsequent narrow fixes and reruns

Nine news-store failures below came from a temporary lifecycle FOR SHARE helper iteration that correctly hit the real read-only ACL. The final helper removes that extra lock and relies on the existing project-locked lifecycle RPC; no lifecycle UPDATE grant was added. Final scoped154/154 and fresh24/24 pass. Three security/registry failures below are fixed by classifying the proposed table SERVER_ONLY as created-not-live; the209-test security rerun passes without any allowlist change. Other broad failures remain unresolved, and all original failed names remain below.

The JSON assertion statuses also contain4 pending cases, separate from1114 skipped;665 test files ran. The later-added review-races file is covered by the final scoped run.

## Failed test files and exact cases

Failures are recorded by name, not assumed harmless. Windows path separators, missing grep, pinned historical source hashes and unenabled separate SQL fixtures are observed categories in the run. Changes to unrelated product code were not made to suppress these checks.

### lib/website-build/api.test.ts

- website build API authorization and durable results unknown_artifact_is_404_and_export_is_private_verified_utf8

### lib/website-build/chat-tools.test.ts

- Website build through actual authenticated chat tool loop queues one durable build and gives its actual workspace link
- Website build through actual authenticated chat tool loop foreign project and conversation never create a session
- Website build through actual authenticated chat tool loop emits a typed plan from a real draft without creating a decision
- Website build through actual authenticated chat tool loop compact approval without a visible reference does not dispatch a build
- Website build through actual authenticated chat tool loop model-supplied confirmation cannot approve or start
- studio execution capabilities at the actual chat route denies a provider-returned global media action in Studio while ordinary operator chat keeps it

### lib/social-launch/news-review/store.test.ts

- evidence_rls_append_only_and_composite_scope
- atomic_multichannel_retry_and_changed_snapshot_conflict
- concurrent_prepare_has_one_result_per_channel
- concurrent_review_vs_changed_revision
- expired_or_stopped_cannot_approve
- server_wrapper_builds_evidence_without_accepting_client_flags
- second_channel_failure_rolls_back_first_channel
- new_ingestion_does_not_refresh_original_49_hour_source
- actual_concurrent_edit_prevents_old_revision_approval

### lib/social-launch/scheduling/store.test.ts

- rejects a reused occasion identity across batches
- does not repeatedly claim a release waiting without evidence ahead of an ordinary occasion

### lib/social-launch/scheduling/worker.test.ts

- processing Instagram containers yield to other jobs and remain eligible on later ticks

### lib/project/lifecycle/store.test.ts

- owner lifecycle and real static worker fences commit winning the project lock finishes before archive and its verified artifact stays readable

### lib/qa/activity-stream.test.ts

- aktivitet · the rollback body is the body it replaced is pinned by hash

### lib/qa/admission-inventory.test.ts

- G3C-2A · run admission has exactly one door no runtime module writes runs.status = running directly
- G3C-2A · run admission has exactly one door the drain is the only caller, and it goes through the canonical RPC
- G3C-2A · run admission has exactly one door no runtime module claims a due workflow instance outside the RPC
- G3C-2A · run admission has exactly one door queueing a run remains open — it is control-plane state, not execution

### lib/qa/atlas-chat.test.ts

- atlas chat · the route contract it speaks emits the transcript events and the two typed website effects
- atlas chat · the route contract it speaks does not observe a client abort — which is why there is no stop control

### lib/qa/atlas-knowledge-boundary.test.ts

- NO PRODUCTION CONSUMER — Phase 1 wires nothing the only importers are the operator harness and these QA tests
- PROJECTION SOURCE — a local boundary, never an Atlas one the only importers are the operator script and its QA suite

### lib/qa/atlas-knowledge-snapshot.test.ts

- golden artifacts — independently derived bytes documents.jsonl matches the golden byte for byte
- golden artifacts — independently derived bytes knowledge-manifest.json matches the golden byte for byte
- golden artifacts — independently derived bytes the identity preimage matches the golden byte for byte, with no trailing LF

### lib/qa/atlas-latency.test.ts

- Atlas latency · timing never becomes visible content keeps the visible reply fed only by text events
- Atlas latency · timing never becomes visible content does not touch the reply from the timing branch

### lib/qa/atlas-memory-dream-producers.test.ts

- 2B-2 · placement and boundaries no M4 recall can feed Dream — the producer closure has no recall seam

### lib/qa/atlas-memory-emit-durability.test.ts

- Slice 2A — no memory emit is ever detached every recordMemoryEvent call in production code is awaited, at exactly the known sites
- Slice 2A — no memory emit is ever detached the drain helper that emits workflow-action outcomes is itself awaited
- Slice 2A — no memory emit is ever detached the Slice 2B-1 emit helpers are awaited at exactly their known call sites

### lib/qa/atlas-memory-terminal-outcomes.test.ts

- 2B-1 · placement and boundaries in the workflow runtime only advance-completed.ts writes memory, and nothing reads it back

### lib/qa/autonomy-bind-guards.test.ts

- the atomic bind migration is the only EXEMPT bind migration after Phase 3B1A (M0, 3B1B2 M1, M2, M3, M4-A and M4-B are the reviewed successors)

### lib/qa/autonomy-license.test.ts

- Phase 2C — the migration does not collide with the chain it joins names itself so it sorts last in the current canonical set
- Phase 2C — hardening H7. the machine write seam is closed at the code level
- Phase 2C — review #2 proofs §9. no production runtime outside this module calls the RPC or drives the store
- Phase 2C — inertness 52. no other atlas subsystem consumes the licence MACHINERY

### lib/qa/autonomy-runtime-foundation.test.ts

- the Chapter 18 scale has exactly ONE declaration the scan actually reaches middleware.ts

### lib/qa/autonomy-trace-guards.test.ts

- migration discipline Phase 2C is byte-identical to its merged form — no historical edit
- migration discipline the new migration sorts after every pre-existing migration
- Phase 3B1A remains INERT no execution module consumes the trace or its writer

### lib/qa/budget-retry-lifecycle.test.ts

- THE MEASURED REASON KEYS STAY DORMANT GUARD — no shipped call site passes an idempotency key

### lib/qa/budget-scopes.test.ts

- canonical comments describe the FINAL code states the invariant it actually implements, in the TOP-LEVEL header
- canonical comments describe the FINAL code gives the stale-open reason wherever stale replay is described

### lib/qa/canonical-evidence-pin.test.ts

- B — every workflow evidence reader, pinned the inventory is COMPLETE — no sixth reader exists
- B — every workflow evidence reader, pinned the shared helper is the only place the pin is computed

### lib/qa/cl-shadow.test.ts

- runContextShadow — fire-and-forget containment delivers a diff to the sink and resolves void (assembled context never escapes)

### lib/qa/content-center.test.ts

- content center · the rollback body is the body it replaced is pinned by hash, its own doc comment included

### lib/qa/delegation-mission-activation.test.ts

- Mission activation through an accepted Delegation ACTIVATES with an accepted current delegation plus a separate activate authorization
- Mission activation through an accepted Delegation the activate authorization is SEPARATE — acceptance does not substitute for it
- accepted-delegation availability is Mission- and version-specific a proof for Mission A does not answer for Mission B in the same project
- accepted-delegation availability is Mission- and version-specific a version-1 acceptance does not answer for version 2
- coverage: a narrowed envelope proves only what it covers (§21.13) an envelope carrying one tool does not prove the mission other tool
- the underlying availability source still has to say yes a throwing source fails closed rather than propagating
- the underlying availability source still has to say yes caches nothing — a revocation between two evaluations changes the answer
- live Mission invalidation collapses the proof (§21.14) a revoked APPROVE authorization invalidates the proof
- live Mission invalidation collapses the proof (§21.14) a governing Decision that stops governing invalidates the proof
- live Mission invalidation collapses the proof (§21.14) a non-operational project mode invalidates the proof
- R2 — a terminal Mission ends the handoff (§21.27) a failed Mission makes the accepted delegation unusable

### lib/qa/desktop-commander-unlicensed.test.ts

- nothing in production can reach the host the scan can actually fail — it finds the production tree
- nothing in production can reach the host no module imports the Desktop Commander MCP package
- nothing in production can reach the host no module spawns the Desktop Commander server
- nothing in production can reach the host no module opens an MCP client or transport at all
- nothing in production can reach the host the declaration is imported by no production module

### lib/qa/execution-contract-propagation.test.ts

- every governed spend supplies an explicit execution contract all runtime withGovernedSpend calls pass `execution`
- every governed spend supplies an explicit execution contract only the sanctioned provider modules call the boundary at all
- every governed spend supplies an explicit execution contract nothing defaults, coalesces or invents an execution contract
- every governed spend supplies an explicit execution contract test-only fixtures never leak into runtime code
- OPERATOR_INTERACTIVE is the only stop bypass, so its construction is allowlisted only the allowlisted files construct it
- classification follows authentication, not filenames cron-only execution paths declare AUTONOMOUS
- every runtime GLOBAL_ONLY is reviewed and justified no unreviewed file constructs GLOBAL_ONLY
- ExecutionStoppedError does not leak operator-authored text nothing reads a StopDecision’s observed prose outside the authority

### lib/qa/executive-brief-apex.test.ts

- EI-S1.5A — no shared-secret Executive Brief read surface exists no Executive Intelligence READ route authorizes on the shared secret
- EI-S1.5A — no shared-secret Executive Brief read surface exists leaves CRON_SECRET intact for unrelated scheduler routes

### lib/qa/executive-intelligence-schema-activation.test.ts

- EI-S1.6A — Executive Intelligence schema activation bundle keeps the legacy EI companion count at exactly 83 enforced migrations

### lib/qa/external-dispatch-guards.test.ts

- G1 · every external write in the tree has a canonical dispatch boundary every external write CALL SITE has its own authorization
- G1 · every external write in the tree has a canonical dispatch boundary the inventory itself is non-empty and finds the known callers
- G1 · every external write in the tree has a canonical dispatch boundary no governance assertion is parked behind an unreachable branch
- G4 · the legacy global-only helper is no longer an authority no runtime module calls checkAutomationPaused
- G5 · the row’s project binds execution, not the billing slug step3 binds the row it already loaded

### lib/qa/global-auth-retired.test.ts

- the global key verifier is gone no PRODUCTION module defines the helpers
- the global key verifier is gone no production module reads the global key from the environment
- no route can reach a global key path finds route files at all — the scan must be able to fail
- no route can reach a global key path zero routes call the helpers, directly or via one hop
- no route can reach a global key path zero route files import from api-auth for anything but cron
- the cron class survived the deletion cron routes still use CRON_SECRET directly

### lib/qa/global-design-tokens.test.ts

- global design · every token a stylesheet needs exists scans the real stylesheets, including the surfaces that carried the defect
- global design · every token a stylesheet needs exists no CSS module uses a shadcn HSL triple bare as a colour

### lib/qa/handlarborsen-visual-pulse.test.ts

- Handlarborsen overview hierarchy places charts after KPI and before secondary pulse, collapsing only the breakdown

### lib/qa/leads-dual-accept.test.ts

- containment no other route imports the leads auth resolver
- containment no other route imports the credential primitive

### lib/qa/leads-legacy-auth-removed.test.ts

- global legacy HTTP surface finds route files at all — the scan must be able to fail
- global legacy HTTP surface no route reaches requireApiKey or requireUserOrApiKey, directly or via one hop
- global legacy HTTP surface no route file reads AIOPS_API_KEY
- global legacy HTTP surface leaves cron auth untouched and still reachable

### lib/qa/legacy-v1-api-removed.test.ts

- drift-guard — manifest ↔ filsystem varje manifestpost har en route-fil
- auth-kärnan behålls — Familje-Stunden är beroende av den /business/leads är fortfarande registrerad
- auth-kärnan behålls — Familje-Stunden är beroende av den /business/campaigns är fortfarande registrerad
- auth-kärnan behålls — Familje-Stunden är beroende av den /business/revenue är fortfarande registrerad
- auth-kärnan behålls — Familje-Stunden är beroende av den /chat/tts är fortfarande registrerad

### lib/qa/licensed-bind-m4b-guards.test.ts

- M4-B is the last migration and leaves the exempt bind untouched no migration after M4-B, and M4-B does not redefine the exempt bind

### lib/qa/marketing-review.test.ts

- marketing review · the rollback body is the body it replaced is pinned by hash, its own doc comment included
- marketing review · the rollback body is the body it replaced the client component it renders is untouched
- marketing review · rendered surface and layout the controls stay visible without the shared foreground token

### lib/qa/media-orchestration-retry-authority.test.ts

- the article hero call site carries the authority every production withRetry around the orchestrator carries it

### lib/qa/memory-vnext.test.ts

- Minne vNext · generation and frozen legacy pins the mechanically moved legacy body
- Minne vNext · generation and frozen legacy keeps the existing API and Memory helpers byte-identical

### lib/qa/migration-security-gate.test.ts

- Phase 9AA — the real corpus passes, and only by exact review replays every migration and the bootstrap without an unparsed security statement
- Phase 9AA — the real corpus passes, and only by exact review every blocking finding is matched by a reviewed exception

### lib/qa/mission-brief-v1.test.ts

- Canonical vocabulary (§20.11, §20.98) supports all sixteen §20.98 statuses in the public type

### lib/qa/money-overview.test.ts

- pengar · the rollback body is the body it replaced is pinned by hash

### lib/qa/monthly-release-v2.test.ts

- v1 is registered in production and must not move MUTATION — the v1 YAML still hashes to the pinned upstream value
- v2 is vendored, never authored here the vendored YAML matches the pinned upstream hash
- v2 is vendored, never authored here the committed JSON is the generated form of the vendored YAML

### lib/qa/muapi-media-provider.test.ts

- no credential and no live default reaches the repository no tracked file assigns a non-placeholder MuAPI key
- no credential and no live default reaches the repository no production module writes MuAPI config at runtime
- no credential and no live default reaches the repository no production module hands out a credential outside config.ts
- no credential and no live default reaches the repository the committed env template contains only empty placeholders
- no credential and no live default reaches the repository nothing outside the provider directory imports the MuAPI adapter directly
- nothing generates media on its own exactly ONE governed module calls a generation method
- nothing generates media on its own no route, cron or workflow calls a generation method
- nothing generates media on its own the provider layer is not imported by any route or cron

### lib/qa/platform-credential-events.test.ts

- Settings S0 · platform_credential_events migration — append-only and server-only RLS on, no policy, every client grant revoked, and the service role holds SELECT and INSERT only
- Settings S0 · platform_credential_events migration — append-only and server-only touches no other object and carries no data statement
- Settings S0 · platform_credential_events — the search_path follow-up pins the append-only function's search_path, and does nothing else

### lib/qa/project-api-credentials.test.ts

- inertness — Phase 1 changes no existing auth is imported by no route directly — only via the leads-scoped resolver

### lib/qa/project-command-center.test.ts

- project command center · legacy rollback keeps the legacy body byte-identical to the page it replaced
- project command center · Marknadsplatsstatistik link the view renders it as a plain link, with no project name of its own

### lib/qa/project-workspace-vnext.test.ts

- project workspace B1 · generation and legacy rollback keeps the six legacy route bodies byte-for-byte from the reviewed base
- project workspace B1 · generation and legacy rollback moves the exact workflow editor behind /edit without changing its implementation
- project workspace B1 · generation and legacy rollback keeps the previous output component and deletion endpoint untouched while stating whole-run deletion

### lib/qa/provider-dispatch-certainty.test.ts

- no consumer of ProviderDispatchUnknownError weakens it none converts the ambiguity into a not-dispatched claim

### lib/qa/release-gate-proof-workflow.test.ts

- the proof definition is vendored, minimal and read-only the vendored file matches its pinned source hash
- single-remote-read authority the ONLY writer of AUTOMATED evidence is the executor

### lib/qa/review-queue.test.ts

- phase 11 · scope, authority and boundaries adds no endpoint, no migration and no schema change
- phase 11 · the legacy rollback is the page that shipped the legacy body is the previous page verbatim — pinned by hash

### lib/qa/schema-security-invariant.test.ts

- Phase 9Y — schema-security invariant: migration text, forward-looking every public table CREATED by a migration is present in the registry, or recorded as not-live

### lib/qa/scoped-read-isolation.test.ts

- 9A · every caller supplies scope canonically has exactly one production caller, and it passes a resolved allow-list

### lib/qa/sdf1b2-code-work-operator-plane.test.ts

- SDF-1B2 read isolation and no-execution boundary keeps migration 80 byte-identical

### lib/qa/sdf1c-broker-claim-credential.test.ts

- SDF-1C1B migration and structural boundary adds no route, no broker CLI command and no execution/model code

### lib/qa/sdf1c-trusted-broker.test.ts

- SDF-1C1 repository, secret and no-execution boundary exposes only enrollment and identity diagnostics, never execution capability

### lib/qa/sdf1c2-broker-control-channel.test.ts

- SDF-1C2 structural boundary exposes exactly the six purpose-specific broker routes and no generic boundary

### lib/qa/sdf1c3-isolation-integration.test.ts

- SDF-1C3A real Git: the preparation substrate against a synthetic repository, with the real toolchain prepares an isolated worktree at the pinned commit and stays inside the approved parent

### lib/qa/sdf1c3-isolation-substrate.test.ts

- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller resolves only from fixed absolute candidates and issues an unforgeable-by-shape tool
- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller refuses relative, missing, non-regular, non-executable, group/other-writable, foreign-owned and unsafe-ancestor candidates
- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller follows a symlink to its real target and judges the target (a link cannot launder trust)
- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller the runner refuses a tool object that did not come from the resolver
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment only a broker-made command can run, and run() takes nothing but the command (no env, args or executable)
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment never enables a shell and runs exactly the trusted executable with direct argv
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment does not inherit the parent environment: secrets in process.env never reach a child
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment bounds stdout/stderr before returning
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a timeout kills the child (TERM, then KILL) and reports timedOut
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment logs nothing and never puts a command line or secret in a result or thrown message
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a planted user gitconfig, hooks, filters and credential helper are unreachable (real git)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) prepares a worktree at exactly the pinned commit with a closed, path-free result
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) is deterministic: same work → same branch, directory and hashes
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts only trusted structured input; the caller cannot choose branch, directory, parent or arguments
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (uppercase)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (39 chars)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (41 chars)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (abbreviated)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (a ref name)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (non-hex)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (option-like)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (empty)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a pin that is not a commit object present locally (missing, blob, tree, annotated tag) and never fetches
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) returns STALE_BASE, exactly and without fetching, when the approved base ref moved
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) needs no network at all (an unreachable origin cannot matter)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong host
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses file remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses plain path remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses credentials in URL
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses sub-path
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts SCP, ssh and case-different forms of the SAME identity, and refuses a second identity or a missing remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (filter driver) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (fsmonitor) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (hooksPath) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (credential helper) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (include) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (ssh command) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (shell alias) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked, non-directory, non-canonical or non-repository root, and a linked worktree used as root
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked or non-canonical worktree parent and never creates it
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses every collision without touching the existing state (path, dangling link, file, branch, worktree)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) a worktree elsewhere already holding the branch or the path is a conflict
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) does not follow a symlink planted in the future target path
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) verifies after creation and, on any failed check, keeps the workspace (explicit_cleanup_only) and says so
- SDF-1C3A real-filesystem containment primitives verifies canonical roots only
- SDF-1C3A real-filesystem containment primitives reads existing files only when no segment is a symlink and the realpath is the lexical path
- SDF-1C3A real-filesystem containment primitives a write-intent check additionally refuses hardlinks and non-regular files
- SDF-1C3A real-filesystem containment primitives verifies a prospective create against its deepest existing ancestor
- SDF-1C3A real-filesystem containment primitives refuses NUL
- SDF-1C3A real-filesystem containment primitives refuses newline
- SDF-1C3A real-filesystem containment primitives refuses tab
- SDF-1C3A real-filesystem containment primitives refuses DEL
- SDF-1C3A real-filesystem containment primitives refuses parent traversal
- SDF-1C3A real-filesystem containment primitives refuses embedded traversal
- SDF-1C3A real-filesystem containment primitives refuses absolute
- SDF-1C3A real-filesystem containment primitives refuses double slash
- SDF-1C3A real-filesystem containment primitives refuses dot segment
- SDF-1C3A real-filesystem containment primitives refuses trailing slash
- SDF-1C3A real-filesystem containment primitives refuses backslash
- SDF-1C3A real-filesystem containment primitives refuses windows drive
- SDF-1C3A real-filesystem containment primitives refuses empty
- SDF-1C3A real-filesystem containment primitives refuses surrounding space
- SDF-1C3A real-filesystem containment primitives refuses non-NFC (NFD é)
- SDF-1C3A real-filesystem containment primitives refuses .git
- SDF-1C3A real-filesystem containment primitives refuses nested .git
- SDF-1C3A real-filesystem containment primitives refuses .GIT case
- SDF-1C3A real-filesystem containment primitives refuses .env
- SDF-1C3A real-filesystem containment primitives refuses .env.local
- SDF-1C3A real-filesystem containment primitives refuses .ENV.production
- SDF-1C3A real-filesystem containment primitives refuses .ssh
- SDF-1C3A real-filesystem containment primitives refuses .aws
- SDF-1C3A real-filesystem containment primitives refuses secrets dir
- SDF-1C3A real-filesystem containment primitives refuses pem
- SDF-1C3A real-filesystem containment primitives refuses key
- SDF-1C3A real-filesystem containment primitives refuses service account
- SDF-1C3A real-filesystem containment primitives refuses not a string
- SDF-1C3A real-filesystem containment primitives accepts ordinary NFC unicode names
- SDF-1C3A real-filesystem containment primitives opens for reading with O_NOFOLLOW and refuses a final component that became a symlink
- SDF-1C3A SandboxSpec and Docker command construction refuses every docker verb outside the closed set and every malformed target
- SDF-1C3A Docker host proof (VM-backed Docker Desktop required for production) derives the daemon socket only from a fixed host-side list (no DOCKER_HOST, no remote, no other socket)
- SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution adds no broker route, and the route set is exactly the 1C2 control channel
- SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution only the approved isolation modules can ISSUE an InfraCommand: brokerCommand is not reachable from any other production module

### lib/qa/session-only-routes.test.ts

- source invariants no route imports requireUserOrApiKey any more
- source invariants exactly ONE route surface still accepts the global key

### lib/qa/social-credentials.test.ts

- social credentials · no consumer reaches a credential any other way no deployed code names a retired environment credential or a global account identity

### lib/qa/spend-financial-decoupling.test.ts

- §14 · each flag has exactly ONE production reader H1_SPEND_GATE is read only in spend-gate-flag.ts
- §14 · each flag has exactly ONE production reader H1_FINANCIAL_EXECUTION is read only in financial-execution-flag.ts

### lib/qa/survival-funding-sql.test.ts

- funding · the declaration and its reader semantics starts UNDECLARED — NULL is the absence of a declaration, with no default
- funding · the declaration and its reader semantics a positive declaration is stored exactly, and audits one SET
- funding · the declaration and its reader semantics ZERO is a KNOWN declaration, never a clear
- funding · the declaration and its reader semantics NEGATIVE is a KNOWN declaration — the sign is not this schema's policy
- funding · the declaration and its reader semantics CLEAR persists NULL, and is distinguishable from a zero declaration
- funding · the declaration and its reader semantics re-setting the SAME value writes nothing — no audit trail of non-events
- funding · the declaration and its reader semantics the RESPONSE equals current truth and the audit row, exactly
- funding · invalid input is refused at the boundary refuses NaN and both infinities
- funding · invalid input is refused at the boundary refuses an absent actor — the ledger cannot record an anonymous change
- funding · invalid input is refused at the boundary none of those probes changed the declaration or wrote an audit row
- funding · the declaration is persisted EXACTLY, never rounded ACCEPTS every exactly-representable shape
- funding · the declaration is persisted EXACTLY, never rounded REFUSES anything that would be silently rounded
- funding · the declaration is persisted EXACTLY, never rounded REFUSES anything outside the numeric(12,4) range
- funding · the declaration is persisted EXACTLY, never rounded ACCEPTS trailing zeros, which is not precision loss
- funding · the declaration is persisted EXACTLY, never rounded the no-op comparison uses the CANONICAL stored value
- funding · the actor must be a canonical authenticated human ACCEPTS the canonical user:<uuid> shape
- funding · the actor must be a canonical authenticated human REFUSES machine-shaped and malformed actors through the RPC
- funding · the actor must be a canonical authenticated human REFUSES the same shapes at the TABLE, not only at the RPC
- funding · the actor must be a canonical authenticated human a refused actor leaves the declaration and the ledger untouched
- funding · current truth is a SERVER-ONLY singleton exists, and holds exactly the singleton row
- funding · current truth is a SERVER-ONLY singleton is the ONLY place the declaration lives — platform_config does not carry it
- funding · current truth is a SERVER-ONLY singleton has RLS on and ZERO policies, so no client can read it through a policy
- funding · current truth is a SERVER-ONLY singleton grants anon and authenticated NOTHING
- funding · current truth is a SERVER-ONLY singleton grants service_role SELECT and nothing else
- funding · current truth is a SERVER-ONLY singleton refuses every direct write by service_role
- funding · current truth is a SERVER-ONLY singleton refuses every direct write by anon and authenticated
- funding · current truth is a SERVER-ONLY singleton the canonical RPC is the ONLY writer that can exist — and it works
- funding · current truth is a SERVER-ONLY singleton the singleton constraint refuses a second row even from the owner
- funding · the change and its evidence are atomic every change writes EXACTLY ONE audit row, and every audit row has a change
- funding · the change and its evidence are atomic the ledger is NOT the current truth — clearing it would not change the declaration
- funding · the change and its evidence are atomic concurrent setters serialise: the predecessor each records is the real one
- funding · the audit ledger cannot be rewritten refuses UPDATE
- funding · the audit ledger cannot be rewritten refuses DELETE
- funding · the audit ledger cannot be rewritten refuses TRUNCATE
- funding · the audit ledger cannot be rewritten refuses a direct INSERT by service_role, and by anon
- funding · the audit ledger cannot be rewritten closes the event vocabulary, so a row cannot name an event no reader interprets
- funding · exactly one current source, and history is never it the setter reads and writes the singleton, and never platform_config
- funding · exactly one current source, and history is never it the setter never reads the ledger to decide what is declared now
- funding · exactly one current source, and history is never it no function anywhere reads the ledger as current funding truth
- funding · exactly one current source, and history is never it the declaration column exists on exactly ONE table in the schema
- funding · least privilege anon and authenticated can neither read the ledger nor call the setter
- funding · least privilege service_role reads the ledger and executes the boundary, and writes neither table
- funding · least privilege the setter is SECURITY DEFINER with a fixed empty search_path
- funding · least privilege the ledger sequence is revoked from every role
- funding · scope completeness, answered without exposing anything is TRUE only when the set contains every project
- funding · scope completeness, answered without exposing anything is FALSE for a subset — a single project is never the platform
- funding · scope completeness, answered without exposing anything is FALSE for the empty set and for NULL
- funding · scope completeness, answered without exposing anything returns ONE BOOLEAN — never a row, an id or a count
- funding · scope completeness, answered without exposing anything is unmoved by a project added outside the caller set
- funding · a declaration moves nothing else reserves no spend, changes no stop, and issues no authorization
- funding · a declaration moves nothing else does not clear a pause that is already set
- funding · a declaration moves nothing else Phase 2A history is untouched by a funding change

### lib/qa/survival-history-sql.test.ts

- survival history · contract creates exactly one table, and grants write to nobody
- survival history · contract denies INSERT to every role while letting the boundary INSERT
- survival history · the recording boundary is hardened is SECURITY DEFINER with an empty, fixed search_path
- survival history · the recording boundary is hardened PUBLIC, anon and authenticated cannot execute it
- survival history · the recording boundary is hardened service_role holds EXECUTE and nothing broader
- survival history · the recording boundary is hardened has no autonomy, actor or provenance parameter at all
- survival history · the recording boundary is hardened refuses a human or arbitrary actor, even on a direct INSERT
- survival history · the recording boundary is hardened the RPC writes the canonical machine identity, whatever the observer
- survival history · the recording boundary is hardened derives provenance from the version, and refuses every mismatched pair
- survival history · the recording boundary is hardened the RPC takes no provenance argument at all
- survival history · the recording boundary is hardened refuses an impossible state/ceiling pair on a direct INSERT
- survival history · the recording boundary is hardened refuses a policy identity no derivation implements
- survival history · the recording boundary is hardened service_role cannot write the table or the sequence directly
- survival history · the recording boundary is hardened a real anon session is refused, and the boundary is reachable as itself
- survival history · records transitions, not polling noise records exactly one baseline for the first observation
- survival history · records transitions, not polling noise records nothing when the same state is observed again
- survival history · records transitions, not polling noise records exactly one transition when the state really changes
- survival history · records transitions, not polling noise keeps event_seq as the chain order and goes back to NORMAL
- survival history · records transitions, not polling noise answers `unchanged` for a no-op rather than inserting
- survival history · from_state is never the caller’s refuses a direct INSERT whose from_state does not follow the ledger
- survival history · from_state is never the caller’s refuses a second baseline for a project that already has history
- survival history · from_state is never the caller’s refuses a transition that does not change the state
- survival history · append-only, enforced by the database refuses UPDATE
- survival history · append-only, enforced by the database refuses DELETE
- survival history · append-only, enforced by the database refuses TRUNCATE
- survival history · closed vocabularies closes the event, state, ceiling, funding and policy-identity vocabularies
- survival history · closed vocabularies seeds a project with history so the CHECKs, not the guard, are under test
- survival history · closed vocabularies refuses a value outside each closed set, by CHECK
- survival history · closed vocabularies refuses an unsupported to_state at the boundary, before anything is written
- survival history · closed vocabularies the declared amount is biconditional with KNOWN — all four cases
- survival history · closed vocabularies ACCEPTS negative remaining headroom — an overspent scope is valid evidence
- survival history · closed vocabularies refuses a negative limit, burn rate or runway
- survival history · closed vocabularies refuses an unknown event type, which can only arrive by direct INSERT
- survival history · closed vocabularies refuses an unknown project, fail-closed
- survival history · the observation survives the round trip preserves reasons, gaps, ceiling, funding and the distinct funding states
- survival history · the observation survives the round trip keeps UNAVAILABLE distinct from UNDECLARED
- survival history · the observation survives the round trip stores declared funding when KNOWN, and only then
- survival history · the observation survives the round trip keeps MRR a SIGNAL — it never becomes runway, and runway stays unknown without funding
- survival history · the observation survives the round trip records the observation instant separately from the write instant
- survival history · the observation survives the round trip refuses an occurred_at in the future
- survival history · concurrency cannot duplicate a logical transition two concurrent FIRST observations produce ONE baseline
- survival history · concurrency cannot duplicate a logical transition two concurrent observers of the SAME change produce ONE transition
- survival history · concurrency cannot duplicate a logical transition a retry of the same observation is idempotent
- survival history · recording changes neither spend nor the stop leaves the automation pause and the spend ledger untouched

### lib/qa/system-health.test.ts

- phase 12 · authority is preserved, never re-created adds no endpoint, migration or schema change
- phase 12 · the legacy rollback is the page that shipped the legacy body is the previous page verbatim — pinned by hash

### lib/qa/vnext-intelligence-graph.test.ts

- phase 18 · the legacy rollback is the page that shipped renders the legacy canvas byte-identically to origin/main 430259e
- phase 18 · the legacy rollback is the page that shipped keeps the legacy client markup byte-identical
- phase 18 · the legacy rollback is the page that shipped moves the previous page body verbatim into IntelligenceGraphLegacy
- phase 18 · the legacy rollback is the page that shipped leaves the legacy inspector file untouched
- phase 18 · layout, scale and motion is exactly as tall as the vNext shell leaves it, not the legacy CommandBar height
- phase 18 T2a · shell geometry measures the floating corner from the activity peek and the Atlas launcher
- phase 18 T2a · shell geometry goes fullscreen with the header, where the shell chrome is gone
- phase 18 T3b · release hardening opts only Live Operations into the G-27 last-safe guard
- phase 18 T3b · release hardening keeps mobile list-first, System Map, Replay and legacy rollback contracts intact

### lib/qa/website-build-drain.test.ts

- website build dispatch through actual drain route and SQL requires_cron_auth_before_any_build
- website build dispatch through actual drain route and SQL dispatches_website_kind_without_touching_legacy_handlers
- website build dispatch through actual drain route and SQL invalid_artifact_is_terminal_without_automatic_paid_retry
- website build dispatch through actual drain route and SQL in_flight_unknown_waits_for_reconciliation_and_never_looks_like_an_active_build

### lib/qa/workflows-definition-familje-stunden.test.ts

- vendored definition — provenance the vendored YAML matches the pinned upstream hash
- vendored definition — provenance the committed JSON is the generated form of the vendored YAML

### lib/architecture-knowledge/architecture-knowledge.test.ts

- Immutable artifact and runtime loader loads and verifies the committed artifact read-only
- Golden lexical retrieval and server citations routes How are Agents, Tools and Execution Resources registered? to Intelligence Fabric canonical material
- Golden lexical retrieval and server citations routes How are Credentials separated from Agent authority? to Intelligence Fabric canonical material
- Golden lexical retrieval and server citations routes How does multimodal production work? to Intelligence Fabric canonical material
- Golden lexical retrieval and server citations reaches provider-selection material in every canonical book that covers it
- Golden lexical retrieval and server citations supports exact section, chapter, book-title and requirement identifiers
- Golden lexical retrieval and server citations excludes wrong/old versions and returns explicit unavailability
- Golden lexical retrieval and server citations mints exact citations and rejects fabricated, stale or mismatched citations

### lib/architecture-knowledge/executive-knowledge.test.ts

- Generic artifact eligibility invariant accepts the committed artifact while Executive is active and approved
- Generic artifact eligibility invariant rejects an inactive source that reached the artifact
- Generic artifact eligibility invariant rejects an artifact source row that diverged from the registry
- Generic artifact eligibility invariant rejects an artifact source that is not registered at all
- Executive retrieval, citations and policy is an active knowledge source in the committed artifact
- Executive retrieval, citations and policy resolves FM.2 by exact front-matter identifier
- Executive retrieval, citations and policy resolves FM.2 from an implementation-scope query and a canonical Stage 1 query
- Executive retrieval, citations and policy resolves exact Executive chapter and section identifiers
- Executive retrieval, citations and policy answers a governance and authority query from Executive doctrine
- Executive retrieval, citations and policy mints a valid Executive citation and rejects every tampered variant
- Executive retrieval, citations and policy denies internal Executive knowledge to an unauthorized principal and allows an authorized one
- Executive retrieval, citations and policy excludes an inactive, superseded or wrong-version Executive source before ranking

### lib/trading/market-data/import-discipline.test.ts

- the contract boundary is identity, never a provider symbol the domain definitions each still exist exactly once

### lib/trading/market-view/import-discipline.test.ts

- no Node builtin is reachable at runtime from the market-view package proves it across the whole transitive value-import closure

### lib/trading/provider-normalization/recorded-adapter.test.ts

- a transcript gap fails closed never branches on a provider message anywhere in the package

### lib/trading/session-calendar/import-discipline.test.ts

- AD. an answer cannot depend on where or when it runs names an explicit timeZone on every formatter it builds

### lib/trading/replay/import-discipline.test.ts

- no Node builtin is reachable at runtime from the replay package proves it across the whole transitive value-import closure
- Stage 1.5 boundaries reads no wall clock on a trading-state path
