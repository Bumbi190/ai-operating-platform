# Implementation: family marketing repeat protection

Approved design: ../specs/2026-10-26-family-social-repeat-protection.md. Implement natively in this isolated checkout; preserve live queue. No live provider calls in tests.

## Tasks

1. CLI-scaffold additive SQL migration. Add private pure caption normalization/comparison and project/account/channel-scoped conflict lookup. Exact normalized text is blocked against published, uncertain and in-flight attempts regardless of age; near-text similarity checks an inclusive 14-day window, including approved live queue items. At least 0.80 word-trigram Dice or 0.65 with identical image is a conservative near-copy signal. Short nonidentical texts are review-required when overlapping; common image alone never blocks.
2. Add a publication INSERT/claim_create/claim_publish trigger using existing project locking. Ignore the current publication, not another job with a new identifier. Keep uncertain receipts blocking. Publish guards are shared by manual and scheduled writes. Errors use existing REVIEW_REQUIRED and never fabricate a receipt.
3. Add service-only owner-scoped batch preflight RPC and wire into social content reads. Return conflict references/reason; show Swedish explanation and time in content review. Read failures fail closed, bounded history refuses on truncation. No approval override for exact copies.
4. Test real PostgreSQL: normalization, new IDs, cross-channel/project/account isolation, exact old copies, 14-day boundary, queue comparison, same image/different caption, concurrent creates, lost-receipt states, and no provider calls. Unit tests cover API/display mapping. Update migration tripwires and schema review records only as needed; no weakening.
5. Independent review and relevant type/build checks; export evidence. Audit existing queue without changing jobs before hosted activation. Instagram read-only reconciliation is a separate follow-up implementation with no automatic resend.

## Review focus

Two new IDs racing; uncertain originals; manual versus scheduled bypass; normalized versus exact proof identity; false similarity from shared boilerplate; insufficient/truncated history; no effect on existing receipt recovery. Text heuristics are not a guarantee of semantic paraphrase detection or altered-image recognition.

## Execution receipt

Tasks1–4 complete. Task5 local review/typecheck/build/browser checks and snapshot audit complete; commit/export prepared. Reviewer findings on short captions, confirmation dating and calendar fallback addressed. New snapshot audit reports0 conflicts across42 posts, including0 among36 queued jobs. Hosted installation is blocked by automatic approval review pending explicit deployment authorization. Instagram reconciliation remains the separate follow-up specified above. See docs/family-social-repeat-verification-20261026.md for commands, fixtures and limitations.
