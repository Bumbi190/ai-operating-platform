# Atlas Local Text – read-only reconciliation visibility

Date: 2026-10-23
Scope: newly added, operator- and project-owner-authorized GET status only.
No GPU work, worker enrollment, admission grant, incident mutation or retry is introduced.

## Verified real production incident state before implementation
- One local-text device is revoked and blocked; one admission revoked.
- Two open incidents from Oct 17, one `reconcile` and one `offline`; neither is acknowledged or resolved.
- Their canonical job rows are no longer retained in `local_text_jobs`; related attempt rows likewise absent. This is not evidence that the former physical attempt did not dispatch.
- Two expired tombstones are preserved, including one quarantined device binding; held cloud USD = 0. These are NOT a certificate of remote completion.
- Only incident opened/resolved event types remain in the bounded local-text event inventory; no original signed worker proof was found in that retained history.
- The former reconciliation SQL operation explicitly returns `RECONCILIATION_REQUIRES_VERIFIED_EVIDENCE`. Its device identity was revoked. Do NOT replay, clear fences or re-enroll it.

## New operator-only read route
- `GET /api/local-text/reconciliation-status?projectId=<uuid>` (exact one query parameter).
- Server authenticates the Supabase platform operator, then invokes the EXISTING service-role `local_text_owner_devices` owner check, which compares verified user identity with the project's owner.
- After both gates pass, performs only project-scoped SELECTs, bounded to 100 rows per table: incidents, admissions and retained jobs; the owner RPC supplies scoped device statuses.
- Returns a small no-store/noindex counts/reasons summary. No raw model tasks/results, key fingerprints, IDs, metadata, hashes or entitlement tokens leave the server.
- The response ALWAYS has `canResume=false`, `canRetry=false` and `canEnroll=false`; even zero open incidents cannot grant execution. Only existing independent signed evidence review and a separately authorized future recovery mechanism could do that.
- Provider failures, DB faults, truncated or malformed rows fail closed. Cross-project access is denied before reading internal tables; POST returns 405.
- No changes to schema, functions, RLS, existing owner API, worker operations, SDF1 dispatch or automatic model selection.

## Tests and release
- 9 new isolated API/pure decision tests passed, including operator refusal, cross-project owner denial, malformed input, missing rows, no secret/ID output, no writes, and no retry from an apparently clean state.
- Existing two canonical local-text migration integrity suites and current 17-case Atlas model-router suite also passed; 30/30 scoped suite total.
- Scoped strict TypeScript check PASS.
- GitHub CI + Vercel preview mandatory before merge. Production readiness is a separate operational validation. No human incident can be auto-acknowledged or resolved by a GET.
- Current CLI state is intentionally untouched. Do not stop Docker/WSL/Brave or load Qwen when RAM below the approved 4 GiB threshold.

## Future canonical reconciliation (NOT in this PR)
A genuine state transition would need an independently reviewed, authenticated evidence chain bound to exactly the original attempt, device, input/result hashes, claim/fence and preserved ledger/tombstone state. Loss of those original proofs must remain an explicit unknown, never be converted into “safe to retry” from a process being absent or a retention-expired row. Design, vet and test this as a separate milestone.
