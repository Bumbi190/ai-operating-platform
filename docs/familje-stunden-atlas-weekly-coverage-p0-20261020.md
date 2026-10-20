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
