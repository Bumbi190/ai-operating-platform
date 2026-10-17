# Atlas + Harvey — verification and activation record

Date: 2026-10-17. Base: `146c5db4db2acb2b4c7d4bf959e1603562b6ebaa`. Branch: `codex/atlas-harvey-sales-20261017`.

## Delivered behavior

Pilot A adds an owned-project contact/offer workspace, three conversation-bound Atlas tools, a durable PostgreSQL draft queue, scoped expiring worker credentials, bounded local research and a text-only Claude/Harvey adapter. Exact immutable drafts enter the existing canonical editorial review system. Revisions supersede pending older reviews atomically. Sending is disabled.

No production migration, deployment, feature activation, real contact import, worker enrollment, Claude inference or Strato connection was performed. Existing Founding 5 history, tiers and exclusions must be verified before import. Parts B/C remain required separate deliverables; the full sales/mail flow is not complete.

## Evidence

| Check | Observed result |
| --- | --- |
| Six sales contract/store/API/protocol/Atlas/view-model Vitest files | 48/48 passed |
| Real PostgreSQL sales transaction suite | Passed ownership/RLS, idempotent replay/conflict, branch identity, tier mismatch, pause, ten-attempt ceiling, cancellation fencing, expiry/revocation, immutable offers and superseded canonical approval |
| Concurrent real database claims | Exactly one claim owner across two processes |
| Canonical run integration | Real existing `runs_idempotency_key_sha256`, `runs_action_binding_complete` constraints and `resolve_approval` function applied in disposable database; passed |
| Real cross-layer slice | Operator API saved five synthetic contacts and a 12-month offer → actual Atlas handler queued job → a fresh read recovered it → fixed worker-protocol API produced five exact persisted drafts → revised hash changed → old approval returned LOST → cancelled late completion returned 409; passed |
| Python worker tests | 16/16 passed on Linux and Windows; fake runtime only; one reserved call before completion, uncertain call not retried, restricted URLs/tools/output/protocol |
| Browser | Playwright Chromium passed desktop 1440×1000 and mobile 390×844; five cards survived reload, shared mailbox branches remained distinct, editing and editorial-only approval worked, no horizontal overflow |
| Visual inspection | Desktop/mobile screenshots inspected. Filial name regression observed RED then corrected and GREEN |
| TypeScript | `npm run typecheck` exit 0 |
| Claude installation | Native CLI 2.1.296; doctor ready for required version/help surfaces. Not evidence of an authenticated inference, subscription terms or actual isolation behavior during a live call |
| Broad existing suite | 13,076 passed; 413 failed; 1,326 skipped across 594 files. Not green. Failures include Windows-only shell incompatibility, missing older isolated database fixtures and stale source/inertness assertions. Exact base comparison is recorded below when completed |
| Related chat/voice/social/build subset | 479 passed, 47 failed, 188 skipped across 65 files; missing existing website/social fixtures and old chat assertions are included. No claim that this entire subset is green |

The synthetic fixtures contain no mail transport implementation or mailbox credentials. No SMTP/IMAP operations, customer mail or live model requests occurred. Browser component receipts are mocked; the real PostgreSQL/API/tool integration is a separate test. This does not prove deployed Next.js routing, production schema deployment, authentication/session cookies or real provider behavior.

## Reproduction

Use `workers/sales/README.md`. The database runner verifies the local Docker daemon, exact image/name and plan ownership label before creating a generated disposable database; it drops that database in `finally`. Production databases and other test containers are not reset. The explicit browser configuration is `apps/web/playwright.sales-pilot.config.ts`.

## Activation prerequisites

1. Independent review findings addressed and normal project checks reviewed; do not merge/deploy on a claim of a green full suite.
2. Normal production migration/deployment process, verified project UUID and feature flag scoped to that project.
3. Verified Claude subscription/runtime behavior, then one synthetic inference. Provider-internal retries/telemetry and installed policy behavior still need qualification; reserved attempts count worker CLI dispatches, not an independently observed provider billing meter.
4. Explicit connection enrollment, five manually selected and confirmed contacts, current history, exclusions and immutable offer. Review exact sources/questions/recipient and text.
5. Separate B/C implementation before mailbox history ingestion or any send authorization. A draft approval never grants sending rights.

## Execution decisions

The approved design is authoritative. Equivalent manual ledger/TDD tracking was used because the skill's shell helper scripts were unavailable on the Windows host. The final reviewer template resource was also unavailable through the skill reader; the published review requirements and verbatim plan focus are supplied directly to the fresh reviewer.

The five-contact fixture expands the plan's two-branch example so five exact drafts can be proven. Hash canonicalization follows PostgreSQL JSONB array serialization to enable an independent database check. The local disposable SQL fixture applies the actual relevant migration/constraints instead of resetting the entire historical Supabase chain.

Only reviewed Harvey tone guidance is used; dubious legal claims, numeric benchmarks, identity concealment and autonomous sequences are excluded. The original source, pinned commit, hashes and MIT license are retained. Contact pilot months are explicit and must match the offer. Sales capabilities are registered in main Atlas text/voice and remain outside the website-only Studio capability set. Product prompts use readable contact/offer descriptions and source evidence.

Browser verification uses the real React component with synthetic API receipts; the real database, operator API, Atlas tool and worker protocol are verified together in Vitest. This avoids activating production authentication, a real model or a mailbox to obtain deterministic evidence. Cost: deployed routing/session/provider behavior remains unproven.

The approved delivery is a draft PR with activation off. Existing unrelated baseline failures are reported and compared, rather than changing historical tests or deploying the branch. Cost: this draft cannot be represented as ready for production solely from these checks.

## Final independent review

Pending whole-branch review. Findings, fixes, baseline comparison and deferred minors are appended before delivery.
