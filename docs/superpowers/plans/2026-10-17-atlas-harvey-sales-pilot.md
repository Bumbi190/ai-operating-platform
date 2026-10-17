# Atlas Harvey Sales Pilot A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first project-bound flow from an Atlas request through a local Harvey drafting specialist to five reviewable Swedish email drafts, without sending mail.
**Architecture:** Omnira owns contacts, immutable offers, jobs, revisions and approval lineage. An outbound-only Windows worker executes bounded text tasks using pinned Harvey sales material and a tool-less Claude runtime. SMTP, IMAP and sales sending are separate deliverables B and C.
**Tech Stack:** Existing Next.js 14 / TypeScript / Supabase Postgres / Vitest / Playwright; Python 3.12 on the Windows worker; Python unittest for the worker.
**Spec:** `docs/superpowers/specs/2026-10-17-atlas-harvey-sales-design.md`, approved by André on 2026-10-17 at 11:52 Europe/Stockholm.
**Workspace:** `codex/atlas-harvey-sales-20261017`, based on `146c5db4db2acb2b4c7d4bf959e1603562b6ebaa`. Design commit: `885990d9c4e45072b8cb8b8d8edbab4efba60f38`.
**Execution:** Awaiting review of this written plan and selection of Native or Subagent-driven. Native is recommended because these tasks share a narrow contract and changes to canonical chat/approval boundaries need a final independent review.

## Global Constraints
- Harvey source/material is pinned to `e114e95471b1bf155454fca108f0730b66a47a01`; preserve the MIT license and record hashes of reused files.
- First job: explicitly selected contact IDs, 1–5 contacts, one initial draft per contact, Swedish language. No discovery campaign, new paid source, email dispatch or follow-up scheduler.
- At most ten model attempts per job including retries; each attempt is durably reserved before dispatch. No automatic model/provider fallback.
- A contact's company, branch and mailbox are distinct. Domain/email normalization must not merge branches.
- Project/conversation ownership, execution stop, worker revocation, claim/generation and immutable content binding apply independently.
- No production service-role credential on the local worker; no incoming port; no public Harvey dashboard; no unbounded Harvey heartbeat.
- Mailbox passwords, runtime credentials and bearer tokens never appear in chat, model input, logs, memory or Git.
- Draft/research content is untrusted text; it cannot approve itself or execute tools. No requirement to conceal AI identity.
- Status must distinguish unavailable, blocked, queued, running, needs_input, awaiting_review, failed, reconciling and cancelled. A timeout is never proof of non-execution.
- All new features default off with `ATLAS_SALES_ENABLED=false`; `ATLAS_SALES_PROJECT_ID` must match that project's verified UUID before enabling. No first-project fallback.
- Parts B/C remain in the approved design; no SMTP/IMAP credential access or external send belongs to this implementation plan.

## Review Focus
1. Previously contacted Founding 5 or repeated mailbox across branches: show history and refuse a duplicate initial-contact job unless explicitly classified as a separate requested follow-up; follow-up execution is outside Pilot A.
2. Stale/revoked worker or crash during a model call: reject stale results, preserve reserved attempts, enter reconciling; never silently regenerate.
3. Valid-looking model output with invented offer, foreign contact IDs or missing evidence: reject wrong bindings and require human questions/review; structural checks cannot prove every semantic claim.
4. Generic approval route can resolve a run without knowing the current sales revision: new revisions must atomically invalidate pending older approvals; displayed approval must match current revision hash.
5. Claude installed configuration can load hooks/plugins or log prompts: isolated text runtime, explicit disabled surfaces, redacted logging and no live inference until the installed CLI's behavior is verified.

