# Atlas sales worker — Pilot A

This worker prepares Swedish drafts for an explicitly selected Omnira project. Atlas and PostgreSQL own jobs, immutable offers, contact history and editorial reviews. Harvey contributes a pinned, reviewed tone excerpt, not its autonomous dashboard or mail sender. No SMTP, IMAP, follow-up scheduler or customer-send capability is included.

## Current activation state

The feature defaults off. Building this branch does not install an automatic background service, connect Strato, enroll a worker or run Claude. `doctor` verifies the installed CLI version/flags and a bounded, non-inference first-party authentication status. It does not prove current model quota or subscription entitlement. A synthetic inference must pass before using real businesses. Parts B (Strato and durable inbox) and C (version-bound sending) require separate implementation plans.

## Requirements and setup

- Windows, Python 3.12+, this repository and a licensed/signed-in native Claude Code installation. The verified version is pinned in `claude_runtime.py` (2.1.296); updates require requalification. No additional Python packages are required.
- Apply `apps/web/supabase/migrations/20261017100633_atlas_sales_pilot.sql` through the project's normal migration process. Deploying or applying a production migration is a separate operator action.
- Set `ATLAS_SALES_ENABLED=true` and `ATLAS_SALES_PROJECT_ID=<verified-project-uuid>` only for the chosen pilot project after verification. No first-project fallback exists. Keep the flag false until then.
- From the repository root, run `python -m workers.sales.cli doctor`. A refusal is a blocked prerequisite, not permission to bypass isolation.
- Open the chosen project's **Säljförberedelse** page and create an explicit worker connection. It expires after 24 hours. Use the displayed `connect` command and enter the token into the terminal's hidden prompt. Never put the token in a command argument, chat, environment file or Git.
- The token is stored in Windows Credential Manager. The non-secret connection file contains origin, project ID and worker ID under the user's local application data. There is no plaintext credential fallback.
- Run `python -m workers.sales.cli run --project <verified-project-uuid> --once` for one queued job. An optional `--model` explicitly selects a Claude model. Without `--once`, the operator-started process polls every 15 seconds; no auto-start installation is performed.
- Stop with Ctrl+C or revoke the connection from the project page. A stopped/expired claim is reconciled by the server; it is never silently retried.

The Omnira origin must use HTTPS. Work is outbound-only. The worker never receives a Supabase service-role credential. The server accepts only fixed worker operations and validates project, owner, token expiry/revocation, claim ID and generation on every operation.

## Using the pilot

1. Verify each contact's company, branch, recipient address, homepage, prior contact and 2/6/12-month pilot tier. Explicitly preserve exclusions and contact blocks. Previously contacted businesses cannot receive a new initial-contact job. Shared mailbox addresses do not merge branch records.
2. Save a confirmed immutable offer with exact sender, duration, wording and product facts. All selected contacts must have the same duration as the offer. No remembered Founding 5 data is automatically imported or asserted.
3. Select 1–5 confirmed contacts and copy the prepared natural-language instruction into the actual project's Atlas conversation. Atlas reads the current saved workspace and queues the explicit IDs. Closing the conversation does not discard the job.
4. Start the local specialist. It fetches only the manually confirmed HTTPS homepage, records bounded literal source text and reserves each model attempt before dispatch. No redirects, private destinations or model-selected URLs are fetched. Source failures become review questions.
5. Review the exact saved sender, recipient, offer, subject, body, source and questions. Semantic correctness still needs human review. Editing creates a new immutable revision and invalidates pending older editorial reviews. Editorial approval sends nothing.

Initially exclude Bilenia and Cartrade Europe AB as required by the approved design. Verify the current contact tracker before importing GP Motor, Autolane, Moberg Bil, Tjänstebils Experten or Newman Bil Hässleholm; their prior communications must be recorded before any new request. This implementation has not imported those contacts or read their mailbox history.

## Runtime limits and failure handling

Claude runs once per contact from a temporary empty directory with tools, MCP servers, hooks, slash commands, Chrome, session persistence and normal settings sources disabled. A stream advertising tools or non-text output is refused. Custom API-provider environments and detected managed policies are blocked. There is no paid API fallback. Runtime stderr and raw CLI output are not persisted as job diagnostics.

Each job has at most ten reserved attempts; the first implementation makes one call per selected contact and never automatically regenerates on timeout. Heartbeats renew a 90-second lease. Uncertain execution, lost claims and failures require reconciliation. The server rechecks stop state before dispatch permits and result commits. Cancellation cannot undo a model request already accepted by its provider. Revoke any connection whose token may have been exposed.

Initial-contact jobs are serialized per project and blocked when the mailbox already has an uncancelled initial job, contacted history or a contact block on another branch. Separate branch records and draft alternatives within the same explicitly selected batch are retained; they grant no sending rights. Updating a contact fences stale claims and model permits. Operator reads reconcile expired leases even if the sole worker was revoked and the project is paused. A configured homepage requires evidence or an explicit question; completion cannot discard recorded evidence/questions. The attempt ceiling counts worker CLI dispatches; provider-internal retries and billing are not independently metered by this adapter and must be qualified before activation.

The worker's source text and drafts are untrusted data. A syntactically valid draft is not proof of truthful business claims. Missing prerequisites, unverifiable facts and offer mismatches must remain questions or blocked states.

