# Atlas sales worker — bounded B2B workflows

This worker prepares Swedish drafts for an explicitly selected Omnira project. Atlas and PostgreSQL own jobs, immutable offers, contact history and editorial reviews. Harvey contributes a pinned, reviewed tone excerpt. The draft adapters have no mail-sending tools. Managed hosting, Strato connection, selected inbox import, reply preparation and version-bound sending are implemented as separately gated capabilities.

**Editorial approval approves text only.** It does not authorize a send, start a sequence or enable a mailbox. Any sending requires the separate sender gate and explicit authorization for the exact current message version, addresses and source context.

## Release state and evidence — 2026-10-31

- The feature defaults off. Building or testing the repository does not install a background service, configure a provider, connect a mailbox, enroll a worker or activate production.
- The installed Claude Code 2.1.296 passed the bounded `doctor` check. Three actual synthetic outputs then passed through `SafeClaudeTextRuntime` and the Harvey adapters: `pilot_initial`, `service_initial` and `service_commercial_reply`. The local evidence bundle contains `synthetic-model-proof.json` and its log. Missing signature/evidence details produced review questions. These calls prove local model access and validated output for synthetic inputs; they do not prove real customer, mailbox or production readiness.
- Public Overpass probes returned HTTP 406 and then timed out. No successful live discovery retrieval was established. The revised provider timeout is a bound, not evidence of availability. Production discovery remains blocked until an approved source is configured and verified.
- This continuation has performed no production SQL application, provider provisioning, installed-host activation or customer sends. Read-only inventory found an older installed host task disabled, while its saved mailbox/reply/send options were already true. It was not started; `doctor` reporting `sendingEnabled=false` describes that check rather than changing the installed configuration.
- Final regression, SQL, browser and build results belong in the release handoff. Do not infer a complete GREEN release from the three synthetic model cases.

## Project configuration and prerequisites

After reviewing each project's readiness, configure `ATLAS_SALES_ENABLED=true` and an explicit comma-separated allowlist:

```text
ATLAS_SALES_PROJECT_IDS=<verified-project-a-uuid>,<verified-project-b-uuid>
```

The allowlist accepts 1–20 unique UUIDs. Whitespace and letter case are normalized. An empty, malformed or duplicate list fails closed. `ATLAS_SALES_PROJECT_IDS` takes precedence; the legacy singleton `ATLAS_SALES_PROJECT_ID` is used only when the plural setting is absent. There is no wildcard or first-project fallback. The allowlist does not replace owner, project, conversation or worker-token authorization.

Each project needs its own verified sender, confirmed product facts and saved immutable offer. Supply the actual WebBuilder project UUID and its verified business information through the ordinary owner workflow. This change seeds no WebBuilder sender, price or offer and copies no Handlarbörsen customer records into another project. Unknown facts and pricing remain missing prerequisites or review questions.

Use the reviewed canonical migration chain and normal deployment process. This candidate adds `20261031100000_sales_b2b_offers.sql`, followed by `20261031110000_sales_discovery_candidates.sql`, under `apps/web/supabase/migrations`. Previously applied SQL must remain unchanged. The production ledger guard still requires every enforced migration; source files and local fixture results do not count as production application.

## Offer and contact contract

| Offer type | Contact fields | Offer fields |
| --- | --- | --- |
| Legacy pilot | Omitted `offerKind`; `pilotMonths` is 2, 6 or 12 | Omitted `offerKind`; matching `freeMonths` |
| Explicit pilot | `offerKind: "pilot"`; `pilotMonths` is 2, 6 or 12 | `offerKind: "pilot"`; matching `freeMonths` |
| General service | `offerKind: "general_service"`; `pilotMonths: null` | `offerKind: "general_service"`; `freeMonths: null` |

Legacy and explicit pilot records can match at the same exact level. API and persisted service records require explicit null month fields; no pilot duration is invented. Contact and offer kinds must match. Drafts and commercial replies use only that project's confirmed facts and exact saved terms. The existing `replyMode=general` path remains an ordinary conversational reply with empty contact/offer context.

## Existing project data

Existing saved contacts and their current history/timing review can feed the draft workflow without a new discovery provider. Handlarbörsen also has a separately documented 81-company SCB/Tavily research archive in its lead-finder; that archive remains owner scoped, explicitly non-production and feature gated. It contains company/source metadata rather than verified recipient email. This change neither re-queries it nor silently imports it into another project or into the OSM candidate contract.

## Manual public-business discovery

The owner chooses a business category, one of the supported cities, a radius of 1–25 km and at most 25 source rows. Each action requests one finite batch. There is no automatic periodic discovery, background prospecting, address scraping from candidate websites or outreach sequence. Candidate URLs are recorded as sources; the discovery adapter does not fetch them.

