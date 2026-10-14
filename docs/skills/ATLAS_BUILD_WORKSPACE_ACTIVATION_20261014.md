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
