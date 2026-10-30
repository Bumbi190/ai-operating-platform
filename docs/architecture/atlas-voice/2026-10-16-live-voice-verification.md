# Atlas Live voice foundation: verification — 2026-10-16

Status: transport foundation reviewed; paid Live trial is blocked. No live provider request, microphone evaluation, deployment, key change or production activation is claimed.

## Focused checks

- Protocol/configuration and transport: **37/37 pass**.
- Existing voice capture, conversation controller, TTS ceiling/error/playback: **54/54 pass**.
- Focused total: **91/91 pass** across seven files.
- Standalone TypeScript: **pass**, `tsc --noEmit --incremental false`.
- `git diff --check`: **pass**.
- Existing runtime, chat API, AI wrappers, cost modules, workflows and dependency manifests are byte-identical to the inspected base.
- Targeted ESLint could not run: this base contains no ESLint configuration. No replacement configuration was invented.

## Whole-repository comparison

Both runs used the same installed lockfile dependencies, Node 24.19.0, Linux, Vitest 2.1.9, two workers and the normal `npm test --workspace=apps/web` command. The baseline was an isolated detached worktree at `4e8bbbc0609ecc863201f362b72372bf8df43cfc`, before any voice implementation. Dedicated SQL fixture configuration was absent in both runs.

| Reported result | Unchanged baseline | Voice foundation |
| --- | ---: | ---: |
| Total tests | 14073 | 14110 |
| Passed | 12666 | 12703 |
| Failed | 186 | 186 |
| Pending/skipped | 1217 | 1217 |
| Todo | 0 | 0 |

Failed assertion names and failed file identities match the baseline: **0 new failures, 0 resolved failures**. The full repository is not green; its failures were not repaired or assertions weakened in this voice branch.

## Independent review

One read-only reviewer reported no Critical issues, one Important issue and no Minor issues. The Important issue was a cumulative-usage update arriving during graceful close. Its new regression first failed (`observedSeconds` stayed 5 instead of 20), then passed after preserving updates while closing. A regressing final usage report now remains unconfirmed. No second review is claimed.

## Activation blocker

The reviewed GPT-Live WebRTC create-session contract and official SDK expose no configurable pre-dispatch duration ceiling. The resolved session expiration is reported after creation. The numeric duration limits found in the create-session reference describe SIP calls. A client timer and successful normal close are not a hard spending bound under the existing Omnira ledger contract. Provider admission, live endpoint/UI, backend integration and the real ten-minute voice comparison remain pending this prerequisite.

## Existing failed assertions and setup failures, by name

### lib/project/lifecycle/api.test.ts

- lifecycle HTTP boundary authenticates before privileged reads or body parsing
- lifecycle HTTP boundary reads and changes only the path project with private responses
- lifecycle HTTP boundary refuses injected path authority, cross origin and oversized bodies before admin access
- lifecycle HTTP boundary returns the same 404 for an observed foreign or nonexistent project

### lib/project/lifecycle/store.test.ts

- owner lifecycle and real static worker fences atomically pauses, versions and replays transitions while restore preserves an unrelated pause
- owner lifecycle and real static worker fences refuses foreign, observer, stale and malformed commands and keeps history and folder requests
- owner lifecycle and real static worker fences archive winning the project lock fences snapshot and commit even with allow_pause
- owner lifecycle and real static worker fences commit winning the project lock finishes before archive and its verified artifact stays readable
- owner lifecycle and real static worker fences serializes actual claim and archive in both orders without claiming paused work
- owner lifecycle and real static worker fences never revives a skipped locked writer after restore and explicit project resume
- owner lifecycle and real static worker fences a project-first writer refuses a busy run without deadlocking canonical claim
- owner lifecycle and real static worker fences a project-first control refuses a busy run without deadlocking canonical claim
- owner lifecycle and real static worker fences retries a transient writer lock on the same artifact, but never retries an actual fence

### lib/qa/analysis-draft-sql.test.ts

