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
