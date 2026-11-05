# Web Studio: durable feedback and version history with prepared candidate fixtures

Command: `node apps/web/scripts/test-website-auth-local.mjs --run --application --routes --next-http --worker --browser --feedback`

--feedback also works without --browser for the internal HTTP/worker proof. It requires the existing isolated application/worker mode. All real Auth, ownership, approval, budget, claim and preset-worker cases run first. No production application code is changed by this addition.

The owner sends feedback through the real Next feedback route, bound to the viewed first revision. A second owner must be refused. Retrying the same intent returns the same feedback row. The real service claim_runs claims exactly the successor generation. Running the unchanged worker stops at its beforePaidStep hook immediately before website.feedback.interpret. This is an explicit test-hook refusal, not a successful provider call or proof of the provider spend gate. The active preview and first artifact must remain unchanged at that boundary.

The test then supplies an explicitly prepared interpretation and compiled cinematic candidate through the existing recordBuildInterpretation/saveBuildCandidate functions and their real claim-guarded SQL RPCs. This models the durable handoff after model work. It does not replace a provider, generate a user JWT, stamp a claim manually, seed a build session or alter approvals/source pins. Interpretation/copy are fixture data; this does NOT prove natural-language understanding, AI quality or an actual model-generated edit.

Executing the real worker with that candidate must commit revision two without any further paid step. Assertions require the new Roadster contact label, a different artifact hash, unchanged other pages/media manifest, exact preservation of revision one and feedback.appliedRevisionId pointing to revision two. Replaying the completed run with fresh persisted context must not produce revision three. The second user must not read the new artifact. The parent SQL check requires exactly two completed-preview run markers and zero cost events.

Browser mode uses the previously verified real login and Studio components. It additionally selects revision one and revision two through the real Version/Sida controls and checks the old/new Roadster link labels inside the rendered iframe. Existing desktop/mobile viewport, cookie renewal/persistence and foreign-owner checks remain active. Full shell, chat planning, media rendering and hosted acceptance remain outside this fixture.

Receipt: docs/validation/website-real-auth-feedback-20261105.json. Completion requires all parent, route/worker and (when enabled) browser checks plus owned-resource cleanup. The non-browser preliminary run passed the new feedback/candidate checks before browser-history acceptance was started.

Remaining: real model interpretation/copy and spend admission, UI submission of conversational edits, drain terminalization, pause/cancel/recovery edge cases in this combined environment, complete media/export and hosted testing. The explicit prepared-candidate proof must not be reported as ordinary end-to-end AI generation.

Verified combined run finished 2026-11-05T13:10:57.295Z: completed=true; 52/52 parent checks, 105/105 HTTP/session/worker checks and 15/15 Chromium checks passed. Browser history displayed both original and updated Roadster labels through actual version selection. The active preview survived the pre-model refusal; revision one remained identical; only the intended page/copy changed; media descriptors stayed identical; the feedback receipt bound to revision two; completed-run replay did not create another revision. Two completed-preview markers and zero cost events were verified.

All five owned containers, both owned networks and temporary standalone builds were removed; follow-up inventories were empty. Syntax/bundle checks and git diff --check passed. The shared-fixture full application suite was not run. No production code, database or deployment changed, no provider call was made, and unrelated dirty showroom/calendar files were preserved.
