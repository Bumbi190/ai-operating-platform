# The Prompt — read-only film preparation, 19 October 2026

André approved the bounded in-chat design at 08:43 Stockholm on 19 October 2026. Base: 44037e58a43a916cd5d56dbc7c640f705cf9d452. Initial implementation: ee2a53eb728cfb5d4b1d49dec213fba84822f772; reviewed validation-order fix: 8ac3c68ea5073e42180195f355aed4fc9e0be47b. This is a proposal builder in the existing content workflow, not the durable source/script/generation producer.

## Result

The local operator command authenticates through the existing operator helper. The adapter reuses actual project ownership/stop checks, social content reads and channel-plan reads. It requires the exact selected post/revision/SHA and a matching current approved plan, then compares the stored manuscript and original URL against a strict structured editorial brief.

The brief fixes English, Victoria, the approved smooth illustrated creative/composition and three distinct ordered scene briefs. Unknown evidence/authority fields are rejected. Source eligibility is checked using the existing original-time 48-hour rule and 15-minute future tolerance. Original-time eligibility is not proof that an operator's timestamp is authentic. Content/plan are read again and ownership/stop/freshness rechecked before returning.

Output includes a schema-projected fingerprint over the actual observed draft, plan decision and creative brief. Object key order and observation time do not change identity. It explicitly returns persisted:false, jobId:null, canGenerate:false, canPublish:false, and sourceVerification:operator_supplied_not_verified. The fingerprint is not a signature, immutable database record, budget reservation, generation permission, source verification or release receipt.

Mandatory blockers remain:
- SOURCE_REVERIFICATION_REQUIRED
- CANONICAL_NEWS_SCRIPT_PREPARATION_REQUIRED
- GENERATION_BUDGET_REQUIRED
- IMAGE_VOICE_USAGE_EVIDENCE_REQUIRED
- GENERATED_MEDIA_REQUIRED
- RENDER_QA_AND_REVIEW_REQUIRED

No insert/update/delete, provider generation, render, admission, public endpoint, UI, schema, scheduling or publication change was added. Read RPCs and their owner/stop helpers were inspected in the existing canonical SQL; no SQL was executed or applied for this task. Existing private preview inputs/identity/gallery and the already approved movie remain unchanged.

## Operator usage

From apps/web, with an already configured authorized local operator environment:

~~~powershell
node ../../node_modules/tsx/dist/cli.mjs --tsconfig scripts/tsconfig.operator.json scripts/the-prompt-prepare-film.ts --help
~~~

The command requires --project, --post, --revision, --sha256, --brief and --operator-jwt-file. It has no --apply mode. Token files are bounded to 16 KiB and briefs to 64 KiB; non-file/oversized inputs are refused. Help, invalid options, malformed UUID/SHA arguments and invalid brief schemas work without credentials or database configuration. Reference validation runs before file reads; shared brief parsing runs before JWT reads/admin creation/authentication. Errors emit a fixed code, not tokens, brief contents or raw exceptions.

Prepared editorial input: docs/the-prompt-film-brief-20261019.json. It contains the existing 79-word manuscript and three illustration briefs, without the historical preparation packet's obsolete pending channel-plan flag. It is operator-supplied planning data, not a publisher/rights attestation or produced media.

The previously saved target is post 0969de98-1685-4337-a6d4-3d9013c186c4, revision 8ee1011f-5b2c-4a01-b57c-22d80c4b4dc1, SHA256 1d91b9d1046c15068d9000440a9b91dab86c496183c7aeb9d22d044d0aa52a9c, project a8a1b1f6-c222-4893-9399-b1fb3bc2fa52. These are selectors expected by the command; they must match live current rows. This task does not claim a fresh authenticated successful production CLI execution.

## Fresh verification

- First functional RED: all 36 new cases failed against minimal empty API/CLI stubs, before the implementation. No missing-import failure was used as the proof.
- Initial GREEN: 36/36. Review added six real CLI cases that first failed (6 failed / 5 earlier passed), then passed after the validation-order fix. Final new coverage: 42/42, including actual read stores/ownership functions with only the external DB boundary substituted. Child-process tests invoke the real CLI without credentials.
- Nine complete affected web suites: 137/137 PASS, no skips. New cases are included in this count, not additional to it.
- Complete Remotion runtime suite: 168/168 PASS, no skips, before the final CLI-only validation-order correction. No Remotion/media-generation code changed.
- Full web TypeScript: final PASS. Initial check found the test child environment missing required NODE_ENV; corrected test harness and reran all nine suites and typecheck. The initial diagnostic is preserved.
- Editorial-lab and news-preview isolation contracts: PASS. Staged diff whitespace check: PASS.
- Existing Vite CJS deprecation and expected retry-fixture logging remain environment/test output; no clean-warning claim.
- No dependency installation; both task-owned temporary dependency junctions removed after target checks. Donor and real Remotion dependencies preserved; no test databases created by this task.

