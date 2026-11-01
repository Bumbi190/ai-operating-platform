# Web Studio — pinned main and exact-claim reconciliation

> Execute inline with superpowers:executing-plans and test-driven-development. Existing isolated PR #368 only.

**Goal:** Remove local main conflicts and reconcile the one newly applied migration without losing showroom or weakening gates.
**Architecture:** Non-rewriting LOCAL merge of pinned main into the owned feature branch, then exact source-only migration history. Do not merge feature into main, enable a feature, replay SQL, or push without the next scoped approval.
**Tech Stack:** Existing Git, TypeScript/Vitest/Playwright, Node and PostgreSQL metadata only. No packages.
**Spec:** Notion Web Studio v0.6; handoff section21; owner continuation of the proposed coordination step.

## Pins and constraints
- Owned HEAD32dd6b569f689d2265b16667d66488e87d3cd04c; main b2335bc7e9565b4cd2081edfb38e5f90ef9a994a. Preserve both histories.
- Existing live PR API still displays old base28092caf; actual main checked by Git fetch/ref. Verify Git ancestry against pinned actual main, not stale API metadata.
- Register final file20261031204433_human_story_exact_claim.sql from8633a3696c96c60d48efae99c037b2d3af92f16a, not the historical170000 proposal. SHA256a7ffd88a4b1881b3173e4dfe98af5d6d6ea1d7bb47b0c09411954cbd698a32e6.
- Supabase metadata read2026-11-01T06:17:39Z:191 distinct ledger names; ordered newline-joined MD5 0d4e7d32152e0f8e6e7afc8c2a7c351e. Three function body digests and ACL match the source rollout receipt. No mutating query.
- The two sales discovery relations are currently RLS-on,0policies,no anon/auth table grants,service SELECT. Prefer main's later187table observed registry; do not retain contradictory created_not_live entries.
- Frozen grandfather14/legacy30 sets, guard algorithms, spending/auth boundaries, and test limits remain unchanged. No main ref update, remote push, deployment or paid model.
- Memory below1GiB observed. No Docker/real DB/Chromium until their required memory threshold is met; never stop unrelated apps or lower guards. Lightweight cases single worker, bounded heap.

## Review focus
1. No lost feature-specific compiler/templates/images or desktop fixes. Compare hashes across source merge.
2. Keep both incoming cross-chat scope checks and our month-boundary regressions.
3. Exact registered SQL, no second duplicate name/version, no changed ACL or function logic.
4. Historical snapshots remain immutable; explicitly augment hypothetical current-world examples only.
5. Read-only catalog evidence is point-in-time, not proof of complete schema replay, live AI or release quality.

## Tasks
- [x] Read Notion, repo rules, handoff and live metadata; preflight reuse_existing; preview merge confirms exactly two conflicts.
- [x] Record baseline RED: current guard rejects observed exact-claim name; current tree cannot cleanly integrate pinned main.
- [x] Merge pinned main locally with no automatic commit; resolve two equivalent policy/test conflicts deliberately, preserve later registry and all feature-specific code.
- [x] Add exact-claim source/ledger/ACL-body tests, observe RED; copy exact SQL, reconcile168/154counts and hypothetical ledgers, re-run GREEN.
- [x] Wire exact source tests into existing guard job only; no elevated rights/new jobs.
- [ ] Run targeted merge-sensitive tests; full TSC/browser if resource gates allow; report blocked checks and known broad failures honestly.
- [ ] Manual second review, local merge commit, hash/ancestry/clean status proof; update Notion and handoff. New push is a separate decision.

## Rulings
Local main-to-feature merge is the requested coordination, not a production merge. Safe non-rewriting history is preferred over rebase or cherry-picking all main commits. The imported exact-claim SQL has already been applied elsewhere; this step never applies it again. No independent reviewer tool was invoked; final review is manual.

## Execution findings
- Source RED5/5 before import; source GREEN63/63 after exact registered SQL/count reconciliation.
- First combined merge-sensitive suite:469pass/4fail/5pending. Two old registry assertions expected absent tables, contradicted by incoming main and current read-only catalog. Updated them to exact live SERVER_ONLY entries and absence of duplicate pending declarations; all original RLS/ACL negative checks retained.
- Combined Studio system instructions9019chars exceeded unchanged9000limit. Compressed two planning sentences without removing selected-style/approval/no-created-folder semantics. No tool schema or permission change.
- One revenue test hit original5s timeout during low-memory run; no assertion mismatch. Will rerun isolated, not increase timeout or mark skipped. Five social-launch SQL cases were not run after their beforeAll lacked an owned DB fixture; list separately, not counted green.
- Existing Migration Guard job extended by only one5-case suite and explicit anti-skip; no new job, permissions, secrets or timeout.

## Final verification ruling
Studio25/25 and focused224/224 plus design/source202/202 passed; overlap is not a unique total. Full TSC is resource-blocked after512/1024MiB heap OOMs, not green. Broad test still fails unchanged mission-brief status-list. Five unrelated social SQL cases lacked fixture in the initial mixed run; not counted as passing. Typecheck and full new Linux/Auth CI remain release gates.
Manual second-pass review and desktop/mobile screenshot inspection complete. Owned database cleanup proven. One unrelated Nova fixture disappeared concurrently (43before/42after), attribution unknown; do not claim global container preservation. No cleanup of that fixture was requested or executed by this work.
