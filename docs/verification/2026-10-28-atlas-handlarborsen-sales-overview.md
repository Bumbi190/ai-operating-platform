# Atlas: owner-scoped Handlarbörsen sales overview (read-only)

**2026-10-28 · Draft implementation · No database writes or outreach**

## Purpose
Atlas already has `handlarborsen_statistics` (marketplace KPI snapshot)
and `handlarborsen_latest_mail` (strictly authorized Strato header read).
Both are kept unchanged. Neither is a read of the live Omnira CRM's
`sales_contacts`, reply workflow, send jobs, or SCB review queue.

This change adds `handlarborsen_sales_overview` to that SAME authenticated
read-tool family, instead of building a second CRM or importing any n8n code.

## Security/behavior contract
- Fixed canonical project `handlarborsen` and its hardcoded UUID from the
  existing collector. User/model cannot select a project/table/column/recipient.
- Requires authenticated user, `allowedProjectIds` membership **and** a
  second `projects.owner_id = userId` database check, slug match and
  `atlas_mode` in observer/active before ANY contact table is queried.
- Counts only. Fifteen fixed PostgREST calls:
  `select('project_id', { head: true, count: 'exact' })` with an explicit
  `.eq('project_id', HANDLARBORSEN_PROJECT_ID)`. Static filters only for
  `sales_contacts.data->>suppressed/confirmed/excluded` and
  `sales_reply_jobs.status=awaiting_review` and
  `sales_send_jobs.status=smtp_accepted`.
- Queries do not read a single name, orgnr, address, email, header or body.
  All data returned to Atlas is metrics (integers), static source table names,
  observation time and fixed interpretation warnings.
- No partial counts or fabricated zeros on errors or null counts. A failed
  table means `{ status: 'unavailable', reason: 'aggregate_unavailable' }`.
- `observedAt` records the COUNT time, NOT a statement that inbox content,
  marketplace snapshot, company history or SCB research is freshly updated.
  Counts are non-transactional across tables.
- `confirmed` and `suppressed` are **overlapping CRM flags**, not legal
  permission or mutually exclusive classifications. `smtp_accepted` is
  NOT confirmed inbox delivery. A blank imported SCB queue does not erase
  review candidates in the separate research workflow.
- Does not introduce `insert`, `update`, `delete`, `rpc`, cron,
  mail-sending, n8n, model-powered contact ranking or provider network calls.

## User intent routing
An explicit question about Handlarbörsen's CRM/contact totals, restricted
contacts, SCB queue or follow-up status gets the *named* existing read tool,
not a generic LLM response. The routing bypasses the content-only fast
path only for that specific read, and does not replace:
- `handlarborsen_latest_mail` for explicit latest-mail questions.
- `handlarborsen_statistics` for verified dealer/vehicle/bid questions.
- External pinned workflow reference lookups, Notion-only reads or Studio.
- Commands to send, activate, import or modify anything.

## Evidence before change (read-only, not hardcoded in code)
As-of 2026-10-28, scoped Omnira Supabase SELECTs observed 139
`sales_contacts` rows, all with `data.suppressed=true`, 57 with
`data.confirmed=true`, 2 `data.excluded=true`; 16 synced inbox
messages, one `sales_reply_jobs` awaiting_review, two
`sales_reply_draft_revisions`, one `sales_send_jobs` with SMTP
accepted status, and zero `hb_lead_candidates` rows. None of those
figures are hardcoded in the tool; every authorized call fetches new
project-scoped aggregate counts. No private contact details were copied.

## Regression / acceptance
The new in-memory fake tests assert: zero unauthorized reads, project
identity/mode check, 15 strict HEAD-count queries with fixed project id,
cross-project exclusion, no PII, overlap of suppressed+confirmed, accurate
reply/send status interpretation, zero vs unavailable, source failures and
no ability to send. The original Handlarbörsen stats/latest-mail and
intent suites are also required in the existing Atlas isolation CI job,
with anti-skip floors. No new CI workflow or production service.

A code/test-green result is not a signed-in Atlas chat acceptance result:
after approved merge/deploy, ask Atlas
`Sammanfatta Handlarbörsens CRM-status och kontaktspärrar. Ange källa och antal.`
Confirm a real `handlarborsen_sales_overview` tool receipt in an
authorized conversation and no read of personal data or outbound mail.

**This is an isolated draft change, not a sender and not approval to contact.**
