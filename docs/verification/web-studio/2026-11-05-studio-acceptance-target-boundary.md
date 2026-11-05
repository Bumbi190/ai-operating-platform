# Studio live-acceptance target boundary (PR #368)

Status: code + mocked tests only. No live acceptance has been run. Nothing here authorizes a deploy, spending money, changing a database, changing a schedule, or calling `runs/drain`.

## What is guarded

`lib/website-build/acceptance-target.ts` applies **only** when `VERCEL_ENV=preview` **and** `VERCEL_GIT_COMMIT_REF=codex/atlas-builder-references-20261017`. Production, other branches' previews, local dev and CI are out of scope and behave exactly as before.

When it applies, the following HTTP writes refuse with `503 {"error":"ACCEPTANCE_TARGET_NOT_ISOLATED"}`. Most checks run before authentication or database access; build-resume is checked after body parsing and authentication but **before** the database client is used. Atlas chat tools return the same refusal code before writes:

| Entry point | Route |
|---|---|
| Cinematic import | `POST /api/website-build/studio/cinematic-plan` |
| Plan save / approval / build start | `POST /api/website-build-plans`, `POST /api/website-build-plans/[planId]/approve`, `/start` |
| Mockup approval | `POST /api/website-build-plans/[planId]/mockups/approve` |
| Build create (plan-bound start) / feedback / resume | `POST /api/website-builds`, `POST /api/website-builds/[sessionId]/feedback`, `/control` with `resume` |
| Studio workspace, request, budget | `POST /api/website-build/studio`, `/workspace-request`, `/budget` |
| Reference analysis and uploads | `POST /api/website-build/references/analysis`, `/tickets`, `/finish` |
| Atlas WebBuilder tools | `draft_website_build_plan`, `start_website_build`, `submit_website_build_feedback`, `control_website_build` with `resume` |
| Website worker (and every other run kind) | `GET /api/runs/drain`, checked after `CRON_SECRET` and before `claim_runs` |

They are allowed only if **all** of these hold:

- `WEBSITE_BUILDER_ACCEPTANCE_MODE=1`
- `WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF` is a 20-character ref and is not `iboepohjwrhtgshrqaol` (production)
- `NEXT_PUBLIC_SUPABASE_URL` is exactly `https://<that ref>.supabase.co`
- `H1_SPEND_GATE=1`

Passing the check grants nothing. Auth, same-origin checks, RLS, approvals, the spend gate and idempotency still run unchanged after it.

## What is deliberately NOT guarded

These are listed here so nobody assumes they're covered:

- GET/read routes, including cinematic binding, reference images/library, plans, builds and artifacts.
- Emergency `pause` and `cancel` controls, including Studio's `stop`, remain reachable through the normal authentication and authorization checks.
- Other settings and non-WebBuilder chat/project APIs are not covered. Some can still write to whichever database the preview is configured to use. **Therefore do not use this preview against production even with the guard; provision the isolated database first.**

The drain guard does stop **all** run kinds on this one preview. That's intended, because a preview on the production DB must not claim production runs. It's harmless elsewhere because the guard is scoped to this branch.

## Read-only preflight

```bash
node apps/web/scripts/website-acceptance-preflight.mjs --expected-sha <sha>
```

The preflight reads env metadata, local `git rev-parse` and the local migrations listing. It prints secrets as `present`/`absent` only and makes no network calls. Exit code `2` means blockers were found. It reports:

- `blockers`: guard rules, commit SHA and branch.
- `realLoginBlockers`: missing anon key, or the database is not isolated.
- `cronBlockers`: Vercel crons only run on production, `runs/drain` is not in `vercel.json` crons, `CRON_SECRET` is missing, or the drain is refused by the guard.
- `manualChecks`: migration parity on the isolated DB, the Auth redirect allowlist, a test user, and env scoping. These can't be checked offline.

## Verification (2026-11-05)

- **59/59** targeted route/drain guard tests passed locally (mocked identities and clients; no production calls).
- **15/15** local preflight and fixture-runner tests passed.
- Full web TypeScript `tsc --noEmit` passed.
- The preceding Studio acceptance baseline was **28/28** in isolated Chromium/PostgreSQL with fixture auth and fixture models; that is *not* a live Supabase Auth proof.
- A separate older `admission-inventory.test.ts` test relies on Unix `find` and fails if run directly under Windows PowerShell. Verify it in Linux CI instead; do not waive its checks.

## Required before any live acceptance

1. Obtain owner approval for branch compute charges and an isolated test spend allowance. Supabase branch compute is billed separately from the provider model budget and is not covered by the usual Supabase Spend Cap.
2. Create a **data-less, temporary** Supabase preview branch, verify migrations, disable or verify all branch cron jobs (especially `omnira_runs_drain`), and provision only fictional test identities/projects. Never seed Demo Motors production rows or production customer data.
3. Configure the existing Vercel PR preview's variables **for this Git branch only**: isolated project URL/credentials, acceptance mode, exact branch ref and `H1_SPEND_GATE=1`. Keep secrets in Vercel, never in Git or chat. Redeploy because env changes do not alter an existing immutable deployment.
4. Verify the preview's deployed commit and that preflight reports no blockers. Independently verify actual Auth and RLS, one manually triggered preview worker invocation, the hard cost limit, the Roadster import, one CTA-only change, old revision and ZIP export.
5. Restore the branch's preview env configuration and delete the temporary Supabase branch immediately after the attended run. Verify the billing/cleanup receipt. No merge, production deploy, customer release, or paid API action is authorized by this document.

**Live status: NOT STARTED.** A green mocked guard and UI suite does not establish real Supabase/Auth, deployed env safety, live model interpretation or release readiness.
