# Family weekly preparation validation — 2026-10-26

Scope: approved on-demand Atlas weekly marketing preparation using existing described owned JPEG assets, saved project facts, new draft captions and native editorial/schedule review. No recurring producer, paid image generation, content approval, schedule authority or provider send is introduced.

Implemented pure Stockholm vacancy planner, server-scoped context/save tools in both Atlas chat prompt modes, project/week/generation1 atomic registry and service-only SQL RPCs. Full weeks yield no new draft slots. Same payload replays saved post IDs across transport keys/conversations. Conflicting generation1 payload is refused. Preparation is atomic and separate from both editorial decisions and executable schedules.

Rulings in implementation ledger: generation1 only; later replacement generations require future explicit native action. Without an established verified server-readable month catalog, new month slots return monthly_catalog_missing; they cannot be silently classified ordinary or invented. Existing approved month jobs are unchanged. Existing individual content edit tools remain available for requested edits.

Verification completed:
-14 weekly planner/service/tool tests,39 migration guard,76 schema security invariant,134 migration security gate =263 passing tests.
-Separate TypeScript check passed.
-One Chromium test passed showing a weekly image draft in native editorial review, ineligible for schedule preparation until editorial approval, followed by a separate propose-only schedule request.
-Full recovered177-entry historical SQL replay passed with repeat guard, Instagram reconciliation and cancelled-reservation repair. Weekly canonical probes passed for atomic four-draft save, identical replay, changed retry conflict, stale snapshot conflict, foreign-image rollback, foreign-conversation rejection, client-role execute refusal and no new queue/publication authority.
-Two independent PostgreSQL connections from different owned conversations returned exactly the same proposal IDs: one preparation, four new drafts, no extra queue jobs and zero publications. Synthetic source fixture includes one pre-existing future queue reservation.
-Independent review found post-vs-revision occupancy omission and missing pinned-job text comparison. Regression observed fail then pass; fixes include revision IDs and exact pinned snapshots. Follow-up review found no remaining important issue and independently ran14/14 weekly tests.
-Added exact pinned-job duplicate refusal and near pinned-job text review assertion; final expanded SQL replay passed, including similar_recent_content on the pinned-job comparison.
-Production build passed with synthetic build settings; build skips lint/typechecking, so tsc was run separately.

Test setup corrections: baseline SQL run intentionally failed on missing weekly RPC. First installed run correctly refused invoking pure repeat helpers as service_role; migration now explicitly grants only those data-free comparisons to service_role. Initial registry entry was incorrectly placed in live-catalog map; corrected to created_not_live, with intended SERVER_ONLY class. One TypeScript mock signature and one ambiguous browser button selector corrected. No hosted feature migration applied and no live preparation created.

Known boundaries: SQL phrase similarity follows existing trigram thresholds, not semantic embeddings. Source references bind drafts to available profile/asset context for human review; they do not prove every natural-language claim. The service fails closed on source truncation or missing facts/images/accounts. Final build and SQL results are green; deployment remains a separate authorized step.

Release checkpoint2026-10-26: owner explicitly authorized GitHub upload and database/deployment. PR549 opened. family_weekly_preparation applied. Live catalog verified server-only table (RLS, zero policies, no anon/auth privileges, service SELECT/INSERT). Service-role read-only context for Nov2 week returned42posts,20described eligible images, approved channel plan and exactly Wed4/Sun8 paired reservations, no saved preparation. Registry moved from created_not_live to observed live classification. No drafts/jobs/provider writes created by smoke-read. CI and production release pending.

CI correction: website-studio prompt economy test caught the full weekly guide inflating its system prompt to10160characters (limit9000). Kept the short existing social guide/tool descriptions in Studio and the full weekly guide in normal Atlas project chat. Observed the exact assertion fail locally, then50 focused chat/weekly tests passed; Studio8886characters and normal Atlas21624. Test threshold unchanged.
