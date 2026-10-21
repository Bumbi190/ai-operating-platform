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

## P9 — verify public source registry before persisting any proposal

Safety review found a remaining mismatch: a UUID-shaped source reference
could still be missing, archived, wrong-project, wrong-bucket, wrong
MIME or oversized when Atlas created the owner's review proposal.
This would clutter the owner's queue with sources that cannot be
activated. The validation was too late in the pipeline.

Fix: the owner-scoped store now checks each of max three registered
assets with an exact ID + FAMILY project ID match and verifies
status=active, image kind, internal visibility, MIME JPEG/PNG/WebP,
metadata checksum, media-assets-private bucket, project/social path
and size 16 bytes–5 MiB. No storage download or media provider call
is needed for this early metadata verification. Missing/mismatched
proofs fail closed BEFORE inserting a candidate into immutable history.
The owner APPROVE decision performs this same fresh metadata check
again immediately before inserting a decision, so a source that became
unusable during review cannot be newly approved. Owner REJECT remains
available if the media vanished after the proposal was saved.

This is NOT a proof of copyright/licensing, or cryptographic
verification of actual bytes: authenticated source review still
requires visual load via the hash-verifying media endpoint, and
source activation still downloads/checks SHA-256 image bytes and
revalidates the latest owner decision before every draft write.

Verification: 99/99 targeted Vitest passed, including invalid/foreign,
archive, bucket/path, size, MIME and changed-SHA negatives as well
as reject-after-missing; 16/16 Social Content and 6/6 Social Launch
Playwright tests passed. Full local typecheck has only the three
unchanged Remotion Lambda dependency/type errors.

No production schema, owner decisions, media, schedules, dispatch,
provider spending or subscriber entitlements were modified.
The independent human security review remains a release blocker;
these engineering changes do not constitute an independent approval.

## P10 — atomic latest-version owner decision (2026-10-21)

The review service previously read the latest month candidate and then
inserted an owner decision using two separate DB round trips. Between
those operations a second request could insert a newer candidate.
The old decision would then be historically saved. The source resolver
would already reject the stale source; the database now enforces a
stronger invariant during the insert itself.

### Unapplied migration — SQL gates

- A before-insert candidate trigger serializes writes for each exact
  (project ID, source month) with pg_advisory_xact_lock, verifies
  project slug and actual projects.owner_id, and assigns the
  authoritative created_at from clock_timestamp() after the lock.
- A before-insert decision trigger acquires the same month lock and
  refuses a decision unless the candidate is still the **latest**,
  its SHA-256 is exact, and decided_by matches both the candidate
  creator and the current project owner. It sets decided_at after
  the lock and runs with ordinary invoker privileges.
- No elevated functions, new client/RLS grants, UPDATE/DELETE rights,
  RPC endpoints, cron, or source release permissions were introduced.
- Existing unique(candidate_id) still prevents two competing
  approve/reject decisions for one version.
- Database check-violation code 23514 is mapped to ordinary
  CONFLICT in the owner-only server API; Atlas cannot interpret
  a stale decision as a successful authorization.

### Real isolated PostgreSQL 17 verification

- The EXACT new migration executed successfully in a scratch PG17
  container with network disabled and no exposed ports.
- Verified current/latest owner decision accepted exactly once;
  stale version, foreign creator, foreign reviewer, wrong checksum
  all rejected by the DB, independently of TypeScript.
- A two-session concurrency proof inserted a newer candidate in a
  transaction holding the advisory lock; a concurrent old owner
  approval waited about 2.9 s and was rejected *after* the newer
  transaction committed. No stale decision record was persisted.
- Confirmed authenticated table reads and service_role UPDATE are
  still denied. The disposable PG17 container was stopped/removed.
- Schema security, migration guard and SQL contract tests:
  212/212 pass.
- Familje-Stunden focused unit tests: 100/100 pass.
- Social Content and Social Launch Playwright: 16/16 + 6/6 pass.
- Full local TypeScript still has only the three earlier unrelated
  Remotion Lambda dependency/typing errors. No new diagnostics.

### Release posture

This code is NOT a substitute for an external independent human
security review. The migration has NOT been applied in production.
PR #472 remains Draft, no new owner approval, no feature flags enabled,
no scheduled generation, public publication or customer-month unlock.
The new version/race semantics need to be reviewed before any migration
or release authorization.

## P11 ? reflect durable owner review in Atlas month status (2026-10-21)

The read-only get_family_month_source_status tool previously relied on
the static public editorial source registry. After a new-month proposal
was approved in the protected owner review system, the status tool could
still report owner_source_material_needed and unnecessarily ask for
the same source again.

The existing conversation-scoped current Social Content plan read
remains required. When FAMILY_MONTH_SOURCE_REVIEW_ENABLED is OFF, status
stays read-only on the pinned public preview registry, with no new DB
queries. When enabled, the tool reads the exact owner-proven private
source-review history through the existing owner-scoped store and
distinguishes awaiting owner review, rejected, and approved-pending-
media-verification sources. It DOES NOT verify image bytes, activate a
new source, schedule, publish or unlock subscriber material.

Errors reading the private review store fail closed with UNAVAILABLE,
rather than falsely reporting missing sources. Both feature flags,
the periodic cron and public dispatch remain disabled.

New positive, rejected and negative/error tests passed; 102/102
targeted family tests green. Latest authenticated branch preview was
visually inspected read-only and showed the Atlas-first content view,
current counters and manual tools hidden by default. The source-review
card is hidden as intended while its deployment flag is OFF. No
approve/publish/save actions were performed.

## P12 — fresh project image metadata before EVERY owner-source review draft

Review found a gap between the initial source download + SHA-256 check
and each later draft save. A source could have its registered asset
archived, replaced, moved between projects or changed in checksum
after Atlas verified the original source and before it saved another
review proposal (including text-only Facebook proposals).

New read-only guard in the owner-scoped source store:
- Re-read the latest durable approved candidate and exact decision ID.
- Compare exact source SHA-256, ID and ordered approved image ID list
  against the proof references of that latest immutable source.
- Re-read and validate registered image metadata: owner project,
  active status, internal visibility, checksum, JPEG/PNG/WebP MIME,
  bounded size and private project social storage path.
- Fail closed on stale/new approval, archived, moved, oversized,
  wrong-bucket or changed-checksum media BEFORE saving any draft.
- This check runs before each owner-approved source draft, not only
  once per batch. The downstream Social Content RPC retains its
  existing plan, actor, conversation and media validation.

Actual image bytes were independently hashed at source resolution.
The pre-save guard checks current metadata but does not re-download
image bytes on every draft. Rights/licensing still need explicit
human review; even passing SHA-256 does not establish copyrights.
There remains the ordinary short nontransactional interval between
the last metadata check and the downstream RPC; this is not claimed
to be atomic. Real publication remains governed separately.

Only the reviewer warning copy was corrected to proper Swedish.
The immutable pinned Nova & Pling public editorial source copy and
its reviewed SHA were deliberately left unchanged.

Validation: 106/106 focused Family Vitest tests green, 16/16 Social
Content and 6/6 Social Launch Playwright green. Full local tsc still
reports exactly the three pre-existing unrelated Remotion Lambda
module/region errors. Production schema, feature flags, jobs,
subscriber access, social publishing and AI billing unchanged.

The PR continues in Draft. Independent review, rights audit and
explicit owner approval are STILL required before migration/release.
