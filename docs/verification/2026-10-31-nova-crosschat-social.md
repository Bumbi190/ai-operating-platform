# Nova cross-chat social delegation — verification and release review

Status: IMPLEMENTED AND TESTED LOCALLY; PRODUCTION NOT CHANGED.
Work ID: NOVA-CROSSCHAT-SOCIAL
Branch: fix/nova-crosschat-social-20261031
Base: d0efe26c8fd719f7a1373ef5c7de6dfe9e331c90
Authorized PC: Hultgren. Worktree: C:\Users\Andre\Projects\Omnira\.worktrees\nova-crosschat-social-20261031

## Observed cause
The live Omnira database (AI Operating Platform, project iboepohjwrhtgshrqaol) was inspected READ ONLY on 31 October 2026. Its social_launch_assert_owner still requires source conversation.project_id = requested projectId in addition to the target owner and allow-list. Thus a valid global or differently tagged owned conversation is denied. Navigation changes the page, not this database association.
Live ACL: anon=false, authenticated=false, service_role=true. No production SQL was applied.

A separate fast-path issue could remove social tools when mode=content. The navigation regex also mistook conditional “När du öppnar …” text for a completed navigation.

## Implemented behavior
- An explicit project name, slug or UUID resolves dynamically through BOTH the server allow-list and current projects.owner_id.
- Social plans, company profiles, content and their existing consumers accept any source conversation owned by the same authenticated user. Target ownership and source identity remain independent; no chat is moved or retagged.
- Stored revision project_id remains the destination and conversation_id remains the original source.
- Ambiguous/missing/foreign project lookup refuses safely; Studio retains its selected-project allow-list.
- Operational social preparation retains tools even in content mode.
- Conditional navigation text is not falsely corrected. Actual completed claims, including embedded “I can confirm I opened …”, still require a successful navigate receipt.
- Generic workflow authoring already accepts an explicit owned target; no placeholder agent or background job was added.

## Verification
- 236/236 targeted Vitest tests PASS, 7 suites, 0 skips. Includes real POST-handler routing in mode=content, navigation honesty, conversation ownership, workflow validation and migration guard.
- 9/9 real disposable PostgreSQL 17 tests PASS, 0 skips: global/same/different-owned-project conversations; three LinkedIn image drafts saved with synthetic owned asset metadata; retry idempotency; exact source audit; forged allow-list/foreign conversation denial; owner transfer; stop state; missing plan approval; restricted function ACL; rollback and reapply.
- Synthetic images are metadata fixtures, not newly generated images or real customer posts. No paid providers or external publication used.
- Independent read-only review found no owner/Studio/ACL bypass and one navigation-guard regression. Three reproducing tests were first RED, then GREEN after repair.
- Nova Curator routing regression: 28/28 standalone Node tests PASS. Existing read-only routing prefix contracts are preserved.
- Targeted TypeScript compilation PASS. Full app TypeScript check is NOT green in reused dependencies: six errors in existing Higgsfield/Remotion files (missing @modelcontextprotocol/client, @remotion/lambda/client and resulting type errors). No new-file TypeScript errors were reported.
- Four unrelated revenue-project-isolation fixture failures were also reproduced on the unmodified base archive; no revenue implementation was changed.
- Studio project guidance is kept compact so the existing <9000-character prompt budget remains enforced.
- The old atlas-chat.test.ts suite has 3 existing contract failures / 96 passes. Reproduced on an unmodified archive of base HEAD: stale event list, request.signal assumption and incomplete tool-label inventory. Not hidden or claimed fixed here.
- git diff --check PASS.
- PG container is random-named, label-checked, networkless, no host ports/volumes, 256 MiB / 0.5 CPU; cleanup verifies absence.
- Existing shared website-build DB integration suites were not run because their labelled fixture container is absent. The new standalone fixture runs canonical launch/content/profile RPCs against real PostgreSQL instead.
- Supabase CLI was unavailable on the PC. The reviewed timestamped SQL file was prepared directly; no CLI installation, remote diff, migration or provider credential change occurred.

