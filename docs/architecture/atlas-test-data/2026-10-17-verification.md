# Atlas / Handlarbörsen test-data verification and release receipt

Latest continuation2026-10-18: [concrete production release and inventory-only proposal](2026-10-18-release-preflight.md). Current checks and rulings57–60 are appended below; earlier measurements remain historical.

Verified candidate after one independent whole-branch review and one coordinator fix pass. No production deployment, production schema change, credential provisioning, grant activation, classification of the remaining eight companies or production cleanup has occurred.

The implementation lets Atlas inspect, prepare and execute an exact human-reviewed package of verified test data, with separate restore. Real and unknown organisations remain protected. The accepted voice engine, voice selection, streaming and microphone lifetime are preserved; ordinary questions make no cleanup/inventory calls. Web search and code work remain separate deliveries.

## Exact scope

| Identity | Treatment |
| --- | --- |
| familje-stunden AB / André / 23b45965-71f8-4e95-a4eb-32872234664d | Protected real by ID, irrespective of rename |
| Bromölla kylteknik / Oscar / d679116a-fc8f-4f80-85c5-1dbecfff8257 | Protected real by ID, irrespective of rename |
| Remaining eight current companies | Unknown; never inferred test |

H owns classification, per-object manifest evidence, exact package/graph expiry, quarantine/restore, access/commerce/background guards and durable receipts. O verifies the current operator, project owner, owned conversation and stored operation grant; its dedicated review card creates the human decision and one durable outbound execution before HTTP dispatch. Neither model confirmation nor voice yes has authority.

No hard deletion, Auth/Storage removal, business-status rewrite, closure, subscription cancellation, mail, push or billing action is part of quarantine/restore. Existing claimed external work blocks execution. Historic deliveries/assets remain retained and do not resume merely because a marker is restored.

## Branches and implementation boundaries

Both repos use codex/atlas-test-data-20261017 in isolated worktrees.
H original base: ec1cdbfee9272a7a603c42a5a8cde900702baa0a.
O original base: ea5f02ac50888e6395af4ae34d6693576e90d6a8.
H production implementation through Task6: 39274b678329ee3dcef4b97e96b0472be266cdf9.
O production implementation through Task7: a3964df181b09b679c0b39e9b1b2581501181f7b.
Task8 adds contract evidence, public signing vectors and this delivery documentation. Final review/fix commits and PR URLs are appended after verification; deployment must pin the actual reviewed HEADs, not infer them from a branch name.

H preserves the unrelated original-checkout edit in app/app/organisation/abonnemang/page.tsx.

## Migrations (candidate, not applied to production)

H, in canonical order:

- 20261017160539_atlas_test_data_registry.sql
- 20261017163317_atlas_test_data_packages.sql
- 20261017165156_atlas_test_data_execution.sql
- 20261017171220_atlas_test_data_activity_guards.sql
- 20261017183724_atlas_test_data_metrics_v2.sql
- 20261017190929_atlas_test_data_integration_principals.sql

O, in canonical order:

- 20261017184015_handlarborsen_metrics_definition.sql
- 20261017192903_handlarborsen_test_data_integration.sql
- 20261017193411_handlarborsen_test_data_reviews.sql

O migration guard after upstream integration: 139 canonical / 125 enforced / 14 frozen grandfathered. The hypothetical complete ledger has 162 names; the actual pre-apply omission fixture has 159 and is deliberately rejected. No override, wildcard, grandfathering or fabricated production apply is used. The three O control tables are classified created-not-live DB_INTERNAL, with FORCE RLS, zero policies and no direct privilege for any API role. Existing live-catalog counts retain the upstream capture of 152 live tables; our three pending tables are not added to that live count.

## Verified behavior

The opt-in H test tests/unit/atlas-test-data-contract-e2e.test.ts uses only localhost:56422 and a fresh tagged O fixture database. It executes the real signed H route against actual service-role RPCs and physically commits the synthetic quarantine before discarding its response. Separate O PostgreSQL sessions concurrently approve and claim; exactly one claim may dispatch. A fresh read request retrieves the same execution receipt. Restore has a separate package, decision and execution.

That scenario verifies both protected IDs, an unknown organisation, an isolated all-test graph and a mixed shared-real-membership graph. Mixed selection blocks completely. Owner direct-link read access transitions true -> false -> true; v2 exclusion transitions 0 -> 1 -> 0 with exact count restoration. Before/after JSON for the protected organisations and every fixture profile, membership and vehicle is exactly equal. Only control markers/history change. The committed local fixture is cleared by the explicit owned reset before the subsequent full DB suite.

Independent SQL suites additionally cover stale packages/classifications, binding revocation, expiry, idempotency conflicts, concurrent bids/claims and dispatch leases, direct commerce/access guards, protected renames and shared real membership. Unit dispatch suites assert zero mail/push/Stripe calls; no paid speech probes were run.

Shared byte-identical public inventory/execute/receipt signing vectors are checked independently in both repositories, including nested approvedPackage content and the execution ID in receipt signatures. Their keys are deliberately public local fixtures and are never deployed credentials.

## Task8 verification before final review

