# Familje-Stunden P5 – durable owner-only source review (LOCAL ONLY)

Date: 2026-10-20. Isolated branch codex/family-atlas-weekly-plan-20261020.

## Goal
Atlas composes PUBLIC month-source proposals and a short evidence card;
the owner later decides on an exact candidate SHA-256 through a native,
authenticated server path. No chat tool can decide, activate or publish.

## Implementation
- Supabase CLI v2.81.3 created the migration:
  supabase/migrations/20261020212124_family_month_source_review.sql
- Two private tables:
  family_month_source_candidates – immutable project/month/hash/payload;
  family_month_source_decisions – append-only decision linked by composite
  FK to candidate ID, project ID and exact hash.
- Both tables RLS-enabled, no anon/authenticated Data API grants or
  policies. service_role has SELECT+INSERT only, not UPDATE or DELETE.
- One candidate-specific decision is enforced by UNIQUE(candidate_id).
  SQL change is NOT applied to any database.
- Owner read/propose/decide server store rechecks project ownership,
  current approved plan and exact source hash. New revisions cannot
  overwrite older source evidence.
- Native GET/POST /api/family-month-source-review rejects untrusted
  browser origins, oversized bodies, unknown properties, foreign
  projects, and unconfirmed/stale decisions.
- FAMILY_MONTH_SOURCE_REVIEW_ENABLED must explicitly equal 'true';
  absent flag returns 503 before the private DB is accessed.
- Atlas chat registry has ONLY get/propose source-review tools with
  existing owned-conversation, authenticated principal and feature gate.
  There is deliberately NO Atlas approve/reject tool.
- No automatic source activation, generation, recurring cron, public
  subscriber unlock, schedule job or social publication is reachable.

## Tests and verification
- Focused Vitest: 63/63 across 11 related source, API, permission, cron,
  month planning and schedule test suites.
- The store's isolated fake-DB tests check exact hash, idempotent replay,
  two simultaneous approve/reject attempts (first insert wins), stale
  prior versions, wrong owner and missing current channel plan.
- API tests prove disabled default, owner session, CSRF origin, bounded
  input and review-only responses.
- Migration tests statically inspect ACL/RLS/unique/composite-FK clauses;
  the migration has NOT yet been executed or SQL-tested on Postgres.
- Full TypeScript: still 3 existing errors in unchanged
  lib/media/lambda-render.ts (missing Remotion Lambda package/region).
  No new errors from this implementation were reported.
- ESLint 8 targeted command cannot run because this worktree has no
  ESLint configuration; this is NOT reported as passing.

## Release blockers
1. Independently review proposed SQL grants, schema and owner-only API.
2. Validate migration on an isolated PostgreSQL/Supabase test database,
   including real authenticated RLS-deny checks and real concurrent writes.
3. Complete the short authenticated owner review UI within Omnira,
   with exact evidence/copy inspection before confirm/reject.
4. Design an atomic current-head check at the moment any source is
   activated. Today, latest candidate is rechecked before a decision
   INSERT but a concurrent new proposal could arrive immediately after.
   Such a historical decision NEVER activates a source, so this
   remaining race cannot trigger publication.
5. Deploy only after those checks and owner approval. Enable the
   feature flag separately, without opening social dispatch.

No production schema changes, no GitHub push or PR merge, no scheduled
traffic, no AI/media provider charges.

## P6 – compact owner review card and real isolated PostgreSQL 17 verification

Date: 2026-10-20 / 2026-10-21 local development.

### Owner experience

- New FamilyMonthSourceReviewPanel in existing Social Content view for
  Familje-Stunden ONLY.
- When the feature flag remains off, the API returns 503 and the panel
  hides itself; no manual UI clutter, no new production traffic.
- The panel automatically targets the next Stockholm calendar month,
  shows the latest pending source card, a short summary/evidence count,
  and one "Granska underlag" entry.
- Full owner-only candidate read reveals each public reference ID,
  reference SHA-256, descriptions, complete proposed captions and the
  immutable candidate SHA-256. Decision buttons remain disabled until
  the human explicitly checks an exact-review acknowledgement.
- Both Approve and Reject call the existing owner-authenticated POST API,
  with the exact candidate ID+hash and confirmed:true.
- Server success alone is NOT considered a verified decision. After POST,
  the browser reads the current owner-only list again and requires a
  persisted, matching candidate, SHA-256, and identical decision.
- Changed candidates, stale snapshots, missing readback, foreign project,
  and disabled feature fail closed. The UI never grants source activation,
  public month access, scheduling or social publication.

### Verified local tests

- Focused unit/integration/migration-contract suites: 63/63 passed.
- Full Social Content Playwright suite: 12/12 passed including four
  tests of actual review UI, disabled feature, stale candidate and
  missing persisted-decision readback.
- TypeScript: only three preexisting failures in unchanged
  lib/media/lambda-render.ts due to missing @remotion/lambda/client and
  derived region typings. The new UI/API emitted no TypeScript diagnostics.

### Real PostgreSQL 17 test (isolated, no production access)

- Docker image postgres:17-alpine was already cached on the developer's
  Windows desktop. Started disposable container with --network none,
  NO mapped host ports, scratch projects table and fixture auth roles.
- Executed the exact local migration file with ON_ERROR_STOP=1.
  Tables, indexes, foreign keys, RLS, grants and revokes created without
  SQL errors.
- Verified RLS enabled and no permissive policies; anon/authenticated
  have no SELECT/INSERT/UPDATE/DELETE, service_role only SELECT+INSERT.
- A real authenticated role SELECT was denied.
- A real service_role UPDATE was denied.
- Inserting conflicting approve/reject for the same candidate hit the
  unique(candidate_id) constraint.
- A wrong source hash on a second candidate hit the composite FK
  (candidate_id, project_id, candidate_sha256).
- Checked that the one earlier decision remained unchanged.
- Stopped and automatically removed the disposable PG container.

### Outstanding before production

- Have a separate reviewer inspect the final code and source evidence.
- Deploy the verified schema through the normal change-management flow
  ONLY after human approval; do not apply from development.
- Authenticate a real owner in a protected preview of this feature and
  validate exactly one candidate decision with no production data writes.
- Source activation remains intentionally UNIMPLEMENTED, including
  independent confirmation of source ownership/rights and new-month
  readiness. Operator approval of source review is not publication
  authority. Recurring planner cron and public dispatch remain disabled.

No Supabase production migrations, scheduled social sends, AI provider
spending or GitHub PR merges occurred.
