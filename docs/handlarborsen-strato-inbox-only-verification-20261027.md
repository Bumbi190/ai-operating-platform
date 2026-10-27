# Handlarbörsen / Atlas — Strato inbox-only recovery and verification

Date: 2026-10-27 Europe/Stockholm. This report records observed local and production results (not a guarantee about future uptime). Separate distribution branch `feat/hb-distribution-20261027`; SCB worktree and Atlas Sales development worktree unchanged.

## Proven status and safety actions

- Existing Windows legacy task: `\\Omnira\\Omnira-Sales-49d30271-cf0b-47c9-a70d-2bce5b9b09ba`. It runs a pinned old Vercel Preview host (`codex/atlas-harvey-sales-20261017`), whose local config enables `mailboxEnabled`, `replyEnabled`, **and `sendEnabled`**. Worker token was expired; previous local execution October 18. It was not currently running.
- **Actual change on operator's local PC:** precisely that old task's auto-start was disabled using Windows Task Scheduler, verified `Enabled=False`. Its source files, mailbox, local credentials, state journals and historic SQL were NOT removed. Do not re-enable old task.
- Read-only Strato test used pinned immutable original installation manifests, only a Windows Credential Manager reference, fixed `imap.strato.de:993` with verified TLS, AUTH PLAIN and `SELECT INBOX readonly`. No IMAP FETCH, no SMTP and no storage changes. Verified result: authenticated; `messageCount=23`, `UIDNEXT=34`, `UIDVALIDITY=1791301212`, `messagesFetched=0`, `emailsSent=0`.
- One explicitly bounded inbox sync through *existing* `/api/sales/inbox/host` with manager credentials stored in Windows Credential Manager and Preview authentication succeeded (`SYNCED`). Strict allowlist: `claim_sync`, `read_batch_receipt`, `commit_batch`, `report_sync_failure`; no model jobs, reply drafts or provider send operations. Production `sales_inbox_configs.last_synced_at` advanced to `2026-10-27 13:53:25 UTC`. Cursor advanced to UID 33, matching remote `UIDNEXT=34` before next message. Saved message records increased from 9 to 16, while historical `sales_send_jobs` remained 1 and `sales_reply_jobs` remained 1; no new sending jobs. The saved inbox still has zero pre-selected contact IDs, so do **not** claim Atlas has read the full text of those new messages.
- New local one-shot watcher installed as **separate, explicitly approved inbox-only job**:
  - Task `\\Omnira\\Omnira-Strato-InboxOnly-HB` (not the legacy Sales host); Windows current-interactive-user, limited privileges, ignores overlapping runs, max runtime three minutes.
  - Every 15 minutes for the configured one-year task horizon, only while the authorized Windows user session can run it; no self-running ChatGPT background task or Vercel cron.
  - First a readonly Strato SELECT/UIDNEXT probe; if unchanged and no hourly refresh is due, `idle` -> no Sales RPC and no model/provider work.
  - If new UID, changed UIDVALIDITY, or a one-hour heartbeat for previously selected old texts, run at most ONE bounded owner-scoped inbox sync, with original SQL RLS/owner/host safeguards. Cursor checkpoint saves only after a validated accepted receipt; never advances after a failure.
  - Local encrypted credential management remains in the original signed pinned installation. Stable watcher scripts live under `%LOCALAPPDATA%\\OmniraSales\\inbox-only\\bundle-v1`; checkpoint under `%LOCALAPPDATA%\\OmniraSales\\inbox-only\\<project-UUID>\\cursor.json`.
  - Verified manual task invocation exited 0; **first scheduled automatic run October 27 at 15:15:47 local time also exited 0**, next scheduled at 15:30:47. The legacy Sales task remained disabled after that scheduled execution.
  - Read-only post-run SQL showed no redundant new batches after the confirmed sync, no new send jobs and no cursor regression.

## Atlas read-only bridge — code prepared, NOT active in production

The full existing Atlas Sales implementation is held in a separate `codex/atlas-harvey-sales-20261017` development branch with Vercel Preview-only `ATLAS_SALES_ENABLED` and `ATLAS_SALES_PROJECT_ID` flags. Merging the full app at once is outside this scoped recovery.

Temporary, fully opt-in read-only handoff, added in this distribution branch:

