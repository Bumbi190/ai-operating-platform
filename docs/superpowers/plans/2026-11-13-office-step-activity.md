# Office step activity implementation plan

> For agentic workers: execute natively with superpowers:executing-plans. Each task uses RED/GREEN and a final whole-change review.

Goal: show only a fresh, scope-bound recorded step request in private Office; never assert execution or completion.
Architecture: retain identity grants, add explicit versioned activity grants, project bounded metadata through the existing classifier, then through Python to a separately tested native consumer.
Tech stack: existing Next/TypeScript, PostgreSQL, Python stdlib and Unreal Blueprint Python tooling. No dependency installation.
Spec: approved Omnira_Office_Arbetsindikering_Design_2026-11-13.md.

## Global constraints
- Local development only. No push, deploy, production SQL, real workflows, voice or live native installation.
- One explicit avatar/project/agent. Old grants remain identity-only; an updated browser and compatible native receiver must request a new activity grant.
- Four hours maximum visit; 30s server lease; 8s sequential polling; 5s total HTTP budget; 20s identity freshness. Activity ends at the earliest of 90s request freshness, claim lease, identity and visit deadlines. Monotonic expiry cannot revive.
- At most 12 runs/120 logs; reaching the cap or any incomplete/ambiguous read produces no positive activity. No prompts/context/response/error text in reads or DTOs.
- Native rendering uses fixed text. Existing map, rig, bartender, bar sign, installed launcher and Nova remain untouched.

## Review focus
- Older clients/grants cannot acquire activity through a default or permissive fallback (Task 1, legacy tests).
- A renewed identity snapshot cannot extend or revive the same old activity (Task 3, monotonic replay tests).
- Malformed or capped log metadata cannot hide a later answer (Task 2, complete-input tests).
- Browser loss during confirm and process exit during a pending request cannot leave activity behind (Task 3, transport regression).
- Native labels must expire during world pause even with unchanged file bytes (Task 4, actual Blueprint behavior).

## Task 1: versioned database grant and bounded facts
- [ ] Write disposable SQL fixture tests for old grants, explicit new grant, owner/session/project/agent denial, catalog permissions and result redaction; run RED.
- [ ] Create a follow-up migration using installed Supabase CLI migration-new. Keep the installed migration unchanged. Add `read_scope` default identity and a dedicated service-only explicit activity-create wrapper. Extend presence only for activity scope with bounded run/log metadata and no raw content.
- [ ] Apply only to the owned network-none PostgreSQL fixture; verify GREEN and cleanup. Capture query count/latency.

## Task 2: server projection and explicit browser consent
- [ ] Add activity projection tests for valid request, reply, wrong scope, malformed/capped/ambiguous data and no content leak; run RED.
- [ ] Reuse identifyOutstandingAgentSteps in new activity.ts. Wire a dedicated POST /visits/activity, strict scope/protocol and existing create/revoke auth. Old presence is unchanged.
- [ ] Add optional native activity capability to visit controller and checkbox/button consent to connection panel. A normal legacy click never asks for extra scope. Test protocol mismatch and consent lifecycle plus existing web regressions and typecheck.

## Task 3: local activity projection and visit transport
- [ ] Add tests for lease cap, monotonic cap, replay/nonrevival, unsupported versions, newer snapshots, old identity mode and process stop; run RED.
- [ ] Add ActivityPresenceReceiver in office_activity.py and optional activity mode in relay. Activity mode requires scope match and emits schema v2 with fixed kind/deadline; legacy mode still rejects activity.
- [ ] Companion advertises activity only after the separately versioned saved native receipt verifies. No implicit upgrade. Local synthetic transport can exercise activity mode without touching installed assets.
- [ ] Run full relevant Python and real HTTP/file transport tests, plus browser detach and process-stop integration.

