# Dedicated premium preview: non-renewing pilot allowance

> Execute inline in existing PR #368. Baseline 531cac0. Follow RED/GREEN and fresh verification. No push, release, new subscription, hosted DDL or paid provider call in this slice.

## Approved outcome
Owner approved USD10 TOTAL for the fictional Handlarbörsen Demo Motors preview, using the accepted showroom design/assets. Later quality-driven increases are possible only after a new amount is explicitly approved; current amount remains USD10. Do not degrade the approved design merely to claim completion within a budget. Budget is an upper bound, not a guaranteed delivery quote.

## Design decision
Existing native budgets are daily/weekly/monthly SEK, not lifetime USD. Do not relabel them, alter the live marketplace, or replace canonical accounting. For the first attended pilot, add a small local, durable supplementary OWNER ALLOWANCE, separate from invoices and canonical spend reservations. This local component must remain outside the public web request path.
Alternatives considered: (a) pretend monthly SEK is total USD — rejected; (b) modify the shared production reservation schema now — unnecessary risk/activation scope; (c) pin a single local pilot allowance and keep the native project paused until the real governed runner is connected — chosen implementation approach, not a claim of already activated enforcement.

One fixed approval file binds the site, actual native project/conversation, design content hash and source version. Each potential billable attempt permanently consumes its entire verified maximum BEFORE a callback. No automatic refund, rollover, retry or top-up. This over-counts uncertain and failed attempts. An explicit later receipt-reconciliation enhancement is out of scope. Integer USD micro-units avoid float rounding at admission. The authoritative Omnira H1 gate, project scope, operator approvals and native run/claim checks must still run inside a future real executor.

## Actual native preparation
A separate app-level Studio project was created via existing ownership-checking RPCs, with native monthly budget zero and project execution paused in the same transaction. No new Supabase project/branch. No runs/provider calls. The live marketplace row/budget was compared unchanged in that transaction. Project ID is retained in local private preparation evidence, not committed into general reusable source. Do not resume it in this implementation slice.

## Files and tasks
- [x] Write `scripts/web-studio/pilot-allowance.test.mjs`; observe missing-module RED.
- [x] Add `scripts/web-studio/pilot-allowance.mjs`: strict identity and amounts, exclusive creation, process-safe local lock, append-only hash chain, corruption refusal, durable writes, remaining-ceiling view, no network/provider dependencies.
- [x] Test exact cap, over-budget denial before callback, failed/unknown attempts remaining counted, process restart, changed month, wrong site/project/design/source, changed limit, repeated attempt, concurrent children and corrupted journal/lock. Retain locks after uncertain writes; never reclaim a stale lock automatically.
- [x] Prepare the real site's untouched local allowance against verified template/asset hashes. Bind the existing approval file to the new native project, but mark paid execution NOT ACTIVE.
- [ ] Run fresh tests and syntax validation; manual second-pass review; record what this module does NOT prove. Keep production code, current preview and H1 unchanged. Update Notion/handoff and commit locally only.

## Safety and limitations
Local disk is an owner-controlled single-machine trust boundary, not multi-host/hostile-admin isolation. A caller must supply a server-derived price ceiling and continue through canonical governance; a callback is not by itself permission to bill. No CLI or remote route to arbitrary commands. No SDK, no credentials, no networking. No normal function can change the total, delete the ledger or reclaim reservations. A dead writer's lock or partial write requires explicit operator reconciliation, never an automatic retry. The hosting subscription/other platform costs are not asserted to be included by this provider allowance.

## Review focus
Duplicate initialization must not reset spent allowance. Corruption must fail closed rather than infer zero. Async callbacks and independent local processes must not authorize the same attempt twice. A thrown callback must not free the ceiling. Bindings and source/version hashes are immutable. Previous paused/native safeguards remain in place until real-run integration is reviewed.

## Ledger
Preflight returned reuse_existing / explicit_existing_pr. Browser extension context unavailable and no desktop CDP port found; no credentials/session data were extracted. Native creation used the authenticated Supabase connector and existing RPCs, not a simulated browser login. One local SQL variable ambiguity was rejected before writes, corrected by distinct variable naming, then native preparation succeeded atomically.

### Final evidence and remaining activation gate
- 18/18 Node cases passed after a manual second-pass RED/GREEN correction for complete journal-tail loss and coerced identity types. The local high-water marker is additional integrity evidence, not protection against an administrator restoring all files.
- Dedicated native project/conversation re-read at 2026-11-01T08:27:33Z: correct owner/project binding; paused; monthly SEK0; zero runs, cost events and spend reservations. No model call occurred.
- Real USD10 local allowance initialized ONCE outside the worktree, bound to native project/conversation and five-file approved template/asset manifest. It is NOT connected to the real provider execution path. Native pause/zero monthly setting remain in place.
- New hosted project creation is a real owner-authorized app-data write through existing RPCs. No SQL schema, production deployment, provider credentials, shared budget or live marketplace data were modified.
- Quality decision retained: propose a concrete increase if needed; never silently lower premium ambition or enlarge the authorized total.


## Attended paid-step seam and real demo plan — 2026-11-01
- Dedicated project remains paused and native monthly budget remains 0 until an attended paid run is explicitly admitted.
- Real plan revision 1 is saved but NOT approved or started: plan `346fbcae-a8b5-4b70-a4fa-263d624733f9`, revision `1286b657-f154-4e3e-b19b-9a42bd772477`, SHA256 `ec617c3bb751bb4e5865276573909b6dc646fa8f87cf3be2b3969772175885c6`.
- Plan uses `premium-dealer-demo-v1`, the approved dark showroom direction, eight fictional vehicles and preview-only features. It has no customer outreach, real inventory or publication authority.
- The worker now has an optional attended `beforePaidStep` seam. Default production behavior is unchanged when absent. When present, the hook receives the exact project/session/run/claim/model/operation/maxTokens/system+user payload, then native stop/claim authority is re-established before `runStep`.
- `paid-step-quote.ts` derives the pilot allowance from the same canonical token-window ceiling and ledger-upward SEK quantization used by governed spend. At the pinned fallback FX 10.5 for tests, Sonnet 4.6 / 12k output is 8.19 SEK = 0.780000 USD hard allowance; feedback / 2k is 6.6151 SEK = 0.630010 USD. Real execution MUST read current rates again.
- Hosted website runs normally default to max_attempts=3. Therefore the first paid pilot MUST NOT use unattended drain until retry behavior is bound to the non-renewing owner allowance. The first pilot is attended/single-attempt only.
- Review boundary: operator must open Studio, review an exact mockup and approve it. No SQL/UI auto-approval is permitted. Opening/reading the plan may hydrate the three versioned mockups; it does not authorize a build.
