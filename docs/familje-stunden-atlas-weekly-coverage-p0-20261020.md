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
