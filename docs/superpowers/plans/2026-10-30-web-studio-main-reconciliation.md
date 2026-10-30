# Web Studio main reconciliation implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline for this authorized continuation.

**Goal:** reconcile existing Draft PR #368 with pinned origin/main28092ca while preserving private save-only references and all current chat behavior, without production/schema/flag changes.
**Architecture:** merge main into the same isolated feature branch; resolve the two known content conflicts by retaining both contracts. Test interaction between newly merged inline screenshot input and reference-save operation before push.
**Spec:** C:/Users/Andre/Projects/Omnira/Docs/OMNIRA_WEB_STUDIO_MASTERPLAN_V05_2026-10-30.md and existing reference-save/picker plans.

## Constraints and review focus
No main/production merge, guard override, paid request, customer activity, new package choice or Supabase branch. Baseline dependencies may advance with main; preserve sharp reference normalization. Verify inline screenshot and private-reference save are never combined; controller signout/navigation safety; current turn-settlement/calendar/voice semantics; migration guard unchanged from main; private flags remain OFF.

## Task1: reconcile current main and preserve disjoint chat intents
- [ ] Read merge-tree output, current main chat/controller changes and live read-only migration status.
- [ ] Merge pinned main into clean existing worktree without committing. Retain saveStudioReferenceMessage import, calendar/local-text imports; both image/referenceSave body fields; referenceReceipt and AtlasTurnSettlement types.
- [ ] Write regression for a request with valid inline image plus private reference save; it must reject before any persistence/provider call. Run RED on combined merge, then include inline image in conflictingIntent.
- [ ] Exercise current controller save and settlement/ordinary image/calendar/voice tests plus migration integrity and responsive picker. Run scoped types and project test attempt; document blockers honestly.
- [ ] Fresh read-only review of merge resolutions/current-main delta, fix Important findings with RED/GREEN.
- [ ] Commit merge in existing branch, push same Draft PR, verify remote SHA and CI/preview status. Keep release/schema activation separate.

## Next checkpoint
After a successful code reconciliation, verify authentic upload->manifest->receipt against a disposable local Supabase/Auth/Storage environment if installed cached resources permit. Never point activated test routes at production. If not yet ready, deliver the reconciled tested branch and state the integration blocker.

## Implementation and verification — 30 October2026

Merged pinned main28092caf20f825ab5649cd930842412f008db594 into existing feature branch from eed0050. Only route imports/body declaration and controller type declarations conflicted; both branches' APIs were retained. No main/production branch change, new PR or forced update.

New integration behavior:
- Valid inline image plus private referenceSave returns409 before persistence/model. New regression first failed202, then passed.
- Reference save emits current-main settlement after pending clears, with actual success/failure, captured generation and operation ownership. Three new RED->GREEN cases cover success, failure and stale navigation; signout still invalidates owned completion.
- Fresh source reviewer found one Important reload bug: receipt loss followed by canonical history hydration could duplicate the saved user message. Reproduced in controller and improved browser fixture, then fixed using canonical message IDs from the owner-scoped conversation query and per-conversation represented-message tracking. Identical text with a different ID remains a separate message. The immutable retry key is preserved. A replay also restores the honest save notice.
- New projection test first failed without selecting id, then passed; foreign-conversation messages are still never queried. Existing loader contract expectation updated only for the added id field and verified with its focused test.

Final local evidence:
- Core/reference/current-controller/voice/isolation/migration regression: **339/339 PASS,30files, no skips**.
- Browser fixture: **11/11 PASS**, now hydrates synthetic committed history before replay after reload. Real React/controller, intercepted HTTP; not real Supabase Auth browser E2E.
- Scoped TypeScript including route/controller/owner-scoped loader/picker/new tests and imported graph: **PASS**,1024MiB heap.
- Existing loader compatibility case: **1 selected PASS;98 unselected tests skipped by the name filter**. Not a99-test pass.
- Migration policy and canonical SQL directory are unchanged vs main. Snapshot of actual read-only Supabase ledger:187names;164canonical150enforced;0unknown0duplicates0missing enforced. This checks names/sets, not SQL hashes, order or replay.
- npm ci --ignore-scripts --prefer-offline succeeded from merged lock. Dependency delta vs main remains prior sharp0.34.4 and its platform/transitive packages.
- Git PR preflight receipt: reuse_existing/explicit_existing_pr368, main28092ca,123openPRs. New main AGENTS.md/CLAUDE.md and enabled Notion workflow pages read.

Remaining test failures (not hidden):
- Broad project command with --bail1: inherited mission-brief-v1.test.ts / supports all sixteen§20.98statuses in public type;2pass1fail then stop. No full-suite green claim.
- Initial broader337-test selection:334pass3fail. Unchanged main source-text assertions: atlas-latency.test.ts / keeps visible reply fed only by text events; does not touch reply from timing branch; design-skill-chat.test.ts / wired into authenticated chat and retains tool-free fast paths. These files and the timing runtime were not changed by the integration. Final339-test core selection does not include these two stale-source suites.
- Real authenticated isolated Supabase/Auth/Storage flow and whole-app types/build are still separate gates. No local full-stack runtime or database containers were started this delivery.

Review: fresh read-only whole-feature/current-main source review found no Critical findings and the single Important hydrated-replay bug above. Fixed by RED->GREEN tests; no second independent source review claimed. Existing Minor deferred: safe authoritative reconciliation/abandonment of permanently rejected retained intents and voice provenance metadata alignment.

Rulings: use only the existing PR/branch; preserve all current-main behaviors and migration guard. Production flags/schema/data, real Auth/Storage integration, deployment compatibility, vision/model dispatch and broader full-suite health were not proven by source review. Keep Draft and OFF; integration/runtime gates remain explicit. No paid model calls, customer activity, new Supabase branch, production write or guard override.