## Reproducible verification

From `apps/web`:

```text
npx vitest run lib/qa/sales-contract.test.ts lib/qa/sales-store.test.ts lib/qa/sales-api.test.ts lib/qa/sales-worker-protocol.test.ts lib/qa/sales-atlas-tools.test.ts lib/qa/sales-view-model.test.ts --maxWorkers=2 --minWorkers=1
npm run typecheck
npx playwright test --config=playwright.sales-pilot.config.ts
```

From the repository root: `python -m unittest discover -s workers/sales/tests -v`.

The database runner (`node scripts/test-sales-db.mjs` from `apps/web`) accepts only a local Docker daemon and the exact disposable `postgres:16` container `omnira-sales-pilot-20261017`. Create it with `docker run --name omnira-sales-pilot-20261017 --label com.omnira.testplan=atlas-sales-pilot-20261017 -e POSTGRES_PASSWORD=sales_local_fixture --detach --rm postgres:16`; do not publish ports or mount production data. It creates and drops a generated fixture database, applies the real sales migration and existing canonical approval/run constraints, tests concurrent claims, then runs the real operator API → Atlas tool → PostgreSQL → fake worker-protocol → revision/cancellation integration. Stop only this container when finished.

Playwright separately mounts the production React component with synthetic API receipts to verify persistence on reload, branch identity, editorial review and desktop/mobile layout. This is not a production login/deployment test. Neither fixture connects an actual mailbox or model provider.

## Upstream

`upstream-manifest.json` pins `ethanplusai/harvey@e114e95471b1bf155454fca108f0730b66a47a01`, records vendored file hashes and the deliberately small prompt subset. Preserve `vendor/LICENSE`. Unverified outreach legal claims, invented benchmarks, AI-identity concealment instructions and automatic sequences from upstream are excluded.

Managed lifecycle: the owner authorizes the existing worker once through the project.
The local host adopts a separately stored management identity and renews its 24-hour
worker credential before it has 12 hours left. Journal files contain references only.
A lost renewal response replays the same operation. It never retries a model job.
`host --project UUID` verifies the pinned installation and holds a process lock.
Windows startup scripts preview by default; `-Apply` affects only the exact owned
`\Omnira\Omnira-Sales-{workerId}` task for the current interactive user.
A dispatch interrupted by process termination stays blocked for reconciliation.

Strato B1 uses an owner-only browser form and a 15-minute RSA-OAEP-SHA256 /
AES-256-GCM envelope bound to project, host, setup and key ID. The private RSA
key and mailbox password are separate Windows Credential Manager entries.
The host performs PLAIN authentication only over verified Strato TLS465/993,
with bounded timeouts; it never selects an IMAP folder or sends an SMTP message.
A staged credential becomes active only after the matching current server receipt.
Lost receipts replay without another login; uncertain auth requires reconciliation.
Inbox history/UID checkpoints and sending authorizations remain separate work.

Strato SMTP authentication uses one two-step AUTH PLAIN exchange (334 challenge,
then one UTF-8/base64 response) so the initial command stays within the SMTP
line limit. Rejected credentials are never retried automatically. The local
connections/<project>/mailbox-diagnostic.json journal records only setup ID,
fixed phase/reason code, numeric SMTP reply and timestamp; it never records raw
server replies or credentials. A failed password is discarded and must be
submitted again through the encrypted owner form after the issue is corrected.

## Strato B2 inbox

The owner explicitly saves and enables a versioned scope: one authenticated mailbox,
INBOX, exact since timestamp, and confirmed contact IDs whose text may be fetched.
B1 login alone grants no inbox access. Atlas has only `get_sales_inbox` and
`get_sales_inbox_message` after conversation/project validation. It cannot enable
import, select new text, link a branch, send mail or start a reply job. B3 reply
preparation and C sending remain separate, unimplemented increments.

The host uses its existing manager identity at the fixed `/api/sales/inbox/host`
endpoint. A separate stoppable thread runs no more often than every60seconds,
independent of Claude readiness and draft-worker heartbeats. Only the active local
mailbox credential with matching generation can authenticate. An actual AUTH error
persists a local scope block and server needs_input state; explicit owner resume
changes the config version. Transport failures use60/120/300second backoff.

EXAMINE, UIDVALIDITY/UID and BODY.PEEK preserve flags. Each batch covers at most500
UIDs/20records, with50KiB transport, bounded headers,64KiB encoded text part and
8KiB saved text. No UNSEEN filter, attachment, image or external URL fetch exists.
Persisted occurrences, text and cursor share one SQL transaction. On restart the
host queries the pending batch receipt before another IMAP login. Journal files
contain only references, ranges, hashes and fixed status codes, never message text
or passwords. Complete content may share one canonical record across UID epochs;
branch choices and stable old references remain separate.

The SQL runner now also exercises fresh Python processes against a real imaplib
loopback server and the real Next handlers/PostgreSQL RPCs. This includes crashes
before commit, lost replies after commit, selected old-UID fills, epoch dedup,
vanished messages, MIME bounds and pause during fetch. These are synthetic fixtures
and do not prove a real Strato mailbox import. Real activation requires the
reviewed concrete scope and pinned server/client installation; never change the
preview origin without explicitly preserving and validating the existing manager,
active mailbox and RSA key references.
