# B3: svarsförslag från vald Strato-evidens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Preserve the selected inline execution method and one fresh whole-increment review. Approved for implementation by André2026-10-18 06:01 Europe/Stockholm. A concrete first model trial remains separately gated on selected message/contact/offer.

**Goal:** André kan välja ett verifierat inkommande mejl och be Atlas ta fram ett svenskt, versionsbundet svarsförslag för granskning.
**Architecture:** En separat beständig svarskö använder redan sparad och uttryckligen vald B2-text, bekräftad filialkontakt och erbjudandeversion. Windows-specialisten använder den befintliga isolerade Claude-textkörningen; Atlas begär och visar arbetet. Första-kontaktkön behåller sitt kontrakt.
**Tech Stack:** Next.js/TypeScript/Supabase, Python3.12, befintlig kvalificerad Claude CLI2.1.296 och Credential Manager; inga nya paket, leverantörer eller SMTP-operationer.
**Spec:** docs/superpowers/specs/2026-10-17-atlas-harvey-sales-design.md §§4–9 samt den godkända B2-planens separata B3-gräns.

## För André

Nästa del låter dig säga till Atlas att förbereda ett svar på ett valt mejl. Först visar vi vilket mejl, vilken företagsfilial och vilken erbjudandeversion som används. Inkommande text behandlas som underlag. Resultatet visas som ett utkast med frågor där uppgifter saknas.

Nu finns sex inkommande rubrikrader, men ingen mejltext är vald och kontaktregistret är tomt. Därför blir första verkliga provet möjligt efter att ett relevant mejl valts och rätt kontakt/filial samt erbjudande bekräftats. Jag sköter installation och tester. Vi behöver inte ange Strato-lösenordet igen. Utkast skrivs i Atlas; Stratos Utkast-mapp och sändning ingår inte.

## Global Constraints

- Projekt8f673c09-1c8f-4d78-876e-4c14bf1c89b3; worker49d30271-cf0b-47c9-a70d-2bce5b9b09ba; mailbox5964032c-aad9-47c5-b986-71dc7339d775/info@handlarborsen.se. Inget standardprojekt.
- B2 INBOX sedan2026-10-07T22:00:00Z fortsätter oförändrat. Ingen ny eller tyst textmarkering/import; bara redan ägarvald text_state=complete och text_selected=true får lämnas till svarskörningen.
- Varje jobb avser exakt ett valt meddelande, en uttryckligen kopplad och bekräftad filialkontakt samt en bekräftad erbjudandeversion. Okänd/tvetydig koppling, ofullständig text, exkluderad/suppressed kontakt eller avvikande mottagaradress blockerar.
- Founding5 är redan kontaktade: inga nya första-kontaktjobb, ingen påhittad adress/historik och ingen automatisk filial- eller trådsammanslagning. Bekräftad historik contacted är tillåten för svar.
- Mottagare kommer från bekräftad kontakt, måste överensstämma med valt inkommande From, och avsändare från aktuell verifierad mailbox/erbjudandeversion. Ingen fri modellvald adress, CC eller BCC.
- Modellunderlag begränsas till ett valt meddelandes8KiB text, dess begränsade rubriker, en bekräftad kontakt och en erbjudandeversion. Ingen bilaga, webbsökning, tidigare tråd eller extern URL hämtas automatiskt.
- Högst tio atomiskt reserverade modellförsök per jobb inklusive fel och omförsök. Osäker dispatch återstartas aldrig automatiskt. Abonnemangskostnad visas som okänd när den inte kan verifieras.
- Ingen verktygs-/shell-/MCP-/browseråtkomst för specialistmodellen; ingen dold providerfallback eller ändring av Atlas huvudmodell.
- Alla claim/attempt/commit/read kontrollerar ägare/projekt, worker/claimgeneration, stopp, aktuell kontakt-, erbjudande-, meddelande-, mailbox- och scopeversion. Sent resultat kan inte bli aktuellt utkast.
- Behörighet att läsa inkorgen är inte behörighet att skicka mejl eller lämna all inkorgstext till modellen. Första verkliga modellprov visar konkret underlag och gräns innan start.
- Inga meddelanden skickas, inga sändningsgodkännanden eller SMTP-kvitton skapas. Granskningsbeslut är redaktionella, och framtida C måste implementera separat hållbar sändningsöverlämning.
- Privata meddelanden/prompt/resultat stannar i ägaravgränsad lagring och avsedd textkörning; inte Git, loggar, telemetri eller driftjournal.

## Review Focus

