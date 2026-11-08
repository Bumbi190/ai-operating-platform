# Reference message binding implementation
Spec: local masterplan v0.5 and 2026-10-30 persisted-reference preflight plan.
Continue PR #368 / codex/atlas-builder-references-20261017 at 6fb5d95.

## Delivery
Create an atomic server-only SQL proposal that inserts a user message with a DATABASE-generated ID and its immutable ordered reference manifest in one transaction. An owner/conversation/idempotency-key uniqueness constraint makes exact retries return the original message. Different text or image order with the same key fails. This removes the need to trust a client message ID.

The TypeScript adapter reuses existing private byte/provenance verification before the RPC, sends metadata only (never bytes/storage paths), and validates the exact database receipt/hash afterward. The adapter is not a provider call. Existing /api/chat remains untouched until governed multimodal integration is ready; no new HTTP write route is introduced.

Files:
- docs/sql/atlas-builder-reference-message-binding-proposed.sql (NOT a migration)
- apps/web/lib/website-build/assets/persist-reference-turn.ts + .test.ts
- apps/web/scripts/reference-binding-local-test.mjs
- apps/web/lib/website-build/assets/fixtures/reference-binding-bootstrap.sql

## Implementation and acceptance
1. Write adapter tests first; observe missing implementation RED.
2. Write isolated PostgreSQL runner with positive, invalid-source, owner/project/conversation isolation, exact/mutated replay, concurrent same-intent, direct API-role privilege and deletion tests. Observe missing RPC RED.
3. Implement SQL proposal + adapter, run both GREEN.
4. Run existing reference tests and scoped types; independent review and push same Draft PR.

## Security and resource bounds
- No production SQL, schema activation, credentials, provider cost or package install.
- PostgreSQL17 cached image only, network none, no published port/host volume, tmpfs, 256MiB/0.5 CPU, unique owned container and verified cleanup.
- SQL checks active project owner, conversation owner/project, ready tickets, private canonical Assets, provenance, exact SHA and 1-4 unique ordered references under locks before any insert.
- No direct anon/authenticated access or service-role INSERT/UPDATE/DELETE on manifest. Narrow service-role-only definer RPC. Supabase-style permissive defaults explicitly revoked.
- Message/parent/account deletion cascades remove manifests (no new deletion blocker); no manifest update API. Authenticated APIs never get new message rights.
- RPC owner parameter is ONLY supplied by authenticated server code, not request data.
- Budget/governance stop, model dispatch and authenticated browser integration remain later gates. This RPC is persistence, not execution authority.
- Synthetic PG role tests are not real Supabase Auth/JWT or PostgREST tests.

## Progress
Baseline reference suite previously 56/56. Full SQL fixture / whole-app typecheck limitations from prior delivery remain applicable; do not claim them green.

## Verified result
- New adapter suite first failed to load the missing implementation; implemented afterward. **17 adapter tests PASS**.
- Current reference + route/UI regression selection: **89/89 PASS**, 12 files, exit 0.
- Real cached PostgreSQL17: **17/17 grouped checks PASS**, exit 0. Covers Unicode/hash parity, atomic persistence, exact/mutated replay, two simultaneous same-intent requests, conflicting simultaneous intent (one winner), source revocation, API permissions, owner/project/conversation isolation, message deletion cascade and bounded lock waiting.
- Missing RPC was observed RED before implementation. Adversarial lifecycle owner test then exposed an actual bypass in the first SQL draft (owner filter hid an archived row); fixed with project-only lookup and explicit owner/state denial, retested GREEN.
- Lock-contention test observed RED (blocked call eventually committed); function now applies lock_timeout=2s and test confirms rollback/no partial message, GREEN.
- Scoped TypeScript source/test/dependency-graph check: PASS, exit 0, 768MiB heap. No full-app typecheck or broad full-suite pass claimed; prior fixture/memory limitations remain.
- Test containers: unique names, verified ownership label, no host port/volume/network, 256MiB and 0.5 CPU. Every actual test container was removed and its absence verified.
- No provider calls, new package install, production SQL or route activation.

## Read-only review and deferred minors
Fresh reviewer found no Critical issues and no Important issues remaining after lifecycle fix. Reviewer checked schema compatibility and code but did not independently run tests; parent executed the checks above.
1. Add foreign-owner ACTIVE lifecycle case; current archived case reproduces the original owner-filter bypass but does not independently pin a future state-only regression.
2. Harden cleanup for an ambiguous docker run response: a container created despite CLI timeout could remain when started=false. Normal/failed test runs in this session all verified cleanup.
3. Synthetic parent FKs differ from production and real provenance append-only triggers are absent. Provenance mutation tests model corruption, not an allowed production edit. Verified deletion coverage is message->manifest only, not full account/project erasure.
These limits remain blockers to broad production equivalence or activation claims.

## Rulings
- Keep DDL in docs/sql as an unactivated proposal. Cost: the app cannot call this RPC until migration/security/release review.
- Do not wire the existing asynchronous /api/chat persistence yet: doing so before governed image dispatch would risk duplicate messages or a paid text-only fallback that never saw the images. Cost: no browser-visible image conversation feature in this delivery.
- Reuse exact owner/conversation intent identity for retries after an ambiguous DB outcome; no automatic new key or paid retry. The SQL transaction is the canonical message-ID and manifest writer.
- Do not rerun known-blocked whole-repository suites; use relevant reference/HTTP regressions, real isolated PG assertions and scoped types for this change.
