# Kontrollerat utskick av godkänt mejlsvar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. Preserve the already selected inline execution method; one independent review of the complete increment, no per-task reviewer loop.

**Goal:** Låta André skicka exakt ett granskat svar via Strato som Andre <info@handlarborsen.se>, med tydlig förhandsvisning, separat sändningsbeslut och beständigt kvitto.
**Architecture:** Återanvänd B3:s privata mejlversion och redaktionella godkännande. En separat sändningskö skapas först av en uttrycklig ägaråtgärd; en lokal worker skickar det förseglade underlaget via befintlig Strato-credential. Osäker acceptans spärrar omsändning.
**Tech Stack:** Existing Next.js/TypeScript/Supabase/Python3.12, smtplib/ssl/EmailMessage, existing Credential Manager and managed host; no new provider or package.
**Spec:** docs/superpowers/specs/2026-10-17-atlas-harvey-sales-design.md §§5–9; approved ordinary-reply extension and sender preference in verification/2026-10-18-sales-reply-general-activation.json and verification/2026-10-18-sales-sender-preference.json.

## För André: konkret första prov

Den godkända mejlversionen är 91736c50-3db6-4d68-86f8-1660672fed0f, hash 2cbea93b7c7bb3e1c04190d954ed857cc9a2a72ad74c7841cfd78c8384dc6b4a. Den godkändes 2026-10-18 kl09:30:15 Stockholm. Själva privata mejltexten kopieras inte hit.
Första tillåtna mottagare är endast den redan valda privata testadressen andrehultgren190@gmail.com. Avsändare och signatur är Andre / info@handlarborsen.se.
I samma läsbara förhandsvisning kommer en separat knapp: **Godkänn och skicka detta testmejl**. Den visar hela texten och exakt mottagare innan sändningsbeslutet sparas. Det tidigare textgodkännandet skickar aldrig automatiskt.
Kvitton visar **Accepterat av Strato**, **Misslyckat före sändning** eller **Leverans osäker — skicka inte igen**. Mottaget i Gmail verifieras separat.
Inga kundutskick, kampanjer eller uppföljningar aktiveras. Moberg och övriga redan kontaktade företag lämnas orörda.

## Global Constraints

- Exact project8f673c09-1c8f-4d78-876e-4c14bf1c89b3, ownerd63a09fb-448e-41b8-9fb2-9a608f5f1800, worker49d30271-cf0b-47c9-a70d-2bce5b9b09ba, mailbox5964032c-aad9-47c5-b986-71dc7339d775. Refresh active generations; never copy an old generation into a new config.
- Sender comes from approved server-owned mailbox identity; From=Andre <info@handlarborsen.se>. No model-selected recipient/name, CC/BCC or address override.
- Only a current immutable approved reply revision with no unresolved questions and current source can request sending. Ordinary reply mode has no fabricated commercial offer/contact.
- Owner session + Origin + project/owned conversation checks remain. Atlas may read send status; cannot approve text, authorize sending or mutate allowlist.
- Initial scope is one explicitly confirmed owner-test recipient. Customer sending stays disabled, even after owner-test success.
- Any new source version, newer incoming mail from the address, suppression/exclusion, changed mailbox/scope/generation, project pause, revoked worker or changed sender/recipient invalidates unsent authority.
- Dispatch reservation is the irreversible boundary for this protocol: pause before reservation refuses; after an external SMTP envelope may have begun, no recall is promised.
- At most one SMTP DATA operation per send job. Any crash after durable dispatch intent is delivery_unknown unless a durable accepted receipt can be recovered. No automatic retry on timeout, lost receipt, reconnect or restart.
- SMTP250 means server acceptance, not inbox delivery/read receipt. Gmail verification is separate. Do not claim a Sent-folder copy; no IMAP APPEND.
- Password remains in OS Credential Manager; private body/payload remains owner-only DB and protected local temporary memory. Metadata-only journals/logs/Git. Never retain a password or SMTP auth transcript.
- Existing B2 reads, B3 provider queue and unrelated worktrees/tasks remain intact. No merge or production alias promotion. Reuse stable protected UI URL; pin worker origin/install independently.

## Review Focus

1. Two tabs double-click or use distinct idempotency keys for one revision: one send job and at most one DATA.
2. Pause/suppression/new reply or revised text races dispatch: pre-dispatch authority rechecked under shared source/run/job lock order; a stale decision cannot send.
3. SMTP accepted but response/HTTP receipt is lost: restart never emits another DATA; show delivery_unknown until explicit evidence settles it.
4. One address belongs to multiple branches, or From/Reply-To differs: retain saved selected From and exact revision lineage; no implicit recipient change.
5. Old generic approval control or Atlas/incoming content requests sending: cannot create send authority; only the dedicated owner confirmation path can do so.

---

### Task1: immutable send authority, scope and durable queue