Production requires `ATLAS_SALES_DISCOVERY_OVERPASS_URL` pointing to an approved HTTPS Overpass-compatible source. Production and Vercel deployments refuse an absent/invalid setting and refuse the shared public `overpass-api.de` / `openstreetmap.de` instance family. Non-production may use the default public endpoint for an explicit manual proof. The identifying User-Agent is fixed; do not rotate identities or endpoints to work around a refusal. No provider account, paid fallback or hosting has been provisioned here.

Discovery has a 27-second provider bound, a 45-second route maximum and a 256-KiB response cap. Database admission is shared across projects: a 30-second cooldown after a terminal result, a 90-second admission hold for unresolved pending work, and at most 25 admitted attempts in a rolling 24 hours. Failed and unresolved attempts count. Exact idempotent replay does not fetch again; GET is read-only. The pending hold is not a promise that the abandoned operation will finish or automatically retry. These request limits do not establish a monetary budget for a future paid source.

Public email is unconfirmed evidence. The owner must verify the business, recipient and offer type before promotion. Existing contact/account/history exclusions and negatively reviewed candidates are rechecked under the project eligibility lock. Promotion saves a contact with `history: "unknown"`; separate history and timing review is required before draft preparation. Coverage is explicitly partial: a nonmatch does not prove that a business has never been contacted. Handlarbörsen's reviewed prevention-only history remains scoped to Handlarbörsen.

## Local setup and drafting

- Windows, Python 3.12+, this repository and a licensed, signed-in native Claude Code installation are required. `claude_runtime.py` pins version 2.1.296; changes require requalification. No additional Python packages are required.
- From the repository root, run `python -m workers.sales.cli doctor`. It checks the installed CLI version/flags and bounded first-party authentication status without inference. A refusal is a blocked prerequisite. It does not prove current quota or subscription entitlement; qualify inference separately with synthetic inputs.
- Open the selected project's **Säljförberedelse** page and create an explicit worker connection. Its credential expires after 24 hours. Use the displayed `connect` command and enter the token in the terminal's hidden prompt. Never place tokens in command arguments, chat, environment files or Git.
- Tokens live in Windows Credential Manager. The non-secret connection file contains origin, project ID and worker ID under local application data. There is no plaintext credential fallback. The HTTPS, outbound-only worker never receives a Supabase service-role credential.
- Run `python -m workers.sales.cli run --project <verified-project-uuid> --once` for at most one available initial-contact job, containing 1–5 contacts. This command claims the next eligible job; it does not select a particular job ID. `--model` explicitly selects a Claude model.
- For a managed connection, launch from its configured, pinned installation root. The command validates the same installation and connection journal as `host`, uses the current journal credential and the configured Preview transport, and holds the same `host.lock`. It honors pause/readiness and unresolved initial/reply dispatch guards. It may renew the worker credential through the existing management protocol. It starts no mailbox, reply or send loop, even when their saved configuration flags are enabled. Managed `run` without `--once` is refused before network or model access; use the separately authorized `host` lifecycle for continuous operation.
- Legacy connections created by `connect` retain their original direct transport and credential lookup. Only this legacy `run` mode continues polling every 15 seconds without `--once`; it does not install automatic startup or schedule discovery.
- Stop with Ctrl+C or revoke the connection from the project page. The server validates project, owner, token expiry/revocation, claim ID and generation on fixed worker operations. Stale or uncertain work requires reconciliation.

1. Review company, branch, recipient, homepage, exclusions and prior contact; confirm the correct pilot level or service kind. Previously contacted or blocked businesses cannot receive a new initial-contact job. Shared mailbox addresses do not merge branch records.
2. Save a confirmed immutable offer with the exact sender, wording and product facts. Match the selected contacts' offer kind and, for pilots, the exact month level. No remembered campaign data becomes authorization automatically.
3. Select 1–5 eligible contacts and copy the prepared instruction into that project's actual Atlas conversation. Atlas reads the saved workspace and queues explicit IDs. Closing the conversation does not discard the job.
4. Start the qualified specialist. It fetches only a manually confirmed HTTPS homepage, records bounded literal evidence and reserves each model attempt before dispatch. Redirects, private destinations and model-selected URLs are refused. Source failures become review questions.
5. Review the exact saved addresses, offer, subject, body, source and questions. Editing creates an immutable revision and invalidates older pending text reviews. Resolve missing facts before approval. Editorial approval sends nothing.

## Runtime limits and failure handling

Claude runs once per contact from a temporary empty directory with tools, MCP servers, hooks, slash commands, Chrome, session persistence and normal settings sources disabled. Streams advertising tools or unsupported output are refused. Custom API-provider environments and detected managed policies are blocked. There is no paid API fallback. Raw CLI output and stderr are not persisted as job diagnostics.