- real_isolated_SQL_privileges_parity_and_concurrency_no_skips

### lib/qa/atlas-chat.test.ts

- atlas chat · the route contract it speaks does not observe a client abort — which is why there is no stop control

### lib/qa/atlas-latency.test.ts

- Atlas latency · timing never becomes visible content keeps the visible reply fed only by text events
- Atlas latency · timing never becomes visible content does not touch the reply from the timing branch

### lib/qa/atlas-launcher-vnext.test.ts

- launcher renders in the platform layout is mounted by the platform layout
- PLACEMENT — the bottom-right corner is shared with the activity peek the activity peek really is on screen at desktop where the launcher renders
- PLACEMENT — the bottom-right corner is shared with the activity peek shares a right edge with the peek so the corner reads as one stack
- PLACEMENT — the bottom-right corner is shared with the activity peek rides the panel above the launcher, not beside the peek

### lib/qa/autonomy-bind-guards.test.ts

- the atomic bind migration is the only EXEMPT bind migration after Phase 3B1A (M0, 3B1B2 M1, M2, M3, M4-A and M4-B are the reviewed successors)

### lib/qa/autonomy-license.test.ts

- Phase 2C — the migration does not collide with the chain it joins names itself so it sorts last in the current canonical set
- Phase 2C — inertness 52. no other atlas subsystem consumes the licence MACHINERY

### lib/qa/autonomy-trace-guards.test.ts

- migration discipline the new migration sorts after every pre-existing migration

### lib/qa/breadcrumbs.test.ts

- breadcrumbs · accessibility uses semantic breadcrumb markup

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

### lib/qa/execution-contract-propagation.test.ts

- every governed spend supplies an explicit execution contract only the sanctioned provider modules call the boundary at all
- OPERATOR_INTERACTIVE is the only stop bypass, so its construction is allowlisted only the allowlisted files construct it
- every runtime GLOBAL_ONLY is reviewed and justified no unreviewed file constructs GLOBAL_ONLY

### lib/qa/executive-intelligence-schema-activation.test.ts

- EI-S1.6A — Executive Intelligence schema activation bundle keeps the legacy EI companion count at exactly 83 enforced migrations

### lib/qa/global-design-tokens.test.ts

- global design · every token a stylesheet needs exists no CSS module uses a shadcn HSL triple bare as a colour

### lib/qa/handlarborsen-visual-pulse.test.ts

- Handlarborsen overview hierarchy places charts after KPI and before secondary pulse, collapsing only the breakdown

### lib/qa/licensed-bind-m4b-guards.test.ts

- M4-B is the last migration and leaves the exempt bind untouched no migration after M4-B, and M4-B does not redefine the exempt bind

### lib/qa/mobile-chrome-contract.test.ts

- mobile chrome · AtlasMiniOrb is desktop-only keeps the desktop footprint, and anchors the geometry deliberately
- mobile chrome · MobileRailToggle is untouched keeps its own desktop-rail suppression

### lib/qa/project-command-center.test.ts

- project command center · legacy rollback keeps the legacy body byte-identical to the page it replaced
- project command center · Marknadsplatsstatistik link the view renders it as a plain link, with no project name of its own

### lib/qa/sdf1c3-isolation-substrate.test.ts

- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller refuses relative, missing, non-regular, non-executable, group/other-writable, foreign-owned and unsafe-ancestor candidates

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

### lib/qa/vnext-intelligence-graph.test.ts

- phase 18 · the legacy rollback is the page that shipped renders the legacy canvas byte-identically to origin/main 430259e
- phase 18 · layout, scale and motion is exactly as tall as the vNext shell leaves it, not the legacy CommandBar height
- phase 18 T2a · shell geometry measures the floating corner from the activity peek and the Atlas launcher
- phase 18 T3b · release hardening keeps mobile list-first, System Map, Replay and legacy rollback contracts intact

### lib/qa/website-build-drain.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/api.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/chat-tools.test.ts