**Files:** create apps/web/lib/sales/sending/{types,validate,store}.ts and their tests; migration via supabase migration new sales_reply_sending; apps/web/supabase/tests/sales_sending.sql; extend schema classification/canonical counts only for actual new migration/tables.
**Interfaces:**
- ConfirmSendInput={projectId,revisionId,expectedRevisionHash,expectedMailboxGeneration,idempotencyKey}; no body, address or sender fields.
- SendRef={projectId,sendJobId,workerId,claimId,generation}.
- SendJobSummary={id,status,revisionId,revisionHash,createdAt,acceptedAt,detail,serverAccepted:boolean,deliveryConfirmed:false}; status queued|claimed|dispatching|smtp_accepted|failed_before_send|delivery_unknown|cancelled.
- SendSnapshot={sealedJson:string,snapshotSha256:string}; sealedJson is one stored exact UTF8 JSON string containing source/revision/mailbox/scope identity, approved subject/body, exact sender and recipient, stable Message-ID/date and bounded In-Reply-To/References from saved message. Hash the exact string bytes, never cross-language reserialization.
- Owner functions confirmReplySend(db,principal,input), readReplySend(db,principal,{projectId,sendJobId}), cancelReplySend(db,principal,{projectId,sendJobId,expectedRevisionHash}):Promise<SendJobSummary>; fixed service-only invoker RPCs sales_send_confirm/read/cancel.
- Worker RPCs sales_send_claim/heartbeat/begin_dispatch/complete/read_receipt/report_uncertain; service-only grants and RLS tables sales_send_policies/jobs/events. No direct client writes.
- cancel refuses once dispatch intent is reserved; it must never claim to recall an accepted/uncertain email.
- Initial policy is installed by the trusted operator during the reviewed rollout only; no model or public policy-write endpoint is introduced.
- Owner-test policy: explicit saved owner/project/mailbox, one allowed recipient, approved sender identity, version and expiry. No inferred default or customer allowlist.

- [ ] Write tests that absent queue fails: approved_current_revision_can_queue; missing_text_approval_cannot_send; foreign_owner_and_model_addresses_refused; general_test_has_no_offer; duplicate_and_different_key_requests_one_revision_one_job; changed_scope_source_sender_refuses_dispatch; paused_revoked_suppressed_and_newer_mail_refuse; cancelled_job_cannot_resurrect; ten parallel begin_dispatch calls yield exactly one permit.
- [ ] Run TypeScript tests plus real PostgreSQL contracts on this plan's separately labelled disposable fixture. Expected: missing module/RPC failure before production implementation.
- [ ] Implement exact contracts. Enforce one send lineage per approved revision and immutable payload. Unique request replay returns the original receipt; changed request with same key conflicts. A cancelled/uncertain/accepted revision cannot be re-enqueued with a fresh key.
- [ ] begin_dispatch atomically checks current exact approval/revision/source/policy/mailbox/worker/project stop and records durable dispatch intent. Completion replay idempotently accepts the same bounded receipt, refuses changed receipt. No automatic claim takeover of dispatching jobs.
- [ ] Run realSQL grants/RLS/cross-owner/parallel and source/cancel races, TS tests and typecheck. Expected: all named tests PASS, zero client grants, no new failing identities.
- [ ] Commit Task1.

### Task2: Strato transport with receipt-first worker recovery

**Files:** create workers/sales/sending/{transport,worker}.py and tests/test_send_transport.py/test_send_worker.py; create apps/web/lib/sales/sending/worker-api.ts and app/api/sales/sending/worker/route.ts; extend protocol/preview transport purpose mapping, managed_connection and host; add host lifecycle tests.
**Consumes:** Task1 SendRef/SendSnapshot and fixed RPCs; current managed worker token and existing mailbox active credential reference.
**Produces:**
- send_once(snapshot,credential_store,mailbox_journal,dispatch_journal,smtp_factory) -> bounded receipt; no model or web call.
- run_send_once(client,journal,transport_factory,can_dispatch=True)->bool.
- Fixed purpose send=/api/sales/sending/worker. Host sendEnabled defaults false and uses its own send-dispatch.json; uncertain send does not erase another queue's journal.

- [ ] Write tests and observe RED: SSL465 with certificate validation/TLS>=1.2; exact From/To/subject/body and saved reply headers; no CC/BCC/header injection; changed active mailbox refuses; password absent from errors/journal; double invocation one DATA; lost250/HTTP receipt no resend; crash before envelope and after DATA fail closed; stale begin_dispatch permit never reaches MAIL; B2 heartbeat survives send.
- [ ] Implement using Python stdlib SMTP_SSL('smtp.strato.de',465), debug0. Validate sealedJson hash and complete envelope before reading credential. Preserve approved plaintext semantics except MIME transfer encoding/CRLF and terminal newline. Message-ID/date remain stable across receipt recovery.
- [ ] Authenticate without sending; obtain the atomic begin_dispatch permit and write local durable intent immediately before first MAIL. Record MIME SHA locally (metadata only). One MAIL/RCPT/DATA; SMTP250 becomes smtp_accepted. Failure after intent becomes delivery_unknown; before intent becomes failed_before_send. Capture no arbitrary server response text.
- [ ] Recovery reads existing durable server receipt before constructing transport. Unknown dispatch remains blocked; no SMTP reconnect/retry. Heartbeat cannot make an expired/changed permit valid.
- [ ] Run full Python suite, worker API tests and real SQL/Next/fresh-Python synthetic integration with network/SMTP denied outside the fake transport. Expected: exact-envelope assertions PASS; accepted replay and uncertain restart both zero additional DATA; existing inbox/reply tests unchanged.
- [ ] Commit Task2.