The DB double rejects unknown tables and write-capable RPCs. Tests cover foreign ownership, existing stop, old plan approval, changed revision/SHA, wrong destination, manuscript/URL mismatch, unsupported authority/evidence, invalid/stale/future source data, fingerprint stability/change and changes during reads. This proves the application path under controlled boundaries, not real database concurrency, production availability, JWT issuance, vendor billing or a generated movie. Repeated reads are observations, not an atomic guarantee against changes immediately after return. Any future writer must reauthorize, reverify source/freshness and atomically bind its inputs itself.

No fresh broad-web run or full Remotion compiler run. The previously documented 331 main-reproduced web failures and 22 shared Remotion compiler diagnostic occurrences remain unresolved limits. The historical full 335-failure run and named comparisons remain in docs/the-prompt-news-review-release-verification-20261018.md/json. This change does not make the broader draft PR release-ready.

## Independent review

The independent read-only review of 44037e5..ee2a53e found one Important issue: malformed full CLI inputs reached credential handling before semantic validation. No Critical or Minor findings. Root accepted the finding, reproduced it in six real-process RED cases and moved shared reference/brief parsing before credentials, retaining independent validation in the adapter.

A narrowly scoped read-only follow-up of ee2a53e..8ac3c68 confirmed the original finding resolved and found no new Critical/Important/Minor issues. Neither review reproduced tests, called providers, authenticated live operations, wrote state or reviewed the whole PR.

Disposition of every review limit:
- Publisher truth, timestamp authenticity and editorial accuracy were not judged. They remain unverified operator input and SOURCE_REVERIFICATION_REQUIRED; no publisher-proof or factual-clearance claim.
- Durable canonical production, budget, rights, generated media, render and publication were not judged. They remain expressly blocked future work; no acceptance or waiver for those stages.
- Production authentication/configuration and live database behavior were not judged. Only wiring inspected; no authenticated successful production CLI execution is claimed.
- Changes after final observation were not judged as atomic safety. The result is a read-only proposal, and every later writer must independently bind current inputs under its own transaction/authorization.
- Content approval/rejection was not treated as generation permission. This path grants none; a later generation writer must implement its own explicit authorization.
- Broader PR and historical test/compiler failures were not judged. They remain unresolved and the PR remains draft/unmerged.

## Remaining work and authority

A future writer must create genuine canonical news/manuscript rows and a separate durable, budget-authorized generation claim. It needs actual provider/account usage evidence, exact cost references, three new illustrations, Victoria receipt/word timings, render/full decode/QA, trusted admission and revision-bound destination review. The existing generic provider job engine is not already a Victoria/Ideogram episode producer. No fake workflow run or promotion of the old private_preview is acceptable.

The channel-plan decision is already complete and must not be requested again. No new paid generation budget was requested or granted by this design. The brief's supplied source timestamp reaches 48 hours on 20 October 2026 at 18:49 Stockholm; fresh retrieval must not reset that clock. Reverify source before any later consequential step and replace stale news when necessary.

PR #377 remains draft/unmerged. No live trial, transport activation, account change, schedule change, merge, migration or publication. Ordinary existing publishing schedules were not changed.

## Raw evidence hashes

Task-owned raw files remain under .superpowers/sdd/2026-10-19-film-preparation. None is a provider receipt or generation grant.

| File | SHA256 |
| --- | --- |
| red.json | ed37c208eb5ea960dfc31c43b248aef234f6c37d3714b914e221b30639f5276a |
| green.json | a8cdbfd6c058bb1064c202a5d42b4f6ac58f3d55970d6ee30cff8284df5b400a |
| review-red.json | 4b2bceb4ab3b16eaa379667cf6426767c50c8fb705ae54beb25cb71ff8ef74ca |
| review-green.json | 6a8ff0cb363b09e84a7fb1211490139b1641b17fa7920b8d6d31c1c3507ce7ab |
| typecheck-initial.log | 736bc58907bd63b83bc2a7d9e3c7e20c883c9f150bfec8f89f06528ea0efbf83 |
| typecheck-reviewed.log | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| remotion.log | 759eeb4bfc393f62e9cc94c9db617131abf94cf7b1357c5385d3dac5e1654126 |
