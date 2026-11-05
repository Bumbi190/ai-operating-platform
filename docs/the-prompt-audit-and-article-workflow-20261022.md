# The Prompt: production audit and proposed website workflow

Date: 22 October 2026. Project: ai-media-automation / a8a1b1f6-c222-4893-9399-b1fb3bc2fa52.

## Verified production state

Read-only Supabase audit: the 21 October morning/evening scripts were published at 08:00/18:00 UTC (10:00/20:00 Europe/Stockholm). Both use SimpleNewsReel with three images and ready voice/video. The same pattern appears in the eight latest scripts. This confirms delivery, not the accuracy of their news claims.

Both latest quality results say `Quality check parse error — proceeding with caution.` with fabricated passing 8s. Several earlier published rows retain failed quality evidence. Source inspection identifies two causes: invalid JSON defaults to approval; rewrites are saved approved without re-evaluation.

The improved illustrated-video review remains an OPEN DRAFT in PR #377. It is not the active daily video format. Do not describe it as deployed or silently merge the separate feature.

The 12 production step/publish/YouTube cron jobs are active on fixed UTC schedules. Open issue #378 tracks preservation of 10:00/20:00 Stockholm across DST; current schedules would shift one hour locally after 25 October. Issue #383 tracks retention/insight evidence. Neither is resolved by this patch.

The newest website_content article is dated 27 August 2026, pending_review. No fresh October article row was found. There is no active article cron among the inspected cron jobs.

## Quality correction

- Validate complete numeric score ranges and editorial feedback; invalid JSON produces explicit failing evidence, never invented approval.
- Derive engagement average from its five dimensions and enforce hook/factuality thresholds and explicit rejection.
- Allow enough output tokens for complete QA JSON; provide up to 12,000 source characters instead of 600.
- Re-evaluate the exact final rewritten text.
- Active split step1 keeps final failures pending_review. Step2 and retry require approved, so voice/image production cannot select these drafts.
- Autonomous, full and breaking entry points stop before admitting failed scripts to media production.
- Start optional step1 rewriting before 30 seconds, reserving time for final QA and persistence. This is not a hard provider-latency guarantee.

41 focused tests pass: 15 parsing/admission, 5 final gate, 18 text fallback and 3 real step1 route scenarios. Independent code review found no important blocker. These tests stub paid providers; no live generation or publication was triggered.

## Proposed website workflow — not implemented or activated

Owner intent: longer original articles about the stories used in reels, plus other viral news relevant to The Prompt. Assumption: retain the current English AI/technology publication scope.

Reuse System A (`website_content`) and its article generator/review/sync flow. Do not create a competing store through the older marketing-approval pipeline.

1. Select the news_item_id behind each new, quality-approved reel. Separately rank fresh AI/technology stories from the existing hunter. Prioritize the reel stories; extra viral articles are optional within the existing approved project budget. Propose an initial ceiling of two reel articles plus one additional article per day; activation and spending limits remain explicit decisions.
2. Deduplicate by project, source/news identity and already-created website content. Never overwrite a reviewed or published article when a scheduler retries. Record reel provenance without copying the reel script into the article.
3. Retrieve enough source evidence. Prefer the original announcement/research and supporting independent reporting. Missing, stale or insufficient evidence leaves the candidate waiting; do not pad a brief into an unsupported long article.
4. Use the existing English writer and deep tier (900–1,300 words) when the sources support it. Produce an independent headline, structure, explanation and clearly labelled analysis. Preserve factual numbers, dates, names and uncertainty. Attribute reporting and link sources. No close paraphrase of the source structure or replacement of words to disguise copying.
5. Check claims against the collected evidence and run originality checks against every source. The existing 15-word exact-overlap detector is one screening signal, not proof of originality; also review close paraphrase and unsupported analysis. A failed check prevents release.
6. Save the full draft and QA evidence in website_content as pending_review. Generate/review the hero through the existing media workflow. Show the source links and related reel for review.
7. Use the existing approved publishing/sync route to the-prompt destination only after the article passes review. Verify the resulting public article URL and record a receipt. Initial rollout retains human review; no automatic website publication is authorized by this proposal.

Validation before activation: retry deduplication, project isolation, failure without source text, copied/closely-paraphrased text rejection, factuality failure, preservation of reviewed content, existing-budget refusal, manual review and a single approved end-to-end article. Verify the destination's connection without exposing credentials. Do not activate a new recurrence until the implementation, schedule and cost ceiling are reviewable.

## Broader local verification limitations

The whole web suite was started with two workers, then stopped after environmental prerequisites failed (missing SQL fixture, POSIX find command on Windows and unavailable generated/hash fixtures). It did not finish and is not claimed green. Observed failing suite lines:

