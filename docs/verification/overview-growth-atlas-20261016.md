# Growth overview and concurrent Atlas work — validation

Date: 2026-10-16. Base: `6dc3b40d9c42f730ce9564b7d1abc0e9368f5409`.
Branch: `codex/overview-growth-atlas-20261016`.

## Behavior

The dashboard presents saved Atlas assessments, up to three source-backed proposals, traffic and social audience observations, saved competitor checks, project next steps, and actual job status. Operations and AI costs remain available in a collapsed section. Missing, failed, partial and old observations remain explicit. Social account changes and missing dates do not become fabricated period growth; YouTube lifetime views stay separate from period traffic.

The portfolio headline summarizes known proposal coverage in Swedish; it never promotes a single project situation to a global conclusion. Unconfirmed source coverage stays unknown rather than becoming measured zero.

Opening or refreshing this page never generates an analysis or dispatches a job. Sources are existing saved observations and the existing project-bound PostHog reader. Fresh owner and active-project checks precede source reads and cache hits. Raw provider bodies do not enter the client model.

Discussing a proposal stages an unsent draft, preserves existing text and leaves the call active. Spoken planning and already-authorized job requests use the shared conversation controller without the old plan-triggered microphone shutdown. Global speech supplies no hidden plan or revision visibility: exact approval and revision-bound feedback retain their reviewed UI requirements. A saved plan, a queued job and a completed result remain distinct. Visible work status refreshes without remounting the conversation.

## Verified

- Focused source, reader, UI, conversation and PostHog suite: **90 passed**.
- Full overview/messenger browser fixture: **36 passed**, including 390/1280/1920 layouts, draft preservation, plan saving during voice, next voice turns while queued, and first-job receipt recovery after throttling or a hidden tab.
- TypeScript: **exit 0**.
- Lint on 25 changed TypeScript files: **0 errors**; two pre-existing runtime hook warnings.
- Production build: **exit 0**, with only public Supabase build inputs. Initial environment-free attempt failed on existing auth-page Supabase initialization; no provider/service secrets were needed for the successful build.
- Canonical isolated SQL suite: session idempotency, owner/RLS boundaries, writer fences, feedback, pause/resume, and concurrent commit/cancel passed. Test-owned databases are removed by the runner.
- Two independent reviews found and re-reviewed fixes for swallowed work refresh receipts and all-null failed social snapshots. No important findings remain.

The new receipt regressions first failed with the old implementation and then passed with the fix. Their fixture keeps server props stable until an actual navigation or router refresh. Social collector error/null metrics and the actual durable website run kind were also verified red then green.

Browser data is synthetic. Speech recognition and tool-event streams are controlled fixtures; this does not measure physical microphone quality, real provider latency or speech echo. Live paid model execution is outside this validation.

## Existing wider-suite failures

The selected wider run before the final presentation refinement completed with **630 tests: 622 passed, 8 failed**, no suite-load errors. Its eight failing test identities exactly match the clean-base comparison below.

A clean checkout of the exact base, using the same locked dependencies and a separate owned SQL fixture, ran the six affected unchanged test files: **125 tests, 117 passed, 8 failed**.

| File | Baseline failure |
| --- | --- |
| `lib/website-build/api.test.ts` | Private UTF-8 export fixture: `DESIGN_WORKER_REQUIRED` |
| `lib/website-build/studio/api.test.ts` | Studio creation expects 201, receives 400 |
| `lib/website-build/studio/budget.test.ts` | Studio fixture: `INVALID_STUDIO_INPUT` |
| `lib/website-build/studio/loader.test.ts` | Studio fixture: `INVALID_STUDIO_INPUT` |
| `lib/website-build/studio/store.test.ts` | Three Studio creation/rollback/RLS fixture assertions |
| `lib/qa/money-overview.test.ts` | Existing rollback-body hash assertion on Windows |

These are not claimed green, nor is the entire repository suite. Planning/build SQL, migrations, model settings and audio-provider configuration are unchanged by this feature.

## Reproduction

From `apps/web`, run `vitest run --maxWorkers=1 --minWorkers=1` with the overview growth/view-model tests, discussion/controller tests, and Handlarbörsen PostHog tests. Run `playwright test --config=playwright.atlas-overview-messenger.config.ts` for all 36 browser checks, and `tsc --noEmit`.

For SQL-backed build tests, prepare the canonical labeled local fixture with `scripts/test-website-build-db.mjs`, retain only the database created by that invocation, pass its `WEBSITE_BUILD_TEST_DATABASE_NAME` to Vitest, and remove that owned database afterward. Never point this runner at production.
