# The Prompt: production migration approval request

Status: prepared for owner review; **not approved or applied** by the20:05 continuation. Broader application/PR release remains blocked and separate.

## Concrete requested action

Apply exactly one migration to **AI Operating Platform / iboepohjwrhtgshrqaol**, using the normal Supabase migration flow, then verify its actual ledger, catalogue, privileges and advisors. The target is not Familje-Stunden or Handlarborsen.

Artifact: apps/web/supabase/migrations/20261018083917_media_news_review_evidence.sql.
Bytes:35,199. SHA256:9cfd8807817878d492814cc29240114c3e3101ac8504651f377f375089b63e52.

The action adds immutable server-only evidence for exact content revisions, server-side prepare/read/validation helpers and a guard reserving trusted admission provenance for the server. It replaces the three existing social-content read/requirements/decision functions to revalidate protected news evidence while retaining ordinary content behavior. It does not create publication requests or authorize dispatch.

## Verification already completed

- [Fresh release preflight and exact baseline findings](the-prompt-news-review-release-preflight-20261018.md).
- Actual new local fixture:24/24 SQL/API/race tests pass; actual32/32 dispatch-stop tests and58/58 GNU inventory/auth tests pass; full web TypeScript passes.
- Hosted preflight: no evidence table/ledger row and zero reserved provenance. The three current routine bodies exactly match canonical source SHA256; existing ACL/search_path/invoker mode confirmed.
- Exact migration bytes unchanged from the reviewed/fixed implementation. Initial fresh review's three Important findings were fixed and reproduced in tests; no independent post-fix review is claimed.
- Hosted security advisors were read: existing WARN/INFO findings remain documented. New objects cannot be checked there before application.

This is scoped schema evidence, **not** a green full-web-suite claim.105 original failed cases reproduced on both selected sources; other broad failures remain unresolved. The PR stays draft and this request does not authorize merging it.

## Application and stop conditions

1. Recheck the source bytes/hash, target identity, current three routine fingerprints, absence of reserved claims and absence of the migration immediately before apply. Stop for any drift, duplicate name, unexpected prior claim or changed owner decision.
2. Apply only the exact file once through normal migration tooling. Do not widen legacy/grandfathered lists or change ledger entries to bypass a failure. Record the actual tool-assigned ledger version/name and statement identity; reconcile source only through the established canonical process if required.
3. Verify actual RLS, no client policies/grants, append-only protection, service-only function execution, explicit search_path and installed function definitions. Run target advisors and compare changes with the recorded pre-apply findings. Do not label the whole platform clean.
4. Confirm ordinary JPEG/content behavior and protected-news refusal through the available authenticated application only after the separately authorized application release. A blocked/unavailable deployment is not a passing HTTP check.
5. Report actual outcome and stop before any application deployment/feature merge or business-data write unless separately authorized.

## Rollback and retained restrictions

Default rollback is application rollback with intake/prepare disabled, retaining new SQL guards and every evidence/decision audit row. Do not drop evidence or restore permissive older decision definitions while protected news revisions could use them. A schema reversal needs its own reviewed freeze/restoration plan.

This schema-only approval does not authorize main merge, production app deployment, generation/spending, actual movie admission, account/scheduler changes, publication or the seven-day experiment. Fresh source/video evidence, video transports, DST#378, metrics#383 and an explicit live release decision remain later work.

Approval is separate because the owner-approved implementation/release boundary requires: “Approve the concrete migration and deployment separately. The implementation approval does not authorize live SQL.” See [the original migration review](the-prompt-news-review-migration-review.md).
