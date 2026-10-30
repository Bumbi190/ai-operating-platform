# Web Studio real browser auth integration
**Goal:** actual Chromium password login -> real browser cookies -> unchanged Next middleware/router and reference routes -> private upload/select/save/reload/retry and cross-user denial.
**Execution:** superpowers:executing-plans inline in existing Draft PR368. Base61a2242. Existing v0.5 Studio spec and accepted auth-integration plan govern scope. One fresh review at end.
**Boundary:** a generated isolated Next14 app reexports production login, middleware, reference routes and chat; synthetic dashboard mounts actual reference components/controller. This proves those integrated modules, not the full production dashboard/layout or canonical migration replay.
**Constraints:** same worktree/PR, Linux ephemeral CI only, existing four-service fixture, no hosted endpoints/credentials/flags/SQL, provider calls, production merge or new paid services. Fresh credentials only. Browser denies external origins; server fetch guard and sanitized child env restrict provider traffic. Never upload cookie/trace/session artifacts. Runner owns and cleans its children/temp app/labelled stack.
## Tasks
1. Test server HTTP-origin guard RED -> implement allowlisted fetch guard, verify guard tests. Write browser acceptance tests before runner wiring.
2. Generated Next shell reuses exact middleware/login/routes/client/controller; SSR verifies real user and reads owner-scoped history. Real browser signout and refresh use Supabase browser client. Seed two real Auth users with separate owned projects so denial reaches route ownership logic as well as middleware. Add collaborator containment case with actual membership RLS.
3. Run serial Chromium against fresh stack in existing CI job: login invalid/valid, cookie SSR, private upload+ordered selection+lost response+reload retry exactly once, changed manifest409, other user404, forged/absent session401, real refresh and signout. Allow only loopback app/gateway origins; no response mocks except deliberate loss AFTER real commit.
4. Relevant regressions/types + project test command; fresh read-only review; fix Important findings with RED/GREEN; commit/push same PR, inspect exact-SHA checks; update PR and Notion.
## Review focus
- Generated app must import actual production modules and keep framework cookie storage/middleware real; no identity injected from test or service role exposed to browser.
- Cookie refresh must change browser cookies and retain authenticated server access; signout/second user must not see first user's retained intent.
- Lost HTTP response must follow real server commit; retry count/order proof must use actual database-backed state, not mocked response.
- Environment/origin guards prevent hosted/provider access. Ownership-proven cleanup on failed startup/tests, preserve unrelated containers/processes.
## Pre-flight
Existing stack -> runner {url,anonKey,serviceKey,sql,close} matches. Existing controller -> SSR saved rows include canonical IDs. Missing membership table would exercise owner compatibility only: add an explicitly synthetic RLS membership table for collaborator branch. No production schemas or policies changed.
Plan self-review: isolated shell clearly delimits production-layout gap; actual production imports and real Next cookie handling are required, no Vite aliases. Existing RAM limits rule out running stack on Hultgren.
