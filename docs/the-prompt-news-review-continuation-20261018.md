# The Prompt continuation: canonical migration-source integration

Continuation requested by Andre on 18 October 2026 at 19:58 Europe/Stockholm. Existing spec, implementation and unchanged film approval remain valid. No new feature, migration application or release is authorized by this source integration.

## Observed source and change

- Prior feature head: d12a2c97bc82ab77a33cc1f9a25aa64b580acb23; worktree and remote feature ref matched and were clean.
- Canonical main advanced from e2316f1 to 34d21cde97aa1c25a6d34a613657d8aee91f8591 via PR403.
- Main contains the owning workstream's already-applied sales_reply_sending source and registry classification; no sales runtime or news runtime changed.
- Merged main into the isolated feature branch, resolving three conflicts in migration guard policy/tests and schema registry. Both histories are preserved.
- Canonical corpus is now 147 SQL files / 133 enforced names. Frozen grandfathered14 / legacy30 lists remain unchanged.
- The captured production-ledger fixture remains unchanged. Tests include the known sales source but still require the separate news migration; only a clearly hypothetical post-apply ledger passes.
- New evidence remains created-not-live / SERVER_ONLY, absent from the observed-live table map. Main's three sales_send table classifications and its scoped observation notes are retained.

## Fresh verification

Initial combined-source test collection failed as intended: canonical SQL count drifted, expected146 / actual147. Resolved count expectations without changing either frozen exception list.

After resolution: **256/256 PASS across seven files**, zero failures/skips (33 migration guard,133 security gate,76 registry invariants,14 news admission/contract/verification/panel tests). Full web TypeScript PASS, exit0. Git whitespace check PASS.

Actual command from apps/web:

    node ../../node_modules/vitest/vitest.mjs run --no-file-parallelism lib/qa/migration-guard-v2.test.ts lib/qa/migration-security-gate.test.ts lib/qa/schema-security-invariant.test.ts lib/social-launch/news-review/contract.test.ts lib/social-launch/news-review/verify.test.ts lib/social-launch/news-review/admission.test.ts lib/social-launch/news-review/panel.test.ts

The broad web suite, SQL integration and Remotion suites were not rerun for this source/metadata-only integration. Their earlier results retain their original scope, including unresolved broad failures; see [validation](the-prompt-news-review-validation.md) and [all broad failures](the-prompt-news-review-broad-test-failures.md). No all-suite, independent re-review or ready-to-merge claim is made.

Exact own pending SQL is unchanged: 35,199 bytes, SHA2569cfd8807817878d492814cc29240114c3e3101ac8504651f377f375089b63e52. Canonical upstream sales SQL equals origin/main byte for byte in the index:25,411 bytes, SHA25680158d54a4cc5d7f15901f0ed8e67dc7fa04a8738054e14fb1c7be1cf484e49e. Its Windows working-file CRLF representation is not its canonical Git artifact.

## Remaining release boundary

Draft PR remains draft. No feature merge into main, hosted SQL, production deploy, paid generation, operator admission, social dispatch, scheduling or trial activation was performed.

The Anthropic sample passed its48-hour original-source limit at18:26 Europe/Stockholm; it remains an approved technical sample, not fresh news. Remaining work: unresolved release checks, exact separately reviewed production migration/target validation, real fresh-news evidence, authenticated deployment review, video transport, DST#378 and prospective metrics#383. Actual post-push preview result is recorded in PR/Notion.
