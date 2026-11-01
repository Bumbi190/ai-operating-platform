# Premium dealership preview — dedicated project and local allowance

Date: 2026-11-01. Existing PR #368 / codex/atlas-builder-references-20261017. Source baseline 531cac00b548ce589e98005f64d90cb0b79642c6.

## Owner decision
Start the fictional Handlarbörsen preview with USD10 TOTAL. Premium quality remains the goal. An increase may be proposed if needed but no new higher amount has been approved. Reuse the accepted showroom design and existing illustrations first. No monthly reset, automatic increase, new subscription, marketplace work or outreach is included.

## Actual preparation performed
A distinct application-level Studio project, named `Handlarbörsen Demo Motors – Preview`, was created inside the existing Omnira database through `website_build_studio_ensure`, using the existing v2 builder preset and verified design-skill hashes. It is NOT a new billable Supabase project or branch.
The same transaction set its native monthly budget to ZERO via `website_build_studio_budget_set` and paused its execution with the normal audited project-stop RPC. This is an intentional temporary block, not a statement that its approved total is zero. The original live Handlarbörsen project row/budget were compared unchanged inside the transaction. No build was queued. A first attempt had a PL/pgSQL variable-name ambiguity and failed before writes; it was corrected, then the complete transaction succeeded.
Verified creation receipt: project and conversation saved; project paused; monthly SEK0; runs0, cost_events0, spend_reservations0. Real native IDs and the approval are retained in local private state, not hardcoded into reusable source. No live sign-in was simulated and no browser credentials were extracted.

## Implemented local component
`scripts/web-studio/pilot-allowance.mjs` is a small supplementary owner-allowance component for an ATTENDED, SINGLE-MACHINE pilot. It is not Omnira's canonical billing ledger and is not wired into production API calls.
An approval binds budget ID, native project/conversation, a five-file template-and-image manifest hash, source version, currency USD and an integer micro-USD total. Initialization is exclusive and cannot overwrite/reset an existing allowance. Before invoking a supplied trusted executor callback, an admission consumes its full maximum, is journaled with a hash chain and high-water marker, and is flushed to disk. That ceiling stays consumed after success, failure, uncertain outcomes or time/month changes. Duplicate attempts are refused. Concurrent local processes serialize through an exclusive lock. A leftover lock is never automatically reclaimed.
The persistent real-site allowance was initialized outside the worktree under `Omnira/State/web-studio/hb-demo-motors-preview-20261101/`: USD10 total, zero admissions. The earlier owner approval JSON now points at the actual dedicated project and marks `paidExecutionAllowedNow=false`.

## RED/GREEN and review evidence
- Initial test invocation failed because the new module did not exist; no implementation preceded the tests.
- Initial implementation: 16/16 Node tests passed.
- Manual second-pass review identified whole-tail journal loss and regex coercion of array IDs. Two new regressions reproduced both failures (16 pass / 2 fail).
- A separate high-water marker and explicit string checks corrected these cases. Final result: **18/18 passed**, zero skipped or cancelled; module and test syntax valid.
- Tests cover exact cap vs one extra microdollar, replay after error, callback ordering, retained uncertain allowance, cross-site/project/design/source refusal, changed cap, month rollover, process restart, three concurrent processes, invalid types, damaged journal and stale lock.
- Tests use disposable local directories and inert callbacks, with NO SDK or external provider calls. They require no Docker, hosted SQL fixtures or package installation. Only owned temporary test directories are removed.
- This was manual second-pass review, NOT independent reviewer or security certification.

## Important remaining boundary
**No real paid executor is connected yet.** The local callback is a composition seam, not a proof of native ownership, H1 enforcement, pricing accuracy, successful provider dispatch or invoice totals. Before a real pilot: build a verified current-price ceiling from the exact request; bind the native run/claim/approved plan and reviewed mockup; use this stable allowance path; invoke ONLY the existing governed provider path; reconcile actual receipts. All planning, editing and newly purchased media for this pilot must share the same allowance, and any other incremental billed work needs the same total accounting. Do not send a raw SDK request as a shortcut or claim this local module automatically limits the hosted Studio.
Full admitted ceilings are deliberately conservative and never refunded automatically. Receipt reconciliation and a new owner-approved larger amount are separate, not hidden ways to replenish USD10. The filesystem assumes an owner-controlled local machine; it is not hardened against an administrator restoring both state files, multi-host writers or arbitrary disk rollback. Power-loss recovery has not been tested. Unknown storage state fails closed, not an inference of unused funds.

## Unchanged / unrun
No application code, dependencies, canonical spend/authorization functions, SQL schema, shared budgets, feature flags, main branch, deployed site or design assets were changed. Creating the dedicated app-level project and pausing it IS a real data write, explicitly distinguished from deployment/schema activation.
The previous 19 green PR checks apply to baseline531cac0; they were not rerun for these offline scripts and do not prove a completed premium website. No new full-repository or real AI quality test was run. The previously known broad-suite issue remains outside this slice.

## Reproduce
From repository root: `node --test scripts/web-studio/pilot-allowance.test.mjs`.
Local RED/GREEN and binding evidence: `.superpowers/sdd/2026-11-01-web-studio-pilot-envelope/`.
Owner approval/binding: `C:\Users\Andre\Projects\Omnira\Docs\OMNIRA_HB_PREVIEW_BUDGET_10USD_2026-11-01.json` and `OMNIRA_HB_PREVIEW_DESIGN_BINDING_2026-11-01.json`.

## Next bounded action
Wire and test an attended native executor with a truthful provider quote, exact approved input and the permanent allowance; then enable only this dedicated demo for one bounded initial generation. Keep the existing preview and approved premium design as comparison baseline. Any extra spend requires a concrete proposal and new approval. Do not rebuild the site or enlarge platform scope merely to add budget machinery.
