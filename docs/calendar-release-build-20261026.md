# Calendar release build — 2026-10-26

Release branch: `codex/calendar-release-20261025`. Current main `56d4ab1e131bf1d5c5164538d3c1470fa7ac0cbb` merged without conflict; its article-read deadline change remains intact.

## Fresh build and tests

- Exported tracked candidate into a separate build directory; no shared dependency junction modified.
- `npm ci --ignore-scripts --no-audit --no-fund` installed 949 locked packages. An initial invocation ran before archive extraction had finished and found no lockfile; installation was rerun after extraction completed.
- `tsc --noEmit --pretty false` passed with zero errors, including after merging current main. Previous missing-package errors were local dependency installation issues.
- `npm run build` passed through optimized compilation, all 64 static pages and build tracing. Synthetic localhost Supabase URL and noncredential anonymous key supplied only to this process; no production keys or connection used. This confirms buildability, not hosted acceptance. Initial build without these public configuration values failed on the existing password pages. Transient Google font requests retried successfully.
- 130 tests in 14 focused suites passed on the integrated candidate: the calendar/story 119 plus 11 tests covering the newly merged main change.
- Prior candidate evidence remains 27 calendar browser tests and adapted local PostgreSQL replay: 177 historical entries, 29 human-start SQL cases, 16 owner/provenance cases. Those were not rerun merely for the unrelated article deadline change.
- Existing Supabase Edge-runtime `process.version` warning remains. Next config skips types/lint in build; the independent passing typecheck above is therefore required evidence.

## Read-only production catalog review

Supabase `iboepohjwrhtgshrqaol` still has migration head `20261023100514`. New human-request and approval tables are absent. Current deferred run provenance trigger/function matches the original autonomy-only prerequisite, is owned by postgres, has an empty search path and postgres-only EXECUTE. Calendar validator is an invoker function, empty search path, EXECUTE restricted to postgres/authenticated. Calendar table RLS is enabled; anon/authenticated lack BYPASSRLS. Existing survival anchor/fence and authority-deadline helpers are present. New functions explicitly revoke default public rights; proposal creation is service-only and approval is authenticated-only with current owner/session checks.

Security advisor baseline was read, not modified: 127 informational RLS-without-policy findings, 20 mutable-search-path warnings, seven anonymous and eight authenticated definer-execution warnings, and one leaked-password-protection warning. This is a prechange baseline, not a clean security report; postmigration ACL/advisor verification is still required. [Supabase advisory reference](https://supabase.com/docs/guides/database/database-linter).

## Deployment boundary

This work does not deploy code, apply hosted SQL, activate financial flags or start a paid job. Release requires migration-before-code coordination for the three additive migrations, target type regeneration and authenticated hosted acceptance. Existing adapted replay remains `replayReady:false` and does not prove hosted parity. The proposed release is held as a draft review until those checks pass.
