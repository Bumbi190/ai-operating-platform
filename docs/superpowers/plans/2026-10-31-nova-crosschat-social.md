# Nova cross-chat social delegation implementation plan
> **For agentic workers:** execute inline using superpowers:executing-plans; whole-branch independent review before release.

**Goal:** Let the authenticated owner prepare work for an explicitly selected owned project from any owned Nova conversation.
**Architecture:** Conversation identity records the source; projectId records the destination. Keep database owner and allow-list verification, source conversation ownership, immutable audit, review decisions and publication gates. Resolve project metadata dynamically and keep operational social requests on the tool path.
**Tech Stack:** Next.js, TypeScript, Vitest, PostgreSQL 17.
**Spec:** User request of 31 October 2026 plus owner architecture https://app.notion.com/p/4087b977c5b8819f8122de73ab8f0b91.

## Global constraints
- Do not change Prime Agent, parked GitHub catalogue PR605, other worktrees, credentials, budgets or real publishing.
- Explicit destination must be owned and in server-derived allowedProjectIds; never use page navigation as authority.
- Studio remains restricted to its own selected project.
- SQL production application and deployment require review of the concrete migration and rollback first.
- LinkedIn preparation does not imply automatic publication support; image briefs are not generated images.

## Review focus
- Same-owner global and differently tagged source chats work without retagging.
- Foreign/nonexistent source conversations and forged allow-lists still fail.
- Project lookup handles duplicates and query failures without choosing a target.
- mode=content cannot swallow a request to save/prepare social content.
- Conditional offers to open a project do not trigger false navigation corrections.

### Task 1: Reproduce database rejection and preserve ownership boundaries
Files: scripts/atlas/verify-nova-crosschat-social.test.mjs; apps/web/supabase/migrations/20261031150000_social_owner_crosschat_context.sql.
- [ ] Add disposable networkless PG17 regression using canonical launch/content/profile RPCs.
- [ ] Observe same-owner global/cross-project source fail on old SQL.
- [ ] Replace only social_launch_assert_owner; retain exact source conversation audit and ACL.
- [ ] Verify actual LinkedIn draft save, replay, wrong-owner/missing/foreign context, stopped state and role denial.

### Task 2: Resolve explicit targets and use operational tools
Files: apps/web/lib/atlas/project-task-context.ts; apps/web/lib/qa/atlas-project-task-context.test.ts; apps/web/app/api/chat/route.ts; social-launch tool guides.
- [ ] Test dynamic exact project identity, duplicate and foreign results, social planning routing and navigation claim detection before implementation.
- [ ] Add read-only resolve_project_context; register in chat and Studio with existing scoped principal.
- [ ] Exclude social preparation from text-only fast path; document cross-chat semantics and exact capability limits.
- [ ] Keep social input schemas closed and source conversation server-owned.

### Task 3: Verify and prepare reviewed release
Files: migration guard policy and count tests; docs/verification/2026-10-31-nova-crosschat-social.md.
- [ ] Run targeted Vitest, disposable PG17, TypeScript and diff checks.
- [ ] Review whole diff independently; fix substantive findings and rerun affected tests.
- [ ] Commit and create one reviewable Draft PR with the preflight receipt, migration risk and rollback.
- [ ] Report test-ready vs deployed state explicitly; do not apply production SQL or publish content.
