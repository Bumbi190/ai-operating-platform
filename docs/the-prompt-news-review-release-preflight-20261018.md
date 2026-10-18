# The Prompt release preflight and sampled regression triage

Owner requested continued work at20:05 Europe/Stockholm on18 October2026. Source inspected and tested:38a84d2be1b44d446a6706e520f77f69306fc84d plus the two test-only corrections described below. No product runtime or SQL source changed.

## Actual baseline comparison

A private temporary index materialized exact canonical main e2316f1eb2a018ce968122eb4d6095b433c0e43c, the baseline used by the original broad run. This did not change the real index/branch or create another worktree. All eight compared test files had identical bytes before the correction. Both sources used the same already-installed dependencies and original Windows command environment. Parallel baseline/feature runs executed506 cases each:

| Source | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline e2316f1 |400|106|0|
| Feature38a84d2 before correction |399|107|0|

106 case names failed on both sources;105 of those are exact cases from the original377-failure appendix. Matching failure status does not alone prove identical root cause or harmlessness. One extra shared timeout appeared during this concurrent diagnostic run; it is not silently added to the original broad totals. No full baseline-suite or all365 unresolved-failures exoneration is claimed.

One feature-only failure was the old G5 source assertion in external-dispatch-guards.test.ts, 'step3 binds the row it already loaded'. It expected the image call to end at its fourth execution argument. The implementation intentionally supplies a separate fifth billing reference. Execution remains scoped to the row's own project.

## Correction and real boundary proof

The obsolete exact-call string assertion is replaced by an actual step3-handler case in external-dispatch-stop.test.ts. The case drives a row without images, then verifies the image-provider boundary receives the row's execution project and separate billing reference and that the handler completes. Existing scope tripwires remain.

The real provider/storage/DB boundaries are faked, not the handler or projectScope. No provider network or paid work is performed. Test passed with actual source, failed when only the image-call execution scope was temporarily changed to the billing project, then passed after exact byte restoration. The full32-test dispatch-stop suite passes without skips. No production file remains mutated.

The initial test-writing attempt used an unsupported Vitest matcher; that was a test error, not a product RED. It was corrected to supported call-count/argument assertions before the mutation check.

## Windows tool diagnosis

Native Windows FIND was being selected by tests expecting GNU find; grep was absent from the original search path. Repeating the three actual inventory/auth suites with the existing Git-for-Windows usr/bin directory first in the child process PATH gives:

| Source | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline, GNU tools |58|0|0|
| Corrected feature, GNU tools |58|0|0|

This covers admission-inventory.test.ts, external-dispatch-guards.test.ts and global-auth-retired.test.ts. No suite was disabled and no product change was made for these tool errors. Before this environment correction, the updated dispatch-guards file had36 passes /4 Windows FIND failures, all four named in the original appendix.

The hardcoded Unix-tool assumptions in other broker tests, stale historical source pins and all other original failures remain recorded and are not automatically waived. The original broad run stays red; it was not rerun wholesale. See [all original failed cases](the-prompt-news-review-broad-test-failures.md).

## Fresh schema proof

The canonical test-website-build-db.mjs setup passed its actual SQL/RLS/cancellation/concurrent-commit checks and created owned loopback fixture website_test_1792347089741. This is an isolated platform fixture with canonical helper prerequisites, not a full empty-database replay of every Supabase migration.

Then the unchanged exact news migration was installed by the existing test helper. Actual news store, API and independent-connection review-race tests: **24/24 PASS**, zero skips. Full web TypeScript also PASS after the test correction. Earlier154/256/Remotion results retain their original scopes; they were not restated as new full-suite results here.

## Read-only hosted preflight

Target confirmed from connected project inventory: AI Operating Platform, iboepohjwrhtgshrqaol, PostgreSQL17.6. Only catalogue/count queries and security advisors were used.

- New evidence table absent; migration-name count0.
- Reserved adapter_version the-prompt-review-admission-v1 provenance count0.
- Existing social_content_requirements/read/decide routine bodies match the canonical pre-news migration exactly by SHA256 of normalized UTF-8 prosrc.
- All three are SECURITY INVOKER with empty search_path; anon/authenticated EXECUTE false, service_role EXECUTE true.
- No hosted mutation, receipt, script edit, private-preview promotion or deployment was performed.