### Task3: readable owner confirmation and truthful send status

**Files:** create apps/web/lib/sales/sending/{api,atlas-tools}.ts, app/api/sales/sending/route.ts and tests; create components/platform/vnext/sales/SalesReplySend.tsx; extend SalesReplies/global approval integration and current sales browser fixtures.
**Consumes:** current visible exact reply revision + Task1 owner functions; existing project/conversation ownership resolver.
**Produces:** preview + dedicated owner-only send confirmation; Atlas get_sales_send_status({projectId,sendJobId}), no send/authorize tool.

- [ ] Write browser/API RED tests: text approval never queues send; full From/To/subject/body visible before confirmation; unapproved/stale/questioned revision cannot send; explicit test recipient shown; separate button “Godkänn och skicka detta testmejl”; double-click creates one job; edit invalidates unsent authority; generic approvals/Atlas/inbound text cannot authorize; exact status and acceptance-versus-delivery copy.
- [ ] Implement dedicated same-origin session-bound confirm path calling ConfirmSendInput only. Read approved body from private server state; never trust an edited browser payload or model-provided address. Disabled controls explain the blocking reason in Swedish.
- [ ] Add current editorialStatus to readReplyJob's summary by joining the current revision/approval; preserve preparation status separately. Test that Atlas sees approved after the owner's actual decision instead of describing awaiting_review as a new required decision.
- [ ] Show queued/sending/accepted/unknown from persisted state. On uncertain delivery show “Leverans osäker — skicka inte igen”; no retry button. For accepted show “Accepterat av Strato”, not “Levererat”. Human content approval remains separate.
- [ ] Run sales/review security unit tests, typecheck and desktop/mobile browser tests; inspect both previews. Expected: all new behavior tests PASS, no private body in generic approvals/analytics, no automatic mail/network call.
- [ ] Commit Task3.

### Task4: qualification, exact test and controlled rollout

**Files:** real SQL/Next/Python integration tests, verification/2026-10-18-sales-reply-sending*.json/md; update current PR386 and this plan's own ledger only.
**Consumes:** Task1–3, actual owner-approved revision and current mailbox/host generation. No new customer data.
**Produces:** independently reviewed, pinned owner-test-only send flow and actual acceptance/delivery evidence.

- [ ] Real integrations: duplicate confirmation, kill before/after begin_dispatch, after250/beforecomplete, lost accepted receipt, pause/revoke/suppression/new source during dispatch, unchanged accepted replay, worker token rotation. Expected: at most1 DATA and exact current payload; ambiguity never auto-retries.
- [ ] Run full Python, scoped sales/review/schema, typecheck and browser. Compare full web failure identities with fresh source baseline; known401 is evidence, not permission to absorb a new failure. Expected: no novel identities; report every remaining historical failure.
- [ ] One independent complete-increment review; one Critical/Important RED→GREEN fix pass, no reviewer loop. Record rulings and deferred minors.
- [ ] Stage immutable client/manifest and reviewed migration hash. Apply only approved migration after RLS/ACL/catalog/ordinary guard/advisor checks. Protected preview build must pass without override.
- [ ] Preserve existing manager/active credential/RSA/mailbox refs through any required pinned worker upgrade; stop and prove absence of the exact old owned host before starting new. Do not alter other project tasks or browser tabs.
- [ ] Enable only the one owner-test send policy and local sendEnabled. Open full real preview with Andre sender, the exact already chosen private recipient and current approved revision. Wait for the owner's dedicated “Godkänn och skicka detta testmejl” action; do not reinterpret the earlier content approval as send authority.
- [ ] Observe one real send attempt, save metadata-only SMTP receipt. Verify actual Gmail arrival by exact Message-ID in matching recipient account; distinguish acceptance/delivery. If delivery_unknown, stop and reconcile rather than resend.
- [ ] Restart only owned host and repeat status/request read; expected same accepted send lineage and no additional DATA. Save final receipt, limitations and rollout pins; keep PR draft/unmerged and customer sending disabled.

## Self-review and handoff

Spec coverage: version/sender/recipient binding and explicit authority (Task1/3), local secrets/Strato/recovery (Task2), stops/suppression/no customer campaign (Task1/4), real single-test proof and no duplicate retry (Task4). All five Review Focus cases have named owning tests. Scope is sending an already approved reply, not new sales prospecting, attachment delivery, Strato draft saving or customer autopilot.

Execution remains inline as previously selected. Review this concrete implementation plan before product code is changed; the later dedicated button is the actual test-send authorization, not another architectural approval.
