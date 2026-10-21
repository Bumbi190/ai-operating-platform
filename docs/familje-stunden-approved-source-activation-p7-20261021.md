# Familje-Stunden P7 – verified owner-approved PUBLIC source for Atlas review drafts
Date: 2026-10-21. LOCAL development only; source activation and cron disabled.

## New behavioral boundary

After the owner has made a persisted exact-hash APPROVE decision through the
existing authenticated month-source review system, Atlas may use that
source to prepare review-only social proposals only if ALL checks pass:

1. FAMILY_PUBLIC_SOURCE_ACTIVATION_ENABLED=true in the reviewed server
   configuration (currently unset and OFF, independent of the existing
   review feature gate).
2. Same approved project/owner and pinned approved Facebook text /
   Instagram image plan. Uses existing server-only principal owner checks.
3. The most recently saved month candidate has exactly one persisted
   approved owner decision with exact matching candidateId, SHA-256,
   project ID and decision owner. Newer unapproved sources invalidate older
   approvals.
4. Every source proof referenceId names an actual project-owned UUID in
   Omnira's existing assets table; status active, image kind, internal
   visibility and expected SHA-256. Private subscriber files and external
   URLs do not qualify.
5. Files are downloaded from the fixed media-assets-private bucket under
   the owner's project/social path (never bucket protected) and verified
   against actual image bytes, size, SHA-256 and JPEG/PNG/WebP header.
6. Max 3 existing images, 5 MiB each, sequentially. No model,
   generation or voice API charge. Storage egress is bounded but may be
   metered by Supabase, so cost is not claimed absolutely zero.
7. Recheck the durable owner decision after media reads. Recheck it again
   immediately before each saved proposal. A stale version stops rather
   than creating further drafts.
8. Only original ordinary calendar gaps for the FOLLOWING calendar month
   (up to 45 days before the first) may be proposed. Release-day jobs and
   member-content unlocking remain separate.
9. For one verified image the registered image UUID can be attached to
   an Instagram REVIEW draft, not published automatically. Facebook
   remains text only. Multiple verified images require individual review.
10. Stable source+slot IDs prevent duplicates, and the existing
   conversation-bound Social Content RPC enforces normal project scope,
   plan, version and idempotency.

The server returns exact reviewed caption text and owner project image
IDs only inside existing authorized Atlas conversation. It does not
expose file bytes, secret/signed URLs, bucket or storage paths. Source
ownership/legal rights still depend on the human-reviewed evidence; an
image hash is an integrity check and cannot establish copyright rights.

## Safeguards

- No autonomous cron, direct publish job, Stripe, ElevenLabs or LLM call.
- An owner source APPROVE is not approval of a social post and does not
  grant production month entitlement.
- Current pinned October-to-November preview remains in a separate
  reviewed source catalog. A new approval may not silently override it.
- Media or stored approval differences return REVIEW_REQUIRED /
  REVISION_CONFLICT and fail closed.
- Unknown month/date or unavailable source means no new draft instead of
  made-up copy.
- The proposed owner source review schema is still NOT deployed.
- Feature flag and periodic planner remain OFF.

## Verification

- Test cases: authentic durable decision, wrong/rejected/superseded
  candidate, SHA mismatch, wrong tenant, malicious storage path,
  wrong MIME/header, tampered bytes, disabled feature, retry and
  stale decision immediately before a draft save.
- All relevant tests pass in isolated local suites. End-to-end UI tests
  from the earlier source-review phase were rerun and remain green.
- The three older errors in lib/media/lambda-render.ts prevent a
  completely clean full TypeScript check; no new diagnostics reported
  for these changes.

## Release gates

A separate independent code/security review, actual authenticated
owner preview, production schema review, and explicit activation
decision remain required. No action in this P7 changed Supabase
production, uploaded media, GitHub branches, live calendars or
published social content.