## File Structure and Public Contracts
- `apps/web/lib/sales/{types,validate,binding}.ts`: shared domain validation and immutable draft hashing.
- `apps/web/lib/sales/{store,worker-protocol,worker-auth,api,atlas-tools}.ts`: database, worker identity/protocol, operator HTTP boundary and Atlas tools.
- `apps/web/app/api/sales/route.ts`: operator GET/POST adapter; `app/api/sales/worker/route.ts`: worker POST adapter.
- `apps/web/components/platform/vnext/sales/{SalesWorkspace,SalesSummaryCard}.tsx` and `SalesWorkspace.module.css`: project-integrated drafting and review.
- `apps/web/app/(platform)/projects/[slug]/sales/page.tsx`: owned project workspace, linked from the existing project page, no global navigation item.
- `workers/sales/{protocol,worker,research,harvey_adapter,claude_runtime,credential_store,cli}.py`, `prompts/draft_sv.md`, `tests/`, `README.md`, `upstream-manifest.json`: outbound-only specialist and installation/proof instructions.
- `apps/web/lib/qa/sales-*.test.ts`: tests remain inside the existing Vitest include; no config expansion needed.
- `apps/web/supabase/tests/sales_pilot.sql`: disposable-database transaction/RLS tests. Migration is created using `supabase migration new atlas_sales_pilot` from `apps/web`; use its generated filename.
- New core types: `SalesPrincipal={userId:string;allowedProjectIds:string[]}`, `PrepareSalesInput={projectId:string;conversationId:string;contactIds:string[];offerRevisionId:string;idempotencyKey:string}`, `SalesDraft={contactId:string;contactVersion:number;offerRevisionId:string;senderEmail:string;toEmail:string;subject:string;body:string;evidenceIds:string[];questions:string[]}`.
- `SalesJobRef={projectId:string;jobId:string}`; `SalesWorkerRef={workerId:string;projectId:string;jobId:string;claimId:string;generation:number}`.
- `SalesWorkspace={projectId:string;state:string;workerState:string;contacts:SalesContact[];offers:SalesOfferRevision[];jobs:SalesJobSummary[];drafts:SalesDraftRevision[];workspaceUrl:string;sendingEnabled:false}`. Types named here are defined in `types.ts`; all IDs are UUIDs, all persisted times are UTC.

### Task 1: Validated contact/offer and immutable draft contracts
**Files:** create `types.ts`, `validate.ts`, `binding.ts`, `lib/qa/sales-contract.test.ts`.
**Consumes:** approved spec, operator-confirmed contact facts and offer text.
**Produces:** `parsePrepareSalesInput(value:unknown):PrepareSalesInput`, `parseSalesDraft(value:unknown):SalesDraft`, `hashSalesDraft(draft:SalesDraft):string`, `normalizeSalesEmail(value:string):string`.
- [ ] **Write failing tests:** `prepare_rejects_six_contacts` expects INVALID_BODY; `draft_binding_changes_with_sender_recipient_body_offer` asserts distinct SHA-256 hashes; `branch_ids_survive_shared_mailbox` asserts two branch IDs remain distinct; `disclosure_is_allowed` accepts ”Jag är en AI-assistent”; `foreign_contact_and_evidence_ids_rejected` expects BINDING_MISMATCH.
- [ ] **Run red:** `npm run test --workspace=apps/web -- lib/qa/sales-contract.test.ts`; confirm failures come from missing contracts.
- [ ] **Implement:** exact-field schemas, 1–5 distinct contact IDs, subject 1–90 characters, body 1–2000 characters, no CR/LF in addresses/subject, no HTML or unresolved merge tags. Hash a fixed-order JSON array of all SalesDraft fields; canonicalize email and sorted evidence IDs, never silently truncate.
- [ ] **Run green:** same test command, all pass.
- [ ] **Commit:** `feat(sales): define contact and draft contracts`.

