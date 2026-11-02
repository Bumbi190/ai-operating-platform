# Nova voice: full project test accounting

The full project command ran during the pre-review implementation: npm test -- --maxWorkers=1 --minWorkers=1 --reporter=json. Later review fixes and source-inventory reconciliation were rechecked with the focused tests and CI documented in the review. This is not an all-green repository claim.

| Run | Files | Passed | Failed | Pending |
|---|---:|---:|---:|---:|
| Pre-review full project |806|14986|412|1397|
| Exact-main failed-suite baseline |120|2654|406|297|

404named failures reproduce on main;8 have passing current focused rechecks;none remain unclassified. The baseline includes two older failures already corrected by inherited voice work. The requested baseline list contained121paths;one newly added failed-suite path does not exist on main.

| File | Named failing assertion in full run | Classification |
|---|---|---|
| media-queue-read.test.ts | merges dated media cards and retains other sources on media failure | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop queues one durable build and gives its actual workspace link | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop foreign project and conversation never create a session | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop emits a typed plan from a real draft without creating a decision | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop exact visible confirmation bypasses model dispatch and returns a durable receipt | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop compact approval without a visible reference does not dispatch a build | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop model-supplied confirmation cannot approve or start | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop rejects authority fields in visible references before model dispatch | Reproduced on exact main |
| chat-tools.test.ts | Website build through actual authenticated chat tool loop authentication precedes any website tool execution | Reproduced on exact main |
| chat-tools.test.ts | studio execution capabilities at the actual chat route denies a provider-returned global media action in Studio while ordinary operator chat keeps it | Reproduced on exact main |
| test-db-bootstrap.test.ts | canonical website SQL fixture bootstrap prepares plan and Studio prerequisites before mockup review | Reproduced on exact main |
| test-db-bootstrap.test.ts | canonical website SQL fixture bootstrap does not overwrite a deliberate fixture budget when initialized again | Reproduced on exact main |
| api.test.ts | studio HTTP boundary authenticates before parsing or reading privileged data | Reproduced on exact main |
| api.test.ts | studio HTTP boundary creates a private real owner workspace and recovers a repeated response | Reproduced on exact main |
| api.test.ts | studio HTTP boundary refuses cross-origin creation, oversized bodies and injected authority | Reproduced on exact main |
| api.test.ts | studio HTTP boundary rejects unknown or duplicate query selections and malformed child ids | Reproduced on exact main |
| api.test.ts | studio HTTP boundary does not grant observed projects mutation authority | Reproduced on exact main |
| api.test.ts | studio HTTP boundary reports unreadable project inventory without exposing database details as an empty draft | Reproduced on exact main |
| budget.test.ts | explicit studio budgets and billable project identity requires a budget for the exact owned studio conversation and keeps replay idempotent | Reproduced on exact main |
| budget.test.ts | explicit studio budgets and billable project identity uses a compare-and-set and preserves daily/weekly limits instead of overwriting later decisions | Reproduced on exact main |
| budget.test.ts | explicit studio budgets and billable project identity refuses foreign owners, unbounded numbers and mutated routing hints | Reproduced on exact main |
| budget.test.ts | explicit studio budgets and billable project identity opens a verified historical conversation in the same owned studio project | Reproduced on exact main |
| budget.test.ts | explicit studio budgets and billable project identity never exposes audit mutations or budget setters to browser database roles | Reproduced on exact main |
| loader.test.ts | studio project and conversation identity lists only owned projects and does not create a draft just by opening | Reproduced on exact main |
| loader.test.ts | studio project and conversation identity loads project metadata in a bounded batch rather than querying every project separately | Reproduced on exact main |
| loader.test.ts | studio project and conversation identity loads a selected studio conversation with its missing budget and no invented desktop | Reproduced on exact main |
| loader.test.ts | studio project and conversation identity rejects a conversation from another owned project before reading its transcript | Reproduced on exact main |
| loader.test.ts | studio project and conversation identity rejects a session from another owned project before loading its conversation | Reproduced on exact main |
| loader.test.ts | studio project and conversation identity returns the same refusal for foreign and nonexistent project selections | Reproduced on exact main |
| loader.test.ts | real requested folder binding keeps an existing root exact and pending, replays once and refuses changed-key payload | Reproduced on exact main |
| loader.test.ts | real requested folder binding retains a bound new-project child root when the default parent later changes | Reproduced on exact main |
| loader.test.ts | real requested folder binding refuses traversal, reserved Windows names, target mismatch and foreign ownership | Reproduced on exact main |
| output-allowance.test.ts | managed builder output allowance migration upgrades only exact factory v1 configurations, preserving custom agents and budgets | Reproduced on exact main |
| output-allowance.test.ts | managed builder output allowance migration keeps the creation RPC private and rejects an incomplete preset | Reproduced on exact main |
| store.test.ts | owner-bound studio creation in real PostgreSQL serializes two independent SQL connections creating the same studio intent | Reproduced on exact main |
| store.test.ts | owner-bound studio creation in real PostgreSQL recovers a lost creation response without another project, agent or conversation | Reproduced on exact main |
| store.test.ts | owner-bound studio creation in real PostgreSQL creates a conversation for an existing project without replacing its agent or settings | Reproduced on exact main |
| store.test.ts | owner-bound studio creation in real PostgreSQL checks actual database ownership even when a caller names a foreign id in its allowlist | Reproduced on exact main |
| store.test.ts | owner-bound studio creation in real PostgreSQL rejects absent principals and malformed or client-authorizing inputs before creating anything | Reproduced on exact main |
| store.test.ts | owner-bound studio creation in real PostgreSQL rolls back project creation when agent insertion fails | Reproduced on exact main |
| store.test.ts | owner-bound studio creation in real PostgreSQL gives authenticated users owner-only SELECT and no mutation or RPC bypass | Reproduced on exact main |
| api.test.ts | lifecycle HTTP boundary authenticates before privileged reads or body parsing | Reproduced on exact main |
| api.test.ts | lifecycle HTTP boundary reads and changes only the path project with private responses | Reproduced on exact main |
| api.test.ts | lifecycle HTTP boundary refuses injected path authority, cross origin and oversized bodies before admin access | Reproduced on exact main |
| api.test.ts | lifecycle HTTP boundary returns the same 404 for an observed foreign or nonexistent project | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences atomically pauses, versions and replays transitions while restore preserves an unrelated pause | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences refuses foreign, observer, stale and malformed commands and keeps history and folder requests | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences archive winning the project lock fences snapshot and commit even with allow_pause | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences commit winning the project lock finishes before archive and its verified artifact stays readable | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences serializes actual claim and archive in both orders without claiming paused work | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences never revives a skipped locked writer after restore and explicit project resume | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences a project-first writer refuses a busy run without deadlocking canonical claim | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences a project-first control refuses a busy run without deadlocking canonical claim | Reproduced on exact main |
| store.test.ts | owner lifecycle and real static worker fences retries a transient writer lock on the same artifact, but never retries an actual fence | Reproduced on exact main |
| activity-stream.test.ts | aktivitet · the rollback body is the body it replaced is pinned by hash | Reproduced on exact main |
| admission-inventory.test.ts | G3C-2A · run admission has exactly one door no runtime module writes runs.status = running directly | Reproduced on exact main |
| admission-inventory.test.ts | G3C-2A · run admission has exactly one door the drain is the only caller, and it goes through the canonical RPC | Reproduced on exact main |
| admission-inventory.test.ts | G3C-2A · run admission has exactly one door no runtime module claims a due workflow instance outside the RPC | Reproduced on exact main |
| admission-inventory.test.ts | G3C-2A · run admission has exactly one door queueing a run remains open — it is control-plane state, not execution | Reproduced on exact main |
| analysis-draft-sql.test.ts | real_isolated_SQL_privileges_parity_and_concurrency_no_skips | Reproduced on exact main |
| atlas-chat.test.ts | atlas chat · the route contract it speaks has one label here for every tool it offers, and none for a tool it does not | Reproduced on exact main |
| atlas-knowledge-boundary.test.ts | NO PRODUCTION CONSUMER — Phase 1 wires nothing the only importers are the operator harness and these QA tests | Reproduced on exact main |
| atlas-knowledge-boundary.test.ts | PROJECTION SOURCE — a local boundary, never an Atlas one the only importers are the operator script and its QA suite | Reproduced on exact main |
| atlas-knowledge-snapshot.test.ts | golden artifacts — independently derived bytes documents.jsonl matches the golden byte for byte | Reproduced on exact main |
| atlas-knowledge-snapshot.test.ts | golden artifacts — independently derived bytes knowledge-manifest.json matches the golden byte for byte | Reproduced on exact main |
| atlas-knowledge-snapshot.test.ts | golden artifacts — independently derived bytes the identity preimage matches the golden byte for byte, with no trailing LF | Reproduced on exact main |
| atlas-latency.test.ts | Atlas latency · timing never becomes visible content keeps the visible reply fed only by text events | Reproduced on exact main |
| atlas-latency.test.ts | Atlas latency · timing never becomes visible content does not touch the reply from the timing branch | Reproduced on exact main |
| atlas-memory-dream-producers.test.ts | 2B-2 · placement and boundaries no M4 recall can feed Dream — the producer closure has no recall seam | Reproduced on exact main |
| atlas-memory-emit-durability.test.ts | Slice 2A — no memory emit is ever detached every recordMemoryEvent call in production code is awaited, at exactly the known sites | Reproduced on exact main |
| atlas-memory-emit-durability.test.ts | Slice 2A — no memory emit is ever detached the drain helper that emits workflow-action outcomes is itself awaited | Reproduced on exact main |
| atlas-memory-emit-durability.test.ts | Slice 2A — no memory emit is ever detached the Slice 2B-1 emit helpers are awaited at exactly their known call sites | Reproduced on exact main |
| atlas-memory-terminal-outcomes.test.ts | 2B-1 · placement and boundaries in the workflow runtime only advance-completed.ts writes memory, and nothing reads it back | Reproduced on exact main |
| atlas-voice-draft-route.test.ts | server-enforced voice drafting boundary refuses an unadvertised save_workflow during a document turn | Fixed; current focused recheck passed |
| atlas-voice-draft-route.test.ts | server-enforced voice drafting boundary refuses an unadvertised trigger_workflow during a document turn | Fixed; current focused recheck passed |
| atlas-voice-draft-route.test.ts | server-enforced voice drafting boundary refuses every tool on deliberate incomplete-document continuation | Fixed; current focused recheck passed |
| atlas-voice-draft-route.test.ts | server-enforced voice drafting boundary preserves text and continuation metadata after partial_tool | Fixed; current focused recheck passed |
| atlas-voice-draft-route.test.ts | server-enforced voice drafting boundary preserves text and continuation metadata after refusal | Fixed; current focused recheck passed |
| atlas-voice-stream-client.test.ts | PCM stops on handshake instead of changing transport automatically | Fixed; current focused recheck passed |
| atlas-voice-stream-client.test.ts | PCM stops on wire-aborted instead of changing transport automatically | Fixed; current focused recheck passed |
| atlas-voice-stream-client.test.ts | PCM stops on wire-unavailable instead of changing transport automatically | Fixed; current focused recheck passed |
| autonomy-bind-guards.test.ts | the atomic bind migration is the only EXEMPT bind migration after Phase 3B1A (M0, 3B1B2 M1, M2, M3, M4-A and M4-B are the reviewed successors) | Reproduced on exact main |
| autonomy-bind-guards.test.ts | the atomic bind migration the bind-provenance constraint trigger is DEFERRED, INSERT-only, bound-runs-only, and nobody may weaken it | Reproduced on exact main |
| autonomy-license.test.ts | Phase 2C — the migration does not collide with the chain it joins names itself so it sorts last in the current canonical set | Reproduced on exact main |
| autonomy-license.test.ts | Phase 2C — hardening H7. the machine write seam is closed at the code level | Reproduced on exact main |
| autonomy-license.test.ts | Phase 2C — review #2 proofs §9. no production runtime outside this module calls the RPC or drives the store | Reproduced on exact main |
| autonomy-license.test.ts | Phase 2C — inertness 52. no other atlas subsystem consumes the licence MACHINERY | Reproduced on exact main |
| autonomy-runtime-foundation.test.ts | the Chapter 18 scale has exactly ONE declaration the scan actually reaches middleware.ts | Reproduced on exact main |
| autonomy-trace-guards.test.ts | migration discipline Phase 2C is byte-identical to its merged form — no historical edit | Reproduced on exact main |
| autonomy-trace-guards.test.ts | migration discipline the new migration sorts after every pre-existing migration | Reproduced on exact main |
| autonomy-trace-guards.test.ts | Phase 3B1A remains INERT no execution module consumes the trace or its writer | Reproduced on exact main |
| budget-scopes.test.ts | canonical comments describe the FINAL code states the invariant it actually implements, in the TOP-LEVEL header | Reproduced on exact main |
| budget-scopes.test.ts | canonical comments describe the FINAL code gives the stale-open reason wherever stale replay is described | Reproduced on exact main |
| canonical-evidence-pin.test.ts | B — every workflow evidence reader, pinned the inventory is COMPLETE — no sixth reader exists | Reproduced on exact main |
| canonical-evidence-pin.test.ts | B — every workflow evidence reader, pinned the shared helper is the only place the pin is computed | Reproduced on exact main |
| cl-shadow.test.ts | runContextShadow — fire-and-forget containment delivers a diff to the sink and resolves void (assembled context never escapes) | Reproduced on exact main |
| content-center.test.ts | content center · the rollback body is the body it replaced is pinned by hash, its own doc comment included | Reproduced on exact main |
| delegation-mission-activation.test.ts | Mission activation through an accepted Delegation ACTIVATES with an accepted current delegation plus a separate activate authorization | Reproduced on exact main |
| delegation-mission-activation.test.ts | Mission activation through an accepted Delegation the activate authorization is SEPARATE — acceptance does not substitute for it | Reproduced on exact main |
| delegation-mission-activation.test.ts | accepted-delegation availability is Mission- and version-specific a proof for Mission A does not answer for Mission B in the same project | Reproduced on exact main |
| delegation-mission-activation.test.ts | accepted-delegation availability is Mission- and version-specific a version-1 acceptance does not answer for version 2 | Reproduced on exact main |
| delegation-mission-activation.test.ts | coverage: a narrowed envelope proves only what it covers (§21.13) an envelope carrying one tool does not prove the mission other tool | Reproduced on exact main |
| delegation-mission-activation.test.ts | the underlying availability source still has to say yes a throwing source fails closed rather than propagating | Reproduced on exact main |
| delegation-mission-activation.test.ts | the underlying availability source still has to say yes caches nothing — a revocation between two evaluations changes the answer | Reproduced on exact main |
| delegation-mission-activation.test.ts | live Mission invalidation collapses the proof (§21.14) a revoked APPROVE authorization invalidates the proof | Reproduced on exact main |
| delegation-mission-activation.test.ts | live Mission invalidation collapses the proof (§21.14) a governing Decision that stops governing invalidates the proof | Reproduced on exact main |
| delegation-mission-activation.test.ts | live Mission invalidation collapses the proof (§21.14) a non-operational project mode invalidates the proof | Reproduced on exact main |
| delegation-mission-activation.test.ts | R2 — a terminal Mission ends the handoff (§21.27) a failed Mission makes the accepted delegation unusable | Reproduced on exact main |
| design-skill-chat.test.ts | Atlas design knowledge tools is wired into the existing authenticated chat and retains tool-free fast paths | Reproduced on exact main |
| desktop-commander-unlicensed.test.ts | nothing in production can reach the host the scan can actually fail — it finds the production tree | Reproduced on exact main |
| desktop-commander-unlicensed.test.ts | nothing in production can reach the host no module imports the Desktop Commander MCP package | Reproduced on exact main |
| desktop-commander-unlicensed.test.ts | nothing in production can reach the host no module spawns the Desktop Commander server | Reproduced on exact main |
| desktop-commander-unlicensed.test.ts | nothing in production can reach the host no module opens an MCP client or transport at all | Reproduced on exact main |
| desktop-commander-unlicensed.test.ts | nothing in production can reach the host the declaration is imported by no production module | Reproduced on exact main |
| execution-contract-propagation.test.ts | every governed spend supplies an explicit execution contract all runtime withGovernedSpend calls pass `execution` | Reproduced on exact main |
| execution-contract-propagation.test.ts | every governed spend supplies an explicit execution contract only the sanctioned provider modules call the boundary at all | Reproduced on exact main |
| execution-contract-propagation.test.ts | every governed spend supplies an explicit execution contract nothing defaults, coalesces or invents an execution contract | Reproduced on exact main |
| execution-contract-propagation.test.ts | every governed spend supplies an explicit execution contract test-only fixtures never leak into runtime code | Reproduced on exact main |
| execution-contract-propagation.test.ts | OPERATOR_INTERACTIVE is the only stop bypass, so its construction is allowlisted only the allowlisted files construct it | Reproduced on exact main |
| execution-contract-propagation.test.ts | classification follows authentication, not filenames cron-only execution paths declare AUTONOMOUS | Reproduced on exact main |
| execution-contract-propagation.test.ts | every runtime GLOBAL_ONLY is reviewed and justified no unreviewed file constructs GLOBAL_ONLY | Reproduced on exact main |
| execution-contract-propagation.test.ts | ExecutionStoppedError does not leak operator-authored text nothing reads a StopDecision’s observed prose outside the authority | Reproduced on exact main |
| executive-brief-apex.test.ts | EI-S1.5A — no shared-secret Executive Brief read surface exists no Executive Intelligence READ route authorizes on the shared secret | Reproduced on exact main |
| executive-brief-apex.test.ts | EI-S1.5A — no shared-secret Executive Brief read surface exists leaves CRON_SECRET intact for unrelated scheduler routes | Reproduced on exact main |
| executive-intelligence-schema-activation.test.ts | EI-S1.6A — Executive Intelligence schema activation bundle keeps the legacy EI companion count at exactly 83 enforced migrations | Reproduced on exact main |
| external-dispatch-guards.test.ts | G1 · every external write in the tree has a canonical dispatch boundary every external write CALL SITE has its own authorization | Reproduced on exact main |
| external-dispatch-guards.test.ts | G1 · every external write in the tree has a canonical dispatch boundary the inventory itself is non-empty and finds the known callers | Reproduced on exact main |
| external-dispatch-guards.test.ts | G1 · every external write in the tree has a canonical dispatch boundary no governance assertion is parked behind an unreachable branch | Reproduced on exact main |
| external-dispatch-guards.test.ts | G4 · the legacy global-only helper is no longer an authority no runtime module calls checkAutomationPaused | Reproduced on exact main |
| global-auth-retired.test.ts | the global key verifier is gone no PRODUCTION module defines the helpers | Reproduced on exact main |
| global-auth-retired.test.ts | the global key verifier is gone no production module reads the global key from the environment | Reproduced on exact main |
| global-auth-retired.test.ts | no route can reach a global key path finds route files at all — the scan must be able to fail | Reproduced on exact main |
| global-auth-retired.test.ts | no route can reach a global key path zero routes call the helpers, directly or via one hop | Reproduced on exact main |
| global-auth-retired.test.ts | no route can reach a global key path zero route files import from api-auth for anything but cron | Reproduced on exact main |
| global-auth-retired.test.ts | the cron class survived the deletion cron routes still use CRON_SECRET directly | Reproduced on exact main |
| global-design-tokens.test.ts | global design · every token a stylesheet needs exists scans the real stylesheets, including the surfaces that carried the defect | Reproduced on exact main |
| global-design-tokens.test.ts | global design · every token a stylesheet needs exists no CSS module uses a shadcn HSL triple bare as a colour | Reproduced on exact main |
| handlarborsen-visual-pulse.test.ts | Handlarborsen overview hierarchy places charts after KPI and before secondary pulse, collapsing only the breakdown | Reproduced on exact main |
| leads-dual-accept.test.ts | containment no other route imports the leads auth resolver | Reproduced on exact main |
| leads-dual-accept.test.ts | containment no other route imports the credential primitive | Reproduced on exact main |
| leads-legacy-auth-removed.test.ts | global legacy HTTP surface finds route files at all — the scan must be able to fail | Reproduced on exact main |
| leads-legacy-auth-removed.test.ts | global legacy HTTP surface no route reaches requireApiKey or requireUserOrApiKey, directly or via one hop | Reproduced on exact main |
| leads-legacy-auth-removed.test.ts | global legacy HTTP surface no route file reads AIOPS_API_KEY | Reproduced on exact main |
| leads-legacy-auth-removed.test.ts | global legacy HTTP surface leaves cron auth untouched and still reachable | Reproduced on exact main |
| legacy-v1-api-removed.test.ts | drift-guard — manifest ↔ filsystem varje manifestpost har en route-fil | Reproduced on exact main |
| legacy-v1-api-removed.test.ts | auth-kärnan behålls — Familje-Stunden är beroende av den /business/leads är fortfarande registrerad | Reproduced on exact main |
| legacy-v1-api-removed.test.ts | auth-kärnan behålls — Familje-Stunden är beroende av den /business/campaigns är fortfarande registrerad | Reproduced on exact main |
| legacy-v1-api-removed.test.ts | auth-kärnan behålls — Familje-Stunden är beroende av den /business/revenue är fortfarande registrerad | Reproduced on exact main |
| legacy-v1-api-removed.test.ts | auth-kärnan behålls — Familje-Stunden är beroende av den /chat/tts är fortfarande registrerad | Reproduced on exact main |
| licensed-bind-m4b-guards.test.ts | M4-B is the last migration and leaves the exempt bind untouched no migration after M4-B, and M4-B does not redefine the exempt bind | Reproduced on exact main |
| marketing-review.test.ts | marketing review · the rollback body is the body it replaced is pinned by hash, its own doc comment included | Reproduced on exact main |
| marketing-review.test.ts | marketing review · the rollback body is the body it replaced the client component it renders is untouched | Reproduced on exact main |
| marketing-review.test.ts | marketing review · rendered surface and layout the controls stay visible without the shared foreground token | Reproduced on exact main |
| media-orchestration-retry-authority.test.ts | the article hero call site carries the authority every production withRetry around the orchestrator carries it | Reproduced on exact main |
| memory-vnext.test.ts | Minne vNext · generation and frozen legacy pins the mechanically moved legacy body | Reproduced on exact main |
| memory-vnext.test.ts | Minne vNext · generation and frozen legacy keeps the existing API and Memory helpers byte-identical | Reproduced on exact main |
| mission-brief-v1.test.ts | Canonical vocabulary (§20.11, §20.98) supports all sixteen §20.98 statuses in the public type | Reproduced on exact main |
| money-overview.test.ts | pengar · the rollback body is the body it replaced is pinned by hash | Reproduced on exact main |
| monthly-release-v2.test.ts | v1 is registered in production and must not move MUTATION — the v1 YAML still hashes to the pinned upstream value | Reproduced on exact main |
| monthly-release-v2.test.ts | v2 is vendored, never authored here the vendored YAML matches the pinned upstream hash | Reproduced on exact main |
| monthly-release-v2.test.ts | v2 is vendored, never authored here the committed JSON is the generated form of the vendored YAML | Reproduced on exact main |
| muapi-media-provider.test.ts | no credential and no live default reaches the repository no tracked file assigns a non-placeholder MuAPI key | Reproduced on exact main |
| muapi-media-provider.test.ts | no credential and no live default reaches the repository no production module writes MuAPI config at runtime | Reproduced on exact main |
| muapi-media-provider.test.ts | no credential and no live default reaches the repository no production module hands out a credential outside config.ts | Reproduced on exact main |
| muapi-media-provider.test.ts | no credential and no live default reaches the repository the committed env template contains only empty placeholders | Reproduced on exact main |
| muapi-media-provider.test.ts | no credential and no live default reaches the repository nothing outside the provider directory imports the MuAPI adapter directly | Reproduced on exact main |
| muapi-media-provider.test.ts | nothing generates media on its own exactly ONE governed module calls a generation method | Reproduced on exact main |
| muapi-media-provider.test.ts | nothing generates media on its own no route, cron or workflow calls a generation method | Reproduced on exact main |
| muapi-media-provider.test.ts | nothing generates media on its own the provider layer is not imported by any route or cron | Reproduced on exact main |
| platform-credential-events.test.ts | Settings S0 · platform_credential_events migration — append-only and server-only RLS on, no policy, every client grant revoked, and the service role holds SELECT and INSERT only | Reproduced on exact main |
| platform-credential-events.test.ts | Settings S0 · platform_credential_events migration — append-only and server-only touches no other object and carries no data statement | Reproduced on exact main |
| platform-credential-events.test.ts | Settings S0 · platform_credential_events — the search_path follow-up pins the append-only function's search_path, and does nothing else | Reproduced on exact main |
| project-api-credentials.test.ts | inertness — Phase 1 changes no existing auth is imported by no route directly — only via the leads-scoped resolver | Reproduced on exact main |
| project-command-center.test.ts | project command center · legacy rollback keeps the legacy body byte-identical to the page it replaced | Reproduced on exact main |
| project-command-center.test.ts | project command center · Marknadsplatsstatistik link the view renders it as a plain link, with no project name of its own | Reproduced on exact main |
| project-workspace-vnext.test.ts | project workspace B1 · generation and legacy rollback keeps the six legacy route bodies byte-for-byte from the reviewed base | Reproduced on exact main |
| project-workspace-vnext.test.ts | project workspace B1 · generation and legacy rollback moves the exact workflow editor behind /edit without changing its implementation | Reproduced on exact main |
| project-workspace-vnext.test.ts | project workspace B1 · generation and legacy rollback keeps the previous output component and deletion endpoint untouched while stating whole-run deletion | Reproduced on exact main |
| provider-dispatch-certainty.test.ts | a not-dispatched claim is always licensed by a classifier every catch that claims NOT DISPATCHED consulted an approved classifier | Reproduced on exact main |
| provider-dispatch-certainty.test.ts | no consumer of ProviderDispatchUnknownError weakens it none converts the ambiguity into a not-dispatched claim | Reproduced on exact main |
| release-gate-proof-workflow.test.ts | the proof definition is vendored, minimal and read-only the vendored file matches its pinned source hash | Reproduced on exact main |
| release-gate-proof-workflow.test.ts | single-remote-read authority the ONLY writer of AUTOMATED evidence is the executor | Reproduced on exact main |
| scoped-read-isolation.test.ts | 9A · every caller supplies scope canonically has exactly one production caller, and it passes a resolved allow-list | Reproduced on exact main |
| sdf1b2-code-work-operator-plane.test.ts | SDF-1B2 read isolation and no-execution boundary keeps migration 80 byte-identical | Reproduced on exact main |
| sdf1c-broker-claim-credential.test.ts | SDF-1C1B migration and structural boundary adds no route, no broker CLI command and no execution/model code | Reproduced on exact main |
| sdf1c2-broker-control-channel.test.ts | SDF-1C2 structural boundary exposes exactly the six purpose-specific broker routes and no generic boundary | Reproduced on exact main |
| sdf1c3-isolation-integration.test.ts | SDF-1C3A real Git: the preparation substrate against a synthetic repository, with the real toolchain prepares an isolated worktree at the pinned commit and stays inside the approved parent | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A trusted toolchain: git and docker are never chosen by a caller resolves only from fixed absolute candidates and issues an unforgeable-by-shape tool | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A trusted toolchain: git and docker are never chosen by a caller refuses relative, missing, non-regular, non-executable, group/other-writable, foreign-owned and unsafe-ancestor candidates | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A trusted toolchain: git and docker are never chosen by a caller follows a symlink to its real target and judges the target (a link cannot launder trust) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A trusted toolchain: git and docker are never chosen by a caller the runner refuses a tool object that did not come from the resolver | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment only a broker-made command can run, and run() takes nothing but the command (no env, args or executable) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment never enables a shell and runs exactly the trusted executable with direct argv | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment does not inherit the parent environment: secrets in process.env never reach a child | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment bounds stdout/stderr before returning | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a timeout kills the child (TERM, then KILL) and reports timedOut | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment logs nothing and never puts a command line or secret in a result or thrown message | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a planted user gitconfig, hooks, filters and credential helper are unreachable (real git) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) prepares a worktree at exactly the pinned commit with a closed, path-free result | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) is deterministic: same work → same branch, directory and hashes | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts only trusted structured input; the caller cannot choose branch, directory, parent or arguments | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (uppercase) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (39 chars) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (41 chars) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (abbreviated) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (a ref name) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (non-hex) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (option-like) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (empty) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a pin that is not a commit object present locally (missing, blob, tree, annotated tag) and never fetches | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) returns STALE_BASE, exactly and without fetching, when the approved base ref moved | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) needs no network at all (an unreachable origin cannot matter) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong remote | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong host | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses file remote | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses plain path remote | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses credentials in URL | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses sub-path | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts SCP, ssh and case-different forms of the SAME identity, and refuses a second identity or a missing remote | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (filter driver) before creating anything | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (fsmonitor) before creating anything | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (hooksPath) before creating anything | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (credential helper) before creating anything | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (include) before creating anything | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (ssh command) before creating anything | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (shell alias) before creating anything | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked, non-directory, non-canonical or non-repository root, and a linked worktree used as root | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked or non-canonical worktree parent and never creates it | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses every collision without touching the existing state (path, dangling link, file, branch, worktree) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) a worktree elsewhere already holding the branch or the path is a conflict | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) does not follow a symlink planted in the future target path | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) verifies after creation and, on any failed check, keeps the workspace (explicit_cleanup_only) and says so | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives verifies canonical roots only | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives reads existing files only when no segment is a symlink and the realpath is the lexical path | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives a write-intent check additionally refuses hardlinks and non-regular files | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives verifies a prospective create against its deepest existing ancestor | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses NUL | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses newline | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses tab | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses DEL | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses parent traversal | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses embedded traversal | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses absolute | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses double slash | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses dot segment | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses trailing slash | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses backslash | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses windows drive | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses empty | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses surrounding space | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses non-NFC (NFD é) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses .git | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses nested .git | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses .GIT case | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses .env | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses .env.local | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses .ENV.production | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses .ssh | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses .aws | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses secrets dir | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses pem | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses key | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses service account | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives refuses not a string | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives accepts ordinary NFC unicode names | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A real-filesystem containment primitives opens for reading with O_NOFOLLOW and refuses a final component that became a symlink | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A SandboxSpec and Docker command construction refuses every docker verb outside the closed set and every malformed target | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A Docker host proof (VM-backed Docker Desktop required for production) derives the daemon socket only from a fixed host-side list (no DOCKER_HOST, no remote, no other socket) | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution adds no broker route, and the route set is exactly the 1C2 control channel | Reproduced on exact main |
| sdf1c3-isolation-substrate.test.ts | SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution only the approved isolation modules can ISSUE an InfraCommand: brokerCommand is not reachable from any other production module | Reproduced on exact main |
| session-only-routes.test.ts | source invariants no route imports requireUserOrApiKey any more | Reproduced on exact main |
| session-only-routes.test.ts | source invariants exactly ONE route surface still accepts the global key | Reproduced on exact main |
| spend-advisory-override.test.ts | E. no behaviour changed E2 — the verdict formula is unchanged | Reproduced on exact main |
| spend-financial-decoupling.test.ts | §14 · each flag has exactly ONE production reader H1_SPEND_GATE is read only in spend-gate-flag.ts | Reproduced on exact main |
| spend-financial-decoupling.test.ts | §14 · each flag has exactly ONE production reader H1_FINANCIAL_EXECUTION is read only in financial-execution-flag.ts | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration and its reader semantics starts UNDECLARED — NULL is the absence of a declaration, with no default | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration and its reader semantics a positive declaration is stored exactly, and audits one SET | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration and its reader semantics ZERO is a KNOWN declaration, never a clear | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration and its reader semantics NEGATIVE is a KNOWN declaration — the sign is not this schema's policy | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration and its reader semantics CLEAR persists NULL, and is distinguishable from a zero declaration | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration and its reader semantics re-setting the SAME value writes nothing — no audit trail of non-events | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration and its reader semantics the RESPONSE equals current truth and the audit row, exactly | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · invalid input is refused at the boundary refuses NaN and both infinities | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · invalid input is refused at the boundary refuses an absent actor — the ledger cannot record an anonymous change | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · invalid input is refused at the boundary none of those probes changed the declaration or wrote an audit row | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration is persisted EXACTLY, never rounded ACCEPTS every exactly-representable shape | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration is persisted EXACTLY, never rounded REFUSES anything that would be silently rounded | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration is persisted EXACTLY, never rounded REFUSES anything outside the numeric(12,4) range | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration is persisted EXACTLY, never rounded ACCEPTS trailing zeros, which is not precision loss | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the declaration is persisted EXACTLY, never rounded the no-op comparison uses the CANONICAL stored value | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the actor must be a canonical authenticated human ACCEPTS the canonical user:<uuid> shape | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the actor must be a canonical authenticated human REFUSES machine-shaped and malformed actors through the RPC | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the actor must be a canonical authenticated human REFUSES the same shapes at the TABLE, not only at the RPC | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the actor must be a canonical authenticated human a refused actor leaves the declaration and the ledger untouched | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton exists, and holds exactly the singleton row | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton is the ONLY place the declaration lives — platform_config does not carry it | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton has RLS on and ZERO policies, so no client can read it through a policy | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton grants anon and authenticated NOTHING | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton grants service_role SELECT and nothing else | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton refuses every direct write by service_role | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton refuses every direct write by anon and authenticated | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton the canonical RPC is the ONLY writer that can exist — and it works | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · current truth is a SERVER-ONLY singleton the singleton constraint refuses a second row even from the owner | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the change and its evidence are atomic every change writes EXACTLY ONE audit row, and every audit row has a change | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the change and its evidence are atomic the ledger is NOT the current truth — clearing it would not change the declaration | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the change and its evidence are atomic concurrent setters serialise: the predecessor each records is the real one | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the audit ledger cannot be rewritten refuses UPDATE | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the audit ledger cannot be rewritten refuses DELETE | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the audit ledger cannot be rewritten refuses TRUNCATE | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the audit ledger cannot be rewritten refuses a direct INSERT by service_role, and by anon | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · the audit ledger cannot be rewritten closes the event vocabulary, so a row cannot name an event no reader interprets | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · exactly one current source, and history is never it the setter reads and writes the singleton, and never platform_config | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · exactly one current source, and history is never it the setter never reads the ledger to decide what is declared now | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · exactly one current source, and history is never it no function anywhere reads the ledger as current funding truth | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · exactly one current source, and history is never it the declaration column exists on exactly ONE table in the schema | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · least privilege anon and authenticated can neither read the ledger nor call the setter | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · least privilege service_role reads the ledger and executes the boundary, and writes neither table | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · least privilege the setter is SECURITY DEFINER with a fixed empty search_path | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · least privilege the ledger sequence is revoked from every role | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · scope completeness, answered without exposing anything is TRUE only when the set contains every project | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · scope completeness, answered without exposing anything is FALSE for a subset — a single project is never the platform | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · scope completeness, answered without exposing anything is FALSE for the empty set and for NULL | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · scope completeness, answered without exposing anything returns ONE BOOLEAN — never a row, an id or a count | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · scope completeness, answered without exposing anything is unmoved by a project added outside the caller set | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · a declaration moves nothing else reserves no spend, changes no stop, and issues no authorization | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · a declaration moves nothing else does not clear a pause that is already set | Reproduced on exact main |
| survival-funding-sql.test.ts | funding · a declaration moves nothing else Phase 2A history is untouched by a funding change | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · contract creates exactly one table, and grants write to nobody | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · contract denies INSERT to every role while letting the boundary INSERT | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened is SECURITY DEFINER with an empty, fixed search_path | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened PUBLIC, anon and authenticated cannot execute it | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened service_role holds EXECUTE and nothing broader | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened has no autonomy, actor or provenance parameter at all | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened refuses a human or arbitrary actor, even on a direct INSERT | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened the RPC writes the canonical machine identity, whatever the observer | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened derives provenance from the version, and refuses every mismatched pair | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened the RPC takes no provenance argument at all | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened refuses an impossible state/ceiling pair on a direct INSERT | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened refuses a policy identity no derivation implements | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened service_role cannot write the table or the sequence directly | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the recording boundary is hardened a real anon session is refused, and the boundary is reachable as itself | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · records transitions, not polling noise records exactly one baseline for the first observation | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · records transitions, not polling noise records nothing when the same state is observed again | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · records transitions, not polling noise records exactly one transition when the state really changes | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · records transitions, not polling noise keeps event_seq as the chain order and goes back to NORMAL | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · records transitions, not polling noise answers `unchanged` for a no-op rather than inserting | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · from_state is never the caller’s refuses a direct INSERT whose from_state does not follow the ledger | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · from_state is never the caller’s refuses a second baseline for a project that already has history | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · from_state is never the caller’s refuses a transition that does not change the state | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · append-only, enforced by the database refuses UPDATE | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · append-only, enforced by the database refuses DELETE | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · append-only, enforced by the database refuses TRUNCATE | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies closes the event, state, ceiling, funding and policy-identity vocabularies | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies seeds a project with history so the CHECKs, not the guard, are under test | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies refuses a value outside each closed set, by CHECK | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies refuses an unsupported to_state at the boundary, before anything is written | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies the declared amount is biconditional with KNOWN — all four cases | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies ACCEPTS negative remaining headroom — an overspent scope is valid evidence | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies refuses a negative limit, burn rate or runway | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies refuses an unknown event type, which can only arrive by direct INSERT | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · closed vocabularies refuses an unknown project, fail-closed | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the observation survives the round trip preserves reasons, gaps, ceiling, funding and the distinct funding states | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the observation survives the round trip keeps UNAVAILABLE distinct from UNDECLARED | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the observation survives the round trip stores declared funding when KNOWN, and only then | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the observation survives the round trip keeps MRR a SIGNAL — it never becomes runway, and runway stays unknown without funding | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the observation survives the round trip records the observation instant separately from the write instant | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · the observation survives the round trip refuses an occurred_at in the future | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · concurrency cannot duplicate a logical transition two concurrent FIRST observations produce ONE baseline | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · concurrency cannot duplicate a logical transition two concurrent observers of the SAME change produce ONE transition | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · concurrency cannot duplicate a logical transition a retry of the same observation is idempotent | Reproduced on exact main |
| survival-history-sql.test.ts | survival history · recording changes neither spend nor the stop leaves the automation pause and the spend ledger untouched | Reproduced on exact main |
| system-health.test.ts | phase 12 · authority is preserved, never re-created adds no endpoint, migration or schema change | Reproduced on exact main |
| system-health.test.ts | phase 12 · the legacy rollback is the page that shipped the legacy body is the previous page verbatim — pinned by hash | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 · the legacy rollback is the page that shipped renders the legacy canvas byte-identically to origin/main 430259e | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 · the legacy rollback is the page that shipped keeps the legacy client markup byte-identical | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 · the legacy rollback is the page that shipped moves the previous page body verbatim into IntelligenceGraphLegacy | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 · the legacy rollback is the page that shipped leaves the legacy inspector file untouched | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 · layout, scale and motion is exactly as tall as the vNext shell leaves it, not the legacy CommandBar height | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 T2a · shell geometry measures the floating corner from the activity peek and the Atlas launcher | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 T2a · shell geometry goes fullscreen with the header, where the shell chrome is gone | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 T3b · release hardening opts only Live Operations into the G-27 last-safe guard | Reproduced on exact main |
| vnext-intelligence-graph.test.ts | phase 18 T3b · release hardening keeps mobile list-first, System Map, Replay and legacy rollback contracts intact | Reproduced on exact main |
| workflow-action-binding.test.ts | revalidation claim-time re-derives the target instead of trusting the stored hash | Reproduced on exact main |
| workflows-definition-familje-stunden.test.ts | vendored definition — provenance the vendored YAML matches the pinned upstream hash | Reproduced on exact main |
| workflows-definition-familje-stunden.test.ts | vendored definition — provenance the committed JSON is the generated form of the vendored YAML | Reproduced on exact main |
| youtube-project-oauth.test.ts | youtube connection · the codebase, read the state is touched only by the OAuth module; the start route records it, the callback consumes it and alone exchanges a code | Reproduced on exact main |
| architecture-knowledge.test.ts | Immutable artifact and runtime loader loads and verifies the committed artifact read-only | Reproduced on exact main |
| architecture-knowledge.test.ts | Golden lexical retrieval and server citations routes How are Agents, Tools and Execution Resources registered? to Intelligence Fabric canonical material | Reproduced on exact main |
| architecture-knowledge.test.ts | Golden lexical retrieval and server citations routes How are Credentials separated from Agent authority? to Intelligence Fabric canonical material | Reproduced on exact main |
| architecture-knowledge.test.ts | Golden lexical retrieval and server citations routes How does multimodal production work? to Intelligence Fabric canonical material | Reproduced on exact main |
| architecture-knowledge.test.ts | Golden lexical retrieval and server citations reaches provider-selection material in every canonical book that covers it | Reproduced on exact main |
| architecture-knowledge.test.ts | Golden lexical retrieval and server citations supports exact section, chapter, book-title and requirement identifiers | Reproduced on exact main |
| architecture-knowledge.test.ts | Golden lexical retrieval and server citations excludes wrong/old versions and returns explicit unavailability | Reproduced on exact main |
| architecture-knowledge.test.ts | Golden lexical retrieval and server citations mints exact citations and rejects fabricated, stale or mismatched citations | Reproduced on exact main |
| executive-knowledge.test.ts | Generic artifact eligibility invariant accepts the committed artifact while Executive is active and approved | Reproduced on exact main |
| executive-knowledge.test.ts | Generic artifact eligibility invariant rejects an inactive source that reached the artifact | Reproduced on exact main |
| executive-knowledge.test.ts | Generic artifact eligibility invariant rejects an artifact source row that diverged from the registry | Reproduced on exact main |
| executive-knowledge.test.ts | Generic artifact eligibility invariant rejects an artifact source that is not registered at all | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy is an active knowledge source in the committed artifact | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy resolves FM.2 by exact front-matter identifier | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy resolves FM.2 from an implementation-scope query and a canonical Stage 1 query | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy resolves exact Executive chapter and section identifiers | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy answers a governance and authority query from Executive doctrine | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy mints a valid Executive citation and rejects every tampered variant | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy denies internal Executive knowledge to an unauthorized principal and allows an authorized one | Reproduced on exact main |
| executive-knowledge.test.ts | Executive retrieval, citations and policy excludes an inactive, superseded or wrong-version Executive source before ranking | Reproduced on exact main |
| import-discipline.test.ts | the contract boundary is identity, never a provider symbol the domain definitions each still exist exactly once | Reproduced on exact main |
| import-discipline.test.ts | no Node builtin is reachable at runtime from the market-view package proves it across the whole transitive value-import closure | Reproduced on exact main |
| recorded-adapter.test.ts | a transcript gap fails closed never branches on a provider message anywhere in the package | Reproduced on exact main |
| import-discipline.test.ts | no Node builtin is reachable at runtime from the replay package proves it across the whole transitive value-import closure | Reproduced on exact main |
| import-discipline.test.ts | Stage 1.5 boundaries reads no wall clock on a trading-state path | Reproduced on exact main |
| import-discipline.test.ts | AD. an answer cannot depend on where or when it runs names an explicit timeZone on every formatter it builds | Reproduced on exact main |
