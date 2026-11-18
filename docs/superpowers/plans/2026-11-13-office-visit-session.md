# Office Visit Session Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Keep one explicitly selected Office identity connected while the verified game process lives, independently of its browser.
**Architecture:** Cookie-authenticated web approval creates a short server grant. A foreground Python companion owns its RAM-only secret, strict loopback pairing, process handle and single HTTPS polling writer. Existing native receiver and legacy browser relay retain their deadlines.
**Tech Stack:** Existing Next.js/Supabase clients, PostgreSQL, Python 3.12 standard library, Windows APIs; no new product dependency.
**Spec:** docs/superpowers/specs/2026-11-13-office-visit-session-design.md

## Global Constraints
- Local implementation/testing only; no commit/push/deploy, production/schema activation, actual grant, installed URI update or Nova/Harvey changes.
- One office-familje-pling + owned project + registered agent; identity only, work unverified.
- Four-hour hard expiry; 30-second nonrevivable server lease; unchanged 20-second native projection; 8-second sequential refresh; 5-second HTTPS timeout; process monitor 250ms; startup 90s.
- Exact production HTTPS origin and fixed Office endpoints; no redirects, cookie/token copying, credentials in files/logs/URL, broad API authentication or caller commands.
- Private RLS grant metadata, server-role-only RPC, auth.sessions/owner/agent membership rechecked atomically.
- Five creates per five minutes, at most100 owner metadata rows, bounded lazy cleanup; no cron.
- Preserve existing launch-only URI, native map/assets, legacy transport and exclusive writer lock.

## Review Focus
- Response arrives after observed game exit: discard without writing; Task3 lifecycle test.
- Duplicate JSON keys/oversized chunked input: reject before session creation; Task2 boundary test.
- Browser closes between create and attach: pending stop revokes; Task4 race test.
- Wall clock rollback/suspend: monotonic bound plus source/lease times fail closed; Task3 test.
- Same-owner concurrent create and transfer of agent/project: serialized grant replacement and current ownership; Task1 SQL test.

---

### Task 1: Atomic database authorization
**Files:** Create CLI-named apps/web/supabase/migrations/*_office_visit_sessions.sql; scripts/office-launcher/test_office_visit_sql.py.
**Interfaces:** service-only office_visit_create(owner,session,visit,digest,project,agent,avatar), office_visit_presence(visit,digest), office_visit_revoke(visit,digest,owner,session). Return minimal JSON row or denied; no secrets. RPC arguments prefixed p_.
- [x] Write disposable synthetic PG fixture assertions for absent feature, roles/RLS/search_path, scope/session mismatch, replacement/replay, lease/hard expiry, retention/rate.
- [x] Run fixture red; confirm feature absent, not connection failure.
- [x] Check cached CLI version/help; generate migration using migration new.
- [x] Implement private table/functions and public invoker wrappers, fully qualified names, explicit revocations.
- [x] Run SQL fixture green against isolated newly owned container; never touch shared containers.
- [x] Record evidence and retain uncommitted scope.

### Task 2: Dedicated web authorization boundary
**Files:** Create apps/web/lib/atlas/office/visits.ts; apps/web/lib/atlas/office/visit-server.ts; app/api/atlas/office/visits/{route.ts,presence/route.ts,revoke/route.ts}; scripts/office-launcher/test_office_visits.cjs.
**Interfaces:** createVisitHandlers(dependencies).create/presence/revoke(Request): Promise<Response>; validated minimal DTO from SQL row; visit credential X-Omnira-Office-Visit only.
- [x] Write HTTP Request tests covering auth, strict same origin, cookie/credential separation, bounded strict JSON, scope, no secret fields and DB errors.
- [x] Observe missing handlers red.
- [x] Implement strict parsing, verified getUser/getClaims matching, narrow typed RPC adapter and fixed routes; no global middleware bypass.
- [x] Run green with existing scoped Campus/middleware tests; check typecheck.
- [x] Record evidence and retain uncommitted scope.

### Task 3: Foreground process-owned native companion
**Files:** Create office_visit.py, office_visit_process.py, office_visit_relay.py and test_office_visit.py/test_office_visit_process.py in scripts/office-launcher.
**Interfaces:** VisitRelay(output,process,client) owns visitId/secret and protocol2 status/attach/disconnect; OfficeVisitClient.presence/revoke fixed routes; WindowsProcessLease.acquire(target,backend), alive(), close().
- [x] Write real loopback/filesystem tests: auth/Origin/Host, no S leakage, no legacy writes, one writer, native-only validated frame, observed exit/inflight discard, bounded revoke and expiry.
- [x] Observe missing companion red.
- [x] Implement process pin via Windows handle creation/executable identity, exact launcher match and monitor; CLI --visit verifies native before lock/start/browser.
- [x] Implement fixed HTTPS client (no redirects/5s/max32KB) and protocol2 loopback; sequential8s polling, four-hour monotonic cap and20s receiver.
- [x] Run all Python regressions and Windows handle tests against owned harmless fixture process; no game launch/real server grant.
- [x] Record evidence and retain uncommitted scope.

### Task 4: Explicit browser visit approval and compatibility
**Files:** Create apps/web/lib/atlas/office/visit-connection.ts; modify connection.ts and OfficeConnectionPanel.tsx minimally; create test_office_visit_connection.cjs; document candidate CLI/URI activation boundary.
**Interfaces:** probe supports protocol1/2; OfficeVisitConnection.start(selection), stop(), detach(); detach only preserves a native-acknowledged visit, pending close revokes.
- [x] Write browser controller race tests and real rendered panel checks for legacy/pending hide-stop vs confirmed detach and explicit disconnect.
- [x] Observe new behavior red.
- [x] Implement explicit create → attach → nativeack protocol and scoped confirmation; no browser snapshot publisher in visitmode.
- [x] Preserve existing launch-only URI unchanged; document separate future visit URI install with fixed module integrity rather than silently changing installed launcher.
- [x] Run scoped web/controller/middleware/Campus suites + typecheck and full Python suite.
- [x] Perform fresh whole-change review; fix important findings with failing regression tests, record exact limits and ready-to-review local scope. Do not commit/push or activate schema.

Local candidate verified; deployment, schema activation and URI installation are outside this completed local scope. See scripts/office-launcher/OFFICE_VISIT_LOCAL_CANDIDATE.md and ignored QA ledger for exact evidence/limits.
