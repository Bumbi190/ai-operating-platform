# The Prompt news review: approved production migration

Owner approval:18 October2026 at20:20:51 Europe/Stockholm, response 'Jag godkanner :)' to the concrete schema-only request. The exact migration was applied through Supabase MCP at20:22:24 Europe/Stockholm.

Target: **AI Operating Platform / iboepohjwrhtgshrqaol**. Actual ledger version **20261018182224**, name **media_news_review_evidence**. Exactly one ledger statement: **35,199 bytes**, SHA256 **9cfd8807817878d492814cc29240114c3e3101ac8504651f377f375089b63e52**, matching the approved source file byte for byte.

Canonical source filename stays apps/web/supabase/migrations/20261018083917_media_news_review_evidence.sql. The tool assigned the actual later ledger timestamp; the statement identity and enforced name are exact. **Do not replay this already-applied SQL.**

Approval/source: [schema-only request](https://github.com/Bumbi190/ai-operating-platform/blob/d6ba32df2e4b37bd0cca69dd288c8619adfd9ead/docs/the-prompt-news-review-production-migration-request.md), [preflight](https://github.com/Bumbi190/ai-operating-platform/blob/d6ba32df2e4b37bd0cca69dd288c8619adfd9ead/docs/the-prompt-news-review-release-preflight-20261018.md).

## Installation verification

- Rechecked immediately before apply: no evidence table/ledger row, zero reserved producer claims, all three old content function bodies/ACL exactly matched canonical source.
- RLS enabled, zero policies and no anon/authenticated SELECT/INSERT. Service role SELECT/INSERT only; UPDATE/DELETE/TRUNCATE denied.
- Four insert/append-only/truncate/provenance guards enabled; all nine constraints validated, including composite revision/post/project/SHA FK.
- All13 installed function bodies match the approved source SHA256; all SECURITY INVOKER, empty search_path, no anon/authenticated EXECUTE and service_role EXECUTE.
- Actual service-role social_content_read on The Prompt passed inside a read-only transaction, with dispatchEnabled:false and publicationReady:false. Canonical-JSON result matched a hand-checked literal.
- Evidence rows0 and reserved admission provenance0 after apply. No script, decision, real movie or publication request was created.
- Captured actual170-name ledger passes the real repository guard; removing only the news name still fails. Historical160-name capture remains unchanged.
- Fresh source-metadata checks: **243/243 PASS** (34 guard +133 migration security +76 registry), no skips. Full web TypeScript PASS. These do not replace the separately recorded24-test local SQL proof or claim a new full web-suite run.

## Exact installed function fingerprints

| Routine | SHA256 of normalized UTF-8 body |
| --- | --- |
| media_news_canonical_json(jsonb) | 30bab5b5f63c39eabad420f1b8095cd4cdb618ec5f4c93f6129b6445525cec44 |
| media_news_review_caption(media_scripts) | 8bc3b5720cc70e85ccafe372839821b741295fc57e16e07f59efeb74757e93f1 |
| media_news_review_guard_evidence() | cd882ddccbb1a64813cc9d22597bd7c895a4c0830a34ca4eff72a5da20d3d21e |
| media_news_review_guard_provenance() | 39000b51eeb93e044a60fbae16fb6dc6ef3e3fa2fe6d18472656de0098666893 |
| media_news_review_lock_inputs(uuid,jsonb) | 8238a0e48a8baf9870dbadded830c322c0821009a1e936522873a0bd6105f53a |
| media_news_review_prepare(jsonb,jsonb,jsonb) | b91f52ef1df7fdf6834bcec3600d5219e57e03c4fe8850ea8ff71ef142775273 |
| media_news_review_read(jsonb,jsonb) | 9bf79f9cc8c9dfe57e89dfacf55ee8b3c9f5a558f26cc73c032cf6bc909c2a5d |
| media_news_review_reject_mutation() | d4a7c4bee4671c53212a23199bc6a4288fb12021c7ed19c1426ee64934ce01bc |
| media_news_review_requirements(uuid) | 5092ddef55cb9b1a6e4144284e3cea4ec528db93b0ef0e480b78646b3a58ad1c |
| media_news_snapshot_requirements(uuid,jsonb) | 4a1c417811b219e1c63e4ea6d41ee38e6dcd042dfc3fa95bbc3cfd7fd5a49c22 |
| social_content_decide(jsonb,jsonb) | 6dd883ec8f6d2da591cb7dd2dfa9612234b5d65b3ba8a5325cd2a18743b05eb1 |
| social_content_read(jsonb,jsonb) | 9224f1d4aae96c1673ed7e9a8732517631114090f29d3eb46f30a85d7ae9ffae |
| social_content_requirements(uuid) | 63013a28420532cdd08066d3a45617af19b85b8aabd88a8cfcc0975743f83b9a |

## Advisors before/after

| Group | Before | After |
| --- | ---: | ---: |
| Security: RLS enabled, no policy (INFO) |120|121|
| Security: mutable search_path (WARN) |20|20|
| Security: anon SECURITY DEFINER execution (WARN) |7|7|
| Security: authenticated SECURITY DEFINER execution (WARN) |8|8|
| Security: leaked-password protection (WARN) |1|1|
| Performance: unindexed foreign keys (INFO) |185|188|
| Performance: RLS initplan (WARN) |40|40|
| Performance: unused index (INFO) |78|79|
| Performance: table bloat (INFO) |1|1|
| Performance: absolute auth connections (INFO) |1|1|

No new security WARN/ERROR findings. The additional no-policy INFO reflects intentional server-only access, verified by grants. The three new FK-index INFO findings remain open: composite revision/post/project/SHA, script_id and video_asset_id. The new unused-index INFO refers to media_news_review_script_channel_idx on the empty new table. No extra index/schema SQL was authorized or applied to suppress these observations. Existing platform findings are not claimed resolved.

## Source reconciliation and remaining release boundary

The observed-live registry now classifies only this newly verified table as live SERVER_ONLY (173 recorded rows); older capture scopes remain unchanged. Canonical corpus147/enforced133; frozen14/30 lists unchanged. A separate source-only changeset from main34d21cd contains the exact SQL, guard/fixture/registry reconciliation and this evidence, without the illustrated-video application changes. Until that source is integrated into main, future main builds still lack the new enforced ledger name. Existing production application runtime was not deployed by this schema task.

Feature PR377 remains draft. No main merge, production app deployment, real movie admission, generation/spending, provider publishing, scheduling or seven-day-trial activation. Automatic branch previews from existing draft workflow are not production promotion. No authenticated deployed HTTP/browser check is claimed here.

The global generated Database bridge was not regenerated in this schema-only bookkeeping; the feature still uses its validated scoped RPC contracts. Canonical type regeneration belongs with the separately reviewed application integration. Actual whole-web broad failures remain documented in PR377; no ready-to-merge application claim is made.

Default rollback retains the SQL guards and immutable audit records while disabling new application intake/preparation. Never drop evidence or restore older permissive approval functions while protected news revisions could reach them. Any schema reversal needs a separately reviewed freeze/restoration plan.

The approved Anthropic movie remains a technical sample after its18:26 original-source age limit. Real fresh-news evidence, video transport, DST#378, metrics#383 and a concrete live release decision remain separate work.
