# Atlas build workspace activation — 2026-10-14

André approved continuation at12:57 Europe/Stockholm after the concrete next steps: integrate PR332, handle the canonical migration correctly and run real model/microphone/TTS checks. Existing public-repository publication approval persists.

## Target and preflight

- Repository: Bumbi190/ai-operating-platform; PR337 feature worktree is isolated and the original dirty checkout is untouched.
- Main advanced to3bd8f77 through already-merged PR335/336. Merging it exposed one schema-classification note conflict; both notes are preserved.
- Supabase target: AI Operating Platform, project iboepohjwrhtgshrqaol. All three website tables and website RPCs are absent before activation.
- Production includes omnira_collaborator_proposals_v1 already. New source set has116 canonical SQL files and102 enforced names; frozen grandfathered14 and legacy30 are unchanged.
- Website migration remains enforced. Three named tests observed RED at115/116, then GREEN after registering116/102. Missing website migration and duplicate ledger names still fail closed. Combined guard/security28/28 PASS.
- No override, allowlist growth, ledger repair or remote reset is used.

## Verification and activation

Pending fresh integration checks and the additive website_build_sessions apply. Physical microphone/audible TTS cannot be inferred from mocked speech tests. Real model smoke must use governed run dispatch and actual durable receipts.

Pre-apply investigation found an omitted existing runs boundary: runs_action_binding_complete requires all workflow binding fields null for non-workflow jobs, and runs_idempotency_key_sha256 restricts workflow keys. The old website enqueue supplied a non-workflow partial binding and would fail in production.

The local SQL runner now loads both actual constraint statements from the canonical repository migrations. Observed RED: first website_build_create failed with runs_action_binding_complete. Fix: keep all workflow binding fields null and retain the deterministic website session/generation key in context.websiteBuildIdempotencyKey; session-row locking still makes repeated enqueue return the same current run. No existing runs constraint is changed. GREEN:26 SQL assertions plus both real connection races. Ruling: canonical workflow-bound key semantics take precedence over the plan's generic runs.idempotency_key choice; cost if wrong: any future caller relying on that reserved column for website jobs must use the explicitly named context key, while workflow authority stays unchanged.

After latest-main integration and the guard fix, focused337/337 passed and standalone typecheck exited0. A fresh post-enqueue-fix focused/browser/full matrix follows before application rollout.

## Production schema evidence

Applied website_build_sessions as ledger version20261014112755. One stored statement,28857 characters; SHA256a3a36396a181af89340482f5a51210a65b5fef6f03480651155177d56363fa0b is identical to the reviewed payload. A first tool request expired; read-only checks proved no partial apply before the successful retry. No ledger repair or second application was used.

Actual production introspection: three tables have RLS=true, authenticated SELECT only, no anon privileges, no authenticated INSERT/UPDATE/DELETE/TRUNCATE. Each has one project-owner/auth.uid SELECT policy. All17 website_build functions are invoker-only with empty search_path; anon/authenticated cannot execute, service_role can. The three registry entries now reflect those observed live ACLs; other historical classifications are left unchanged.

PR332 merged as5bb514d. Its actual parents arefbaa85d and687b8ea; tree7ba0541 matches the independently calculated merge tree. PR338 arrived concurrently and is integrated without conflict (proposal timeline only, no new migration).

Post-enqueue-fix focused337/337 pass. Latest main integration tests56/56 pass. One newly failing inherited mobile navigation source guard expected a one-argument compose call; main adds a collaborator argument. Keep checking the authorized model.projects first argument and mounted ProjectRail with a bounded pattern. This is a test compatibility correction, with separate collaborator runtime tests retained.


## Final release verification and protected-main activation

- Post-fix focused suite: 337/337 assertions; latest-main integration: 56/56. Standalone typecheck exit 0.
- Complete disjoint release matrix: 471 unique files, 12,207 passed assertions, 362 inherited failures in 69 files, 1,110 pending. No new failed assertion names versus the recorded 362-name baseline. The repository-wide suite remains red.
- Chromium: 9/9 flows passed with no retries or timeout changes in the isolated run. The preceding concurrent full-suite/typecheck run exhausted the voice flow's 30-second budget at its final reload (8/9); this is not claimed as a product timing fix.
- Feature-head 361de52225ef42380879915ebb23709c8d8b3c54 Vercel preview is READY and its actual production migration guard passed.
- Main requires three GitHub Actions contexts from app 15368: Memory M4 boundary suites, Trading canon integrity, Atlas project isolation suites. The approved activation includes these necessary protected-main checks; the earlier draft's no-hosted-CI scope does not authorize a bypass of protected main.
- The three manual runs on 361de52225ef42380879915ebb23709c8d8b3c54 all succeeded: runs 38559809609, 38559813503, 38559817244. GitHub nevertheless rejected normal merge (HTTP 405: all three required statuses expected). GitHub documents that workflow_dispatch jobs do not satisfy pull-request requirements: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- The release evidence commit uses the normal pull_request trigger, preserving workflow definitions and branch protection. Only the three mandatory suites are needed for activation; other automatically triggered workflows on this owned branch may be cancelled to retain that scope. No check status is fabricated, no admin merge is used, and no production credential is introduced into CI.
- User cancelled browser credential entry. No logged-in UI smoke, real-provider generation, physical microphone proof or audible TTS proof is claimed.