## Task 4: isolated native consumer and reviewable delivery
- [ ] Add authoring/verification script for a separate v2 consumer. Reuse native graph behavior; add fixed activity caption and independent per-frame monotonic activity expiry.
- [ ] Test actual compiled unsaved Blueprint against synthetic projection files in a separate Unreal process. Verify existing saved map/assets are byte-identical afterward. Prepare guarded native install code/receipt format without invoking live installation.
- [ ] Run combined regression, TypeScript and diff checks; obtain fresh whole-change review and fix important findings with RED/GREEN.
- [ ] Save exact local diff, test evidence, migration/install/release boundaries and next action. Do not publish.

## Ledger
Preflight: origin/main d485a764; review_required candidates are unrelated creative read-only work. Continue existing owned Office branch; no new branch/PR. Relevant Office source paths unchanged between branch head0397798 and current origin/main. Existing generated design-bundle modification preserved.
Baseline: 15/15 affected visit web tests; earlier classifier baseline14/14. Native implementation and integration not yet tested.
Ruling: use the existing local Office branch for development after review_required; no branch is created. Reason: task already owns it, PR634 is merged, and scope is unchanged by newer main.
Ruling: execute the already approved local design without another method/plan approval round. Reason: user explicitly said to build and test now; production authority stays excluded.

## Final execution ledger, 13 November 2026
Task 1: complete locally. Actual disposable PostgreSQL scope/catalog/redaction/bounds fixture RED→GREEN, including two reviewer probes for typed-only JSON and 1000 unrelated candidates. Old grants remain identity-only. No hosted SQL executed.
Task 2: complete locally. Classifier6/6, HTTP5/5, browser6/6 and actual panel5/5, with held/dropped confirmation and disclosure regression RED→GREEN; final combined run recorded in verification report.
Task 3: complete locally. Independent Python absolute/monotonic expiry and opaque event key; renewal/stopped-writer projection regression RED→GREEN, strict integer protocol and hash-only native-receipt rejection RED→GREEN. Old launch-only/full v1 native checks preserved.
Task 4: unsaved native candidate and local verification complete. Actual compiled graph checks cover shorter/equal-deadline new events, stale caption and cleared flag, v1 identity compatibility and v2 activity; actual paused PIE with stopped writer also passes on final source. Saved v2 installation/finalizer is deliberately deferred; ordinary launcher capability stays OFF.
Final review: one fresh read-only reviewer,0Critical/8Important/3Minor. All8Important addressed in one RED→GREEN fix pass; strict integer protocol minor regraded Important and also fixed. No independent second review after fixes is claimed.
Ruling: keep production capability disabled and preserve all independent v1 checks until saved-v2 binding/material/fresh-process finalization is separately implemented and reviewed. This replaces the insufficient hash-only receipt reader; cost is that this local candidate cannot yet activate ordinary activity visits.
Ruling: footer scope disclosure regraded Important because the old identity-only statement contradicted consent; fixed and component tested.
Ruling: protocol boolean/float acceptance regraded Important at the new authority boundary; exact int1 now required.
Ruling: malformed unassignable bounded candidate snapshots return unavailable; malformed steps that are positively mapped only to another agent do not enter the selected-agent facts. All source candidates are bounded BEFORE JSON membership inspection. Cost is conservative unknown on truncated/unassignable data.
Ruling: cold PIE fixture publishes fresh synthetic frames until actual native ack, then freezes bytes and pauses. It no longer assumes the first stopped frame survives startup. Tests still prove both activity and identity expire with stopped writer on actual paused ticks.
Ruling: exact serialized microsecond deadlines, rather than unrounded test clock floats, are the boundary asserted. Effective absolute deadline is also kept in receiver state and serialized with the monotonic minimum.
Final: minor (deferred): per-presence query latency/count has not been measured separately. Whole disposable SQL fixture timing is labelled as such; production latency/billing is not claimed.
Final: temporary review.patch was a tracked-only, text-decoded reviewer aid, not a deliverable. Final exact source export will be generated from staged Git with all new files and apply-checked against base03977982.
Review declined-to-judge rulings: real deployment, saved-native install/usability/rollback execution, real-account positive activity and actual agent work stay unverified and outside this local authorization; no production performance/billing claim; no malicious-admin attestation; relevant v1 interfaces only, not an audit of other worktrees/assets.
