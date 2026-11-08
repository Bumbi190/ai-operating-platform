# Project Viewer P1 — resource authorization audit (2026-10-13)

Scope: Omnira repository only. Inspection and audit; no production database changes.

## Verified

- The current Atlas allowlist in `apps/web/lib/atlas/isolation.ts` selects only `projects.owner_id = userId`. It is also used by action-capable routes and MUST NOT be expanded to include viewers.
- The Handlarbörsen marketplace collector endpoint `app/api/collectors/handlarborsen/marketplace/route.ts` requires `CRON_SECRET` and uses a service-role database client; it is not a viewer-facing endpoint.
- `lib/atlas/project-analytics/handlarborsen-overview.ts` is a pure report-to-KPI transformer, not an authorization boundary.
- PR #329's membership migration only grants access to the membership registry, not to projects or project data. RLS role checks passed against a minimal independent Supabase PostgreSQL fixture.
- 114 migration files exist in the worktree; the full historical migration chain has not been replayed for this audit. This is a release blocker, not a claimed pass.

## Access design decision

Build a dedicated server-only `viewer Handlarbörsen overview` read endpoint, authenticated by Supabase user session. The handler should:
1. Determine the project from an audited fixed project mapping or strictly validated server-side resolution.
2. Check **active** membership against the canonical membership table, or the genuine owner, without trusting model-supplied IDs.
3. Query only approved stored aggregate KPI data, with no collector invocation and no remote credential exposure.
4. Return an explicit, narrow DTO (counts, freshness timestamp, source state) with no raw customer, finance, secret, agent memory, or other-project data.
5. Set private/no-store caching and deny access for unauthenticated, unrelated, and revoked users.
6. Keep all POST/PATCH/DELETE and Atlas tools inaccessible to viewers.
7. Test owner, viewer, outsider, revoked, missing project, attempted ID swap, and cross-project data leakage.

## Blockers before merge or invitation

- Run full Omnira migration replay in a **new** isolated Supabase test project / DB, not existing Omnira or Handlarbörsen containers. Resolve conflicts if any.
- Add actual RLS tests against that complete schema; the minimal fixture tests alone are insufficient.
- Review and prove project-viewer binding to the right existing project id and role-specific read paths.
- Add email invite lifecycle and callback checks separately; never enable anonymous self-registration as a shortcut.
- No production migration, merge, deployment, invite or Oscar account creation in this audit.
