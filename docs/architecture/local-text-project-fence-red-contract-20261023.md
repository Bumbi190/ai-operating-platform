# Atlas local-text project-wide unknown-outcome hold — RED acceptance contract

Date: 2026-10-23
Status: intentionally failing TEST-ONLY branch for https://github.com/Bumbi190/ai-operating-platform/issues/533

## What was verified (read only)
- Real public.local_text_eligible eligibility function checks the historic per-device tombstone quarantine, project/global stop, current device/admission and fresh model evidence.
- The function DOES NOT check open project incidents of kind reconcile.
- Omnira Selftest retains one open reconcile and one open offline incident. The old device and admission remain revoked; no local jobs remain in canonical storage.
- Production ATLAS_LOCAL_TEXT_ENABLED=false was confirmed, with READY deployment. This is a temporary feature-level stop, not a replacement for the missing SQL authority.
- A separate governed OpenAI fallback is still enabled for its already approved text tasks; it is not the local Qwen worker.

## Test-first deliverable
- A new source-contract test in apps/web/lib/qa/local-text-project-incident-fence.contract.test.ts scans additive migrations for the last authoritative public.local_text_eligible definition.
- It explicitly requires a **denying** incident predicate against local_text_incidents for the SAME project, where kind=reconcile and state=open. The strengthened syntax checker recognizes fail-closed `IF EXISTS ... THEN RETURN FALSE` or qualifying `AND NOT EXISTS`, not a superficial incident SELECT; it requires all incident columns to use the same table alias.
- As expected, the test FAILS on the current SQL. Do NOT skip, xfail, weaken, or merge it into production while red. No SQL files, live functions, schema ledger, RLS, stop flags or workers were changed in this branch.
- Source inspection cannot PROVE database semantics. The final implementation needs PostgreSQL integration tests before code review.

## Minimum acceptance in a throwaway PostgreSQL database
1. Set up approved synthetic project A with an open reconcile incident and an old revoked device A0 with expired original job metadata. Enroll synthetic fresh devices A1 and A2 using normal server-owned proof/admission fixtures. Both MUST be denied for selection, enqueue, claim, start and model dispatch.
2. Acknowledging the incident without independently verified outcome MUST keep A1/A2 denied; deleting/retaining an unrelated job row must not matter.
3. A separate healthy synthetic project B with a properly qualified device and no open reconcile must continue to behave according to all existing admission, scope, stop and budget rules. The project-A incident MUST NOT spread to B.
4. A new project-A device with a new key, signed request, claim, idempotency key or admission cannot bypass the project-A incident.
5. Two concurrent synthetic callers admitted against one project cannot pass an incident transition race; the final dispatch authority must recheck the incident under the existing transaction/lock hierarchy. Failure to read the incident state MUST deny dispatch, not fall back to a model.
6. Test RLS and function privileges: the eligibility RPC is SECURITY INVOKER, with explicit search_path and service_role-only EXECUTE; anon/authenticated cannot read local-text restricted tables.
7. The signed original attempt's canonical binding must be independently reviewed before any separate recovery transition is even considered. Expired canonical rows remain UNKNOWN; no auto-complete, auto-refund, retry or quarantine clearing.

## Required implementation process (not performed)
- Obtain an authorized, reviewed ADDITIVE Supabase migration instead of editing the frozen October 17 SQL files. Apply through the normal migration ledger process only after release/owner approval.
- Compare the resulting function source against the test contract AND execute the above negative/positive tests in isolated Postgres; hash/ledger security gate, CI and Vercel-preview all pass before merge.
- Preserve the temporary production local-text disable and existing revoked device until the REAL project-wide fence and evidence admission pathway have been independently verified.
- The previous tool security controller blocked SQL writing. Do NOT re-attempt the same blocked SQL via another tool or unrelated CI path; this branch deliberately contains no SQL patch.