1. Delad mejladress för två filialer: uttryckligt kontaktval måste bestå och ett svar får inte byta filial automatiskt.
2. Inkommande text ber modellen byta mottagare, hämta URL eller godkänna utskick: externa data får endast påverka granskningsbart textinnehåll.
3. Ägaren byter textval, erbjudande eller mailboxgeneration under modellkörning: resultatet får inte bli aktuellt.
4. Samma begäran eller osäkert Claude-avbrott upprepas: inga dubbla jobb eller automatisk ny debiterad dispatch.
5. Ett nytt inkommande mejl tillkommer innan granskning: vyn måste visa att underlaget blivit äldre; trådkorrelation får inte bygga på Message-ID ensamt.

---

### Task1: beständig svarskö och versionskontrakt

**Files:** create apps/web/lib/sales/replies/{types,validate,store}.ts, tests in replies/store.test.ts and replies/validate.test.ts, SQL via `supabase migration new sales_reply_preparation`, apps/web/supabase/tests/sales_replies.sql; update schema classification and canonical counts with frozen14/30 unchanged.
**Consumes:** SalesPrincipal={userId,allowedProjectIds}; existing sales_owner/sales_stop; B2 immutable stored message/occurrence identity and explicit contact link.
**Produces:**
- PrepareReplyInput={projectId,conversationId,messageId,messageVersion,contactId,contactVersion,offerRevisionId,idempotencyKey}; idempotencyKey UUID, no addresses or body supplied by model.
- ReplyJobSummary={id,projectId,messageId,status,createdAt,detail}; status queued|running|needs_input|awaiting_review|failed|reconciling|cancelled.
- ReplyRef={projectId,jobId,workerId,claimId,generation}.
- ReplySnapshot={mailboxId,mailboxGeneration,inboxConfigVersion,messageId,messageVersion,contentSha256,header,text,contact,offer}; canonical alias resolution must retain the explicitly selected public message/contact provenance.
- ReplyDraft={subject,body,evidenceIds,questions}; subject1..90 chars without CR/LF, body1..2000 chars plain text, evidenceIds only the supplied message identity, questions<=10 each<=500.
- prepareReply(db,p,input):Promise<ReplyJobSummary>; readReplyJob(db,p,{projectId,jobId}):Promise<ReplyJobSummary>; separate tables sales_reply_jobs, sales_reply_attempts, sales_reply_draft_revisions; RLS and no API-role direct writes, only reviewed service-only invoker RPCs.

- [x] Write named SQL/TS tests: reply_accepts_confirmed_contacted_branch; reply_rejects_unselected_incomplete_foreign_or_unlinked_message; same_key_same_snapshot_one_job_changed_hash_conflict; changed_scope_or_source_fences_commit; shared_address_keeps_exact_branch; reply_attempt_limit_is_atomic_ten; newer_mail_marks_review_stale. Assert missing/foreign/stale inputs refuse and no first-contact row is created.
- [x] Run named tests and observe missing reply contracts FAIL.
- [x] Implement owner RPCs sales_reply_prepare/read_job/read_drafts/edit_draft/review_draft and worker RPCs sales_reply_claim/heartbeat/reserve_attempt/complete/report_failure with p_principal or p_token_hash plus p_input. Exact input fields above; expected draft revision/hash required for edit/review. New edit creates immutable revision and invalidates previous editorial approval. Store the job snapshot hash and model evidence binding.
- [x] Verify SQL on disposable PostgreSQL, owner/foreign/service grants, parallel duplicate requests and stale generation/offer/selection fences; run Vitest reply store/validation tests, expect all PASS.
- [x] Commit only these contracts and qualification evidence.

### Task2: fixed worker API and isolated reply adapter

**Files:** create replies/worker-api.ts, app/api/sales/replies/worker/route.ts, workers/sales/replies/{adapter,worker}.py, workers/sales/prompts/reply_sv.md; extend workers/sales/protocol.py, host.py and tests/test_reply_worker.py, test_reply_adapter.py, test_host_lifecycle.py.
**Consumes:** Task1 ReplyRef/Snapshot/Draft; SafeClaudeTextRuntime.generate(prompt,attemptId,cancel); existing host single-instance and managed worker credentials.
**Produces:** fixed purpose reply=/api/sales/replies/worker; operations claim,heartbeat,reserve_attempt,complete,report_failure. run_reply_once(client,adapter,before_dispatch=None)->bool; HarveyReplyAdapter.prepare(snapshot,permit,cancel=None)->ReplyDraft. No research call or first-contact operation fallback.