| Check | Actual result |
| --- | --- |
| Cross-app signed route + committed q/restore + concurrent O decisions/claims | PASS 1/1 |
| H fresh full pgTAP suite | PASS 118 files / 5,040 assertions |
| H full unit, generated types, tsc, lint | PASS 1,298 tests + 1 opt-in fixture skipped; types verified; tsc0; lint0 errors/4 old warnings |
| H production build with installed --webpack mode | PASS exit0, actual fonts; no source/config change |
| H real local mobile/browser access and restore | PASS 1/1, workers 1 / retries 0 |
| O owning + operator/project/chat/controller/voice + migration/security units | PASS 434/434 in 15 files |
| O fresh focused canonical SQL replay | PASS 41/41 (metrics 10, authority 11, review/outbox 20) |
| O dedicated phone review card + shared voice-panel browser | PASS 2/2, workers 1 / retries 0 |
| O existing overview/messenger/voice-entry browser | PASS 32/32, workers 1 / retries 0 |
| O normal production build | PASS exit 0, all 62 static pages |
| O nonincremental typecheck after final test vectors | PASS exit0 |

The normal O build used only local service credentials and blocked non-local runtime API calls. Google font assets were allowed and downloaded after transient retries. A supplementary build using installed Next's local font-response fixture also passed; it is not the authoritative normal-font build result. No product source/dependency/config was changed for this.

H's default Turbopack build cannot follow this existing Windows worktree's node_modules junction outside its filesystem root. Installed Next documents --webpack, which the native harness already uses. The final local production build uses npm run build -- --webpack; a normal deployment checkout does not share this junction restriction. Report its actual result separately.

Whole-O historical suite is not green: an earlier whole run recorded 402 failures in 103 files. The unmodified detached baseline reproduced 401 failures in the same 102 files across two bounded runs. The remaining cold-import timeout in platform-authority was separately rechecked green (53/53) with a 30-second CLI timeout. Do not represent the 434 scoped passes as a passing whole-repository suite. Most reproduced failures concern Windows path/CRLF assumptions and unavailable legacy test services. Evidence is retained in this plan's workspace.

O has no configured ESLint setup; next lint prompts for initial configuration and exits 1. No unrelated global lint configuration was introduced. Typecheck, owning tests, security/migration gates, native regressions and build provide the recorded checks. H's four earlier lint warnings are unrelated; report final error/warning totals.

The O local replay is focused on canonical snapshot and new integration/review migrations with the actual relevant projects/conversations columns. It is not a complete production-schema replay. No production data or service credentials are used in local evidence.

## Current-main integration

O origin/main advanced during execution. The final private-branch integration retains upstream f0b52e16e424658993624194f0155bee83ad3c82, including inbox/local-text tools, conversation receipts, schema-security metadata and its exact internal workspace package1.0.0. The package manager linked one local workspace offline/ignore-scripts; the upstream lockfile and dependency versions did not change.

Five content conflicts were resolved by retaining both capabilities. The migration guard was observed RED at canonical139 vs expected133, then reconciled to the actual139/125 set without growing grandfathering. Both local-text omission proofs and our three pending-cleanup omission proofs remain fail-closed. Upstream's existing worker-file CRLF whitespace was preserved. Only our plan/spec Markdown line endings were normalized.

After integration: owning/overlap/security/voice units PASS469/469 in22 files, review SQL20/20, nonincremental tsc0, dedicated review browser2/2 and existing messenger/voice browser32/32. O normal production build PASS exit0 in105.80seconds on integrated ec97db4 before the independent review. The earlier whole-O baseline figures describe the pre-integration baseline, not a new complete run of upstream's enlarged suite. No complete-O green claim is made.

## Exact command families

H (own workdir .superpowers/sdd/2026-10-17-atlas-handlarborsen-test-data/local, API56421/DB56422):

