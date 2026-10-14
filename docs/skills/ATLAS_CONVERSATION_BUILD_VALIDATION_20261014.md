# Atlas conversation → plan → preview — validation, 2026-10-14

## Delivered behavior and scope

This branch implements approved delivery A. Text and editable voice input use one owned durable Atlas conversation. Atlas saves a versioned architecture proposal; an exact operator approval starts that version, selects the explicitly configured builder and opens the existing governed static preview. Feedback carries the actually rendered revision. Historical owner sessions retain their real brief without invented approval.

The project directory default and bound per-project path are persisted. The private ZIP collects src/, assets/images/, assets/media/, plans/, previews/ and project.json under one project root; it explicitly records physicalDirectoryCreated=false. It pins the session's approved plan even when a newer draft exists. Delivery B still needs a verified native/cloud development runner; C needs real provider write adapters, publication, DNS and HTTPS evidence. A does not deliver those execution capabilities.

All generated-site terminal, Vercel, Supabase, Strato account/DNS and form-delivery adapters remain not_implemented. Account state is unknown until an actual adapter verifies it. Platform hosting/environment variables, broker identity and ChatGPT connectors do not change that. A simple static website has no unnecessary Supabase requirement. Domain discovery uses Strato first and purchases stay in the operator's own account.

## Evidence boundary

Browser fixtures mount the actual AtlasConversationProvider, AtlasRuntimeProvider, AtlasChatConversation, AtlasBuildSurface, preview runtime, server POST route, owner APIs, SQL RPCs and website worker. Framework routing/auth transport and external Anthropic/SpeechRecognition responses are adapted. No paid provider call, physical microphone, logged-in owner browser or generated-site provider deployment is inferred from doubles. The prior aborted browser login is not retried or bypassed.

All database proofs use the newly owned labeled Docker fixture and the explicitly selected private test database. Stateful suites are serialized: resetWorkerDb in an overlapping suite can reconcile another suite's pending jobs. Two earlier overlapping runs are discarded, not counted as final evidence.

## RED → GREEN findings

- Bounded plan validation and deterministic brief/hash:32 tests; project names use the full UUID to prevent collisions.
- Real SQL plan/decision/start locking, canonical run insertion and stale/replay handling:13 planning tests plus13 worker tests and32 validators,59 total in the Task2 final gate.
- Authenticated APIs/settings:26 real SQL/API/store assertions,3 settings browser cases. Service-role auth.users SELECT was denied in the production privilege probe; the fixture now matches that and the unnecessary root lookup was removed rather than granting access.
- Actual chat native approval/model-tool boundaries and isolation:84 tests. A committed exact retry after a newer draft returns the original session; an unstarted stale decision is refused.
- Shared controller, voice capture and chat:111 tests; actual build-context/ownership gate33. Released microphone browser13, external speech doubles.
- Preview/workspace:9 released cases plus5 actual-surface cases. The loading-revision test proves both POST context and persisted feedback stay bound to the rendered v1 while v2 is selected/loading.
- Readiness/guides:21 catalog/API/SQL/tool assertions;6 initial browser states and a seventh expanded-guide layout case.
- Joined new-conversation flow:7 browser cases cover text idea→edited plan→approval→v1→feedback→v2; editable voice idea; lost acknowledgement/reload/exact replay; missing builder; historical feedback/foreign reference denial; mobile auto-open; separate unsent drafts across conversation switches.
- Visual inspection revealed a duplicated project-directory suffix and guide/composer overlap. Each had an observed browser RED and is fixed by showing the bound path once and a bounded conversation scroll pane. The same-component switch reproduced an unsent draft leak; a per-conversation React key restores independent drafts.
- A missing fixture Next router refresh method falsely produced an interrupted-turn notice despite a completed SSE. The strengthened joined assertion observed RED; the routing adapter now includes the actual documented method. This is fixture repair, not a production network fix.
- The broader initial351-test gate had4 failures: the new read tool lacked its Swedish UI label and the canonical source-count tripwire still expected117 instead of118. The label and explicit118/104 enforced inventory are repaired; frozen grandfathered/legacy allowlists are unchanged. No production application is claimed from a synthetic ledger.
- Real SQL export-pinning regression verifies a newer unapproved draft and a changed owner directory default cannot alter the approved plan/bound location in the ZIP; a foreign principal is refused.

Final fresh gate totals and activation evidence are appended after execution. No repository-wide green is claimed; unrelated inherited Windows/source baseline failures remain documented in ATLAS_ENTRY_VOICE_FIX_20261014.md.

## Implementation rulings (chronological)

1. Ruling: Native skill's bundled scripts/resources are not readable through the configured cloud skill provider (three reads failed); use the same ignored workspace/brief/ledger/test contract manually on Windows — preserves checkpoints and evidence — cost if wrong: checkpoint formatting can differ, no product authority changes.

2. Ruling: The user's project-directory addition is implemented in A as persistent owner defaults, bound per-project locations and real structured exports; actual host folder/image generation waits for a verified B execution adapter — current Vercel static worker cannot write to a Windows filesystem — cost if wrong: user might expect a host folder sooner; UI must explicitly show pending native creation.

3. Ruling: Full-suite baseline already has known failures documented in the earlier validation; use fresh impacted baseline and appropriate focused regression gates, then record broader checks only where justified — higher-level instructions require appropriate checks, not repeating unchanged unrelated failures — cost if wrong: an unrelated integration regression may escape focused tests; required isolation CI and final review remain.