### Task 2: Durable project-bound store, attempts and review lineage
**Files:** create generated migration, `store.ts`, `supabase/tests/sales_pilot.sql`, `lib/qa/sales-store.test.ts`.
**Consumes:** Task 1 types/hash; existing projects, conversations, runs, approvals, resolve_approval and project execution-stop semantics.
**Produces:** `readSalesWorkspace(db,p,projectId):Promise<SalesWorkspace>`, `prepareSalesDrafts(db,p,input):Promise<SalesJobSummary>`, `readSalesJob(db,p,ref):Promise<SalesJobSummary>`; service-only SQL RPCs named `sales_save_contact`, `sales_save_offer`, `sales_enroll_worker`, `sales_revoke_worker`, `sales_prepare_job`, `sales_claim_job`, `sales_heartbeat`, `sales_commit_research`, `sales_reserve_attempt`, `sales_commit_drafts`, `sales_control_job`, `sales_save_revision`.
- [ ] **Write failing tests:** foreign project/conversation refused before writes; same idempotency key+hash returns same job; changed hash gives conflict; simultaneous claims produce one winner; attempt 11 refused; contact/offer change refuses old result; stopped project prevents new attempt; cancelled job refuses late results; revision replaces pending approval atomically. SQL tests assert anon has no access, nonowner reads zero, browser roles cannot call mutators, and generic approval cannot approve a superseded pending revision.
- [ ] **Run red:** Vitest `lib/qa/sales-store.test.ts`; start a disposable local DB using installed CLI help and run `supabase test db` from `apps/web`. Record unrelated baseline failures separately; never reset a remote DB.
- [ ] **Implement tables:** `sales_contacts` (project, company/branch IDs, version, mailbox, source/history and suppression), `sales_offer_revisions` (immutable text/facts/version), `sales_evidence` (job/contact/source URL, observed-at, literal extract, content hash and provenance='worker_observed'), `sales_jobs` (snapshots, status, claim/generation, lease, request hash, attempt count), `sales_worker_registrations` (project/owner/capability, token hash, expiry/revocation), `sales_model_attempts` (unique permit, contact/job/claim, dispatch status), `sales_draft_revisions` (immutable text/hash, run/approval links, current revision binding). Composite project foreign keys prevent cross-project references. RLS SELECT follows existing project ownership; revoke browser mutation/function privileges; service-only SECURITY INVOKER RPCs with fully qualified objects.
- [ ] **Implement transitions:** store jobs outside generic pending runs so the generic workflow runner cannot claim them. A valid completion creates one `sales.email.draft.v1` run already awaiting_approval and a `sales_draft_review` approval per reviewable draft in the same transaction. Unanswered required questions create needs_input, not approval. New revision locks old run then approval in canonical order, invalidates pending old review and inserts new lineage; previous approved versions remain historical, never current permission. Lease 90 s, heartbeat 15 s; expired in-flight attempt becomes reconciling. No auto-reclaim of uncertain paid work.
- [ ] **Run green and commit:** both SQL and Vitest pass; check new objects with database advisors/security checklist; commit `feat(sales): persist governed draft jobs and reviews`.

### Task 3: Worker identity, protocol and operator HTTP boundary
**Files:** create `worker-auth.ts`, `worker-protocol.ts`, `api.ts`, both sales API routes, `lib/qa/sales-api.test.ts`, `lib/qa/sales-worker-protocol.test.ts`.
**Consumes:** Task 2 RPCs/store; resolveProjectAccess, assertSameOrigin, canonical execution stop.
**Produces:** `salesApi(request:Request):Promise<Response>`, `salesWorkerApi(request:Request):Promise<Response>`; operator operations `save_contact`, `save_offer`, `prepare`, `revise`, `cancel`, `enroll_worker`, `revoke_worker`; worker operations `claim`, `heartbeat`, `reserve_attempt`, `complete`, `report_failure`.
- [ ] **Write failing tests:** wrong/missing origin denied for operator mutations; malformed UTF-8 or >64 KiB body rejected; arbitrary project/worker ID denied; expired/revoked token denied; replayed complete is same receipt; changed result on same receipt conflicts; offline worker produces queued/unavailable truth; paused project refuses reserve_attempt even after successful claim.
- [ ] **Run red:** `npm run test --workspace=apps/web -- lib/qa/sales-api.test.ts lib/qa/sales-worker-protocol.test.ts`.
- [ ] **Implement:** read session before any admin operation; validate principal/project/conversation again in RPC. Enroll requires explicit human UI action, generates 32 random bytes, stores SHA-256 only and returns secret once with no-store headers. Registration capability is only draft_prepare for one project and expires after 24 hours; reconnect requires deliberate re-enrollment. Worker bearer is sent only to configured HTTPS origin; no redirects, query tokens or general-purpose proxy. Endpoint accepts fixed operations and calls server-only RPCs; worker never has database credentials. Reserve each model permit immediately before execution and record completion/failure separately; lost authorization stops later calls.
- [ ] **Run green:** all protocol tests; verify response/log redaction and missing-table behavior returns unavailable rather than fake empty success.
- [ ] **Commit:** `feat(sales): add scoped local worker protocol`.