- node node_modules/supabase/dist/supabase.js --workdir <own-workdir> db reset --local --no-seed
- docker exec supabase_db_handlarborsen-atlas-test-data-local psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "alter database postgres set test.host_port='56422'"
- node node_modules/supabase/dist/supabase.js --workdir <own-workdir> test db --local <absolute supabase/tests/database>
- npx vitest run --maxWorkers=2 (committed-fixture gate unset)
- explicit ATLAS_TEST_DATA_CONTRACT_E2E=1 and sibling ATLAS_TEST_DATA_OMNIRA_ROOT, then npx vitest run tests/unit/atlas-test-data-contract-e2e.test.ts --maxWorkers=1
- node .superpowers/sdd/2026-10-17-atlas-handlarborsen-test-data/generate-types.mjs
- npm run typecheck; npx eslint . --ignore-pattern .superpowers/**
- npx playwright test --config playwright.atlas-test-data.config.ts (own local keys, ATLAS_TEST_DATA_E2E=1, all providers disabled)
- npm run build -- --webpack (local-only credential/network wrapper)

O, from apps/web:

- npx vitest run <owning/authority/chat/controller/voice/security/migration files> --minWorkers=1 --maxWorkers=1 --testTimeout=30000
- npx tsc --noEmit --incremental false
- npx playwright test --config playwright.atlas-test-data-review.config.ts
- npx playwright test --config playwright.atlas-overview-messenger.config.ts
- npm run build (local-only credential/network wrapper)
- Canonical SQL replay and docs/sql/handlarborsen_metrics_v2_fixture.sql, handlarborsen_test_data_integration_fixture.sql, handlarborsen_test_data_review_fixture.sql against the separately tagged owned database.

Raw command output is retained in the plan-owned .superpowers workspaces. Browser/database fixtures run sequentially; never reset a cluster while its browser or DB fixture is active.

## Earlier local isolation incident

During Task1, legacy dblink tests with hardcoded port55322 reached the ordinary local H development database even though the Supabase CLI workdir selected the own isolated cluster. No production connection was involved. Twenty-eight legacy test files were changed to honor test.host_port, with their existing55322 default preserved; each own reset now sets56422 through the owned container's supabase_admin role. One exact synthetic SeatSync fixture was verified, backed up and cleaned; pre-existing generic queue leases could not be reconstructed. Do not claim the original local dev database was wholly untouched. The ledger contains the investigation and bounded recovery evidence.

Task8 initially used the postgres role to set the custom database parameter and received42501; that helper's own idle connection kept its node process alive. Only those exact owned reset/probe node children were stopped; the helper now uses the bounded docker exec command above. No broad process/container cleanup occurred.

## Producer-first delivery and activation

1. Independent review of both whole branches; fix Critical/Important findings with reproducing RED -> GREEN tests. Keep all new credentials unset and ATLAS_TEST_DATA_MUTATIONS_ENABLED false on both servers.
2. Review the concrete PRs, migration SQL and verification receipt. Deployment/activation is a separately reported operation; no live target is approved by accepting implementation.
3. Apply/deploy compatible H schema/API first, then O schema/consumer. Verify the exact reviewed SHAs, intended hosts and actual canonical migration ledger. The O guard must become green from real reviewed application, never an override.
4. Unauthenticated mutation endpoints must deny. Use no paid audio production smoke. Review narrowly mapped operator bindings and dedicated read/execute credentials separately.
5. Begin authenticated live read-only inventory. Deliberately classify and attest only the owner's exact confirmed targets; the remaining eight stay unknown. Mutation still needs a fresh exact card approval, before package expiry, for each quarantine or restore.
6. Coordinate metrics v2 explicitly; endpoint/consumer defaults remain v1 until that switch is approved. Never relabel historical snapshots or compare across definition/exclusion changes as growth.
7. Verify real-phone microphone/interrupt/navigation behavior after deployment, reusing the accepted voice and browser permissions. Local native tests cannot certify the user's physical phone permissions, audio routing or lock-screen background limitations.

Rollback disables the two mutation flags/grants and reconciles in-flight execution IDs. Already dispatched approved work may finish. Keep markers, evidence and historical snapshots; use a separately reviewed restore package if required. Never reset production or delete data as rollback.

## Rulings I made

Every chronological ruling is retained from the ledger, including its rationale and cost if wrong.

1. Ruling: Protect both real-company IDs even if DB registry is stale; hardcoded capability guard plus DB invariant are authoritative — per approved owner correction — wrong implementation could affect real accounts, so both layers are tested.

2. Ruling: Skill shell helpers run from copies in this plan's ignored workspace on Windows Git Bash; the skill installation exists only in the cloud executor — preserves original helper behavior while using the actual repositories.

3. Ruling: Git Bash represents physical plan paths as /c/... while git reports C:/...; use the plan helper-selected -plans workspace and retain the exact marker it generated. No implementation state existed in either directory.

4. Task 1: Ruling: Add classification-policy.ts alongside server-only classification.ts so client-safe validation and ID guards can be exercised directly while DB rechecks real authority — no weaker role check; wrong separation would expose server dependencies in the UI, caught by type/build and guard tests.

5. Task 1: Ruling: requirePlatformAdminFresh is used at sensitive server boundaries instead of only cached requirePlatformAdmin — DB also re-derives authority — cost if wrong is redundant verification latency on rare admin actions, not normal voice turns.

6. Task 1: Ruling: Adding /admin/testdata requires its literal privacy-safe category in lib/observability/sentry-pages.ts; whole-project page-inventory test caught this — prevents new route being reported as unknown; no dynamic values added.

7. Task 1: Ruling: Three pre-existing SQL tests count private base tables exactly; update 12 -> 14 for the two reviewed private classification/protection tables. Existing global privilege invariants remain unchanged and pass. Further reviewed private schema additions must update this inventory deliberately.

8. Task 1: Ruling: Legacy dblink concurrency tests hardcoded host.docker.internal:55322 in 94 connections across 28 files. The first whole-db run, though CLI targeted isolated DB, sent those dblink connections to the ordinary local development database. No production database was accessed. The run left one freshly created seat-sync fixture (exact ID/name/email/created_at verified); its original teardown was executed after retaining an ignored local snapshot. No broad reset or unrelated record deletion occurred. Generic test queue claims on the old local DB cannot be reconstructed to their prior state; they were local test leases only, not provider calls. Do not claim the ordinary local DB was untouched.

9. Task 1: Ruling: Committed test connection strings now use current_setting('test.host_port', true), defaulting to the established 55322; isolated DB sets it to 56422. Self-loopback 127.0.0.1 was rejected because local pg_hba trust makes dblink require delegated credentials; use the existing password-authenticated external loopback with the correct project port. Supabase's restricted postgres role cannot ALTER DATABASE parameters, so only the owned test container's supabase_admin set this test-only GUC. This changes no business RPC or production setting. All subsequent full DB runs use original source tests against the isolated DB and its explicit port override; source tests remain reproducible without rewritten copies.

10. Task 1: Ruling: Bind the passed classification principal to requirePlatformAdminFresh's current authUserId as well as rechecking DB authority; a newly added test observed RED for a different previous user's principal, then GREEN. This rejects accidental stale identity reuse; cost if wrong: legitimate admin must reload.

11. Task 1: Ruling: Full eslint includes ignored .superpowers helper scratch by default; use --ignore-pattern .superpowers/** so local helper CommonJS files are not treated as product. No product lint rule disabled; all product files checked. Initial task-done failed because nested cmd quotes became literal Docker bind-path characters; replaced its verification wrapper with structured Node argv, and final task-done passed.

12. Task 2: Ruling: Add an explicit platform-admin manifest review/attestation to populate per-object provenance by exact kind/ID/row hash; root classification cannot attest children. Otherwise the approved per-child verification would have no usable entry point. Cost if wrong: manifest review must be repeated after graph changes; no new child is auto-approved.

13. Task 2: Ruling: Empty preparation returns the discriminated result {status:nothing_to_do}, not a fabricated PackageView ID; exact approved spec takes precedence over the plan's narrow Promise<PackageView> annotation. Cost if wrong: consumers must handle this union explicitly.

14. Task 2: Ruling: Introduce private binding and marker storage contracts with preparation, before Task 6/3 add signature/execute behavior; no remote execute capability or marker write RPC is granted in Task 2. This resolves the plan's earlier preparation consuming later identity/restore interfaces. Cost if wrong: later migrations must preserve these private contracts.

15. Task 2: Ruling: Atlas administrative audit actions are excluded from the commercial object fingerprint but registry/provenance/marker revisions are bound separately. This avoids an attestation's own audit append invalidating its input. All original audit rows stay preserved. Cost if wrong: operational audit-only changes do not force a fresh package; business changes do.

16. Task 2: Ruling: Inventory omits ClassificationView.evidenceRef; evidence is admin-only text, while the approved inventory contract permits only names/IDs, classification, revisions, counts and stable blockers. Cost if wrong: an operator must open the admin classification view for the underlying evidence.

17. Task 2: Ruling: Detect unreviewed schema changes by a pinned SHA-256 over business table columns/FKs, excluding the explicit set of private Atlas control tables. Never automatically bless the deployed schema. Cost if wrong: an unrelated schema migration can temporarily block preparation until its dependencies are reviewed; it cannot silently expand cleanup.

18. Task 2: Ruling: Manifest fingerprint binds objects/classification/markers without provenance, while package fingerprint additionally binds provenance revisions; the admin operation necessarily changes provenance itself. Both use canonical sorted JSON schemaVersion 1. Cost if wrong: packages and admin attestations cannot interchange their fingerprints, enforced by separate entry points.

19. Task 2: Ruling: Restore origin validation denies by default until Task 3 installs receipt-backed validation. Marker storage and its original_execution_id already participate in graph fingerprints. No incomplete restore can be prepared or remotely executed between tasks. Cost if wrong: restore is temporarily unavailable on this unactivated branch.

20. Task 2: Ruling: The pinned schema fingerprint also covers incoming FKs from any other schema, excluding only named private Atlas control tables. A new cross-schema dependency test observed RED (27/28 pass) before this correction; recomputed reviewed local baseline SHA is 45290090ef97d70f787f76bdd73cd6c107088141addba5c01f4d22e21da45cda. Cost if wrong: same conservative preparation block after schema change, not permission expansion.

21. Task 2: Ruling: Private base-table inventory tests deliberately move 14 -> 18 for four new private binding/provenance/package/marker tables (three tests observed RED first). No privilege assertions relaxed. Fresh migration replay and whole DB suite now running on owned handlarborsen-atlas-test-data-local only; its database GUC explicitly stays test.host_port=56422.

22. Task 3: Ruling: Add private exact-package approval rows now, with hash of the complete frozen PackageView, operator binding, expiry and revocation; no API insert grant. Task 6 may register only server-verified signed approvals, and Task 7 must supply an actual review-card decision. Cost if wrong: activation remains blocked; a model argument never creates approval authority.

23. Task 3: Ruling: Internal execution RPC also receives target_conversation_id from the verified principal, separately from model input. Compare it with the immutable package before any result/mutation. Five UUID args could not express that boundary; explicit six-arg wrong-conversation test observed RED before adding it. Cost if wrong: stale or other-thread commands are denied, not silently transferred. Public TS execute interface stays input plus principal as approved.

24. Task 3: Ruling: Approval/receipt storage has separate private tables and markers reference an applied original quarantine receipt via deferred FK; execution writes marker, receipt and audit in one transaction. Internal control-table schema exclusion list explicitly adds approvals, keeping the reviewed business-schema fingerprint unchanged. Cost if wrong: DB commit rejects an incomplete original receipt, never commits an orphan marker.

25. Task 3: Ruling: Audit actor_user_id is null for cross-app execution, with operatorBindingId/approvalRef/executionId in immutable metadata; Omnira and Handlarborsen UUIDs are not assumed to identify the same profile. Cost if wrong: trace follows the registered cross-app binding rather than impersonating a Handlarborsen profile.

26. Task 3: Ruling: Existing private table-count inventory moves18->20 for approval+receipt tables after all three inventory tests observed RED; privilege assertions remain unchanged. Cost if wrong: an explicit schema inventory mismatch fails the suite.

27. Task 4: Ruling: Use a dedicated local browser harness on56430, against ownAPI56421/DB56422, one worker/no retries, no provider keys and external browser requests blocked. Browser fixture UUIDs are remapped to fresh synthetic IDs, including its real-category organization, so it never edits the actual protected-ID records. Browser first launch hit Turbopack refusing node_modules junction outside project root; verified installed CLI --webpack and switched only this local test-server command, no app config/version changes. Cost if wrong: test bundler differs; final build must report its exact bundler too. Browser meaningful RED not yet observed; current retry is process running via task4-browser-red-webpack.log.

28. Task 4 fixture ruling: Older concurrency suites leave local admin-email event history, so a broad claim in the new test initially returned10 rows. New fixture's next_attempt_at is2000 and batch_size1; assertions identify only event_key atlas-access-queued and roll back all probe claims. This proves target eligibility and target exclusion while permitting unrelated queue work; no external dispatch happens in SQL tests. No ordinary/dev/prod DB was used.

29. Task 4: Ruling: Shared profile and device identities are not quarantined. Their changes lock all related orgs for snapshot consistency, but only actual business-owned orgs are denied activity. A later real membership may be created after quarantine while the old test membership stays hidden; if it commits before cleanup, shared-membership recheck blocks cleanup. Cost if wrong: graph changes after quarantine can require a new restore review, but genuine identity/membership must not be disabled.

30. Task 4: Ruling: Applied receipt's exact object IDs define retained test history. Old queued test mail/push must not resend just because restore removes a marker, and originally retained vehicle assets must not be physically purged by the automatic worker. Use original immutable package object membership for dispatch/purge suppression, while normal historical read visibility returns on restore. This implements the approved no-send/no-Storage-delete restoration boundary without changing original queue/business statuses. Cost if wrong: automatic dispatch/purge of that explicitly retained history stays suppressed; any later physical removal/resend needs a separate deliberate operation.

31. Task 4: Ruling: Server read callers keep their existing narrow RPC/RLS paths; quarantine is enforced in those central owning SQL predicates, avoiding a redundant extra network call on ordinary reads. Only actual provider boundaries add preflight RPC checks. Cost if wrong: any missed reader could leak active test data, so direct owner links, marketplace search, admin historical inspection and native browser are required checks.

32. Task 4: Ruling: Exact service-role function allowlist extends27->29 for only atlas_check_claimed_dispatch and atlas_check_test_data_dispatch after the old exact-list assertion observed RED. All direct table/column/sequence and anon/PUBLIC invariants remain unchanged. Both gates are read/lock-only, no execute authority.

33. Task 4: Ruling: A Task3 test simulating later offline manual repair now disables only the new vehicle activity trigger for that exact synthetic UPDATE, re-enables it immediately, and performs a separately reviewed restore. This models privileged offline repair without granting a production activity bypass to any admin/client/service role. Its old raw UPDATE correctly failed once activity guards existed. Cost if wrong: the fixture would not model an ordinary UI edit, and is explicitly labelled offline repair.

34. Task 4: Ruling: dispatch coordination uses shared advisory locks for claims/final preflights and the exclusive matching key for prepare, attest and execute before organisation roots — an exclusive lock for every claim broke existing SKIP LOCKED concurrency; fresh isolated replay plus all 116 database files/5003 assertions now pass — cost if wrong: background claim stalls or a quarantine/dispatch race.

35. Task 4: Ruling: direct organisation-approval mail is another owning dispatch boundary and must obtain a durable recipient-bound delivery lease in the existing private mail tables — the prior direct call had no in-flight record, so a preflight alone could race quarantine — cost if wrong: genuine approval email availability or untracked external sends. Only one narrow service RPC is added; no table access grants.

36. Task 4: Ruling: an uncertain direct approval-mail send remains processing and cannot be automatically retried, including after lease expiry; the generic admin-alert worker excludes this distinct template — avoids clearing a quarantine blocker without provider evidence and avoids duplicate sends outside provider idempotency retention — cost if wrong: a genuine failed approval email requires explicit receipt reconciliation instead of a quick retry.

37. Task 5: Ruling: retain distinct same-day rows per definition by changing snapshot uniqueness to (project_id,snapshot_date,definition_id), preserving legacy guarded-store signature and adding one v2-only guarded store — a single row per date would overwrite legacy history during a same-day switch — cost if wrong: old collector compatibility or ambiguous report ordering. Default collector remains v1 until explicit server switch; same-day report chooses v2 first but retains both rows.

38. Task 5: Ruling: the immutable analysis-draft source envelope remains v1-only; strip exactly verified legacy metadata when bridging legacy rows, and return no draft source for v2 instead of relabelling it v1 — the signed analysis semantics and SQL binding are frozen v1 contracts outside this plan — cost if wrong: v2 reports are readable but analysis-draft creation needs its own versioned contract before enabling v2 collection. Existing v1 analysis remains tested and unchanged.

39. Task 5: Ruling: suppress growth and chart segments when v2 exclusion counts change or are unavailable, as well as across definition changes — cleanup is not business growth or contraction — cost if wrong: a real change is withheld until comparable observations exist; equal exclusion counts alone cannot prove identical excluded membership (the approved aggregate envelope provides no population hash).

40. Task 5: Ruling: update the owning report component to display Swedish definition/population markers and distinct same-day history keys — model-only metadata cannot inform a person looking at the page — cost if wrong: report presentation compatibility.

41. Task 5: Ruling: use a separate plan-owned database omnira_atlas_test_data_local inside our owned H local PostgreSQL container, tagged with the exact plan, for O snapshot SQL; bootstrap only projects + canonical snapshot/guarded-store migrations — O has no local Supabase config and existing omnira-stt-local is not ours — cost if wrong: focused projection SQL replay does not prove the entire O production migration history; final review must retain that limitation. H tests use their separate postgres DB; no shared/live services changed.

42. Task 5: Ruling: migration guard remains enforced for the new O migration; fixture counts move 130/116 to 131/117 and hypothetical post-apply ledger 154, with an explicit test rejecting the current pre-apply 153-row set — no production application is authorised by code tests and no override/grandfathering is introduced — cost if wrong: release build correctly stays blocked until an operator-approved migration apply.

43. Task 5: Ruling: baseline O has no ESLint configuration (tracked catalog empty; next lint opens setup prompt and exits 1); do not create a new repo-wide lint policy during this feature — use existing TypeScript diagnostics, focused tests and diff-whitespace verification, explicitly report lint unavailable — cost if wrong: lint-only issues require final review or the future repo lint setup.

44. Task 5: Ruling: classify broad O-suite failures against an untouched detached baseline rather than port unrelated tests — full run had 103 failed files/402 assertions, 459 passed files/13115 assertions and 1326 existing skips; baseline 534cd13 reproduced 401 failures in the same 102 files (two bounded runs: 280 + 121). The remaining platform-authority file had a cold-import 5s timeout and passed all 53 tests with a 30s local test timeout; no product code changed — cost if wrong: broad Windows/CRLF and missing-test-service coverage remains unproven; scoped checks and independent final review are the release evidence, and no whole-O green claim is made. Baseline worktree is retained at C:/Users/Andre/Projects/Omnira/.worktrees/atlas-test-data-baseline-20261017.

45. Task 5: Ruling: keep browser/SQL integration fixtures sequential and scoped verification on one worker after observing a fixed-container collision and cold-import timeouts under overlapping broad checks — old analysis SQL passed in the whole suite (49s) and standalone serial recheck (175s); no unowned container was removed — cost if wrong: slower local checks rather than unstable false failures.

46. Task 7 Ruling: new event carries validated reviewRef/decisionState/nullable receipt alongside PackageView, all server-produced, because the dedicated route needs the immutable bound review reference — arbitrary tool prose cannot create the event and the decoder rejects extra fields/foreign conversations — cost if wrong: transport shape refinement, no change in approval authority.

47. Task 7 Ruling: use existing controller.ensureConversation for real chat/voice first turns; a direct /api/chat call without an owned persisted conversation cannot prepare an actionable review — every present full-chat/global-voice sender already ensures the owned thread, and inventing server-side ownership from a missing ID would transfer authority — cost if wrong: a future sender must create a conversation before using cleanup tools.

48. Task 7 Ruling: expose read-only receipt lookup separately from dispatch; a committed approval with an undispatched outbox can be resumed deliberately with its same review reference, while dispatching/unknown always reconcile the same execution — this covers server interruption between approval commit and HTTP dispatch without a blind resend — cost if wrong: a stranded undispatched job needs a new review after TTL, not an automatic mutation.

49. Task8 Ruling: a real physical commit is necessary for lost-response evidence, so the opt-in contract probe commits synthetic data only to the owned H test cluster and creates a fresh tagged O fixture database for concurrent sessions; after the probe an explicit owned reset restores empty local fixtures and O is bootstrapped again before SQL checks — transaction rollback alone would not prove receipt visibility after commit — cost if wrong: owned local fixture rerun, never a production reset or broad cleanup.

50. Final: Ruling: merge freshly fetched O origin/main into this private implementation branch before its one independent review, retaining both upstream inbox/local-text behavior and cleanup authority; derive migration counts from the actual merged set rather than taking either branch's counts — avoids shipping against stale shared chat/security contracts — cost if wrong: reversible private-branch merge resolution and affected re-verification, no shared/main mutation or production apply.

51. Final: Ruling: retain upstream @omnira/local-text-contract workspace1.0.0 and its lockfile, installing the missing local workspace link with the package manager offline/ignore-scripts rather than dropping upstream code or inventing another dependency version — required by the merged local-text tool imports — cost if wrong: reify the owned worktree dependencies again, no package upgrade or production install.

52. Final: Ruling: use resolved owning-organisation overlap for metadata/parent-owned notifications, push and email graph selection, and derive processing-delivery blockers from those exact graph objects — a real null-org admin notification producer otherwise escapes package/lease/retention checks — cost if wrong: safe fail-closed larger package/blockers; never add the recipient admin identity itself to quarantine.

53. Final: Ruling: preserve immutable conversation UUID as audit identity without a live conversations foreign key; every authority RPC still verifies the current owned live conversation — the existing delete endpoint otherwise fails forever after preparation — cost if wrong: retained audit references can outlive the user-visible thread; they cannot approve or transfer authority after deletion.

54. Final: Ruling: persist only the bounded definitive no-execution refusals needs_new_review/denied/disabled as not_applied with the existing held one-use claim, separately from real H receipts; derive pending-outbox expiry from its never-dispatched state — timeout/invalid/ack-failure uncertainty remains receipt-only under the same execution ID — cost if wrong: an unrecognised refusal stays unknown, never falsely successful or replayed. Add one service-only rejection acknowledgement RPC, no browser grant or new mutation ID.

55. Final: Ruling: merge validated saved review effects into cached threads by package/review/conversation binding and monotonic decision/receipt rank — navigation can drop a late typed effect while the durable saved message still exists — cost if wrong: retain a newer local decision rather than downgrade it from an older saved pending message; server authority always revalidates.

56. Final: Ruling: finish the approved Task8 reviewable draft PRs while disclosing reproduced whole-O baseline failures and focused SQL limitations — the approved plan explicitly requires separating unchanged baseline failures from scoped checks — cost if wrong: drafts remain unsuitable for automatic merge or production activation; no claim of a green complete O suite.

## Independent review and single fix pass

The sole independent whole-branch reviewer reported four Important findings, no Critical or Minor findings, and **Declined to judge: none**. The unchanged [independent report](2026-10-17-independent-review.md) identifies the original frozen H bdf3f4e / O ec97db4 source and concrete triggers. All four were accepted on user impact and addressed in one coordinator TDD fix pass. No second review is claimed.

| Finding | Reproducing RED | Fix and verification |
| --- | --- | --- |
| I1: metadata-owned admin push escaped graph/lease/retention | H graph assertions11/12 and lease/execute14/15 failed; old code returned applied with processing admin push | Resolved owning-org graph selection for notification/push/email, graph-derived processing blockers; full fresh H SQL5047 passes, including queued/claimed metadata-owned push and post-restore no-resend |
| I2: review FK blocked normal chat deletion forever | Real SQL deletion failed23503 | Immutable UUID audit retained without live conversation FK; deletion with pending/rejected/expired/unknown/applied audit states, retained evidence and deleted-thread denial pass |
| I3: definitive non-execution became endless checking | Service and review decoding assertions failed among eight new failing unit cases | Bounded not_applied refusal acknowledged with the original held claim; never invent a H receipt. Pending-outbox expiry gives a new-review outcome. Invalid/timeouts/ack failure retain same-ID receipt-only reconciliation. SQL and real phone-card harness pass |
| I4: cached thread lost late review | Cached saved-review activation assertion failed | Merge validated bound saved effects without downgrading local decisions/receipts; delayed-stream navigation and stale-refresh tests pass; chat/voice native regressions pass |

The initial H RED fixture also used an invalid push-completion error class after its meaningful source failures; it was corrected to the existing provider_transient/null retry-after contract. It calls no provider.

No deferred minors. Every declined-to-judge entry has been ruled: the list is empty. Deployment, physical-phone audio behavior and target classification were outside the read-only reviewer scope and remain explicitly separate operations.

## Final source pins and checks

- H reviewed-fix source: cebf0fec09cc4d7f06349c2364254e1244cf4609.
- O reviewed-fix source: 4959a285973c4bffddc4f416a0eb7158027b04ef (includes upstream f0b52e1).
- Later delivery documentation commits do not alter these product-source pins. Deploy only the actual approved final branch HEADs after checking their diff, not by assuming a branch name identifies reviewed code.

| Post-fix check | Actual result |
| --- | --- |
| H fresh full pgTAP | PASS118 files /5047 assertions |
| H full units | PASS1298, one opt-in committed fixture skipped by default |
| H generated types | Verified |
| O owning/overlap/authority/chat/voice/controller/security units | PASS482/482 in22 files |
| O focused canonical SQL | PASS55: metrics10, authority11, review/outbox/lifecycle34; not full production replay |
| O nonincremental tsc | PASS0 |
| O dedicated phone-card/global-voice browser | PASS3/3 workers1/retries0 |
| O existing messenger/voice browser | PASS32/32 workers1/retries0 |
| Final H typecheck/lint/build | PASS0; lint0 errors/4 existing warnings; webpack build0; post-restore tsc0 |
| Final O normal production build | PASS exit0,110.01seconds,63/63 static pages; actual fonts, no source workaround |

The physically committed cross-app scenario and H owner-access mobile browser passed before the independent fix pass, as recorded above. They are not represented as repeated after that pass; changed dispatch graph behavior is covered by the new real SQL claim/restore regression and full H suite. Existing complete-O baseline failures and lint/focused-replay limitations still apply. No production apply, deployment, activation, credential/grant provisioning or target cleanup has occurred.

## Reviewable delivery

The final read-only main check found H still at ec1cdbf. O main advanced from f0b52e1 to0711d4a only in six isolated Remotion/content paths (no apps/web, schema or lockfile changes). That later Remotion commit is not part of this candidate; the exact tested web source remains4959a28, and the PR must preserve upstream changes when integrated.

- H producer draft: [handlarborsen#141](https://github.com/Bumbi190/handlarborsen/pull/141), initially published03dfb1cd2adb7c92a05ae603ee089ff2616f7116.
- O consumer draft: [ai-operating-platform#399](https://github.com/Bumbi190/ai-operating-platform/pull/399), initially publishedf3db0273e792db38b1207e379ab5540fba444edc.

Product-source pins above remain authoritative; this PR-link documentation update does not alter product code. Both remain drafts, not merged or activated. Worktrees and raw evidence are retained for review feedback. New mutation flags remain false/unset; the next release operation follows the producer-first sequence above.

Publishing the draft branches triggered automatic Vercel preview checks. At the first PR-status read, H preview was successful and O preview plus three repository CI checks were pending. These are automated preview/CI operations, not a production rollout or activation; no production schema, new credentials/grants or targets were changed. Both PRs were OPEN/DRAFT/MERGEABLE at that read. Final local product source is unchanged from the verified pins above.

The later read-only [O preview build-log check](https://vercel.com/bumbi190s-projects/ai-operating-platform-web/7hXo1mWReW2YhHoiZcA44BMgUpDN) at1a790d2 confirmed ERROR because the enforced production-ledger migration guard lists exactly handlarborsen_metrics_definition, handlarborsen_test_data_integration and handlarborsen_test_data_reviews as unapplied. This is the expected deployment barrier; local normal build/scoped gates pass, but production readiness is not claimed. No override, fabricated ledger entry, migration application or activation was used. SDF-1B and Trading canon CI passed at that read; the other repository CI jobs were still running. This documentation-only follow-up does not change the tested product source.

## Continuation2026-10-18: live preflight and canonical reconciliation

Current O source2d00ab7b95a28f1ed680bc2b372363d31f756d69 includes shared main37ffd3f through merge649215a; H remains03dfb1cd2adb7c92a05ae603ee089ff2616f7116. Both own cleanup SQL interfaces and voice engine are unchanged. The current-main Remotion and project-news features are retained.

Production was inspected read-only: H62 ledger names, exactly our six pending; O160 names, exactly our three pending plus the previously unknown already-applied sales_strato_inbox. H37 business tables and74 incoming dependencies matched local. Fingerprint45290090ef97d70f787f76bdd73cd6c107088141addba5c01f4d22e21da45cda matched when executed inside a read-only transaction with the function’s declared empty search_path; a default-search-path text digest is not comparable. The read-only transaction was rolled back. H has10 organisations and both protected UUIDs.

The exact inbox canonical SQL from PR386 was byte-identical to its production ledger SQL:36094bytes, SHA2561013142706f4fc1ebd60c31f64cc3f38d6d0d9082c58610487ddc46a4bc606a1. Only that already-applied file and four independently observed SERVER_ONLY catalog entries were imported; no mail application code, provider call or production SQL apply. The original file version is preserved. The four tables have RLS, zero policies/client grants and service-role select/insert/update but no delete; public live catalog156. Existing own DB_INTERNAL entries remain unchanged.

Guard remains strict: canonical140/enforced126, frozen14 grandfathered/30 legacy unchanged. A captured160-name production fixture reproduced RED unknown sales_strato_inbox even after hypothetical own applies. Exact canonical source resolves it; removing that name still fails as an enforced omission. Real ledger160 still fails for our three unapplied names. Hypothetical-only163 passes. All fixture counts are explicit: full163, P1B+P1E omission161, P1E omission162, own-three omission160. No override, wildcard, ledger write or grandfather expansion.

Continuation checks:487/487 in23 files PASS; review/outbox/lifecycle SQL34/34 PASS (other21 focused cases use unchanged own SQL); nonincremental tsc0; final normal production build exit0 with63/63 static pages. The build used local-only credentials and no source workaround. Generated design bundle was restored afterward. Existing full-O baseline failures/lint/full-replay limits remain disclosed. No new independent review is claimed for this canonical-recording continuation; its exact already-live SQL, source/security gates and fresh fixture evidence are recorded.

Inventory-only grant proposals pass6/6 checks on the owned local H/O databases, with every transaction rolled back: no mutation operations, exact retry/expiry preservation, and changed-owner/revoked-binding denial. [The release proposal](2026-10-18-release-preflight.md) links both SQL proposals and the nine exact pending migration blob hashes. Production keys, grants, flags, classifications and targets were not changed.

## Continuation rulings57–60

57. Continuation Ruling: merge latest shared main37ffd3f into our private O branch, preserving upstream isolated Remotion preview and project-specific legacy-news navigation — these12 files have no cleanup/migration/voice/controller overlap — cost if wrong: reversible private-branch merge, affected route unit/type/build checks before push; no shared-main merge or live operation.

58. Continuation Ruling: treat live sales_strato_inbox as a release dependency rather than adding an allowlist exception or importing the unrelated draft mail feature — its schema is already applied but canonical source belongs to OPEN/DRAFT PR386; actual O ledger160 + our three names would still fail unknown-name checking — cost if wrong: release waits for proper canonical integration of that dependency, without weakening migration guard or merging unreviewed mail work.

59. Continuation Ruling: canonicalize only the exact already-applied sales_strato_inbox SQL blob and its four observed SERVER_ONLY table entries, superseding the earlier dependency wait once direct evidence became available — the PR386 blob is byte-identical to the actual production ledger (36094 bytes, SHA2561013142706f4fc1ebd60c31f64cc3f38d6d0d9082c58610487ddc46a4bc606a1); this resolves the unknown-name barrier without mail application imports, allowlist expansion or production writes — cost if wrong: immutable hash check aborts and the production guard stays fail-closed. Original source filename/version is preserved; no new migration name invented.

60. Continuation Ruling: stage the first production activation as inventory-only for the freshly verified project owner, using one bound30-day H/O principal with empty operation lists, read-key capability only, mutation flags false and execute keys unset — the approved first-live step is authenticated inventory and the eight remaining companies still need individual classification/review — cost if wrong: Atlas can inspect but cannot prepare/execute quarantine or restore until the owner explicitly authorises that later scope. No account mode, metrics collector version or business data changes. Proposed grant SQL tested6/6 against owned local databases with rollback, including exact idempotency, changed owner and revoked binding refusal.

No deferred minors. No new declined-to-judge items. The sole original independent review and its one fix pass remain recorded above. Shared-main merge, production schema apply and production activation are the remaining explicit-approval boundary.