4. Task 1: Ruling: Folder names use the complete UUID rather than the first eight characters — projects sharing a prefix must never collide — cost if wrong: longer names, no data overwrite.

5. Task 2: Ruling: Existing worker fixtures now need explicit real plan/operator decisions because the legacy RPC is intentionally closed — update test-only session setup, preserve worker assertions — cost if wrong: fixture setup could mask a gate bug; direct unplanned SQL denial remains separately tested.

6. Task 3: Ruling: Production service_role cannot SELECT auth.users (read-only privilege probe=false), unlike the original SQL fixture — remove the unnecessary root-get existence query, keep authenticated server principal and table FK; never grant auth access or use SECURITY DEFINER — cost if wrong: a trusted internal caller can read null for a nonexistent UUID, but cannot persist it past FK. Reproduced permission-denied RED in owned fixture; permanent canonical grants regression added.

7. Task 3: Ruling: Add /settings/website-build as a direct owner-bound settings destination alongside the vNext settings panel — Atlas needs a working settings link even when the legacy UI generation is selected — cost if wrong: one extra route to maintain, no legacy credential mutation changes.

8. Task 5: Ruling: Approved shared conversation work supersedes the old ChatClient private transport freeze; retargeted the legacy hydration/source-location tripwires to real rendering and shared sender behavior, kept the other legacy hash pins, ownership and history assertions — cost if wrong: legacy presentation may change; browser and SSR hydration checks remain. Expanded the event contract to the two reviewed website effects and supplied labels for the two actual plan tools. Fixture conversation POST/STT/TTS transport is adapted, not production auth.

9. Task 6: Ruling: Conversation pages use the shared owner-bound surface under both UI generations; keeping the old early legacy branch would leave the requested preview unavailable — cost if wrong: legacy chat body differs, but original shell tokens, owned history, and other legacy body pins remain. Updated the generation behavior tests to the shared loader rather than requiring the removed branch.

10. Task 6: Ruling: The fresh-idea approval/auto-open and missing-builder checks will be proved together in Task8's new-conversation joined fixture, rather than duplicating a second stub fixture here — uses the actual route/controller/SQL once — cost if wrong: Task6's intermediate commit alone is not releasable; final review and activation wait for Task8.

11. Task 7: Ruling: No generated-site terminal/provider account adapters are callable in Omnira, so all production connection statuses remain unknown with not_implemented adapters; readiness reads only the owned saved plan/settings — platform environment, broker enrollment and ChatGPT connectors do not prove capability — cost if wrong: manual login may exist but Atlas will not claim or exercise unproven access. Verified-target guides add explicit owner/project scope checks; no target is inferred.

12. Task 7: Ruling: A static preview currently requires no new app secret, so no local CSPRNG/key-generation recipe is emitted; provider tokens must be created through the issuing provider — avoids a fabricated API key or unused credential — cost if wrong: a later live feature needs its actual named secret and protected destination added in B/C.

13. Task 8: Ruling: Move Task9's pure canonical migration inventory/count update into Task8 so the impacted regression gate can complete before final review — the new SQL file is explicitly enforced118/104, never grandfathered; production remains unapplied — cost if wrong: a count reconciliation may be needed after refreshing main, not a relaxed guard.

## Release contract

The new planning migration is enforced, not grandfathered. Frozen applied migrations stay byte-identical. Final review and required checks precede production application. Apply-before-PR guard policy creates a schema-first window in which new starts are gated until the matching UI is deployed; historical reads/feedback continue. Failed activation keeps the gate closed; never restore unplanned creation.

Protected main is merged only with its real required PR contexts. No admin merge, forged check status or workflow_dispatch substitution is used. Exact merge SHA, deployment aliases, canonical guard, owner assignment and anonymous/foreign access checks must be recorded before A is called live.

## Reviewed provider guides

Reviewed2026-10-14 using official sources:

- https://www.strato.se/domannamn/sok-doman/
- https://www.strato.se/apps/CustomerService
- https://www.strato.se/faq/domaen/vilka-dns-poster-finns-tillgaengliga-hos-strato-och-hur-kan-jag-hantera-dem/
- https://vercel.com/docs/cli/login
- https://vercel.com/docs/cli/link
- https://vercel.com/docs/environment-variables/managing-environment-variables
- https://supabase.com/docs/guides/getting-started/api-keys

No price, static A/CNAME value, nameserver/mail change, registrar transfer, arbitrary model URL or fabricated API-key generator is encoded. Manual provider commands are non-secret, require the appropriate CLI/OS and do not connect Atlas's unavailable execution adapters.

## Fresh Task8 gates before review

-377/377 tests across30 impacted Vitest files, including real SQL planning/worker/API/export pinning, chat ownership/operator/read isolation, controller/voice and pure migration guard. Explicit private fixture; non-overlapping final run, exit0.
-Joined conversation7/7, readiness/status/expanded-guide7/7 and released microphone/entry13/13 Chromium cases, zero retries.
-Standalone TypeScript check exit0; main refreshed once and remains630a12c, so no integration conflict or count reconciliation was required.
-The final old workspace9 and actual-surface5 browser gates execute through the Task8 completion helper. Their result is recorded in the subsequent release evidence; no broader legacy baseline green is inferred.
