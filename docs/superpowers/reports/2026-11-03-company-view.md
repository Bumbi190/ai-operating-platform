# Företag: implementation and verification

## Result

The new owner-only `/projects/handlarborsen/companies` page adds area/name/status filtering, per-record contact badges, expandable history/source gaps, website/source links and a separate bounded ephemeral public dealer lookup. The active Handlarbörsen project sidebar and existing Lead Finder link to it. Other projects and read-only collaborators receive no new access. Existing Lead Finder and Sales routes remain.

The implementation uses stable-ID pagination for contacts, 200-contact timing batches and existing gated SCB/archive readers. It deliberately does not call `sales_read_workspace`, whose implementation reconciles expired jobs. No company search function has a batch/contact/history/rule/worker write capability. No source, key or flag was activated and no live provider/mail operation was run.

Actual location is kept separate from public search centre/radius. Exact email can show address-history and recipient-stop hints without merging company identities. Names/domains do not merge histories. Duplicate recipient totals and connected message/provider aliases are deduplicated. A later bounce does not shift the original sent date. SMTP acceptance is not final delivery; incoming mail is not automatically pilot interest.

## Verification

- Final affected unit/API/timing/navigation run: **161/161 tests**, 11 files. Of these, **30** directly cover the new projection/read/API behavior.
- TypeScript `tsc --noEmit`: **exit0** after review fixes.
- Browser fixture: **8/8 desktop/mobile checks** after fixes. An additional **2/2** visual capture runs passed; desktop and mobile screenshots inspected. No horizontal overflow; filtering/details and public error/empty/result states work. Browser requests are intercepted with synthetic data and assert no unintended API writes.
- Initial feature tests observed missing implementation. The later-bounce date regression and all five review findings were observed RED before the fixes, then GREEN.
- Whitespace/diff check run before commit. No new package, migration or dependency.

### Independent review

One builder check found no unresolved product decisions. One separate code review of this increment found **0 Critical, 3 Important, 2 Minor**. All five were fixed in one pass with regression checks:

1. Fresh attested empty history can render a bounded no-match state. It requires current revision/version/address, all three fresh complete source channels, no observed events and zero timing blockers; it never confers sending permission.
2. Public search centre is labelled search area, including radius, with actual company city unknown.
3. Current recipient/contact stop codes and observed unsubscribe/bounce signals feed structured `blocked` filtering, including when no history revision can be displayed.
4. Successful zero-result search gets a dated completion/coverage message.
5. Ephemeral POST rejects all URL query parameters.

Current SQL was read to verify `RECIPIENT_STOPPED` is produced for bounced/unsubscribed events, separately from contact suppression. No independent re-review of the fixes or full-PR review is claimed.

### Broad-suite limitation

The full Windows Vitest command was run once before final review fixes: **117 failed /707 passed /44 skipped files; 406 failed /15,583 passed /1,406 skipped tests**. The complete117 named failing-suite index is in `2026-11-03-company-view-broad-suite-failures.json`; raw log remains in `Temp/harvey-resume-20261101/company-view-full-vitest.log` on Hultgren.

Examples inspected include missing Unix `grep`, Windows `find` incompatibility, slash/path comparisons and byte/hash expectations under CRLF; other failures and unavailable local PostgreSQL suites remain unresolved. No failure reference points to the new companies route, and the new feature files passed in that run. This is **not** a claim that every broad failure was independently reproduced on the unchanged base. The full repository suite is not green in this environment. No main merge or production release is justified by these results. Final focused and browser checks were rerun after the review fixes; the full suite was not repeated.

## Limits and operational boundaries

- The view reads saved journal/history revisions, not a fresh live Strato/Resend reconciliation. Current mailbox, suppression, complaint, bounce and registration checks remain necessary before recommending any outreach.
- Existing registered-account data is a dated29October prevention-only snapshot; no live registry sync. The SCB/archive readers retain their existing caps and incomplete/disabled states. No complete dealer coverage is claimed.
- Public search supports the six already configured city centres and at most25 provider results by API,20 by this UI. The existing adapter can omit repeated domain/email entries; results are a bounded selection, not a company/branch census. Search saves nothing and has no retry/polling.
- Website/source links support human inspection. Automated website fetching/analysis, persistent selection, wider geography and live account sync are deferred.
- Existing dialog decisions are shown as dated name-linked handoff context, not automatic reinterpretations of new replies.
- No customer email, scheduling, approval, contact edit, database schema/data apply, timing/worker/policy/flag change, production deployment or billing/media activation occurred in this increment. Webbuilder stays review drafts.

## Work identity and rulings

Same Draft PR#386, branch `codex/atlas-harvey-sales-20261017`; clean detached continuation `Temp/hb-sales-slim-20261029`, starting SHA`1d15d8d1d20ea6adab0f6c681b6edbda5c4cfb6d`. No new branch/worktree/PR, resets or force pushes. Preflight found metadata overlap with#306; its competitor/history file scope was inspected and does not own this increment.

Ruling: continue routine implementation under the owner's autonomous development standard and accepted reuse direction; no new micro-approval for the technical design. Ruling: keep one coherent feature commit rather than publishing intermediate failing states. Ruling: preserve Draft status and disclose broad-suite failures instead of changing unrelated subsystem tests. Preview build/SSR results, if obtained, are recorded separately in the handoff; component fixtures do not prove authenticated live SSR behavior.