## Exact release proposal
Migration: apps/web/supabase/migrations/20261031150000_social_owner_crosschat_context.sql.
It replaces ONE security-invoker function and explicitly retains service-role-only execution. No table data, secrets, RLS policy, scheduled publication, payment or external account changes.
Only authorization change: source conversation.project_id need not equal destination projectId; the source must still belong to the same caller, and target project must still be currently owned AND in the server-derived allow-list.

Risk: legitimate owner operations can now target another owned project from the current chat. A wrong target selected by the model could create a proposal in the wrong owned project; exact resolver, fresh project context, immutable review and explicit review links mitigate it. Public/other-owner access remains denied. Function replacement briefly takes a catalog lock.
Cost: no paid model/media calls or new accounts; no additional recurring service enabled.

Before live apply:
1. Owner reviews this report, SQL, independent-review finding/fix and rollback.
2. Reconfirm live function body/ACL and intended Omnira project. Abort if drifted.
3. Apply exact migration transactionally with lock_timeout=2s and statement_timeout=15s using approved migration tooling. Update migration ledger exactly once through that tool. No guard override.
4. Verify function body/ACL and existing-project behavior with read-only checks; deploy reviewed application revision after normal checks.
5. Owner-session acceptance in both text and voice: global chat and another owned project chat -> explicit target -> saved proposal -> returned review page. No real publishing is part of this acceptance.
6. Verify no unwanted Supabase test branch was created by integration.

The migration guard intentionally blocks Preview/production builds against an unapplied ledger. No fake ledger, grandfathered entry or override was added.

## Rollback
docs/verification/2026-10-31-nova-crosschat-social-rollback.sql restores the original function predicate and ACL without deleting any proposal or audit. Real PG test verifies old admission is restored while source audit survives, then new admission can be reapplied.
If the migration has already been recorded, release rollback must be a separately recorded forward migration; do not delete or rewrite production history. Roll back the app revision as needed. Existing saved drafts remain accessible from the matching project context.

## Capability limits
This fixes cross-chat PROJECT SELECTION / SOCIAL PREPARATION, not every future integration. New image generation is not implemented by these tools; an image brief is not an image. LinkedIn drafts and intended times are supported, but automatic schedule batches currently accept only Facebook/Instagram. No claim that all future workflows, generated media or LinkedIn dispatch are now live.
The real three-post marketing campaign has not been created as part of this code-fix task.

## References
- Owner architecture: https://app.notion.com/p/4087b977c5b8819f8122de73ab8f0b91
- Owner execution/release policy: https://app.notion.com/p/4017b977c5b881fe85a3c8d0cc3db23c
- Supabase function security: https://supabase.com/docs/guides/database/functions
- Preflight: docs/superpowers/plans/preflight-NOVA-CROSSCHAT-20261031.json. Historical launch branches inspected (PR358 already merged; plan branch had no open PR), no active equivalent. Parked PR605 and voice PR578 were not altered.

## Review handoff
Draft PR: https://github.com/Bumbi190/ai-operating-platform/pull/609 . Initial implementation commit fab9c33; follow-up preserves the existing source-read routing contract and Studio prompt size. No independent production approval is asserted. Supabase branch list after PR creation contained only main; no new database branch was present.

Follow-up regression run: 153/153 tests PASS across Studio prompt economy, inbox/evidence/sales read routing, dynamic target lookup and external references (overlaps core suites). The Studio route retains its existing short guide composition; the global task guide is not injected into Studio. Four unrelated revenue fixture failures reproduced on unmodified base (35 pass / 4 fail). CI on the initial commit was red from source-layout assertions and prompt-size regression; both were repaired before the follow-up commit. Vercel remains blocked pending the unapplied migration. No claim of a green full release.
