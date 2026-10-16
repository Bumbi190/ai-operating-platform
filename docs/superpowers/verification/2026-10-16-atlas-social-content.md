# Atlas social content preparation — verification 2026-10-16

Scope: preparation only. Real account connections and actual social publication remain postponed by André. No publisher, social provider write, paid generation, budget change or The Prompt authority change is included.

## Implemented behavior
- Project-owned immutable content revisions and exact editorial decisions; current approved channel plan and actual destination binding/media metadata are pinned.
- Read/propose-only Atlas tools; operator UI reviews exact saved content.
- Existing registered project assets can be reused and privately previewed after actual byte/checksum verification. Assets up to 50MiB use a streamed response in bounded chunks.
- Intended calendar uses Europe/Stockholm, stored UTC, and rejects ambiguous/nonexistent local times.
- No executable delivery schedule is created. All read models retain dispatchEnabled=false and publicationReady=false; account/activation requirements remain visible.
- Failed saves, project changes and workspace tab navigation retain/isolate drafts. Refresh and write responses are sequenced; mutations are disabled during refresh.

## Evidence
- Main baseline 9a1cb9a: 84/84 existing social unit and real SQL checks passed after initializing the canonical local planning/studio/saved-draft fixture prerequisites.
- Pre-review aggregate: 186/186 social/content/connection/chat/migration tests passed in 19 files, real isolated local Postgres included.
- Post-review affected aggregate: 72/72 content/SQL/API/Atlas/media/migration tests passed; TypeScript passed.
- Browser: 8/8 content tests at mobile390 and desktop1440; 5/5 existing channel and 6/6 existing connection tests.
- Additional isolation: 114/115 initially passed; one Atlas-page context test hit the existing 5-second test budget during parallel checks. That entire file passed 25/25 when run alone, without changing timeouts.
- Targeted Next standard lint profile: zero errors, two advisories (stable sequence ref cleanup and intentionally native image preview for authenticated media). Repository has no committed ESLint configuration; the temporary review profile is not product configuration.
- First CI isolation run: 1060/1061 passed; the new table entries were correct but registry total_tables still said 115 instead of118. Corrected the metadata count and added the scoped production observation note; the schema and migration security suites then passed209/209 locally. All other first-pass CI checks, including UI, passed.
- git diff --check passed.

## Independent review
Exact reviewed range: 9a1cb9a..a9e0e1c. One fresh reviewer found no Critical and two Important findings:
1. A held refresh could overwrite a completed approval. Browser regression failed on the old code, then passed after loading gates, monotonic response sequencing and aborted-response checks.
2. A fixed-length media response could exceed Vercel's ordinary 4.5MB response limit. A 5MiB fixture failed before the change, then passed with checksum-first, bounded streaming and no fixed content length.
No re-review was requested; affected tests and TypeScript verified the fix pass.

Deferred minor: the expiry retry regression advances the JavaScript clock, not PostgreSQL's clock. It proves the application validation boundary; the SQL's idempotency-before-time-validation ordering was inspected and other SQL retry behavior is tested. Real expired-time database replay was not separately exercised.

## Production schema preflight
Supabase project iboepohjwrhtgshrqaol. Additive migration social_content_preparation_v1 applied as ledger version 20261016103411. Canonical SQL SHA256:
638305f235bc453729bc3fd414faf602a536854342220d8e5ade9e34ce40d967
The stored migration statement hash matches exactly. All three tables have RLS, no anonymous/authenticated reads; all six new functions are SECURITY INVOKER with empty search_path and no anonymous/authenticated execution. Zero content posts were created. Security advisor categories are unchanged from preflight.
Application release and authenticated operator use are separate from this schema verification.

## Limits
No real social account/provider activation, public post, paid model/media test or live media-delivery test was performed. Actual existing assets must be in the canonical project asset registry; a media brief is only an idea. Live posting and future provider-specific publication checks belong to the later activation/delivery track.

Sources for streaming deployment contract: https://vercel.com/docs/functions/limitations and https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions.