- [x] Write tests: reply_tools_and_address_injection_refused; malformed_json_cannot_change_evidence; reply_no_fetch_or_mail_call; reply_dispatch_uncertain_remains_blocked; managed_rotation_fences_late_reply; host_inbox_heartbeat_survives_reply_runtime. Assert only strict draft fields, fixed safe text runtime and expected refs can pass.
- [x] Run Python and worker API tests, observe FAIL on absent reply implementation.
- [x] Implement strict JSON output, Swedish factual reply prompt and subordinate reviewed tone guidance. Requests to change account/tools/permissions are untrusted text. Reserve one attempt immediately before each dispatch; do not retry model operations on transport uncertainty. Journal task kind/ref/attempt only before dispatch; clear only after durable accepted result or explicit safe reconciliation. Do not let the first-contact loop erase an uncertain reply marker.
- [x] Run full Windows Python suite plus reply API tests and typecheck; expect PASS/0. No real model or mailbox calls in these tests.
- [x] Commit.

### Task3: Atlas request tools and human review

**Files:** create replies/{api,atlas-tools}.ts, components/sales/SalesReplies.tsx; add app/api/sales/replies/route.ts; modify SalesInbox.tsx, SalesWorkspace.tsx, sales module registration in app/api/chat/route.ts; tests replies/api.test.ts, atlas-tools.test.ts, browser fixture and Playwright sales inbox/reply cases.
**Consumes:** Task1 owner contracts; existing validated conversation-to-project binding; B2 selection/link APIs remain owner operations.
**Produces:** prepare_sales_reply(input:PrepareReplyInput), get_sales_reply_job({projectId,jobId}); both conversation/project-bound, neither selects text/contacts, approves, sends or changes scope. UI displays source metadata, exact branch and offer, revision and staleness with explicit editorial actions.

- [x] Write tests: atlas_cannot_prepare_without_bound_conversation; two_branches_same_address_require_choice; unselected_text_cannot_silently_start_model; stale_revision_cannot_approve; incoming_html_is_plain_text_and_cannot_trigger_fetch; no_send_action_exposed. Assert visible blocking reason and immutable old evidence.
- [x] Observe tests FAIL.
- [x] Implement owner UI actions and private/no-capture markup; unknown/ambiguous contacts show needs_input. Display "Svarsförslag för granskning — inget skickas". A new message is shown as newer evidence, never appended to the model input or promoted to reply intent automatically. Owner chooses whether to prepare another job.
- [x] Run scoped sales/security tests, typecheck and desktop/mobile Playwright; inspect screenshots. Expect PASS and no external content request.
- [x] Commit.

### Task4: qualification, concrete model trial and pinned rollout

**Files:** update apps/web/scripts/test-sales-db.mjs; create lib/qa/sales-reply-integration.test.ts and workers/sales/tests/reply_cross_fixture.py; verification docs and immutable candidate receipt.
**Consumes:** Tasks1–3, current active B2 install/server pins from actual activation receipt (refresh them; do not assume generation3 after later rotation).
**Produces:** reviewed independent qualification and separately authorized concrete single reply trial; no sending capability.

- [x] Write integration assertions: SQL->Next->fresh Python subprocess->fake text runtime->durable draft->owner/Atlas read; kill before/after result commit, wrong owner/branch, pause/revoke/offer change during runtime, duplicated request and uncertain-dispatch recovery. Assert no second model call on an accepted replay, no send operation.
- [x] Run and observe new integration FAIL; complete only the minimal seams and verify all cases PASS.
- [x] Run full Python, scoped sales/security/schema, typecheck and browser; compare full web failures by exact identity against a fresh approved base. Historical401 is earlier evidence, not permission to absorb new failures. Record any changed identities.
- [x] One fresh whole-increment review, one regression-tested Important/Critical fix pass. No re-review loop; report all rulings and deferred minors.
- [ ] Prepare migration hash, protected preview and distinct hashed client without changing current B2 host. Show concrete trial: one message already selected by owner, verified branch/email/history, sender, offer revision, exact input boundaries, Claude provider and ten-attempt job ceiling. With no complete relevant message or confirmed contact/offer, stop at needs_input and report limitation.
- [ ] After plan review and concrete trial authorization, apply only reviewed DDL with ordinary guard/RLS/catalog/advisors checks, qualify preview contract, preserve manager/mailbox/key refs through controlled origin migration, upgrade only owned task after its old process is gone.
- [ ] Observe one real authorized reply preparation. Show the draft privately in Atlas and actual status/cost uncertainty; persist evidence and restart/replay proof. No test email is sent and no Strato draft is saved.
- [ ] Commit/push actual receipt, keep PR unmerged and broad outreach paused. C sending remains a separate plan.

