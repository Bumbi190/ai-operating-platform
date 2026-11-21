# Atlas/Nova global owner project catalogue – Stage 0 (2026-10-29)

**Status: INERT STAGES 0–1. The Stage 1 read-only DB adapter and SQL PROPOSAL are NOT connected to Nova chat, real Supabase queries, or GitHub/Vercel provider calls.**

**Owner's non-negotiable GitHub deletion rule:** Nova/Atlas may create new repositories via a separate project-authorized write workflow and may recommend manual deletion, pause work and revoke/disconnect Omnira integrations, but will **never delete a GitHub repository directly or indirectly**. Only the owner executes full deletion manually in GitHub. The inert action classification contract in `nova-github-operations.ts` is a planning safeguard, not a connected tool-gate. The technical worker is called project/workflow agent – "Pling" is only its 3D avatar, and the Familje-Stunden Pling is an unrelated story character.

Work ID: [#604](https://github.com/Bumbi190/ai-operating-platform/issues/604). Owner-approved target architecture: [Notion](https://app.notion.com/p/4087b977c5b8819f8122de73ab8f0b91). Existing Nova source read pilot: [#576](https://github.com/Bumbi190/ai-operating-platform/issues/576).

## Collaboration boundary: Prime Agent
Prime Agent is being developed separately on `codex/atlas-model-agent-router-20261022`. Its current local worktree has uncommitted Windows broker/TPM and model router code. **This change does not touch any model-router, code broker, TPM, SDF, chat dispatch, provider credential or database files.** No Prime Agent run, approval or model budget is reused. It does not increase the previously agreed 5 USD/day Prime budget or the 3 Codex calls/day limit.

## Delivered contract
`apps/web/lib/atlas/project-connections/owner-github-catalog.ts` is a pure TypeScript module:
- Reads a **caller-provided owner-approved catalogue** by project UUID, not a hardcoded slug or single repository name. An authenticated caller must independently derive `ownedProjectIds` from `apps/web/lib/atlas/isolation.ts` and verify owner record membership.
- Rejects missing/duplicate/conflicting records, foreign owners, disabled records, unsafe names/branches and ambiguous shared-repo mappings. A model-provided project slug/URL is never sufficient authority.
- Returns an immutable **candidate read scope** for a single known project. A nonenumerable module-local marker makes accidental caller-made scopes fail; this is *not* a substitute for session, RLS or provider verification.
- Validates independently obtained **App-JWT parent-installation receipt** against numeric App ID, installation ID, owner ID/login/type, read-only Contents+Metadata, no events or suspension. Accepts a parent installation with either `repository_selection='all'` or `'selected'`; it never converts this into a broad token.
- Constructs only `repository_ids: [oneVerifiedRepoId]` and `permissions: { contents: 'read' }` for the future token mint; checks live repository numeric identity, owner and branch, and rejects broad/other-repo/write-capable/expired minted-token receipts.
- Does not store secrets, supply a network client, mint tokens, query Supabase or Vercel, create a repository, or start a workflow agent/Prime Agent. No new feature flag, schema, migration, cron or paid provider calls.

**Crucial:** Any future server route must still authenticate the owner, derive the project ownership allowlist from trusted database rows, validate current GitHub responses over an authenticated App transport, bind every provider operation to a fresh project/installation/repository, and independently deny unapproved reads. The pure candidate scope is never a sufficient runtime authorization by itself.

## Existing live limitations deliberately preserved
- The shipping `source-inspection/policy.ts`, `atlas-tool.ts` and `github.ts` remain Handlarbörsen-only, Preview-gated and OFF. `github.ts` still denies a parent All-repositories installation.
- Existing SDF Code Broker repository allowlist and Windows/Prime Agent identity are unchanged. **Do not add new repositories to that allowlist** as a side effect of Atlas read-only discovery.
- `apps/web/app/api/chat/route.ts` is untouched because a separate Nova Source Curator PR #602 owns overlapping chat routing.

## Next milestones (not implemented by Stage 0)
1. **Owner catalog persistence**: security-reviewed `projectId + ownerId + verified provider IDs + connection status` mapping, RLS/ACL, immutable approval/revoke history and a filtered owner-only list. Propose migration separately; do not apply production DML or add a service-role bypass.
2. **GitHub read-only runtime**: independently verify new GitHub App installation identity, discover accessible repository metadata in a bounded owner session, let owner approve mapping to Omnira project, then mint only one-repo tokens for per-project read/commit inspection. Prove cross-project and forged-SHA denial, output redaction and owner revoke. **Do not place a PEM key in chat, PR, Notion or logs.**
3. **Supabase optional connector**: per-project immutable Supabase project ref and environment, read-only schema/status/logs first, no secret/service-role exposure to LLM or workflow agent. Authenticated owner + project ACL and narrow data access. SQL writes, migrations, RLS, admin and key changes are separate critical owner approvals.
4. **Vercel optional connector**: verified team/project ID + branch/commit + environment, read-only deployment/build/Preview status first; deploy/promotion/rollback/env-secret changes require explicit owner action, estimated costs and rollback details.
5. **workflow agent lifecycle**: each active agent instance references one active project-workflow/job, per-run budget and separate credentials/memory. No cross-project data and no idle/orphaned billable agents.
6. **Browser/Desktop**: bounded observation with provenance; any effectful computer/browser action delegated under separate auditable permissions; Prime Agent keeps exclusive ownership of the code-execution implementation.

## Tested
`node --experimental-strip-types --test apps/web/lib/qa/atlas-owner-github-catalog.test.mjs` (Node 22): **15/15 tests PASS**, no skips, offline, synthetic objects. Tests cover three dynamically added projects, foreign owners, ambiguous repo mappings, selected/all parent receipt, one-repo scope, forged scope, repo identity, and token permissions/TTL. Clean CI and full TypeScript checks must still run before merge. This proves only the pure policy logic, not a live installation, Supabase/Vercel integration, or autonomous code agent.

## Cost and release rule
Stage 0 ran no network provider calls or paid models. Keep all new provider integrations disabled by default. Before approval of a real connection, show the owner the exact project, scopes, source, potential cost, data-security risk and rollback plan. Production and write authority are separate approvals.

## Stage 1 follow-up – offline read-only persistence adapter (29 October 2026)

**Status: IMPLEMENTED IN A DRAFT BRANCH FOR OFFLINE VERIFICATION ONLY. No schema or credential has been applied to Supabase or Vercel.**

- The existing `owner-github-catalog.ts` now also exports `loadStoredOwnerGithubReadScope`. This adapter accepts a caller-provided DB query interface (no project credentials) and requires independently verified owner UUID + exact requested project UUID. It queries `projects` by `owner_id` and checks `owner_id` again in returned rows, before querying future `atlas_owner_github_bindings` by exact `owner_user_id`, `state='approved'` and the list of owned project UUIDs.
- Each approved mapping is matched against the project's current canonical `slug`, owner and reviewer ID, numeric GitHub identities and a non-future approval timestamp. A missing table, foreign project, stale/malformed approval, duplicate/ambiguous repository mapping or provider/db error causes `not_available`, with no fallback to a default project or account-wide token.
- The adapter refuses silent truncation if a caller has more than 200 projects or approved records. Scaling beyond that ceiling requires a separately reviewed paginated, snapshot-consistent listing instead of ignoring records.
- The Stage 0 candidate-scope marker and one-repository token restrictions remain intact. **No DB result automatically grants runtime authority**: the future endpoint must verify a live authenticated operator session, fresh project membership, real GitHub App installation and immutable repository identity at every access, and never trust model text as a principal.

### Proposed database contract — not a migration

The SQL sketch in `docs/architecture/proposed-sql/atlas_owner_github_bindings_stage1_PROPOSAL.sql` is deliberately outside `apps/web/supabase/migrations` to avoid changing the protected migration ledger or Vercel build guard. It proposes owner-bound project references, `pending/approved/revoked` states, reviewer/date fields, unique active repository mappings, RLS and only authenticated owner **SELECT** access. There is no insert/update/delete permission for normal users or workflow agent. **No real SQL schema has been created, modified, granted or populated.**

Known Supabase change: new tables are no longer automatically exposed to the Data API under the 2026 rollout, with enforcement planned for **30 October 2026**. Before implementing a live reader, independently review the project's Data API exposure/grant configuration and keep browser access closed by default. All production SQL changes require explicit owner approval, migration-ledger review and a real isolated Postgres/RLS test. Our static SQL contract is not a live database verification.

### Evidence

Offline local `node --experimental-strip-types --test` over three named suites: **40/40 passed, zero skips** (15 Stage 0, 17 Stage 1 loader, 8 SQL proposal contract cases). The same source file passed strict standalone TypeScript without changing shared `tsconfig`. These tests use synthetic DB objects only and do not authenticate Supabase, create a GitHub token, contact Vercel, modify a project or call a paid AI model.

### Release gates still open

1. Exact GitHub Actions/Preview verification of this commit and an independent security review.
2. A real owner-approved, migration-guard-safe database change, including RLS adversarial checks and explicit Data API exposure decision.
3. Independent operator/DB/installation authorization at a new server endpoint, an owner-readable UI and an audited acceptance/revoke flow.
4. Real GitHub App owner acceptance in Preview with only a one-repo `contents:read` token, immutable commit evidence and access-denial tests.
5. Optional **Supabase/Vercel** project connectors remain separate read-only-to-write capability stages; **Prime Agent's code broker and model router remain exclusively in their own workstream**.

All work remains in existing Draft PR #605, linked to GitHub issue #604. **No merge, production deployment or secret installation is authorized by test success.**

## Stage 1a targeted security review – 29 October 2026

A further manual security pass reproduced two concrete **RED** regressions in the previous Stage 1 candidate: copying the old public-object Symbol marker onto a forged repo ID, and accepting an `approved` DB row despite a non-null `revoked_at` timestamp. Both were fixed within PR #605 without adding live authority: the candidate identity now uses a module-private WeakSet rather than a copyable Symbol, and the database lookup fetches and independently verifies `revoked_at is null`.

The same pass tightened approval timestamps to explicit timezone-aware ISO instants and qualified the outer project ID in the proposed RLS SQL. New negative tests were added; the three offline suites now pass **44/44, 0 skipped**, with strict standalone TypeScript PASS. A deeper finding remains unresolved: SQL constraints alone do not prove `owner_user_id = projects.owner_id` and no signed independent approval/revocation audit or real PostgreSQL/RLS negative proof exists. A true external/independent reviewer is still required.

Full findings, attack demonstrations, residual risk and owner release gates: `docs/architecture/atlas-owner-github-catalog-security-review-20261029.md`. **This self-review is not an independent attestation. No migration/production/GitHub App configuration was changed.**

## Stage 1b – REAL isolated PostgreSQL 17 negative test (29 October 2026)

**This later section supersedes earlier statements that real PG17 testing remained undone.** The SQL remains a **proposal** outside the canonical migration folder. No real Supabase schema or production data changed.

- A reproducible Windows PowerShell runner lives at `scripts/atlas/verify-owner-github-pg17-rls.ps1`. It uses the existing cached `postgres:17-alpine` Docker image with `--network none`, no host ports or mounts, maximum 256 MiB memory/0.6 CPU, tmpfs-only PGDATA and `--rm`/finally cleanup. The disposable container is named `omnira-nova-rls-issue604-20261029` and the runner refuses to touch a pre-existing container by that name. No download, paid service or real database access.
- Two synthetic SQL fixture files under `apps/web/lib/qa/fixtures/atlas-owner-github-rls` create temporary mock roles (`authenticated`, `anon`, `service_role` with `BYPASSRLS`, and `workflow_agent`), mock `auth.uid()` claim resolution, three fictitious project/binding rows and expected denial checks.
- **RED → GREEN finding A (DB integrity):** original schema permitted a privileged owner mismatch (`project_id` from owner B with `owner_user_id` claiming owner A). The revised proposal adds a composite foreign key `(project_id, owner_user_id) REFERENCES projects(id, owner_id)`, plus the required supporting unique index on the existing `projects` table. The real PG17 test then rejected that cross-owner insert.
- **RED → GREEN finding B (Supabase default ACL):** read-only verification of the real Omnira Supabase project's `pg_default_acl` showed existing postgres and supabase_admin default grants include ALL to `anon`, `authenticated`, and `service_role` on newly created public tables. Simulating this in PG17 showed the proposal's previous `GRANT SELECT` did not remove service-role DML; the new `REVOKE ALL FROM ... service_role` followed by explicit `SELECT` blocked inherited INSERT/UPDATE/DELETE.
- **12 real PG17 assertions PASSED:** owner A only their own records; owner B only theirs; no session => no records; anon/workflow agent SELECT denied; ordinary authenticated INSERT/UPDATE/DELETE denied; project/owner FK rejects privileged mismatch; service-role SELECT works but RLS bypass is explicit; service-role has no table DML after deliberate revocation; final fixture is unchanged.
- Disposable container was verified stopped and absent after each run. The pure/static test workflow has been extended to **46/46 offline tests, 0 failed/skipped** checking composite FK, Supabase default grants and runner isolation. GitHub CI and Vercel on the future updated head still need separate verification.

**Residual gates:** this is isolated synthetic PostgreSQL (mocked JWT claim GUC), not real Supabase Auth/production RLS or a security signoff. The composite index alters the existing `projects` table if applied; review lock time, migration history and safe rollback. Future server adapters using a service-role key must independently restrict each lookup to a freshly authenticated owner/project since that role bypasses RLS. Owner approval/revocation signatures and actual GitHub App connection are not yet built. Independent human security review plus explicit owner approval before live migration, secrets, or merge remains mandatory.
