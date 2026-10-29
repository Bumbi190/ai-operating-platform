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
- **Post-fix tests:** non-ISO/ambiguous approval values and outer-key qualification; no live SQL ran.

## Verification recorded
- Test-first RED on existing code: **2/34 failing**, new exploitable candidate paths isolated by synthetic tests; no provider call.
- After fixes: `node --experimental-strip-types --test` on three offline suites: **44/44 PASS, 0 skipped**.
- Strict standalone TypeScript on changed catalogue module: PASS.
- Git diff whitespace check: PASS.
- GitHub CI/Vercel on the **exact future patched commit** remain pending at time of local review; do not substitute prior green build from `bd0ee4b`.
- Only code in this existing PR/worktree was touched; Prime Agent `codex/atlas-model-agent-router-20261022` and Nova Source Curator files stayed untouched.

## Remaining gates – not solved by this review

1. **DB authority and audit:** the SQL document is NOT installed and a row with `approved_by` merely asserts owner review. A future owner approval/revoke API must issue verifiable, replay-resistant decision receipts, preserve immutable history, check live authenticated principal, bind stable project/repo IDs, and revoke provider grants promptly. No DB role should be able to self-attest without independent authority.
2. **Owner-to-project referential consistency:** proposed schema references `projects(id)` and separately `auth.users(id)`; it does not contain a composite FK guaranteeing `bindings.owner_user_id = projects.owner_id`. RLS checks the relationship on SELECT and the offline loader repeats the check, but a future privileged write path must enforce it in an audited transaction.
3. **RLS and production migration:** the RLS SQL is a proposal. No isolated real PostgreSQL RLS attack test has been run, including authenticated foreign-owner reads, guest/anon, ordinary-write denial, service-role bypass checks, migration-guard ledgers and rollback. Do not claim database verification from text-match tests.
4. **Live App installation:** GitHub parent App can have `All repositories`, but the provider-installed App ID/owner/permissions must be independently authenticated by a signed App-JWT request and each generated token must have **exactly one** approved `repository_id` and `contents:read`. No PEM/keys in chat, logs, git or Notion. A fabricated token response is not a verified token.
5. **TOCTOU/cross-tenant:** even an approved DB row can be revoked after an initial lookup. Before any actual source read the server must recheck current project ownership, binding revision/state, installation identity, repo numeric identity, pinned commit and budget/approval. The current pure contract does not implement this.
6. **Supabase API exposure rollout:** per [official Supabase April 28, 2026 changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), the new default becomes enforced on existing projects on **October 30, 2026**. Future schema should use explicit per-role grants and RLS; consider a private schema with a reviewed server-only access path if browser reads are not required.
7. **Scope and run controls:** no dynamic authenticated Nova chat tool, no global GitHub discovery, no owner UI, no Pling runtime or Prime Agent code execution. Source content remains untrusted; do not allow prompt text to be an authorization principal.

## Independent review checklist
- [ ] Independent engineer checks staged patch against base SHA, authorizes no accidental repo or cross-project expansion.
- [ ] Threat review validates owner/provider IDs, App permissions, revoked/stale mapping, pagination and correct RLS/GRANT model.
- [ ] Separate real isolated PG17 and RLS negative test evidence, migration guard reconciliation.
- [ ] Owner accepts explicit risk/cost/rollback for any live registration table and GitHub App credentials.
- [ ] Preview E2E with an authenticated operator, wrong-project denial and a single-repo read receipt; production remains OFF pending separate decision.

**No independent reviewer has approved this PR. CI success is not human approval.**
