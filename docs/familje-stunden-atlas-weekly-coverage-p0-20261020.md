# Familje-Stunden / Atlas P0: Weekly coverage read tool
Date: 2026-10-20
Branch: codex/family-atlas-weekly-plan-20261020 (isolated origin/main)
Status: local code, NOT deployed; automatic recurring execution is NOT enabled.

## What this adds

Atlas tool: get_family_weekly_content_plan
Inputs: approved owner project UUID and optional daysAhead 7 or 14
(default 14). Output is a deterministic, read-only planning receipt using
Europe/Stockholm and the server clock, NOT an executable schedule.

The existing chat tool registry automatically includes this tool via the
SOCIAL_CONTENT_TOOLS and SOCIAL_CONTENT_TOOL_NAMES exports. Atlas uses
its already existing conversation-scoped readSocialContent and
principal-scoped readSchedules. No new DB tables, views, RLS policies,
service-role access paths, paid provider calls or cron configuration.

Coverage considers:
- Planned Tuesday 17:00 and Friday 20:30 slots (no backfill).
- 1st of month 20:30 when the saved monthly rule is enabled.
- Both approved Facebook (text) and Instagram (image) channels.
- Actual post revisions and matching saved schedule jobs.
- Valid current plan, correct original project/tenant, already-covered
  slots, missing image assets, stale plan/batch and revoked/failed jobs.
- End of October DST transition and release-specific evidence requirements.
- A bounded 7/14-day horizon. Bounded history failures stop the result
  rather than inventing missing slots.

The tool cannot generate, approve, schedule, publish, request secrets
or spend money. For content gaps, Atlas may use its existing
propose_social_content after instructions and source verification;
the resulting draft is for owner review. All existing project
approval gates and publication authorizations stay intact.

## Verification

- Vitest: 13/13 new and related deterministic tests passed.
- An older api.test suite requires WEBSITE_BUILD_TEST_DATABASE_NAME and
  its dedicated SQL fixture. That separate integration suite was unable
  to initialize and 6 tests were skipped. No production DB touched.
- Full tsc from this clean worktree hit 3 existing dependency errors
  in unchanged lib/media/lambda-render.ts: missing @remotion/lambda/client
  and two dependent unknown-region errors. No TypeScript errors were
  reported in the new weekly planner files.
- Code has no auto-loop, no scheduled task, no prompt-only release changes.

## Next gates for real recurring autonomy

1. Review this code and merge on its own isolated PR when ready.
2. Add a cost-capped, authenticated recurring planner entrypoint with
   bounded execution and replay/idempotency tests. Do not use service-role
   shortcuts or broad grant to create content.
3. Trigger ordinary content proposals only from actual verified project
   material, with no fictional claims, account mix-ups or stale month.
4. Surface a concise Atlas decision card and short owner review.
5. Keep any live sending, spending, asset upload, confirmed customer
   release and human approval in existing independent gates.

The older Familje-Stunden November teaser and PR #448 were not touched.

## P1 — Protected read-only weekly heartbeat, installed but not activated

New files:
- apps/web/app/api/family-content-weekly-tick/route.ts
- apps/web/lib/social-launch/content/family-weekly-cron.ts
- apps/web/lib/social-launch/content/family-weekly-cron.test.ts

The new GET route uses the existing requireCronAuth(CRON_SECRET)
boundary. An exact private flag FAMILY_WEEKLY_PLANNING_CRON_ENABLED=true
is required or it returns disabled with ZERO database calls.
The route accepts no project query, mode override or extra parameters.

When both checks pass it makes at most:
1. One read of the canonical fixed Familje-Stunden project ID, slug
   and owner_id from the private projects table.
2. One owner-scoped Social Content RPC read.
3. One owner-scoped Social Schedule RPC read.

Only after validating project ID, slug and owner identity does the
server construct the fixed project owner principal. Failures return
generic errors rather than private data. The report contains bounded
counters and next-action labels only; no captions, files, provider
tokens or account IDs are returned.

