# Security review – Atlas/Nova owner GitHub catalogue (Issue #604, PR #605)

**Review date:** 29 October 2026
**Scope:** Stage 0–1 inert, read-only identity and DB-lookup candidate in `apps/web/lib/atlas/project-connections/owner-github-catalog.ts`, SQL **proposal** in `docs/architecture/proposed-sql`, three offline test suites, credential-free GitHub Action.
**Review type:** self-performed, source-based targeted security review with red/green adversarial tests. **NOT an independent reviewer attestation.**
**Decision:** HOLD / DRAFT; no merge, migration, GitHub PEM provisioning or live Nova source reading from this report.

## Findings confirmed and corrected on branch

### SEC-604-01 – externally readable Symbol marker could be copied
- **Before:** a valid in-process `scope` held a nonenumerable `Symbol` property with value `true`. A caller with the object could enumerate its own symbols, clone its metadata, change `repositoryId`, copy that symbol and pass the marker check. This defeated the intended *in-process forged-scope prevention* on a future token-grant path. It did **not** grant production GitHub access because Stage 0–1 has no live transport/credentials.
- **Proof:** new test `rejects a stolen internal marker replayed onto a different repository` returned **RED** before the patch; marker-based grant accepted the forged repository candidate.
- **Fix:** module-private `WeakSet<object>` membership tracks the exact frozen scope object returned from `resolveOwnerGithubReadScope`, rather than an introspectable property. Clones and JSON rehydrations have no entry. Existing permissions/owner/source verification remains mandatory.
- **Post-fix test:** direct and copied-marker forgery denied, entire offline suite green.

### SEC-604-02 – approved-but-revoked row accepted by store loader
- **Before:** loader selected `state, approved_by, approved_at` but did not fetch or verify `revoked_at`. An inconsistent privileged query yielding `state='approved'` plus a non-null revocation timestamp could be treated as a valid candidate. The proposed SQL constraint forbade this state, but relying only on a future DB constraint is insufficient defense in depth.
- **Proof:** new `refuses a supposedly approved binding that is already revoked` test returned **RED** before the patch.
- **Fix:** select `revoked_at` and reject every row where it is not `null`; require a reviewer matching the authenticated owner and a valid approval timestamp. This prevents stale approvals from being revived by a malformed query result.
- **Post-fix test:** revoked candidate denied; green suite.

### SEC-604-03 – ambiguous approval timestamps and unqualified SQL outer key
- **Before:** JS `Date.parse` accepted locale-dependent and date-only strings; a SQL proposal predicate `p.id = project_id` could become shadowed if a new `projects.project_id` column were introduced.
- **Fix:** only accept explicit ISO 8601 timestamps with time and timezone; use `p.id = atlas_owner_github_bindings.project_id` in the RLS proposal.
- **Post-fix tests:** non-ISO/ambiguous approval values and outer-key qualification; the follow-up real PostgreSQL 17 fixture verified the qualified RLS predicate, not production SQL.

### SEC-604-04 – privileged cross-owner project binding accepted without composite FK
- **RED in real isolated PostgreSQL 17:** the previous SQL allowed a privileged insert with `project_id` belonging to owner B but `owner_user_id` claiming owner A. Although SELECT RLS hid the record from ordinary users, the database accepted incorrect project-to-owner attribution.
- **Fix:** the SQL proposal now creates a unique reference key on `projects(id,owner_id)` and a composite `FOREIGN KEY(project_id,owner_user_id) REFERENCES projects(id,owner_id) ON DELETE RESTRICT`.
- **GREEN in real PG17:** the cross-owner insert raises `foreign_key_violation`; both owners' own records remain readable only within their scope. This proposed unique index modifies an existing table and requires lock/size/rollback review BEFORE any production migration.

### SEC-604-05 – Supabase default ACL silently retains service-role write privileges
- **Observed read-only in live Omnira Supabase:** `pg_default_acl` grants all table privileges on new public tables to `anon`, `authenticated` and `service_role` for postgres/supabase_admin creators. A `GRANT SELECT TO service_role` is additive and does not remove DML.
- **RED in real isolated PostgreSQL 17:** with matching fixture default privileges, the original SQL left INSERT/UPDATE/DELETE available to `service_role`.
- **Fix:** the SQL proposal explicitly `REVOKE ALL ... FROM public, anon, authenticated, service_role`, then grants `SELECT` only to `authenticated` and `service_role`.
- **GREEN in real PG17:** `service_role` has no direct table DML privileges even with the reproduced default ACLs, though its **BYPASSRLS** attribute still exposes all rows for authorized SELECT. Owner-scoping must therefore be separately enforced by future server code.

