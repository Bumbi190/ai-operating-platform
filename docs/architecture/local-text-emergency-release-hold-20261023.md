# Atlas Local Text – source-controlled emergency release hold

Date: 2026-10-23
Scope: defense-in-depth while security issue #533 is OPEN. This is NOT the permanent SQL remedy.

## Verified production situation
- Omnira Selftest contains one open local-text reconciliation incident for a historical unknown dispatch, and an open offline incident.
- The historical device and its admission are revoked; original local attempt/job rows are gone due to retention, which is NOT proof of a safe non-dispatch.
- Live public.local_text_eligible still checks per-device quarantine but does NOT check project-wide open reconciliation incidents.
- The authorized SQL migration writer previously refused the attempted additive migration. The code for that blocked SQL replacement was NOT written, applied or re-submitted via another tool.
- The operator already disabled ATLAS_LOCAL_TEXT_ENABLED in production and the old pilot-specific preview branch, with live HTTP 503 LOCAL_TEXT_DISABLED observed on POST /api/local-text/worker/claim. Older built preview snapshots may still use historical flags.

## Extra defense in this change
- Pure activation-fence.ts deliberately fixes LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD=true at source level.
- localTextDispatchEnabled requires BOTH a reviewed future removal of this hold and ATLAS_LOCAL_TEXT_ENABLED=true. It ignores additional environment override switches.
- All current Next.js local-text initiation entrypoints use the source gate: signed worker operation, owner device registration/approve, admission, direct pilot, Atlas local-text tool request, cloud budget authorization and pending cloud physical dispatch.
- Read-only incident/devices/receipt APIs and emergency revocation paths remain permitted as before.
- Existing unit tests explicitly mock this new source gate when testing *historical application behavior*; dedicated activation-fence tests run the REAL module and enforce that an ordinary Vercel environment toggle cannot release it.
- No migrations, schema/RLS changes, provider credentials, model calls, hardware/GPU tests, jobs, admissions or incident edits are part of this code change.

## Critical limitations
- Application-level source gate is NOT authoritative Postgres security. Service-role internal RPCs such as local_text_eligible, local_text_claim or local_text_worker_operation still need the project-scoped DB incident check described in #533.
- Do NOT enable local models, re-enroll another device or mark the historical job safe merely because this PR is merged.
- An open reconcile incident must be bound to the PROJECT, not just a quarantined device, by a reviewed additive SQL migration with concurrency and cross-device negative tests.
- Separate trusted evidence verification is required before any recovery or new synthetic pilot; structural receipt hashes alone never clear UNKNOWN.
- No setting in Vercel can reverse this source-controlled hold once it is deployed. Removal requires a separate reviewed code change after authoritative SQL and incident policies are proven.

## Verification and rollout
- 41/41 focused tests covering the hard hold and existing local-text operations passed using a temporary local Vitest resolution alias for the existing monorepo local-text package.
- Strict scoped TypeScript compilation passed. Full clean-install CI and Vercel preview are mandatory before merge.
- Deploy with ATLAS_LOCAL_TEXT_ENABLED=false still set in production; this release must not change the existing separate budget-controlled OpenAI text reserve.
- Any repeated or uncertain worker request remains prohibited. Do not replay lost historical jobs.