- Website build through actual authenticated chat tool loop queues one durable build and gives its actual workspace link
- Website build through actual authenticated chat tool loop foreign project and conversation never create a session
- Website build through actual authenticated chat tool loop emits a typed plan from a real draft without creating a decision
- Website build through actual authenticated chat tool loop exact visible confirmation bypasses model dispatch and returns a durable receipt
- Website build through actual authenticated chat tool loop model-supplied confirmation cannot approve or start
- Website build through actual authenticated chat tool loop rejects authority fields in visible references before model dispatch
- Website build through actual authenticated chat tool loop authentication precedes any website tool execution
- studio execution capabilities at the actual chat route denies a provider-returned global media action in Studio while ordinary operator chat keeps it

### lib/website-build/connections/api.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/api.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/build-context.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/chat-tools.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/concurrency.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/conversation-workspace.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/export-pinning.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/mockup-store.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/planning/store.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.

### lib/website-build/studio/api.test.ts

- studio HTTP boundary authenticates before parsing or reading privileged data
- studio HTTP boundary creates a private real owner workspace and recovers a repeated response
- studio HTTP boundary refuses cross-origin creation, oversized bodies and injected authority
- studio HTTP boundary rejects unknown or duplicate query selections and malformed child ids
- studio HTTP boundary does not grant observed projects mutation authority
- studio HTTP boundary reports unreadable project inventory without exposing database details as an empty draft

### lib/website-build/studio/budget.test.ts

- explicit studio budgets and billable project identity requires a budget for the exact owned studio conversation and keeps replay idempotent
- explicit studio budgets and billable project identity uses a compare-and-set and preserves daily/weekly limits instead of overwriting later decisions
- explicit studio budgets and billable project identity refuses foreign owners, unbounded numbers and mutated routing hints
- explicit studio budgets and billable project identity opens a verified historical conversation in the same owned studio project
- explicit studio budgets and billable project identity never exposes audit mutations or budget setters to browser database roles

### lib/website-build/studio/loader.test.ts

- studio project and conversation identity lists only owned projects and does not create a draft just by opening
- studio project and conversation identity loads project metadata in a bounded batch rather than querying every project separately
- studio project and conversation identity loads a selected studio conversation with its missing budget and no invented desktop
- studio project and conversation identity rejects a conversation from another owned project before reading its transcript
- studio project and conversation identity rejects a session from another owned project before loading its conversation
- studio project and conversation identity returns the same refusal for foreign and nonexistent project selections
- real requested folder binding keeps an existing root exact and pending, replays once and refuses changed-key payload
- real requested folder binding retains a bound new-project child root when the default parent later changes
- real requested folder binding refuses traversal, reserved Windows names, target mismatch and foreign ownership

### lib/website-build/studio/output-allowance.test.ts

- managed builder output allowance migration upgrades only exact factory v1 configurations, preserving custom agents and budgets
- managed builder output allowance migration keeps the creation RPC private and rejects an incomplete preset

### lib/website-build/studio/store.test.ts

- owner-bound studio creation in real PostgreSQL serializes two independent SQL connections creating the same studio intent
- owner-bound studio creation in real PostgreSQL recovers a lost creation response without another project, agent or conversation
- owner-bound studio creation in real PostgreSQL creates a conversation for an existing project without replacing its agent or settings
- owner-bound studio creation in real PostgreSQL checks actual database ownership even when a caller names a foreign id in its allowlist
- owner-bound studio creation in real PostgreSQL rejects absent principals and malformed or client-authorizing inputs before creating anything
- owner-bound studio creation in real PostgreSQL rolls back project creation when agent insertion fails
- owner-bound studio creation in real PostgreSQL gives authenticated users owner-only SELECT and no mutation or RPC bypass

### lib/website-build/worker.test.ts

- Suite setup failed: Prepare the isolated SQL fixture and set WEBSITE_BUILD_TEST_DATABASE_NAME to its KEEP_DB value; see the build validation report.