### Task 4: Local Harvey text specialist and bounded Claude runtime
**Files:** create planned `workers/sales/` modules, prompt, manifest, MIT notice, unittest cases; add no server packages.
**Consumes:** Tasks 1–3 JSON protocol and model-attempt permits; pinned Harvey `email_frameworks.md` and `lead_qualification.md` after line-by-line review.
**Produces:** `HarveyDraftAdapter.prepare(snapshot,permit_client)->DraftBatchResult`; `SafeClaudeTextRuntime.generate(prompt:str,permit_id:str)->str`; CLI `python -m workers.sales.cli doctor|connect|run --once`.
- [ ] **Write failing tests:** exact contact/offer grounding and Swedish prompt; one draft/contact, no Writer.run/campaign/sender import; sixth contact rejected; malformed/foreign-ID model output refused; tenth permit last allowed; no automatic retry on timeout; cancelled/expired claim stops next call; no token/prompt in captured logs; CLI tool/hook/plugin disabling and isolated working directory enforced.
- [ ] **Run red:** `python -m unittest discover -s workers/sales/tests -v`.
- [ ] **Implement:** vendor only reviewed pinned Markdown and MIT notice with SHA-256 manifest; do not execute upstream heartbeat, Writer.run, Sender or Handler. This first adapter reuses Harvey's sales material, not the full standalone agent. Use a fixed Swedish prompt with structured source facts, exact offer, one relevant question and honest AI disclosure. No fact is silently invented to fill missing fields; return questions. Model output uses strict json.loads and Task 1-equivalent validation; model evidence IDs must belong to the persisted job/contact evidence snapshot. No model-controlled web tools, SMTP/IMAP imports or discovery API keys.
- [ ] **Implement source research:** `fetch_contact_homepage(url:str)->EvidenceFragment` in `research.py` accepts only the operator-confirmed HTTPS homepage for that contact, port 443, no credentials, no redirects and no model-provided URL. Resolve DNS, reject every private/loopback/link-local/multicast/reserved IPv4/IPv6 destination, connect to the validated IP while verifying TLS for the original hostname, and cap response at 64 KiB/10 seconds. Extract at most 8 KiB of plain text using the standard HTML parser, remove scripts/styles/forms, and attach canonical URL, UTC observation time and SHA-256. Do not make requests to pages on missing/failed verification. Persist evidence through sales_commit_research before issuing a model permit; label it worker_observed rather than human-verified. Tests cover public-to-private DNS/redirect, oversized response, fake instructions in HTML, missing website and saved source bindings. A failed homepage fetch returns a visible question and uses existing confirmed facts only; no search or guessed facts.
- [ ] **Implement runtime and worker:** inspect `claude --help` of installed 2.1.296 before relying on flags. Start child in a fresh empty directory with `--tools ""`, strict empty MCP config, disabled slash commands, no Chrome, no session persistence and verified disabled hooks/settings/plugins; reject unsupported/managed configuration if isolation cannot be established. Do not use `--bare`: its help says OAuth/keychain are not read. Do not use skip-permissions. Inputs go over stdin; subprocess arguments contain no contact text or bearer. Preserve user's existing login/config untouched. Limit each call to 120 s and kill only its owned child on cancellation; unknown dispatch is reconciling and no retry. Background heartbeat renews lease while model runs. Windows credential-store API stores the worker token under a project/registration-specific name; no plaintext token files. Doctor makes no model or mail call and reports capability/CLI readiness without login contents. Connection enrollment is a human action, not a side effect of installation.
- [ ] **Run green and commit:** full worker unittest passes using fake provider/HTTP; record version/help evidence and CLI-isolation probes before any live prompt; commit `feat(sales): add bounded Harvey drafting worker`.

### Task 5: Atlas tools and project drafting/review UI
**Files:** create `atlas-tools.ts`, SalesWorkspace/SalesSummaryCard/CSS, project sales page; modify chat route and existing project page; create `lib/qa/sales-atlas-tools.test.ts` and `lib/qa/sales-view-model.test.ts`.
**Consumes:** Tasks 1–4 store/API; existing owned project resolver and review queue.
**Produces:** `SALES_TOOLS`, `SALES_TOOL_NAMES`, `SALES_GUIDE`, `handleSalesTool(name,input,principal,conversationId,db):Promise<unknown>`; exact tools from spec.
- [ ] **Write failing tests:** tools omit approve/send/enroll; model cannot inject raw recipient; foreign conversation refused; feature-off tools absent; read returns actual workspace URL; queued job never rendered running; review content matches current revision/hash; two branches stay separate; prior first-contact and uncertain history block new initial draft selection.
- [ ] **Run red:** `npm run test --workspace=apps/web -- lib/qa/sales-atlas-tools.test.ts lib/qa/sales-view-model.test.ts`.
- [ ] **Implement:** modular registration follows SOCIAL_CONTENT_TOOLS pattern and all supported chat modes; preserve existing voice/build/social behavior. Tool guide requires workspace read, explicit IDs and exact current offer; returns saved job ID and status, never simulated work. UI supports operator-confirmed contacts/history and immutable offer saving; no automatic import of the remembered 139 rows. Register contact evidence as plain text with source/observation timestamp. Save and review contact changes before preparing; missing actual pilot source must be visible.
- [ ] **Implement review:** SalesSummaryCard is a project-local link/summary, SalesWorkspace has contact selection, job states and exact draft display. Existing review links show canonical approval/run. Human revisions use expected revision CAS, new hash and Task 2 invalidation. Editorial approval button is labeled ”Godkänn utkast”; persistent notice ”Utskick är inte aktiverat”. No send, reconnect-to-mailbox or autopilot control. Worker connect/revoke is separate explicit human UI action. Feature-off preserves current project markup.
- [ ] **Run green and commit:** tests plus `npm run typecheck --workspace=apps/web`; commit `feat(sales): prepare and review drafts through Atlas`.

