# Nova image campaign review and verification
2026-10-31. PR610. Base b2335bc7e9565b4cd2081edfb38e5f90ef9a994a.
An independent read-only whole-branch review at62c41f6 found no Critical and nine Important issues. The implementer resolved them in one RED/GREEN fix pass; no second review is claimed.

## Important fixes and evidence
1. Refused claims and terminal native runs cannot look queued forever. Worker persists known blockers; read-only snapshots derive terminal/reconciliation states from actual native run evidence.
2. An identical live claim is an inert follower. It cannot abort the winner or write a native lifecycle result. A different reaped claim cannot redispatch an image.
3. Marking failure locks before reading and requires the current live claim. An old dispatch claim can preserve image evidence but cannot overwrite an admitted/current review receipt.
4. Known non-dispatch/refusal, known admitted-image/save refusal and genuinely uncertain transport outcomes are separate. Canonical lifecycle ERROR/FENCED results are respected; a failed bookkeeping write is lifecycle_error.
5. Campaign locks use native run-before-project order. Actual native claim_runs and cancellation serialize in two PostgreSQL sessions without deadlock.
6. Insufficient invocation headroom defers untouched work and restores its attempt. Claim/work is bounded55s and settlement10s within65s total. Actual Supabase transport receives finite abort signals. An unknown claim response leaves a possible live leader alone.
7. The constrained campaign path requires both uncached positive canonical price rows and rejects unreadable rates. It rereads prices at the physical boundary and refuses a rise above the original reservation or item allocation. Legacy getRates behavior is unchanged.
8. An exact accepted intent replays its original receipt/allocation before new pricing; concurrent acceptance has the same SQL behavior. Changed user intent still conflicts.
9. Past intended times, a full native content workspace and a blocked binding are rejected before paid dispatch; transactional save checks remain authoritative for later races.

Exact duplicate copy was regraded Important because it can buy repeated images against the requested distinct posts. Parser and SQL reject trimmed casefolded exact repeats before queueing.

## Verification
-358/358 relevant Vitest tests across20 files, including image/spend/watch regressions, actual drain routing, known/unknown settlement, hung claim/settlement, strict current prices, canonical transport signals, closed tools/API, current rendered review links, Studio prompt budget and Strato routing.
-24/24 networkless disposable PostgreSQL17 tests. The fixture now executes the actual source claim_runs, reap_stuck_runs and action_phase_rank functions in addition to real native social plan/profile/content migrations and the proposed campaign SQL.
-Independent sessions verify same-claim winner continuation, stale failure versus transactional commit, and native claim versus cancellation. Native reaping and reclaiming admit existing bytes without a second image.
-The preceding expanded SQL RED run had8 failures/16 passes; worker/replay/price/transport/double-finalization regressions also failed before their fixes. The final relevant suite has zero failures.
-Full local TypeScript check reports only the six pre-existing shared Higgsfield/Remotion dependency diagnostics. No new campaign diagnostics. Clean-dependency CI remains a separate gate.
-Initial exact-head62c41f6 Preview built READY. Authenticated Preview acceptance is not claimed: the new hostname shows the app login screen. No cookies or credentials were extracted or transferred. Updated exact-head CI/Preview evidence belongs in the PR before activation.
-No production schema/flags/credentials were changed, and no real image generation or publication was called.

## Deferred minors
-After a human edits a campaign post, its review link opens the native current revision rather than an historical campaign revision. The campaign keeps the immutable original revision ID; native approval binds the actual current revision explicitly.
-The record_asset SQL RPC does not redundantly verify private visibility/bucket/provenance. Its only current server writer uses canonical private byte admission; no client-selected arbitrary-asset route is exposed.

## Rulings made during implementation
-Use native runs, current spend controls and canonical assets rather than a new service, unbound agent or another project's video allowance. If wrong, refactor the OFF implementation before activation.
-Execute routine engineering decisions inline under the saved owner autonomy mandate, with one design review and one whole-branch review. No per-task permission or implementer agents.
-Reuse this clean owned worktree after mergedPR609, switch to one new preflight-approved task branch, and preserve all parallel worktrees/PRs. Its historical directory name is not its current branch.
-Keep unapproved SQL outside canonical migrations while OFF; source/live guard counts stay honest. Moving/applying and reconciling it is an explicit coordinated activation decision, not an invented ledger entry.
-Use optional constrained V3 invocation so legacy caller behavior remains intact. Require physical admission/watch, fresh internally priced ceilings and finite transport deadlines.
-Use65s total per item and80s invocation headroom within the existing300s/max3 drainer. Slow/unknown dispatch stops; an untouched congestion deferral costs no attempt.
-Commit the native immutable content revision and campaign receipt under one authority transaction. A separate check-then-save would leave cancellation/profile races.
-The isolated fixture grants trusted service_role UPDATE on conversations for row locking; no client privilege is added.
-Reuse existing pngjs/jpeg-js to decode bounded PNG/JPEG up to1440px; unsupported formats stop. No new sharp dependency or shared dependency mutation.
-Use documented multipart only on the constrained campaign V3 invocation, and require explicit independently pinned provider origins. Existing caller encoding remains unchanged.
-Require an explicit per-project activation allow-list in addition to the global OFF switch, preventing accidental paid activation for unrelated owned projects.
-Regrade exact duplicated paid copy as Important and reject it, because repeated expenditure contradicts the requested distinct drafts.

## Behaviors the reviewer set aside and final ruling
-Actual provider output, charges and live network behavior need the separately approved paid pilot; mocked HTTP is not that proof.
-Production migration inventory, applied ACLs and release flags are activation work, not silently inferred from local SQL tests.
-Live LinkedIn consent, native delivery authority, publish receipts, schedules and durable create latch remain intentionally unconnected. The OFF transport seam is not a working automatic publisher.
-Signed-in Preview and exact-head CI are separate release evidence. Local shared dependency diagnostics are recorded, not called a clean global type check.
-Editorial quality and posting times need real project material/assets. The proposed slots are editorial choices, not engagement analytics.
-PR609 is already live; its cross-chat behavior was preserved, not reimplemented.
These limits are intentional release boundaries. Misstating them would cause false readiness or unauthorized spend; keep the PR in Draft until the activation decision and remaining acceptance evidence are explicit.
