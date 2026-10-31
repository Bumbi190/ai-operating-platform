# Atlas/Nova GitHub-project lifecycle – revoke, unlink, account deletion

**Design alternative / REVIEW REQUIRED – NOT A PRODUCTION MIGRATION**

## Owner correction – GitHub repository deletion is MANUAL ONLY; Pling is a 3D avatar

**Nova/Atlas must NEVER delete a GitHub repository**, directly or by delegating to a workflow agent, code worker, browser, computer, app or automation, even with a prior task approval. Nova may create new GitHub repos only through a separately approved project-scoped creation capability; recommend deletion and give the owner manual GitHub steps; pause workflows or revoke/disconnect the *Omnira integration* without deleting the repository. A total GitHub repo deletion is exclusively the owner's action performed manually inside GitHub.

**A workflow agent is a technical project-bound executor. "Pling" is solely its on-screen robot avatar/persona in the Omnira 3D office**, with no role in authorization or the server-side agent identity. The Pling in Familje-Stunden is a separate fictional story character. Old references to a "Pling agent" in historic worknotes must be read as "project/workflow agent", not a real Pling principal.

The synthetic SQL `DELETE` operations below describe an **independently authorized administrative project/account erasure process**, not a capability granted to Nova and **never GitHub's repository-delete API**. If a revoked binding's metadata is physically unlinked, require a separate explicit owner-approved admin workflow; Nova's normal stop operation only blocks work, scopes and future token issuance. Revoke ≠ physical deletion.
Date: 29 October 2026 • [Issue #604](https://github.com/Bumbi190/ai-operating-platform/issues/604) • [Draft PR #605](https://github.com/Bumbi190/ai-operating-platform/pull/605)

## Problem confirmed in isolated PostgreSQL 17
The baseline binding schema uses `FOREIGN KEY(project_id, owner_user_id) ... ON DELETE RESTRICT` and user references with default RESTRICT/NO ACTION. With an approved binding, deleting the project or deleting its owner fails (even though the existing Omnira `projects.owner_id` FK from `auth.users` is `ON DELETE CASCADE`). Owner transfer is also blocked. Silently changing those pre-existing project/auth relationships would endanger unrelated workflows.

The desired lifecycle has TWO independently governed operations:
- **Revoke access:** prevent any new Nova source-read authorization and cancel or revoke already-issued provider credentials (actual GitHub revocation is NOT implemented). This is a security event, not account deletion.
- **Unlink/erase data:** remove a binding record after its grant is revoked; retain owner-accessible project audit during the lifetime of that project, and erase the project's linkable audit records on authorised project/account erasure. Do not permanently retain personal/project identifiers without a specific approved legal/retention policy.

## Two alternatives – none approved for production

| Alternative | Effect | Cost / risk | Status |
| --- | --- | --- | --- |
| A. Keep restrictive FKs + explicit pre-delete cleanup | All deletion must first pass a user-verified unlink pathway; if direct Supabase Auth delete bypasses it, deletes may still fail | Preserves records by default but blocks account erasure in external flows; complex recovery | Baseline in `atlas_owner_github_bindings_stage1_PROPOSAL.sql`, RED reproduced for deletion |
| B. Project-owned bindings with CASCADE + separate project audit | Unlink removes only the mapping; audit survives unlink while project exists. Project/owner erasure cascades binding and audit to avoid blocking legitimate deletion | Provider tokens can outlive DB rows; owner transfer must be deliberate; audit erasure requires privacy/retention sign-off | **RECOMMENDED FOR FURTHER REVIEW**, real synthetic PG17 tests PASS, no production code/schema enabled |

**Why B merits further review:** PostgreSQL 17 and Supabase's own user-data guide support `ON DELETE CASCADE` for child records that should disappear with their parent. This avoids the identified erasure blocker without weakening composite project/owner identity. It does NOT replace explicit token revocation or a policy for legally required retention. [PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html) · [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data).

## Lifecycle B – exact offline candidate

Documentation-only SQL: `docs/architecture/proposed-sql/atlas_owner_github_lifecycle_OPTION_NOT_MIGRATION.sql`. It runs **after** the original Stage 1 proposal inside a disposable PG17 test fixture. The resulting candidate:
- Changes child binding's composite `project_id, owner_user_id` FK to `ON DELETE CASCADE`; changes binding's user/reviewer FKs to `ON DELETE CASCADE`. Existing `public.projects` FKs, triggers and membership policies are **unchanged**.
- Adds project-owned `atlas_owner_github_binding_events`: composite owner/project FK with cascade, `binding_id` as a non-FK immutable correlation label, nonnegative sequence/allowed event types, and hash-format-only decision reference (no real signing). The event schema has no client/workflow agent write grants. Owner SELECT is independently RLS-restricted; `service_role` SELECT bypasses RLS and must be server-scoped.
- Keeps audit entries after a mapping is unlinked. Event records cascade away on project/account deletion. There is no automatic archival to Notion, browser, desktop, other repositories or external paid services.
- **Auditing limitation:** the table lacks a trusted signed event issuer and cannot claim cryptographic immutability. PostgreSQL owners remain privileged, and future signed approval/revocation needs a separate serialized, authorized write API and trusted provenance.

### Planned owner-directed flow (NOT implemented live)
1. Nova receives a precise owner request, identifies the exact `projectId` and GitHub numeric `repositoryId`, and shows current connection status and possible live effect.
2. Server authenticates the owner, checks project ownership and a signed, bounded task mandate. Stop new token mint and pause workflow agent workflows for this project. An already-issued GitHub token must be invalidated via a provider-supported method or expired/confirmed inactive before claiming full revoke. No agent may continue with cached authority.
3. In a **serializable/locked** DB transaction, change `approved → revoked` only if expected `bindingId`, revision and state match, append the related owner-attributed event and issue a verified completion receipt. A stale retry may not make a second event or revive the binding.
4. `revoked → unlinked` after access is actually closed, in another audited transaction. The live binding is removed; the project audit remains available for owner review. No other project's connection changes.
5. **Project deletion / account erasure:** shut down active tasks and tokens first; then delete the project/account under authenticated owner/administrator authority. The DB CASCADE safety net ensures connected binding metadata + project audit do not block erasure. Never call this cascade a way to revoke a still-valid external token.
6. **Owner transfer:** remains BLOCKED while bindings/audit belong to the original owner. Before an explicit transfer, perform a signed unlink and a privacy-reviewed audit handoff/erasure decision; then issue fresh connections under the new owner. Never silently reassign audit actor identity or reuse credentials.
7. **Legal retention exception:** if a specific retention rule applies, an approved separately isolated, minimised retained record may be needed. No blanket indefinite SHA/UUID/repository correlation retention; a hash can still be personal/pseudonymous information.

## Tested, not merely proposed
Reproduction: `powershell -NoProfile -File scripts/atlas/verify-owner-github-pg17-rls.ps1 -LifecycleVariant`.

The runner requires a pre-cached `postgres:17-alpine`, refuses to collide with an existing fixture, uses **network=none**, 256 MiB memory cap, 0.6 CPU, temporary PGDATA, no host mount or host port, and stops/deletes its own container in `finally`. The SQL variant and its verifier are copied only into the container. It cannot reach the actual Supabase database and requires no real provider secrets.

**Real PG17 results:** cross-owner binding denied; A/B owner audit and mappings isolated; guest and workflow agent audit access denied; normal-user audit deletion denied; approved binding becomes revoked with matching audit; duplicate revoke cannot update; unlink removes only binding while three audit events persist; project deletion erases project-linked audit only; owner deletion cascades own remaining binding/audit while foreign owner survives. Transfer remains an EXPECTED BLOCKER, intentionally not promoted.

Node offline contract suite `apps/web/lib/qa/atlas-owner-github-lifecycle.test.mjs` verifies the proposed SQL doesn't grant writes, that the two owner-scope FK types are cascaded, that audit is separately project-owned, and that the disposable runner never touches real credentials/ports. Existing baseline PG17 tests for the original restrictive proposal must also continue passing.

## Open owner + independent reviewer choices

- **Audit retention:** keep audit only while its project exists (candidate B), or require longer retention for a documented purpose? A data protection/retention assessment and operator decision are mandatory before any production schema.
- **Provider revocation:** explicit GitHub App token revocation/expiry tracking and the no-cache, pre-read DB check must be implemented, negative-tested and independently reviewed. This is a hard launch gate.
- **Account deletion/transfer semantics:** what should happen if a project with active integrations is deleted outside the Omnira UI? DB cascade prevents FK blockage but cannot guarantee token cancellation; decide alert/reconciliation protocol.
- **Signed owner event authority:** develop an owner-review and single-use proof workflow before creating real `approved` or `revoked` rows. Do not make the presence of `approved_by` equivalent to user consent.
- **Migration footprint:** the candidate B SQL alters the new mapping table and adds event DDL; the baseline proposal would still add a unique index to existing `projects`. This requires fresh schema preflight, lock/window and rollback plan. Never deploy both proposals blindly as two permanent migrations.

**Release remains HOLD / Draft.** No code broker, Prime Agent model router, live Nova chat, real GitHub App key, Supabase schema, paid API, production deploy or account deletion was touched.