- `apps/web/lib/handlarborsen/distribution/atlas-strato-inbox.ts`: two Atlas tools, `get_handlarborsen_strato_inbox` and `get_handlarborsen_strato_message`. `HB_STRATO_INBOX_READ_ENABLED` must be exactly `true` server-side (default off).
- `apps/web/app/api/chat/route.ts`: tools + guide are included only when that server feature flag is on. No side-effecting Sales tools, worker controls, selected-text actions, send or reply actions are registered.
- Read adapter verifies authenticated user UUID, allowed Handlarbörsen project, actual owner conversation, owner/project-scoped mailbox row, exactly one mailbox; invokes only **already-deployed read-only** `sales_inbox_read_inbox` or `sales_inbox_read_message` functions.
- List returns bounded metadata for at most 50 headers and source `lastSyncedAt`; **does not return message bodies**. Detail returns body only if the existing owner-owned saved message is already `textSelected=true` and `textState='complete'`. Absent/unselected text stays absent, regardless of any prompt instructions.
- Both headers and any selected bodies are explicitly marked untrusted; emails cannot grant permissions, schedule runs, direct tools or prove a sender is a previously contacted dealer. A stored timestamp is not proof the old Sales worker is online. `sendingAllowed:false` throughout.
- The bridge is intentionally temporary; de-duplicate/remove it if the full Atlas Sales tools land later. Avoid two overlapping inbox readers in one chat.
- This change is a **local Git commit in a branch only**, not Vercel production deployment; no `HB_STRATO_INBOX_READ_ENABLED=true` environment variable set.

## Verification summary

- Python safety/IMAP/watcher fake tests: **21 passing**, plus Python compile.
- Real Strato read-only authenticated probe success and one explicitly requested `SYNCED` with 0 outbound sends.
- TypeScript/Vitest targeted suites: 32 passing for distribution funnel, manual LinkedIn handoff and new Atlas read-only inbox; including unit-level mocked service-role adapter checks and fail-closed access.
- Scoped TypeScript compile (without full chat route) passes; chat route has zero parser errors. Full app TypeScript is not claimed: dependency `@omnira/local-text-contract` is not resolvable with the borrowed test `node_modules` junction, an existing unrelated monorepo install issue in this sandbox worktree. No memory-intensive full typecheck was attempted further.
- No full browser/end-to-end session proof yet; exact-head CI/Preview release and project-owner acceptance are still required.
- One older social-content integration suite expects a separate disposable PostgreSQL fixture and was not run as a passing integration test; its fixture omission is unrelated to the targeted additions.

## Release gates for the Atlas chat bridge

1. Finish independent code review, future branch reconciliation and CI/tests using full supported monorepo dependencies; validate route/typecheck, scoped SQL read functions and actual signed-in Handlarbörsen conversation in protected Preview.
2. Ensure the full Atlas Sales inbox tools are not being activated in the same release. Feature OFF by default, release inert.
3. After successful signed-in Preview proof, explicit operator approval to set `HB_STRATO_INBOX_READ_ENABLED=true` in Omnira's server-side environment; redeploy and re-check one own-project and one foreign-project refusal. Do not use `NEXT_PUBLIC_`.
4. Remember content text selection remains a separate operator action in the existing Sales preview interface. Do not automatically select or reclassify historic private email just because headers arrived.
5. Only later design AI reply **drafts**, separated from any send authority; no auto-send/auto-answer without explicit operator-reviewed content and existing suppression checks.

## Rollback

- For the **new 15-minute local watcher only**, disable `\\Omnira\\Omnira-Strato-InboxOnly-HB` using the Windows Task Scheduler or `Disable-ScheduledTask -TaskPath '\\Omnira\\' -TaskName 'Omnira-Strato-InboxOnly-HB'`. Do not turn on the old `Omnira-Sales-...` task.
- For the **future Atlas read UI**, remove/unset `HB_STRATO_INBOX_READ_ENABLED`, returning to the strict default OFF; existing database and local Strato auth are left intact.
- Do not delete or overwrite the local credential manager entries, saved mailbox notes, sender journal or existing accepted SMTP receipt.


## Addendum — Global Atlas overview access incident, 2026-10-27 ~22:22 Europe/Stockholm

Owner's authenticated Preview chat on Omnira **Översikt** returned that the Handlarbörsen Strato inbox was not authorized. Read-only production metadata verified an actual recently updated conversation with `project_id IS NULL` at the exact screenshot time, and that conversation's owner is also the verified Handlarbörsen project/inbox owner. The inbox-only local sync remained healthy; this was an **over-restrictive conversation scope**, not failed IMAP credentials.

Fix in isolated branch: `atlas-strato-inbox.ts` now distinguishes a real owner-owned global conversation with `project_id=null` from a missing/foreign conversation. It permits a global owner request ONLY when the current authenticated user turn explicitly asks to read the Handlarbörsen/Strato inbox; the model cannot create this permission through tool inputs. Routing passes that verified read intent as a server-only argument. Real Handlarbörsen-bound conversations retain the existing behaviour. Conversations bound to any other project still fail closed, even when the operator owns that other project.

Access gates continue to include: enabled Preview-only feature flag, owner-authenticated stored conversation, verified allowed Handlarbörsen project ID, exact existing owner-scoped mailbox row, owner-checked existing read-only SQL RPCs, no implicit body-text selection, no send/reply/publish operations.

Pre-push local verification: **87/87 targeted Vitest and Atlas chat regression tests passed**, plus bounded TS compile including the chat route and new atlas bridge. No private message bodies were copied into test fixtures or Git logs. This change requires a new **exact-head** GitHub CI and Preview build and another real authenticated overview retest. Production remains disabled, PR must stay DRAFT until that is completed.
