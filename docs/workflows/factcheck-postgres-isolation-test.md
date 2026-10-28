# The Prompt — isolated PostgreSQL 17 FactCheck proof

**Status:** local security rehearsal PASS, **NOT a production migration**.
Related: PR #585, issue #591. Rehearsal performed on 28 October 2026.

## Scope and safety

- SQL source: docs/workflows/proposed-migrations/20261028131815_the_prompt_factcheck_evidence_v1.sql. The proposal **must remain outside** apps/web/supabase/migrations until Omnira's canonical migration gate, production ledger and rollout process separately approve it.
- Test files: docs/workflows/factcheck-postgres-test-bootstrap.sql and docs/workflows/factcheck-postgres-test-assertions.sql.
- Local regression runner: apps/web/scripts/test-factcheck-postgres-isolation.ps1.
- The runner uses the **existing**, already-running local Windows Docker desktop-linux test container omnira-atlas-voice-actions-test-20261026 with image postgres:17-alpine. It does **not** start a new Postgres container, change global Postgres roles, or read production credentials.
- It creates a uniquely named factcheck_tmp_... database with minimal fixtures for projects, media_scripts, runs and auth.users. It applies the **draft** FactCheck SQL only inside that database, executes assertions in a transaction that rolls back, then drops **only that temporary database** and removes its copied fixture files in a finally block.
- The runner refuses non-local Docker contexts and unexpected container images/names. Avoid reusing any other Docker container, especially user data or live Supabase clusters, without a separate operator decision.

## To rerun locally

From the repository root in Windows PowerShell:

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\apps\web\scripts\test-factcheck-postgres-isolation.ps1
~~~

The successful tail is FACTCHECK_PG_ISOLATION_ALL_ASSERTIONS_PASSED, followed by DROP DATABASE and FACTCHECK_POSTGRES_LOCAL_ISOLATION_PASSED_AND_CLEANED. A nonzero command/SQL status stops the run; the finally block attempts to drop only its generated test database. If cleanup reports a problem, inspect the locally generated factcheck_tmp_... name before touching anything.

## What actual PostgreSQL tested

- Proposed media_factcheck_reports (FactCheck evidence) and media_factcheck_editorial_decisions (human preproduction decision) tables really create on PostgreSQL 17.
- RLS and FORCE RLS, no anon/authenticated policies or table grants, service-role SELECT/INSERT only.
- Authorized server-role report and human-owner decision INSERT paths succeed; no UPDATE/DELETE/TRUNCATE even for a privileged connection.
- The report rejects wrong project, script version/vN identity, reviewer-run replay, swapped claim, expired/cancelled/not-running worker, changed script, missing sources and fabricated successful verdict shape.
- The human gate rejects a non-owner, wrong report content hash, changed project or script version, short justification and approved-but-unverified stories. It allows a rejection receipt for unverified evidence.
- High-impact source-grounded content can reach the **preproduction human-review-only** stage only with explicit, substantial owner acknowledgment.
- Citing only a **single independent publisher** for a claim, despite two URLs in the report, cannot pass editorial approval.
- Both ledgers are structurally append-only; a TRUNCATE ... CASCADE attempt is also blocked.

## Findings and limitations

- The first isolated fixture surfaced a real Postgres privilege distinction: SELECT ... FOR SHARE on runs requires the source table's UPDATE privilege too. The test fixture was adjusted only after **read-only** confirmation that Omnira's actual service_role holds that privilege; no production permission was changed.
- The isolated run also found that revoking function EXECUTE from PUBLIC disables the new evidence-shape helper for service_role unless it receives a **specific** grant. The proposal now grants only this function's EXECUTE to service_role.
- This is a physical SQL test, **not** a complete production-schema replay or an independent verification of semantic truth. Input sources, IDs and model reviews are synthetic fixtures. Model-generated citations may be materially misleading even when they are structurally valid.
- Owner equality in the SQL trigger does not by itself attest a human-origin action: a privileged writer could provide the owner's UUID. A future live writer must derive that identity from a fresh authenticated operator session, never from model/client JSON. No real owner-session approval API, provider-funded fact-check worker, source licensing verification, report storage in production, or mandatory render/publish admission has been activated.
- The **existing** social_content_decisions remains a separate, final channel/revision-bound human approval after preparation. Never treat a new FactCheck decision as permission to publish.

## Release blockers

Before a production migration, reconcile the exact production migration ledger and schema, replay against an appropriately isolated staging clone, add a session-authenticated owner decision action that records its server-verifiable identity, implement a project-scoped live report writer and trusted source/provenance adapter, and enforce a final atomic publisher/render gate that revalidates all source/story/post/video revisions immediately before any external side effect.
