# Media-news SQL review dependencies — bounded catalog audit

**23 October 2026 · PR #504 · TEST-ONLY · NO PRODUCTION ACTIVATION**

## Why this function set is part of the calendar safety boundary

The calendar's `social_schedule_authority` and `social_schedule_item_guard`
re-check approved content before scheduling or public release.
`social_schedule_item_guard` uses `social_content_requirements`.
The latter invokes `media_news_review_requirements` for revisions that
participate in The Prompt's news-video admission flow. That validator
in turn invokes three additional SQL routines which had not previously
been pinned. They matter to the shared social-content admission logic
even though a normal Familje-Stunden image post is not a news-video.

| Function | Role in existing migrations | Independent checks |
|---|---|---|
| `media_news_canonical_json(jsonb)` | Canonicalize recursively ordered JSON for evidence hash comparisons | Immutable, STRICT, ordered object keys using `COLLATE "C"`, array ordinality |
| `media_news_review_caption(media_scripts)` | Rebuild approved caption from script captions, hashtags and CTA | Immutable, ordered text components |
| `media_news_snapshot_requirements(uuid,jsonb)` | Reject changed/invalid news video source, voice, asset, provenance, usage, account/plan and release-state evidence | Volatile, source age, private video and reference assets, provenance and costs, approved plan and active destination |

The snapshot validator cross-checks the original The Prompt receipt,
render/video metadata, 48-hour freshness of the news source, asset
provenance including adapter version and simulated flag, cost-event
references, plan revision and destination-account binding. It returns
`news_evidence_invalid`, `news_evidence_changed`,
`news_source_expired` or `news_project_stopped` when evidence
is not usable. These are **internal creative/source evidence gates**:
none of them authenticate a Facebook/Instagram *publishing receipt*.

## Audit rules

The new `apps/web/scripts/calendar-media-news-callees-audit.mjs`
uses a read-only SQL catalog query of `pg_proc`, `pg_namespace`,
`pg_language`, `pg_get_functiondef` and effective EXECUTE ACLs.
It compares exact names/signatures, `supabase_admin` owner in the
**isolated** fixture, `SECURITY INVOKER` mode, volatility, language,
empty `search_path`, STRICT on canonicalization, and absence of
any PUBLIC/anon/authenticated/scoped-worker/broker direct execute
grant. Its sole explicitly allowed API role is the existing
`service_role` in the fixture, not an endorsement of service-role
access in production.

It also inventories the schema-qualified SQL references and direct
qualified function calls. The snapshot function must continue
calling canonical JSON and caption reconstruction. Independent
semantic checks require ordering, provenance, source freshness,
cost/asset/plan/binding gates and stopped-project codes to remain
present. Exact `pg_get_functiondef` SHA-256 checks are added after
measuring the isolated PostgreSQL catalog; any code change after
pinning must be reviewed deliberately.

Security caveat: static body hashes and lexical call/reference
extraction are **change-control evidence, not formal verification**.
PL/pgSQL can contain implicit/unqualified calls or calls resolved
through runtime SQL that a regex-based dependency inventory cannot
fully prove. A privileged outer caller can execute `SECURITY INVOKER`
helpers with inherited elevated privileges, so these three bodies
remain security-sensitive despite the invoker declaration.

## Related boundaries and outstanding blockers

No Meta token, provider receipts, production SQL grants, hosted Auth
session, production PostgREST role, CI pipeline, public UI route, or
new agent autonomy is introduced. The repo's calendar runner is still
a disposable PostgreSQL/PostgREST replay with synthetic projects,
provider calls and independently scoped test JWTs.

The media/news review code also has provenance/evidence-write
triggers, which must be independently audited before any production
rollout. The separate May media migration baseline, hosted
permissions, receipt authenticity (especially ambiguous send
results), account credentials, and Instagram multi-stage
finalization remain unresolved. Keep PR #504 DRAFT.

## Verified closed-replay result — 23 October 2026

The first full replay loaded the 151 canonical web migrations and 10
pinned historical root migrations into an owned, isolated PostgreSQL
database and measured actual `pg_get_functiondef` SHA-256 hashes,
function signatures, code references and effective role grants.
The reviewed catalog fingerprints were then pinned as:

| Function | PostgreSQL `pg_get_functiondef` SHA-256 |
|---|---|
| `media_news_canonical_json` | `0d841b2da4ae7e39e903cb34327a1d80e0f62ffdaa8e78ab89bcf943679a1d92` |
| `media_news_review_caption` | `0f98d7b5b4f85a0be71f00dac929b7eb11dec98d38f85d18cc7b357d7052bdb4` |
| `media_news_snapshot_requirements` | `5fae8e7ae4e6b4ae5238ff40d7a4960236a36981b6267e31cf2e19495a40d32a` |

The **second complete replay** with all pins enforced ended with
`CROSS-TREE MEDIA NEWS CALLEE PASS`,
`CROSS-TREE POSTGREST APPLICATION WORKER PASS` and
`CROSS-TREE REPLAY PASS` (exit code **0**). It checked three
`SECURITY INVOKER` functions, **two direct qualified function calls**
and **17 qualified SQL references**. The canonical JSON routine
returned the expected deterministic result on an actual nested
Postgres JSONB object. The snapshot validator returned
`["news_evidence_invalid"]` for an invalid/incomplete
creative evidence object. No provider publish call was made.

There are **7/7** native security/audit tests, covering drift of
source/roles/signatures, JSON key and array ordering, caption
composition, image/video storage and provenance, cost references,
approved plan, active destination, source freshness, and project
stop state. All **55/55** targeted calendar Vitest tests passed,
with the four environment-gated integration checks exercised in
the full replay rather than ordinary unit mode.

The three media-news functions have no direct `PUBLIC`, `anon`,
`authenticated`, scoped calendar worker, reviewer, operator or
broker EXECUTE grants in the isolated role map; `service_role`
still has the existing internal permission. The additional
`media_news_snapshot_requirements` qualified references cover
`public.assets`, `public.asset_provenance`,
`public.cost_events`, current launch plan and account bindings,
and media scripts/news. They do **not** directly reference
`public.platform_tokens`.

**Important interpretation:** The receipt inside this media-news
audit is a *creative/render/source receipt*, NOT an authenticated
Meta post-publishing receipt. This does not enable autonomous
posting, resolve an unknown Meta dispatch result, or establish that
hosted Supabase role boundaries match the isolated fixtures.

The next privileged area to review includes the evidence/provenance
table triggers and the downstream media-news snapshot dependencies,
plus reconciliation of the historical May media migration baseline.
A real provider-confirmed receipt path and independent broker remain
prerequisites for any production cutover. No production SQL, grants,
secrets, calendar UI routes or provider accounts changed.