| Existing routine body | SHA256 |
| --- | --- |
| social_content_decide | bb5d8c2f0d1f82a8efe8a6374daf65e1602b52edc8b04c74d95cb5127cf90b49 |
| social_content_read | f78222379391265c777ba87231c5012a61c5400f3fdb626d547c610685250446 |
| social_content_requirements | 73a22b8f1d0c84c7fcd699b07912964309d1254fb59e31cd006511b051072960 |

Security advisors report existing findings, not a clean-platform PASS:120 INFO no-policy findings;20 mutable-search-path warnings;7 anon SECURITY DEFINER execution warnings;8 authenticated SECURITY DEFINER execution warnings;1 leaked-password-protection warning. No ERROR group was returned. Some findings overlap routines and counts are not distinct vulnerabilities. The proposed news objects are absent, so current hosted advisors do not validate their future installed state. None of these platform settings/functions were changed here.

## Approval boundary

The [concrete schema-only request](the-prompt-news-review-production-migration-request.md) is now reviewable. It does not request main merge, application deployment, paid generation, intake of a real movie or trial/social activation. Draft remains draft. The original Anthropic movie remains an approved technical sample after its18:26 freshness deadline.

## Exact original failure cases reproduced on both sources

- aktivitet · the rollback body is the body it replaced is pinned by hash
- G3C-2A · run admission has exactly one door no runtime module writes runs.status = running directly
- G3C-2A · run admission has exactly one door the drain is the only caller, and it goes through the canonical RPC
- G3C-2A · run admission has exactly one door no runtime module claims a due workflow instance outside the RPC
- G3C-2A · run admission has exactly one door queueing a run remains open — it is control-plane state, not execution
- atlas chat · the route contract it speaks emits the transcript events and the two typed website effects
- atlas chat · the route contract it speaks does not observe a client abort — which is why there is no stop control
- canonical comments describe the FINAL code states the invariant it actually implements, in the TOP-LEVEL header
- canonical comments describe the FINAL code gives the stale-open reason wherever stale replay is described
- G1 · every external write in the tree has a canonical dispatch boundary every external write CALL SITE has its own authorization
- G1 · every external write in the tree has a canonical dispatch boundary the inventory itself is non-empty and finds the known callers
- G1 · every external write in the tree has a canonical dispatch boundary no governance assertion is parked behind an unreachable branch
- G4 · the legacy global-only helper is no longer an authority no runtime module calls checkAutomationPaused
- the global key verifier is gone no PRODUCTION module defines the helpers
- the global key verifier is gone no production module reads the global key from the environment
- no route can reach a global key path finds route files at all — the scan must be able to fail
- no route can reach a global key path zero routes call the helpers, directly or via one hop
- no route can reach a global key path zero route files import from api-auth for anything but cron
- the cron class survived the deletion cron routes still use CRON_SECRET directly
- v1 is registered in production and must not move MUTATION — the v1 YAML still hashes to the pinned upstream value
- v2 is vendored, never authored here the vendored YAML matches the pinned upstream hash
- v2 is vendored, never authored here the committed JSON is the generated form of the vendored YAML
- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller resolves only from fixed absolute candidates and issues an unforgeable-by-shape tool
- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller refuses relative, missing, non-regular, non-executable, group/other-writable, foreign-owned and unsafe-ancestor candidates
- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller follows a symlink to its real target and judges the target (a link cannot launder trust)
- SDF-1C3A trusted toolchain: git and docker are never chosen by a caller the runner refuses a tool object that did not come from the resolver
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment only a broker-made command can run, and run() takes nothing but the command (no env, args or executable)
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment never enables a shell and runs exactly the trusted executable with direct argv
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment does not inherit the parent environment: secrets in process.env never reach a child
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment bounds stdout/stderr before returning
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a timeout kills the child (TERM, then KILL) and reports timedOut
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment logs nothing and never puts a command line or secret in a result or thrown message
- SDF-1C3A infrastructure process runner: closed commands, no shell, scratch environment a planted user gitconfig, hooks, filters and credential helper are unreachable (real git)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) prepares a worktree at exactly the pinned commit with a closed, path-free result
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) is deterministic: same work → same branch, directory and hashes
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts only trusted structured input; the caller cannot choose branch, directory, parent or arguments
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (uppercase)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (39 chars)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (41 chars)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (abbreviated)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (a ref name)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (non-hex)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (option-like)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) requires a full lowercase SHA pin (empty)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a pin that is not a commit object present locally (missing, blob, tree, annotated tag) and never fetches
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) returns STALE_BASE, exactly and without fetching, when the approved base ref moved
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) needs no network at all (an unreachable origin cannot matter)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses wrong host
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses file remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses plain path remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses credentials in URL
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses sub-path
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) accepts SCP, ssh and case-different forms of the SAME identity, and refuses a second identity or a missing remote
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (filter driver) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (fsmonitor) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (hooksPath) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (credential helper) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (include) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (ssh command) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a repository whose own config launches programs (shell alias) before creating anything
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked, non-directory, non-canonical or non-repository root, and a linked worktree used as root
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses a missing, symlinked or non-canonical worktree parent and never creates it
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) refuses every collision without touching the existing state (path, dangling link, file, branch, worktree)
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) a worktree elsewhere already holding the branch or the path is a conflict
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) does not follow a symlink planted in the future target path
- SDF-1C3A repository proof, pinned base and isolated worktree (synthetic repositories) verifies after creation and, on any failed check, keeps the workspace (explicit_cleanup_only) and says so
- SDF-1C3A real-filesystem containment primitives verifies canonical roots only
- SDF-1C3A real-filesystem containment primitives reads existing files only when no segment is a symlink and the realpath is the lexical path
- SDF-1C3A real-filesystem containment primitives a write-intent check additionally refuses hardlinks and non-regular files
- SDF-1C3A real-filesystem containment primitives verifies a prospective create against its deepest existing ancestor
- SDF-1C3A real-filesystem containment primitives refuses NUL
- SDF-1C3A real-filesystem containment primitives refuses newline
- SDF-1C3A real-filesystem containment primitives refuses tab
- SDF-1C3A real-filesystem containment primitives refuses DEL
- SDF-1C3A real-filesystem containment primitives refuses parent traversal
- SDF-1C3A real-filesystem containment primitives refuses embedded traversal
- SDF-1C3A real-filesystem containment primitives refuses absolute
- SDF-1C3A real-filesystem containment primitives refuses double slash
- SDF-1C3A real-filesystem containment primitives refuses dot segment
- SDF-1C3A real-filesystem containment primitives refuses trailing slash
- SDF-1C3A real-filesystem containment primitives refuses backslash
- SDF-1C3A real-filesystem containment primitives refuses windows drive
- SDF-1C3A real-filesystem containment primitives refuses empty
- SDF-1C3A real-filesystem containment primitives refuses surrounding space
- SDF-1C3A real-filesystem containment primitives refuses non-NFC (NFD é)
- SDF-1C3A real-filesystem containment primitives refuses .git
- SDF-1C3A real-filesystem containment primitives refuses nested .git
- SDF-1C3A real-filesystem containment primitives refuses .GIT case
- SDF-1C3A real-filesystem containment primitives refuses .env
- SDF-1C3A real-filesystem containment primitives refuses .env.local
- SDF-1C3A real-filesystem containment primitives refuses .ENV.production
- SDF-1C3A real-filesystem containment primitives refuses .ssh
- SDF-1C3A real-filesystem containment primitives refuses .aws
- SDF-1C3A real-filesystem containment primitives refuses secrets dir
- SDF-1C3A real-filesystem containment primitives refuses pem
- SDF-1C3A real-filesystem containment primitives refuses key
- SDF-1C3A real-filesystem containment primitives refuses service account
- SDF-1C3A real-filesystem containment primitives refuses not a string
- SDF-1C3A real-filesystem containment primitives accepts ordinary NFC unicode names
- SDF-1C3A real-filesystem containment primitives opens for reading with O_NOFOLLOW and refuses a final component that became a symlink
- SDF-1C3A SandboxSpec and Docker command construction refuses every docker verb outside the closed set and every malformed target
- SDF-1C3A Docker host proof (VM-backed Docker Desktop required for production) derives the daemon socket only from a fixed host-side list (no DOCKER_HOST, no remote, no other socket)
- SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution adds no broker route, and the route set is exactly the 1C2 control channel
- SDF-1C3A boundary: no production caller, no route, no CLI command, no migration, no execution only the approved isolation modules can ISSUE an InfraCommand: brokerCommand is not reachable from any other production module

## Additional shared diagnostic failures, outside the original appendix

- aktivitet · the rendered surface states that no agent is recorded
