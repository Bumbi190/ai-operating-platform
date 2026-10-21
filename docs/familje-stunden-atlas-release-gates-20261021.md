# Familje-Stunden – Atlas monthly source review: release gates

Date: 2026-10-21. **DRAFT / NOT APPROVED FOR PRODUCTION.**
Scope: Omnira / Familje-Stunden, public promotional content only.

## User-facing result

- Atlas reads an approved channel plan and the next 7/14 days of
  Facebook-text/Instagram-image slots; avoids matching saved posts/jobs.
- When explicitly asked, Atlas may prepare **max 4** source-grounded
  draft proposals from exactly permitted preview dates. Calendar intent
  is not an executable schedule.
- Compact source-review card: one-month summary, verified-original
  checklist, exact SHA-256, explicit human Approve/Reject; database
  readback is required before the UI reports a decision.
- No Atlas source approval tool. No silent publication, month unlock,
  scheduled recurring generation, cost-bearing LLM/TTS or automatic
  image/video generation.

## Security / cost boundaries

- Both FAMILY_MONTH_SOURCE_REVIEW_ENABLED and
  FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED default to off.
- Protected month-source history: private tables, RLS on, no user Data
  API privilege, service role SELECT+INSERT only; unique
  candidate ID and composite hash foreign key.
- All API writes require an authenticated actual project owner and
  same-origin request. Changed plan/review/current source is blocked.
- A new approved month source is not trusted until all referenced images
  have actual SHA-256 bytes verified against project-owned assets in
  the existing private **media-assets-private** bucket. Max 3 assets
  of up to 5 MiB each. Any private member/story or wrong project source
  blocks the action.
- Before each new review draft is saved, the exact durable owner
  decision is read again. A changed version stops further saves.
- New content remains draft-only; existing per-post approval and
  publication checks are separate. Database read and bounded storage
  egress may incur ordinary infrastructure metering.

## Verification performed

- 85/85 focused Vitest tests passed from clean latest-origin/main
  based release worktree.
- 12/12 real Playwright Social Content browser tests passed.
- Separate isolated PostgreSQL 17 fixture previously executed the
  proposed migration successfully. Denied authenticated SQL reads
  and service-role edits; wrong SHA blocked by composite FK and a
  second candidate decision blocked by unique constraint.
- Full local TypeScript remains blocked by **three existing, unchanged**
  lib/media/lambda-render.ts Remotion errors (missing package and two
  derived region typing errors). No new errors from the Family feature.
- No release deployment, Supabase migration, live DB write, actual
  production login test, automated publishing or provider charges.

## MUST RESOLVE before release

1. Independent engineer/security review, including RLS/owner mapping,
   event history, source rights, and TOCTOU handling. This draft PR
   does not count as completed independent review.
2. Coordinate with separate draft PR #448 which simplifies the
   Familje-Stunden Social UI. The two PRs touch SocialContentPanel;
   review merge order and reconcile any conflict before production.
3. Validate against an authenticated application preview after schema
   planning. The source-review feature remains disabled by default and
   is not usable in production yet.
4. Apply the schema migration ONLY through the normal protected
   release process and explicit owner approval.
5. Activate owner-review and source-read flags **individually** after
   validation. Never enable periodic cron/dispatch/publication from
   these changes.
6. Fix or separately document the baseline Remotion TypeScript errors
   prior to interpreting full build checks as green.

## Rollback

Switch off FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED and
FAMILY_MONTH_SOURCE_REVIEW_ENABLED. Both must remain off until separate
explicit approval. No schema rollback or table deletion should be
attempted casually: immutable source history may matter for audit.

## CI security and context gate follow-up — 2026-10-21

First Draft PR #472 CI exposed two release checks outside the focused
Familje-Stunden suite:

- Migration security gate / schema inventory: both new public-schema
  private source-review tables were UNKNOWN. Registered them in
  tests/isolation/schema-security.json under _meta.created_not_live
  with SERVER_ONLY class. This does NOT mutate the effective production
  table snapshot; they do not exist in production. The migration still
  requires RLS, zero client policies, anon/authenticated denied and
  service_role SELECT+INSERT only.
- Website studio context economy: the new Social Content guide increased
  the model system prompt to 9279 characters (strict limit <9000).
  Deduplicated guidance while retaining the operator review, no
  publishing, project scope and no-cost boundaries. Verified test now
  measured 8809 characters; no threshold was weakened.

After changes, all 76 schema-security and 133 migration-security
tests passed locally. The authentication and context economy test
that was timing-sensitive during a concurrent local run also passed
when rerun separately without load. The Draft PR remains unmerged;
CI must rerun on the new commit.

Original UI PR #448 merge rehearsal shows conflicts in
SocialContentPanel.tsx, e2e/social-content-entry.tsx and
e2e/social-content.spec.ts only. Resolve the Atlas-first UI and
month-source owner card intentionally before merging either.

## P8 — Source-image review integrity (2026-10-21)

Independent engineering review is still REQUIRED before merge. This is
an internal hardening pass, not independent security approval.

### Fixed a readiness gap

Previously a source proposal could contain a free-text source
referenceId such as december-public-hero and still enter owner
review. Later source activation requires an actual project-owned asset
UUID. That mismatch could lead to unusable approved source packets.

Now each source proof must contain a UUID-shaped asset reference, not a
free-text label or URL; maximum three reference images, matching the
subsequent verification cap. Atlas tool input schema enforces the same
constraint. Membership, ownership, bytes and legal rights remain
separate checks: a syntactically valid UUID alone is not proof.

### Improved owner review before exact approval

The compact review card fetches and displays every source image via
the existing authenticated /api/social-content/media endpoint with
the exact project ID, asset UUID and SHA-256. The endpoint checks
project authorization, registered media status and actual byte hash.

The owner cannot enable APPROVE until all source images have loaded.
Missing/forbidden images keep APPROVE disabled; REJECT stays available.
Exact copy/source/rights review checkbox remains mandatory.
No public storage grants, untrusted arbitrary URLs, new provider calls,
or automatic media generation added.

### Verification

- 95/95 focused Vitest passed.
- 16/16 Social Content Playwright and 6/6 Social Launch tests passed,
  including a negative broken-image approval test.
- Full local TypeScript only reports the 3 existing Remotion errors.
- No schema applied, no production data changed; no content uploaded,
  scheduled, approved or published.

### Remaining before release

1. Independent code/security review of updated PR #472.
2. Authenticated owner preview walkthrough, including image rights.
3. Explicitly approved protected SQL migration apply.
4. Both private flags remain OFF; no cron or automatic social dispatch.
5. The image endpoint uses metered storage bandwidth; track actual
   source asset sizes before enabling the review feature.