### Task 6: End-to-end proof, installation notes and reviewable delivery
**Files:** create `apps/web/e2e/sales-pilot.spec.ts`, `workers/sales/README.md`, `docs/superpowers/verification/2026-10-17-atlas-harvey-sales-pilot.md`.
**Consumes:** complete Pilot A; a disposable fixture project and fake model/worker before any live setup.
**Produces:** traceable proof, reviewed branch/PR and explicit activation status.
- [ ] **Write failing end-to-end scenario:** owned project → save two separate branches sharing a mailbox and a verified 12-month offer → explicit Atlas prepare request → close/reopen chat → fake worker completes → five exact drafts in project reviews → edit one → old pending approval cannot be resolved → cancel another job → late completion refused. Fake provider must record zero SMTP/IMAP operations.
- [ ] **Run red then implement test fixtures only:** `npm exec --workspace=apps/web playwright test e2e/sales-pilot.spec.ts` using a dedicated local fixture database; never use production contact rows for destructive tests.
- [ ] **Verify complete slice:** contract/API/store/tool/view Vitest tests, worker unittest, SQL suite, typecheck, migration checks and the scoped Playwright scenario. Check approved design requirements A against artifacts. Run voice/build/social tests affected by chat registration. Re-run only when changes/failures justify it. Record unrelated baseline failures honestly.
- [ ] **Run first live probe only after prerequisites:** verified subscription terms/runtime isolation, explicit worker enrollment and chosen project/contacts; one synthetic model example first, then the five operator-confirmed businesses. Actual contact research uses the approved homepage fetch from Task 4 and stored literal evidence; record source failures as questions rather than silently skipping them. No mailbox credential is needed for Pilot A. Record actual model/provider, attempts, timings, drafts, unanswered questions and review URLs.
- [ ] **Self-review and handoff:** fresh independent code review at chosen execution method's required point; address material findings, commit evidence and create a draft PR. State exactly which tests ran, what is connected and whether live inference occurred. Default flag remains off until the verified project pilot is explicitly enabled.

## Separate Deliverables B and C
B requires its own implementation plan for secure Strato setup, SMTP/IMAP login tests, selected history/start boundary, UIDVALIDITY/UID+PEEK ingestion, persistence before checkpoint, dedupe and an explicitly approved private test recipient/text. No customer sending.
C requires its own implementation plan for version-bound send authorization, atomic decision-to-outbox handoff, suppression and stop rechecks, no blind SMTP retry on delivery_unknown, observed receipts and current Swedish/Strato outreach conditions. Existing pause on broad pilot outreach remains.
These are retained requirements, not silently omitted or labeled complete by Pilot A.

## Self-review and Execution Handoff
The plan covers spec sections 1–6 and Pilot A in sections 9–10. Spec sections 7–8 and B/C in section 9 are explicitly sequenced next. No promise of calendar auto-booking or full autonomy.
Task contracts share the same IDs/types and status vocabulary; review focus items map to Tasks 1/2/4/5. No remote database reset, actual credential extraction or contact send is a planning step.
Recommended execution: **Native** — implement tasks in this session and request one independent whole-branch review before delivery. This avoids repeated context copies while preserving a fresh review of the project/approval boundaries.
Before product implementation, André reviews this written plan and chooses Native or Subagent-driven.