Mode is STRICTLY read_only. A repeated invocation performs the same
reads and returns the same report for unchanged inputs, with no writes.
No AI API, no model routing, media generation, post proposals, cron
dispatch or publication can be called from this handler.
The route is NOT registered in vercel.json and the flag is NOT
configured or enabled. No scheduled traffic starts from this code.

Tests include missing/wrong CRON_SECRET, wrong HTTP method, query and
project injection, default-disabled fast exit, canonical owner scope,
no write operations, read failures and repeated read-only checks.
6/6 cron-specific tests pass; 19/19 related planner/schedule tests pass.

A read-only production query confirmed the expected project ID, slug
and an owner ID exist in the live Omnira database. No records were
modified during verification.

Full TypeScript validation is blocked on the unrelated pre-existing
lib/media/lambda-render.ts errors (missing @remotion/lambda/client and
two region type errors). No new TypeScript diagnostics were raised in
this route or planner.

### Remaining autonomous workflow (not yet running)

- Decide the bounded weekly trigger cadence and review its expected
  Vercel usage. Then register and enable the read-only cron.
- Add a securely scoped, replay-safe proposal writer (still separate
  from scheduling and publishing) that uses actual approved month facts
  and project-owned assets. Do not invent captions from sparse metadata.
- Save and surface a concise Atlas review card, and allow the operator
  to approve exact revisions through the existing native gates.
- Activation and any additional provider/API budget must be explicitly
  reviewed. Keep live dispatch, release evidence and content approval
  independent of the planning heartbeat.

## P2 — Bounded source-pinned review proposals, Atlas conversational action

Source: local owner-verified Familje-Stunden November artwork/story QA, including
Löv- och Skuggmånaden and the Nova/Pling characters. The campaign copy is
still DRAFT COPY pending owner approval; source provenance is not publication
permission. Hero SHA-256
5789a09f28ad95334d5d1a3a08af3cc3d3201468d28f66f310da860db0815a76
and game-board SHA-256
ffd12c414aba2b71e2c39965c22e5c71f1028905eb5ed64217c054893604b31b
are pinned for the original editorial references. Protected subscriber story
pages and private November MP3s must NOT be included in public drafts.

Atlas can now use prepare_family_weekly_review_drafts ONLY after the
operator explicitly asks for content preparation in an authorized owned
conversation. The Atlas chat tool:
- reads existing project-scoped posts and schedule batches with the same
  principal and conversation ownership as other Social Content tools,
- determines missing Tuesday/Friday upcoming slots from current plan,
- reuses and flags existing unscheduled November release drafts for
  review rather than silently duplicating them,
- only prepares October 23, 27 and 30 preview material for the upcoming
  November theme; it never invents further November/December posts,
- limits a single run to FOUR planned, unapproved content proposals,
- pins the exact existing Familje-Stunden project and approved channel
  plan revision (Facebook text, Instagram image),
- generates stable candidate post UUIDs and retry idempotency keys,
- saves ONLY through pre-existing, version-checked and
  conversation-scoped proposeSocialContent RPC,
- stops immediately if any source, plan, user scope or write check fails.

The Instagram proposals have mediaIds=[]. A real project-owned,
hash-verified image and explicit content review are required before they
can ever be approved for publication. scheduledAt on a draft expresses
intended time in the calendar, NOT authorization to execute a social job.

No auto-cron, queue, AI-call, paid provider, approval bypass, public
release, production data change or automatic publishing is implemented.

### Verification / limitations

- Real Omnira content inventory read-only confirmed existing October 23
  Facebook/Instagram draft slots and unscheduled November release drafts.
- 29/29 selected Vitest tests passed (weekly coverage, proposal producer,
  Atlas scope, protected disabled cron, schedule timing).
- Integration suite lib/social-launch/content/api.test.ts still cannot
  initialize without an explicit isolated SQL fixture; do not claim it
  has passed here. Existing change only extends tool-name contract.
- Full tsc --noEmit remains red in untouched lib/media/lambda-render.ts
  due to missing @remotion/lambda/client dependency and derived typing.
  No error was reported in the new files.
- Changes are local to the isolated worktree, not pushed or deployed.

### Next phase

