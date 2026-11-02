# Harvey editorial-only release review — 2 November 2026

## Result
An explicitly requested preparationMode=editorial_only can save a marked first-draft revision from a fresh, reviewed bounded Strato-sent/inbox/Resend audit while older coverage remains honestly unknown. Ordinary initialPreparationAllowed and reply-send authority remain unchanged. No production SQL, model run, customer send, sender activation, merge or production deployment was performed for this change.

Existing repository Bumbi190/ai-operating-platform; continue Draft PR #386, branch codex/atlas-harvey-sales-20261017. Implementation base 493a01acfba91e847e6fa66ace5276c26200c4df. Worktree C:/Users/Andre/Projects/Omnira/Temp/hb-sales-slim-20261029 (detached). Read-only preflight reported review_required because the older matching worktree/branch still exists. Manual comparison confirmed this clean continuation matched the PR head and handoff; no branch/PR/worktree was created and the older worktree was untouched.

## Evidence
| Check | Actual result |
| --- | --- |
| Parser/store RED | Before implementation: 3 failures and 6 passes |
| New real-SQL RED | New RPC absent before implementation |
| Review regression RED | Persisted SMTP acceptance was admitted after an empty audit; separate UI predicate test failed |
| Sales Vitest | 530 passed; 8 environment-gated integrations skipped in this run |
| Real PostgreSQL + API/Python integration | 7/7 passed, including editorial Atlas/SQL; SQL contracts and concurrency races passed |
| Python worker regressions | 169 passed |
| Desktop/mobile Playwright | 11 passed, including explicit mode, no send action and draft whose parent is outside job summary |
| TypeScript | tsc --noEmit exit 0 |
| Non-destructive forward rollback | Real SQL check passed: existing editorial job fenced, new editorial work refused, ordinary preparation still works |
| Diff whitespace | git diff --check exit 0 |
| Production ledger read | 193 names; exactly sales_editorial_only_drafts remains unapplied |
| Guard integrity | 171 canonical / 157 enforced; frozen 14 grandfathered / 30 legacy-only unchanged; current ledger correctly blocked |

Integration initially found an obsolete fixture spreading server metadata into editable draft fields. The production editor already projects explicit editable fields. The fixture was updated to exclude preparationMode; the complete integration rerun passed. Unit inventory failures from the added migration were fixed by incrementing explicit count tripwires only, without changing guard algorithms or allowlists. This is scoped verification, not a claim that every repository test or production integration is green. Browser and mail transports use synthetic fixtures; no real recipient/provider model is exercised.

## Independent review and rulings
One separate read-only reviewer returned two Important and two Minor findings. All four were fixed in one pass; fixes were self-reviewed and tested, not independently re-reviewed.

1. Important, accepted-send gap: independently reject normalized-recipient persisted queued/claimed/dispatching/smtp_accepted/delivery_unknown send jobs or accepted_at, plus contacted/suppressed/excluded sibling contacts. A real accepted-before-empty-audit fixture now refuses preparation.
2. Important, older-draft marker: enrich every draft by joining its actual project-scoped parent job. SQL and browser fixtures cover absence from the latest-20 job list.
3. Minor, UI capability mismatch: server-computed editorialPreparationAllowed uses the same predicate; failed/missing/stale/event cases agree with server refusal. No capability means no selection.
4. Minor, immutability promise: trigger pins editorial job identity, request, snapshot and creation time while allowing operational state/lease updates. Worker lifecycle and attempted snapshot removal are tested.

No initial draft ID enters sales_reply_draft_revisions or reply-send authority. Editing/approval of a first draft remains editorial only. Revalidation at claim, model permit and commit still pins history/rule/contact versions. All new functions remain service-only invoker functions with empty search_path; owner/project/conversation checks are retained.

## Concrete pending production decision
Only new canonical migration: apps/web/supabase/migrations/20261102090200_sales_editorial_only_drafts.sql
SHA256: 7d6fab0931aafc52a4d10b397eb8255bb74b15920029b393abe341de9f89f762
Target: Omnira / iboepohjwrhtgshrqaol. Handlarbörsen project remains scoped by its existing owner and project ID.

It adds a guarded preparation RPC and eligibility helpers, replaces the shared timing snapshot/read/workspace/job-JSON functions, and adds an editorial-only immutability trigger. It creates no campaign, changes no contact/history record, enables no sender and creates no recurring job. Shared functions affect existing Sales readers/workers, so this is a real production schema decision. Existing ordinary-path, ownership, SQL and race regressions passed. There is no new paid service or model call in applying SQL; use the existing database instance, with no new external API budget.

Apply only after explicit owner decision under the enabled Omnira autonomous-development standard (production schema/data changes are a decision point). Use the exact reviewed canonical SQL through the migration mechanism, then read back function/ACL/trigger definitions and ledger name. The migration guard must stay strict; a synthetic post-apply comparison is not proof of a real apply. Code/Preview must reflect this commit before the human-review flow is used. No merge, production deployment or sending permission is bundled into this schema proposal.

Before any later real Carstore draft, refresh all currently available source checks, save an honest gap/unknown history revision, recheck replies/stops/duplicates/current offer, then run only one explicitly marked review draft through the existing bounded specialist. An old audit is not reusable beyond its current 900-second rule. No fictional olderHistoryAttestation may be saved.

## Rollback and parked state
Use the non-destructive forward-disable proposal in 2026-11-02-harvey-editorial-disable-proposal.sql as a new reviewed migration. It refuses new editorial jobs and makes pending editorial snapshot checks fail closed. It retains contact history, draft/request provenance, UI metadata, existing normal preparation and reply-send rules. Cancel or reconcile queued editorial work through existing owner RPCs as appropriate; never delete history or edit the applied ledger. Re-enabling needs a new reviewed forward migration restoring the two function bodies, not replaying the complete trigger-creating migration. The current production definitions were read and saved separately before activation planning.

Raw verification logs and preflight receipt are in the existing Temp/harvey-resume-20261101 evidence directory on Hultgren. No secrets, mailbox bodies or customer addresses are committed in this report. Stop only the owned local sales fixture after checks, and preserve other worktrees and services.