## Självgranskning och handoff

Spec §§4–9 maps to confirmed branch/offer/history and no initial recontact (Task1), isolated bounded provider and recovery (Task2), bound Atlas/human revision review (Task3), and real qualification with separate sending boundary (Task4). All five Review Focus cases have named tests. No implementation or extra mailbox/model permission is implied by creating this plan.

Inline execution is already selected. André reviews this concrete B3 plan before implementation, then the exact first model trial before any selected private message is sent to that provider.


B3 local qualification2026-10-18: source/client candidate and reviewed fixes are ready; actual trial/DDL/protected-preview/host rollout remain needs_input. See verification/2026-10-18-sales-reply-candidate.json and verification/2026-10-18-sales-reply-preparation.md. Do not mark Task4 complete until the real selected-message trial and actual rollout receipt exist.


## General replies and actual activation -2026-10-18 09:13 Stockholm
Owner approved the bounded ordinary-reply mode. An explicit replyMode=general uses one already selected complete message, the same trusted conversation, mailbox/scope/generation/source/version fences, exact saved From, address-wide suppression/exclusion refusal, fixed bounded provider and ten-attempt ceiling. No commercial contact or offer is fabricated. Commercial mode retains its prior exact contact/branch/offer checks. General drafts cannot promise pilot terms/prices; sender and signature are server-owned, pinned to the owner's approved exact project/mailbox.

RED observed: general request INVALID_BODY, adapter missing general context, PostgreSQL refusal of the mode and browser missing ordinary-reply selector. GREEN: Python126/126 (also from55-file immutable install), validation/Atlas38, all-sales/schema452 PASS with31 explicit skipped integrations/SQL, tsc0, browser12/12. Real PostgreSQL contracts, both cancel/edit races and concurrent requests/ten-permit bounds pass. Complete five-integration run had4 PASS and a newly extended synthetic runtime's obsolete commercial-branch assertion fail in general mode; corrected only that test fixture, then all9 reply crash/fence/general modes pass in a fresh dedicated realDB/Next/fresh-Python run.
Broad15052 total/13315 passed/402 failed/1331 pending: no new identity against fresh approved BASE403. Recurring unchanged A6-2 diagnostics5000ms timeout is the only extra against the prior final401; dedicated platform53/53 passes. This is not an all-green repository.

Reviewed additive B3 SQL SHA7516d8566ae7776086452ff8fdd51058ce34a10ab70973bcdbf4ee14f655a3cc applied; generated ledger version20261018070222 normalized by exact one-row/name/cardinality/SHA guard to source20261018040242. Three RLS tables, zero client grants and23 service-only invoker routines verified. Security-advisor delta contains only the three intentional no-policy INFO entries; unrelated existing WARNs unchanged. Protected preview453daaa READY and ordinary migration guard124/124 with161 known names, no override.

Upgraded only the owned task after asserting old task XML/current SID/Python/root/manifest: oldPID42904 absent before newPID48884. Exact manager/worker/mailbox refs, existing RSA kid, hostgen3 and mailboxgen6 preserved through explicit origin migration. New immutable55-file install source453daaa, manifeste67863cd73283aded4ef894cc7759fcf59ebed5f2ada9a0a11d372f79a7d0f0d. replyEnabled=true; sending remains unavailable.

Created one real owner/project-bound test conversation because all existing Handlarborsen-related conversations were global/projectless. Did not relabel old conversations or fake a branch. Operator invoked canonical owner prepare RPC, not a live natural-language Atlas dispatch. The active permanent host claimed the selected owner message and completed exactly1 actual Claude attempt. Initial draft had2 questions already answered by owner-confirmed delivery and verified sender metadata; saved an immutable human-editable revision clearing only these resolved questions (no new provider call, no editorial approval). Current draft has0 questions, exact Andre sign-off and pending approval. After actual owned-host restart48884->47760 the same current revision and attempt count1 persist; source still current and B2 scope enabledv2/gen6.

Browser login on the new immutable origin is pending; the old origin session did not transfer. Real private UI review and live natural-language Atlas request are NOT claimed proved. Task4 stays open for that acceptance, and its workspace is retained. C sending remains separate, no mail was sent, no Strato draft saved, no customer body selected and Moberg/broad outreach remains paused. See general-activation.json for exact pins and metadata only; private source/draft text is not committed.