Generalize source-grounded preparation beyond the pinned October preview
only after canonical new-month material, media registrations, and editorial
review rules have been supplied and verified. Then add an independent
approved, cost-capped recurring trigger. The existing read-only cron stays
disabled; the approved release gate and live social sending remain separate.

## P3 — Verified editorial source registry, reusable for future months

New immutable in-code source registry:
- apps/web/lib/social-launch/content/family-editorial-packs.ts
- apps/web/lib/social-launch/content/family-editorial-packs.test.ts

The current pack contains only owner-grounded PUBLIC promotional
November preview facts, based on the already inspected hero and
activity evidence. It permits exactly 2026-10-23, 27 and 30 in
ordinary (non-month-release) slots. Draft captions in the pack have
not been approved as social publications; they are proposals.

The generic resolver now owns eligible days, captions, formats,
provenance hashes and eligibility. Weekly preparation no longer needs
hardcoded October date switches. Future months can be added via
distinct reviewed packs (source proof, dates and text), but are
intentionally blocked when absent. No reused older-month copy and
no private member images, stories, MP3s or signed URLs.

Safety improvements:
- Rejects foreign projects, unsupported channels, changed plan
  revision, month-release use and unsupported dates.
- Source SHA-256 changes when cited facts or campaign copy change.
- Stable post UUID is scoped to project, approved plan, channel and
  calendar slot; source revisions cannot create a duplicate post ID.
- Idempotency keys additionally pin the exact source SHA-256, so
  edited copy cannot silently reuse an earlier accepted payload.
- An existing Facebook image post in a plan that currently allows
  only Facebook text is marked needs_review, not prepared.
- Atlas read-only week planning and protected disabled cron expose
  only safe source-ready versus source-missing counts.
- No auto image generation, no API model spending, no content
  upload, no publication, no calendar execution.
- The owner's social plan and customer month entitlement are
  independent release gates.

Final focused Vitest:
- 34/34 tests passed across 7 suites.
- TypeScript reported ONLY 3 pre-existing errors in
  lib/media/lambda-render.ts (Remotion Lambda module/region typing).
  No new planner/editorial diagnostics.

This implementation is stored only in the isolated local development
branch; no new GitHub CI jobs or production deploy were triggered.

## P4 — Monthly source-review card and exact-hash owner decision contract

New:
- apps/web/lib/social-launch/content/family-month-source-review.ts
- apps/web/lib/social-launch/content/family-month-source-review.test.ts
- The existing Atlas Social Content tool registry now exposes one small
  READ-ONLY get_family_month_source_status(projectId, month) operation.

The tool checks the existing owned conversation through the established
readSocialContent authorization boundary; it refuses other projects,
invalid months, missing conversation scope and unapproved project plans.
It does not create or approve any source, call providers or change DB rows.

From an untrusted proposed public source manifest,
prepareFamilyMonthSourceReview creates a SHORT human review card:
- project and month, heading and public summary,
- bounded evidence count and proposed public posting dates,
- the exact SHA-256 for the full canonical proposed manifest, evidence,
  copy, plan revision and public/private declarations,
- explicit warnings that hashes/ownership still require independent
  source verification and that no subscription access or publication
  can be approved this way.

A pure decision-shape validator detects a wrong owner, foreign project,
changed SHA-256 or wrong exact version. It ALWAYS returns
activationAllowed=false, even for a structurally valid owner approval.
It is not a persisted or authenticated owner decision.

For the current source registry, the read-only status reports that
November has pinned PUBLIC marketing preview material. December returns
owner_source_material_needed until its own reviewed public source pack
is collected. This never means November subscriber content is released,
or that the owner has approved new captions or a live publication.

**Not yet implemented**:
- A persistent project-scoped source proposal/decision store.
- A live authenticated owner action tied to an exact source SHA.
- Atomic activation of an approved source pack after a stored decision.
- Any recurring autonomous monthly source discovery or publication.

No new tables/RLS/policies, spending, media uploads, cron activations,
GitHub pushes or production deployments were executed.

Verification: 42/42 relevant unit tests passed. TypeScript still reports
only 3 unrelated errors in unchanged lib/media/lambda-render.ts
(Remtion Lambda missing module and dependent typing).
