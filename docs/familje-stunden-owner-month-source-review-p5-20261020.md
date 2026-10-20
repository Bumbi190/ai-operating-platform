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