```text
 Γ¥» lib/qa/mission-brief-v1.test.ts (225 tests | 1 failed) 480ms
 Γ¥» lib/qa/sdf1c3-isolation-substrate.test.ts (195 tests | 83 failed) 3559ms
 Γ¥» lib/qa/vnext-intelligence-graph.test.ts (124 tests | 9 failed) 1820ms
 Γ¥» lib/qa/autonomy-license.test.ts (135 tests | 4 failed) 5370ms
 Γ¥» lib/qa/marketing-review.test.ts (81 tests | 3 failed) 683ms
 Γ¥» lib/qa/atlas-chat.test.ts (99 tests | 3 failed) 1979ms
 Γ¥» lib/qa/survival-history-sql.test.ts (50 tests | 44 failed | 5 skipped) 44ms
 Γ¥» lib/qa/platform-authority-closure.test.ts (53 tests | 5 failed) 22662ms
 Γ¥» lib/qa/atlas-knowledge-snapshot.test.ts (77 tests | 3 failed) 128ms
 Γ¥» lib/qa/project-command-center.test.ts (77 tests | 2 failed) 3316ms
 Γ¥» lib/qa/money-overview.test.ts (90 tests | 1 failed) 724ms
 Γ¥» lib/qa/sdf1c2-broker-control-channel.test.ts (49 tests | 1 failed) 444ms
 Γ¥» lib/qa/youtube-project-oauth.test.ts (30 tests | 1 failed) 1640ms
 Γ¥» lib/qa/autonomy-runtime-foundation.test.ts (68 tests | 1 failed) 3053ms
 Γ¥» lib/qa/executive-brief-apex.test.ts (54 tests | 2 failed) 4140ms
 Γ¥» lib/qa/atlas-memory-emit-durability.test.ts (48 tests | 3 failed) 5037ms
 Γ¥» lib/qa/delegation-mission-activation.test.ts (32 tests | 11 failed) 83ms
 Γ¥» lib/qa/atlas-memory-terminal-outcomes.test.ts (39 tests | 1 failed) 5595ms
 Γ¥» lib/qa/content-center.test.ts (64 tests | 1 failed) 3135ms
 Γ¥» lib/qa/muapi-media-provider.test.ts (70 tests | 8 failed) 66ms
 Γ¥» lib/qa/survival-funding-sql.test.ts (52 tests | 52 failed) 45ms
 Γ¥» lib/qa/activity-stream.test.ts (69 tests | 1 failed) 1351ms
stdout | lib/qa/external-dispatch-stop.test.ts > step4 ┬╖ starting a NEW render is external compute > a stop does not increment retry_count and does not mark the video failed
stdout | lib/qa/external-dispatch-stop.test.ts > reply-comments ┬╖ a stop mid-queue stops the next reply > a deferred comment is NOT marked failed ΓÇö it stays pending and resumable
 Γ¥» lib/qa/atlas-memory-dream-producers.test.ts (40 tests | 1 failed) 2753ms
 Γ¥» lib/qa/project-api-credentials.test.ts (116 tests | 1 failed) 84ms
 Γ¥» lib/qa/system-health.test.ts (57 tests | 2 failed) 2462ms
 Γ¥» lib/qa/leads-dual-accept.test.ts (74 tests | 2 failed) 79ms
 Γ¥» lib/qa/review-queue.test.ts (62 tests | 2 failed) 2507ms
 Γ¥» lib/architecture-knowledge/executive-knowledge.test.ts (39 tests | 12 failed) 23640ms
 Γ¥» lib/qa/executive-intelligence-schema-activation.test.ts (19 tests | 1 failed) 105ms
 Γ¥» lib/qa/spend-financial-decoupling.test.ts (27 tests | 2 failed) 493ms
 Γ¥» lib/qa/sdf1b2-code-work-operator-plane.test.ts (26 tests | 1 failed) 90ms
 Γ¥» lib/qa/execution-contract-propagation.test.ts (28 tests | 8 failed) 13481ms
stdout | lib/qa/image-reference-fail-closed.test.ts > a constrained generation that FAILS also fails closed > exactly ONE paid attempt: a failed constrained call triggers no second call
 Γ¥» lib/qa/external-dispatch-guards.test.ts (40 tests | 4 failed) 172ms
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts'
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts'
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts'
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts'
 Γ¥» lib/qa/media-orchestration-retry-authority.test.ts (22 tests | 1 failed) 4281ms
 Γ¥» lib/qa/autonomy-bind-guards.test.ts (31 tests | 1 failed) 302ms
 Γ¥» lib/qa/session-only-routes.test.ts (49 tests | 2 failed) 85ms
 Γ¥» lib/qa/release-gate-proof-workflow.test.ts (41 tests | 2 failed) 96ms
 Γ¥» lib/qa/leads-legacy-auth-removed.test.ts (53 tests | 4 failed) 98ms
 Γ¥» lib/qa/licensed-bind-m4b-guards.test.ts (31 tests | 1 failed) 43ms
 Γ¥» lib/qa/sdf1c-trusted-broker.test.ts (16 tests | 1 failed) 95ms
 Γ¥» lib/qa/autonomy-trace-guards.test.ts (24 tests | 3 failed) 3083ms
 Γ¥» lib/qa/platform-credential-events.test.ts (25 tests | 3 failed) 33ms
 Γ¥» lib/qa/pipeline-orchestration-isolation.test.ts (22 tests | 1 failed) 703ms
 Γ¥» lib/qa/scoped-read-isolation.test.ts (27 tests | 1 failed) 68ms
 Γ¥» lib/trading/session-calendar/import-discipline.test.ts (30 tests | 1 failed) 123ms
 Γ¥» lib/qa/budget-scopes.test.ts (54 tests | 2 failed) 52ms
 Γ¥» lib/qa/atlas-knowledge-boundary.test.ts (23 tests | 2 failed) 6878ms
 Γ¥» lib/qa/breaking-dual-authority-isolation.test.ts (21 tests | 6 failed) 1241ms
 Γ¥» lib/qa/canonical-evidence-pin.test.ts (24 tests | 2 failed) 119ms
 Γ¥» lib/trading/market-data/import-discipline.test.ts (28 tests | 1 failed) 568ms
 Γ¥» lib/architecture-knowledge/architecture-knowledge.test.ts (17 tests | 8 failed) 13126ms
 Γ¥» lib/qa/sdf1c-broker-claim-credential.test.ts (16 tests | 1 failed) 1127ms
 Γ¥» lib/website-build/chat-tools.test.ts (9 tests | 9 failed) 16ms
 Γ¥» lib/qa/sdf1c3-isolation-integration.test.ts (10 tests | 1 failed | 9 skipped) 14ms
 Γ¥» lib/project/lifecycle/store.test.ts (9 tests | 9 failed) 15ms
 Γ¥» lib/qa/monthly-release-v2.test.ts (31 tests | 3 failed) 46ms
 Γ¥» lib/qa/provider-dispatch-certainty.test.ts (15 tests | 1 failed) 2802ms
 Γ¥» lib/qa/memory-vnext.test.ts (16 tests | 2 failed) 84ms
 Γ¥» lib/qa/project-workspace-vnext.test.ts (19 tests | 3 failed) 39ms
 Γ¥» lib/trading/provider-normalization/recorded-adapter.test.ts (17 tests | 1 failed) 26ms
 Γ¥» lib/qa/workflows-definition-familje-stunden.test.ts (18 tests | 2 failed) 45ms
 Γ¥» lib/qa/atlas-latency.test.ts (22 tests | 2 failed) 25ms
 Γ¥» lib/qa/global-design-tokens.test.ts (12 tests | 2 failed) 3314ms
 Γ¥» lib/trading/market-view/import-discipline.test.ts (7 tests | 1 failed) 63ms
 Γ¥» lib/website-build/studio/store.test.ts (7 tests | 7 failed) 12ms
 Γ¥» lib/qa/legacy-v1-api-removed.test.ts (16 tests | 5 failed) 123ms
 Γ¥» lib/qa/handlarborsen-visual-pulse.test.ts (7 tests | 1 failed) 118ms
 Γ¥» lib/qa/global-auth-retired.test.ts (14 tests | 6 failed) 74ms
 Γ¥» lib/trading/replay/import-discipline.test.ts (12 tests | 2 failed) 230ms
 Γ¥» lib/website-build/studio/loader.test.ts (10 tests | 9 failed) 16ms
 Γ¥» lib/qa/desktop-commander-unlicensed.test.ts (16 tests | 5 failed) 30ms
 Γ¥» lib/qa/cl-shadow.test.ts (12 tests | 1 failed) 948ms
 Γ¥» lib/website-build/studio/budget.test.ts (5 tests | 5 failed) 11ms
 Γ¥» lib/qa/admission-inventory.test.ts (4 tests | 4 failed) 117ms
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts' -not -name 'database.types.ts'
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts' -not -name 'database.types.ts'
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts' -not -name 'database.types.ts'
     ΓåÆ Command failed: find app lib -name '*.ts' -not -path '*/qa/*' -not -name '*.test.ts' -not -name 'database.types.ts'
 Γ¥» lib/website-build/studio/api.test.ts (6 tests | 6 failed) 9ms
 Γ¥» lib/project/lifecycle/api.test.ts (4 tests | 4 failed) 8ms
 Γ¥» lib/website-build/studio/output-allowance.test.ts (2 tests | 2 failed) 8ms
 Γ¥» lib/website-build/test-db-bootstrap.test.ts (2 tests | 2 failed) 10ms
```

Whole-web TypeScript was attempted and reported three errors in unchanged lib/media/lambda-render.ts: missing @remotion/lambda/client and two consequent unknown-region errors. The reused local dependencies do not contain @remotion/lambda. No dependencies were changed or installed. These are validation limitations, not resolved findings. Full failing-output evidence remains in the local quality-suite.log; no secrets were used.