Each job has at most ten reserved attempts; initial drafting makes one call per selected contact and never automatically regenerates after a timeout. Heartbeats renew a 90-second lease. Stop state is rechecked before dispatch permits and result commits. Cancellation cannot undo a request already accepted by a provider. Uncertain execution, lost claims and failed dispatches stay subject to reconciliation; provider-internal retries and billing are not independently metered by this adapter.

For managed execution, the initial dispatch journal clears only after confirmed successful completion. A failed or interrupted attempt after the dispatch marker is written preserves its identifiers and blocks another initial run until separately reconciled. This includes model timeouts and lost completion receipts. An empty queue or a failure before the dispatch callback does not create an uncertain-dispatch marker. Both the one-shot command and continuous host use this rule.

Initial jobs are serialized per project and blocked by an uncancelled initial job, contacted history or another branch's contact block for that mailbox. Updating a contact fences stale claims and permits. Operator reads reconcile expired leases even when the worker is revoked and the project paused. A configured homepage requires evidence or an explicit question, and completion cannot discard recorded evidence/questions. Draft/source text stays untrusted; JSON validity does not establish truthful business claims.

## Managed host, inbox and separate sending gate

Managed hosting requires explicit owner authorization. The host stores a separate management identity, renews its 24-hour worker credential before fewer than 12 hours remain, and journals references only. Lost renewal receipts replay the same operation, never the model job. `host --project UUID` checks the pinned installation and holds a process lock. Windows startup scripts preview by default; `-Apply` targets only the exact owned `\Omnira\Omnira-Sales-{workerId}` task for the current interactive user. Inspect existing configuration and pending work before any authorized host start.

Strato connection uses an owner-only browser form and a 15-minute RSA-OAEP-SHA256 / AES-256-GCM envelope bound to project, host, setup and key ID. RSA keys and mailbox passwords are separate Windows Credential Manager entries. Authentication uses verified TLS on ports 465/993 and bounded timeouts. SMTP AUTH PLAIN uses a 334 challenge followed by one UTF-8/base64 response. Rejected credentials are not retried automatically; staged credentials become active only after the current matching server receipt. Diagnostics contain fixed phase/reason codes, numeric reply and timestamp, never credentials or raw server replies.

Mailbox login alone grants no inbox access. The owner separately enables a versioned scope: one authenticated mailbox, INBOX, exact since timestamp and selected contacts whose text may be fetched. The host's stoppable inbox thread runs no more often than every 60 seconds, independently of Claude readiness. Authentication failure persists a scope block; explicit owner resume changes the config version. Transport backoff is 60/120/300 seconds.

EXAMINE, UIDVALIDITY/UID and BODY.PEEK preserve mailbox flags. Each batch covers at most 500 UIDs/20 records, with 50-KiB transport, bounded headers, 64-KiB encoded text and 8-KiB saved text. There is no attachment, image or external-URL fetch. Occurrences, selected text and cursor commit in one transaction. Restart recovery reads the pending receipt before another login; journals contain references, ranges, hashes and fixed codes rather than message text or passwords. UID-epoch deduplication preserves separate branch choices and old references.

Reply preparation uses the explicitly selected incoming message and current bound context. Private Nova reminders contain editorial metadata only. Text review, inbox selection and worker connection remain separate from exact-version send authorization. A qualified sender may act only through the separate send gate; this release work has issued no customer-send authorization and started no installed sender-capable host. Preview-origin changes must preserve and validate existing manager, active-mailbox and RSA-key references.

## Reproducible verification

From the repository root: `python -m unittest discover -s workers/sales/tests -v`.

From `apps/web`, run the relevant sales, discovery, migration/security and review suites with one worker, then `npm run typecheck`. Browser fixtures use the production components with synthetic API receipts; they do not prove production login, deployment or mailbox access. Final commands, exit codes and counts must be recorded in the release handoff.

`node scripts/test-sales-db.mjs` accepts only a local Docker daemon and the exact owned `postgres:16` fixture containers listed in that script, with matching `com.omnira.testplan` labels. The default is `omnira-sales-pilot-20261017`; the supported reply/sending fixtures require explicit `SALES_FIXTURE_CONTAINER` selection. Use no published ports or production mounts. The runner creates and drops a generated `sales_<timestamp>` database, applies the real canonical sales chain and approval/run constraints, and exercises SQL, concurrency and API/Python integration. Synthetic IMAP/SMTP fixtures and test-only timestamp resets are confined to the owned disposable database; they do not establish live mailbox or discovery availability. Stop only the owned fixture when verification is complete.

## Upstream pin

`upstream-manifest.json` still pins `ethanplusai/harvey@e114e95471b1bf155454fca108f0730b66a47a01` and its reviewed vendor hashes. Preserve `vendor/LICENSE`. The imported subset excludes unverified outreach legal claims, invented benchmarks, AI-identity concealment instructions and automatic sequences. Project-neutral prompts use verified project facts; this is the same Harvey pin, not an upstream replacement.