## Verification recorded
- Test-first RED on existing code: **2/34 failing**, new exploitable candidate paths isolated by synthetic tests; no provider call.
- After SEC-604-01…03: 44/44 offline tests green. After the PG17 review additions: **46/46 offline tests PASS, 0 skipped** (including default ACL and disposable runner contracts).
- Strict standalone TypeScript on changed catalogue module: PASS.
- Git diff whitespace check: PASS.
- PR #605 at `8f2a831` previously had **8/8 GitHub Actions SUCCESS** and Vercel Preview READY. The **new SQL/fixture/PG17 changes are not yet covered by that exact-head CI**; a new commit must be pushed and tested before any merge consideration.
- Only code in this existing PR/worktree was touched; Prime Agent `codex/atlas-model-agent-router-20261022` and Nova Source Curator files stayed untouched.

## Remaining gates – not solved by this review

1. **DB authority and audit:** the SQL document is NOT installed and a row with `approved_by` merely asserts owner review. A future owner approval/revoke API must issue verifiable, replay-resistant decision receipts, preserve immutable history, check live authenticated principal, bind stable project/repo IDs, and revoke provider grants promptly. No DB role should be able to self-attest without independent authority.
2. **Owner-to-project referential consistency:** now enforced by a **proposed composite FK** and verified against a synthetic, networkless PG17 container. Production has **not** received it. The supporting unique index on the existing `projects(id,owner_id)` table requires independent review of migration lock time, rollback, and owner-transfer semantics before applying.
3. **RLS and production migration:** the documented proposal is now **tested with 12 real PG17 assertions in an isolated, disposable, network-disabled container** (owner A/B, anon, Pling, missing auth, denied DML, cross-owner FK, SQL default grants, and service-role bypass). The real Supabase schema is still untouched. The fixture mocks auth.uid using trusted PostgREST claim semantics, **not real JWT verification**. No staging/production migration-ledger reconciliation or production rollback test has been completed.
4. **Live App installation:** GitHub parent App can have `All repositories`, but the provider-installed App ID/owner/permissions must be independently authenticated by a signed App-JWT request and each generated token must have **exactly one** approved `repository_id` and `contents:read`. No PEM/keys in chat, logs, git or Notion. A fabricated token response is not a verified token.
5. **TOCTOU/cross-tenant:** even an approved DB row can be revoked after an initial lookup. Before any actual source read the server must recheck current project ownership, binding revision/state, installation identity, repo numeric identity, pinned commit and budget/approval. The current pure contract does not implement this.
6. **Supabase API exposure rollout:** per [official Supabase April 28, 2026 changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), the new default becomes enforced on existing projects on **October 30, 2026**. Future schema should use explicit per-role grants and RLS; consider a private schema with a reviewed server-only access path if browser reads are not required.
7. **Scope and run controls:** no dynamic authenticated Nova chat tool, no global GitHub discovery, no owner UI, no Pling runtime or Prime Agent code execution. Source content remains untrusted; do not allow prompt text to be an authorization principal.

## Independent review checklist
- [ ] Independent engineer checks staged patch against base SHA, authorizes no accidental repo or cross-project expansion.
- [ ] Threat review validates owner/provider IDs, App permissions, revoked/stale mapping, pagination and correct RLS/GRANT model.
- [x] Real isolated PG17/RLS negative test evidence, including deliberately RED→GREEN owner FK and Supabase default ACL cases; fixture cleaned up.
- [ ] Future canonical migration guard reconciliation, staging rollback and production release authorization.
- [ ] Owner accepts explicit risk/cost/rollback for any live registration table and GitHub App credentials.
- [ ] Preview E2E with an authenticated operator, wrong-project denial and a single-repo read receipt; production remains OFF pending separate decision.

**No independent reviewer has approved this PR. CI success is not human approval.**
