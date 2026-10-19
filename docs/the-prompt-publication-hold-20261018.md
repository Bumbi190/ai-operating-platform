# The Prompt – private preview publication hold, 18 October 2026

## Finding and bounded fix

The new production presentation exists and its sample movie is verified. Before adding release authority, code review found that the illustrated preview hold was enforced by step2/step3 and the central Lambda starter but not by all downstream legacy publication consumers. A persisted illustrated/private row accidentally marked ready with a video URL could reach cron/publish, cron/youtube, manual media/publish/instagram or step4 container preparation.

The fix preserves the already-intended private-review boundary:

- All four consumers select persisted `raw_output` and check `requiresIllustratedPreview` before claims/credentials/channel dispatch or, for step4, before polling/retrying/container creation.
- The shared predicate also holds non-null `private_provider_preview` metadata if the image-profile key is absent. Turning optional flags off does not remove this hold.
- Scheduled/named cron queue queries exclude these rows before their one-/three-row limits, using server-defined PostgREST conditions. This prevents a held preview from starving ordinary scheduled content.
- Direct authenticated manual publishing returns HTTP 409 for an owned held row. Cron queries normally exclude such rows; defensive selected-row guards remain in place. A named cron request cannot fall back to a different row.
- No existing private row is promoted, edited or published. Existing project/operator checks, stop checks, channel idempotency and success receipts stay in place.
- This is a persisted-metadata preflight, not a new atomic exact-output release authority. Concurrent privileged edits after a read are not solved by this patch. The proposed revision/evidence design below addresses the future authority boundary.

## Verification

- **142/142** complete Remotion Node/tsx tests PASS; both existing isolation contracts PASS.
- **453/453** scoped web regressions across 16 files PASS, zero failed files.
- Full web TypeScript PASS.
- Twelve new publishing tests first failed against the missing holds: cron could report published/dry_run, manual could stream publication and YouTube did not classify the private row. They pass with the holds, using actual handlers and external DB/provider boundaries stubbed.
- Four step4 tests pass for two metadata markers and both ready/rendering states with zero poll/retry/container/credential/write effects. The initial fake omitted maybeSingle and errored; after correcting the fake, the exact tests against pre-fix HEAD code failed for the intended `step4_done` versus `illustrated_preview_required` behavior. They then passed against current code. No incorrect initial RED is counted as proof.
- The test fakes model whether raw_output was actually selected, so returning a whole fake row cannot mask an omitted production SELECT column.
- Six queue tests run the actual handlers against a PostgREST-shaped filtering/order/limit fake, with three held rows and ordinary content. Each scheduled consumer still processes only the ordinary row. An additional publish-queue regression covers its one-row FIFO slot.
- The broader run exposed eight failures because the older platform-authority fake could not parse JSON field paths, and one Windows-only OAuth scan path-separator failure. The fake now handles JSON extraction paths, and the scan normalizes path separators without changing OAuth runtime or expected call sites. The final 16-file run is green. No failures are omitted from the report.
- Full Remotion application typecheck was not rerun in this publication-only follow-up. Its previously confirmed nine legacy diagnostics are documented in `the-prompt-production-composition-20261018.md`; this report does not claim that entire typecheck passes.
- Self-reviewed; no fresh independent reviewer is claimed.

Scoped web command: existing twelve governance/budget/provider/authorization/migration/reconciliation/report files, plus publish-channel-independence, publish-sync, youtube-channel-independence and youtube-project-oauth; Vitest serial workers with 20s test/hook limits. No live provider calls from tests.

## Real read-only query check

The actual current server predicate/queue constant were imported through the authorized operator CLI. Ownership and allowed project IDs were resolved first. Against The Prompt, project `a8a1b1f6-c222-4893-9399-b1fb3bc2fa52`:

- Existing private preview `194592d0-57b0-5980-a01c-dc9fad5e39eb` is present and marked as private.
- Actual PostgREST accepts the JSON null/neq/or filters.
- The private row is excluded; an actual ordinary control row remains included.
- Private row's selected state/provenance is identical before/after: pending_review / private_preview.
- No database writes, media signing, provider calls, paid generation or publication.
- This is a real read-only database query, not a new deployed/authenticated HTTP route test or a full audit of ordinary publishing health.

Official Supabase or/select documentation and the current changelog index were checked. The raw OR string uses only the server-defined profile constant, never request text. No relevant filter/PostgREST/supabase-js breaking entry was identified in the fetched index. The query was then verified against the actual server, rather than treating documentation alone as integration evidence.

## Next architectural step is prepared, not implemented

`docs/superpowers/specs/2026-10-18-the-prompt-video-release-design.md` proposes reusing the actual `social_content_posts/revisions/decisions` plane, with a minimal immutable news/voice/render evidence record tied to each revision. The first subproject is a server-built review packet; it does not enable social dispatch.

The current general content-preparation contract can carry video assets, but the current manual publication transport supports Facebook text/link/JPEG and Instagram JPEG. Reels and YouTube are not silently treated as existing capabilities. Later transport work must extend the canonical publication engine and receipts.

The specification awaits owner review under the Superpowers architectural design gate. It does not record a new aesthetic rejection or ask for the same unchanged private movie to be reapproved.

## Deployment limits

At start of this follow-up, canonical main was still `f0a5232`. The latest automatic preview for `193342c` was ERROR at the same shared migration-guard dependency `sales_reply_preparation`. No unrelated sales migration was copied, no guard/policy/ledger override used and no SQL applied. A new push alone cannot resolve that shared source mismatch.

PR #377 remains draft. No main merge, production deployment, changed cron, social credential or trial flag, migration or live publication. The source sample still expires at 18 October 18:26 Stockholm; review may continue later, but its date must not be refreshed for the evening release.

### Additional queue regression proof

Temporarily removing both database queue filters from all three cron consumers made all six queue-selection tests fail for the intended selected-private-row/empty-upload outcome. The original route byte sequences were restored in a finally block and checked for exact equality; all six tests then passed. This proves the tests detect a guard-only implementation that starves ordinary slots. No temporary variant was committed or deployed.
