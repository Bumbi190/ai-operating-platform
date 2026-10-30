# Instagram Growth – release review packet
Date: 2026-10-23
Branch: codex/instagram-growth-integration-20261023
Target: origin/main, aligned at 9d3a205 (PR #519)
Status: LOCAL REVIEW READY; not pushed, not merged, not deployed.

## Goal
Read-only project-scoped Instagram performance in Atlas Operations Center and safe optional Insights ingestion for Familje-Stunden's separate social_publications workflow. Preserve The Prompt's working media pipeline, approvals, voice locks, costs and fallback.

## Changes reviewed
- 19 files (1179 additions, 10 deletions vs origin/main before this review packet).
- Manus direction from pinned MIT Instagram Agent concepts; project-separated Swedish/English creative constraints.
- Read-only server-side operations cards, project-scoped by authenticated user's allowedProjectIds; missing data reported as missing.
- Pure per-account median/outlier and saved/shared per-reach calculations, no artificial forecasts.
- Social publications adapter: verified binding and account identity; only confirmed published media IDs; at most 4 items/project/run and 10 projects; skip inactive accounts.
- Existing media_insights table only (no migration); unique media_id guards new INSERT; existing rows use ownership-constrained UPDATE at write time. Never overwrite a foreign project or an existing script-owned record.
- Graph results can use values[0].value or total_value.value; missing metrics remain null.
- Existing insights and Atlas opportunity generation run before optional adapter; feature flag OMNIRA_SOCIAL_PUBLICATION_INSIGHTS_ENABLED must equal "true", otherwise no new Meta requests.
- No new scheduler, API provider, credential scopes, publishing/DM/comment automation or cost-bearing calls in the new Atlas view.

## Evidence
- 123/123 targeted post-merge Vitest tests passed across 12 suites, including existing The Prompt news/text fallback, Atlas access isolation, voice lock and Instagram reader.
- Additional last-turn final suite: 97/97 targeted tests passed; parser and guarded-writing tests passed. Isolated TypeScript project passes.
- Git diff --check: clean; no uncommitted source changes at review checkpoint.
- Verified by read-only Graph call on the user's pre-existing Familje-Stunden account binding: account identity confirmed, reach + full requested metrics set returned success. No token values or provider payload data logged.
- AI Operating Platform database already has 293 The Prompt Instagram insight rows; Familje-Stunden has 2 approved provider-publication receipts and zero insights rows before activation.
- Production Vercel deployment for origin/main 9d3a205 was READY at inspection. Recent unrelated previews include ERROR states.
- The full app-wide tsc/build is NOT confirmed green with the reused local node_modules junction; unrelated missing workspace/media dependencies were previously observed.

## Release safety / blockers
1. Have a second reviewer inspect the code and ownership, token, deadline, metric parsing and fallback contracts.
2. Run a clean dependency install/typecheck/CI in standard workspace, using the project's approved runner.
3. This Vercel project automatically creates a preview build for non-main branch pushes. GitHub has nine workflows eligible on PR. Therefore do NOT push/open a PR merely as a status action when minimizing spend; get explicit operator approval for the CI/preview cost or coordinate with existing planned review.
4. On release, keep OMNIRA_SOCIAL_PUBLICATION_INSIGHTS_ENABLED unset/false. Do not activate on first deployment.
5. After successful production-read checks and owner approval, enable the flag explicitly, verify one run, confirm 2 Familje-Stunden insights records are saved and scoped, then validate Atlas Operations view with real data. Set it back to false if an anomaly occurs.
6. No new paid subscriptions or autonomous Meta interactions. The two-week content experiment starts only after data availability and editorial approval.

## Out-of-scope
- Installing third-party Python skills in Vercel runtime (not done).
- Automatic content experiment selection or algorithmic viral guarantees (not done).
- Direct production DB writes or manual publication changes (not done).
