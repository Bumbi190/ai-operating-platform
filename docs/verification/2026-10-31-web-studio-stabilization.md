# Web Studio - CI blocker stabilization

Date: 2026-10-31. Baseline b3a607d49ad3833e9ddd8726562ba13e7feabda0; existing worktree atlas-builder-references-20261017 / draft PR #368. LOCAL checkpoint only. No push, main merge, deployment, new dependency, paid model call, production SQL mutation or emergency override.

## Three local fixes
1. RevenueLegacy now reads revenue events and token logs from its existing calendar-month boundary, matching displayed month-to-date totals. The former rolling30-day fetch lost first-day entries late on day31. Project filters, inner ownership join, pricing, seven-day run count and existing local-calendar timezone convention stay unchanged.
2. The desktop Studio header uses bounded grid columns and less vertical padding. Long native-select options no longer force controls into another band. No controls, warnings or stop actions were hidden. Mobile rules and the original >=300px desktop-preview assertion remain unchanged.
3. Three exact canonical migration files were copied from the owning PRs. Counts are167 canonical /153 enforced; frozen grandfather14 /legacy30 sets and guard algorithms are unchanged. No SQL was applied and no other feature implementation was merged.

## Source history, security classification and current observation
Original commit/file SHA-256s and checked owning-PR heads are pinned in 2026-10-31-web-studio-migration-provenance.json. Sources: PR386/f4d41f5 for sales_b2b_offers and sales_discovery_candidates; PR609/fab9c33 for social_owner_crosschat_context. All three bytes match original and observed latest source versions.
A read-only Supabase metadata query in AI Operating Platform returned190 distinct migration names, including all three. The exact captured names are in 2026-10-31-web-studio-observed-ledger.json. The local guard accepts that snapshot, but rejects each missing reconciled name, unknown names and duplicates. This is a point-in-time name-set check, not live function-body hashing, full-schema replay or proof of a new Vercel build.
The first broad replay exposed a required source dependency: sales_discovery_batches and sales_discovery_candidates were not classified in this branch. Reused their SERVER_ONLY intended classifications plus seven security tests from PR386. No security allowlist exception was added. The existing185-table historical catalog capture stays unchanged; its capture-time absence is explicitly distinguished from the current ledger observation. Static replay checks RLS, zero policies, zero public/anon/authenticated grants and service-role access. No fresh live table-grant introspection is claimed.
Historical raw ledger snapshots are unchanged. Only hypothetical completed-ledger arrays and additive expected counts were reconciled.

## Fresh verification
- Revenue/guard focused cases:100/100 in UTC and again100/100 in Europe/Stockholm. These are the same100 tests in two zones, not200 distinct tests. Calendar cases cover31/30/29/28-day months, midnight, rollover, first-day inclusion and exclusion of prior-month/foreign data.
- After the registry follow-up:317/317 focused revenue, guard, schema and migration-security regressions passed across6 files.
- Lightweight actual Studio component/browser suite:22/22, including3 new long-option cases at1280/1440/1920 widths. Desktop screenshots visually reviewed; no horizontal overflow and Stop remains accessible. Existing mobile/fullscreen/draft cases pass.
- Full actual Studio UI/HTTP/PostgreSQL/worker journey:25/25, zero failures/skips/flaky cases, no retries. Includes the unchanged >=300px preview requirement and both showroom build/edit/history journeys. Auth identities and model output are fixtures, not real login or model-quality evidence. Run517bc7cc-6667-4dd5-934e-1d87ad251572; owned container removed and all42 pre-existing container identities preserved.
- Full web TypeScript: exit0 after correcting the new test's explicit provenance type.
- Exact updated Migration Guard CI test command:54/54. YAML parses; contents:read and15-minute timeout unchanged. Executed the actual anti-skip script: accepts the full report and rejects a report missing the5 new reconciliation cases. No CI was triggered. Only this existing job's test list and anti-skip check changed.
- Full44-file project-isolation command on Windows:1219 passed /4 failed /0 pending out of1223. All revenue and newly reconciled schema/security cases pass. Remaining failures:3 platform-credential-events assertions and1 YouTube path assertion. Do NOT report the full isolation command green.
- Broad npm test -- --bail=1 --maxWorkers=1 --minWorkers=1 still exits1 at the unchanged mission-brief-v1.test.ts:384 status-list assertion (2 passed /1 failed before bail). No all-repository-green, merge-ready or production-ready claim.

## Remaining Windows failures and diagnostic boundaries
The three credential failures are unchanged SQL comment-parsing expressions applied to CRLF files. Direct diagnostic reproduction using the same raw SQL and exact assertion expressions yields2 grants/statements with CRLF versus the expected1 after in-memory LF normalization; the platform_tokens comment is retained only under CRLF. No source/test/SQL files were altered for this diagnostic. An initial preload experiment did not change Vitest's isolated view and still failed; it is not counted as a successful test run.
The YouTube failure compares lib\media\youtube-oauth.ts with lib/media/youtube-oauth.ts. Its source and the credential test/SQL files are unchanged from baseline. The normal suite remains red on Windows; these are not silently skipped or fixed by lowering expectations. Linux CI must verify the new commit.

## RED/GREEN and review notes
Initial targeted RED:16 failed /35 passed; header RED:3 failed. Grid-only first fix still exceeded header budget; reduced padding rather than changing the limit. Guard test snapshots required additive-count/hypothetical-ledger updates while preserving raw historical captures. Registry follow-up first failed8 checks and then passed all217 schema/security checks. The new Vitest.each JSON input needed an explicit type; TypeScript passed after that correction.
Second manual review confirmed exact source copies, unchanged frozen policy/algorithms, existing185 table map, project filtering, no new permission exceptions, preserved worker/auth/cost logic and unchanged original height test. This is manual review, not independent security certification.

## Evidence and release boundary
Plan: docs/superpowers/plans/2026-10-31-web-studio-stabilization.md.
Local logs: .superpowers/sdd/2026-10-31-web-studio-stabilization/; SQL-backed Studio receipts/screenshots remain in .superpowers/sdd/2026-10-31-web-studio-sql-roundtrip/runs/517bc7cc-6667-4dd5-934e-1d87ad251572/.
Previous remote checks still describe b3a607d (15/18 green), not this local patch. A new authorized push must repeat CI and the protected Vercel build. Concurrent future ledger changes can require another source-history review. No new online preview or production activation is claimed. Actual model generation, full builder login journey, active-version rollback and remaining platform issues are separate gates.
