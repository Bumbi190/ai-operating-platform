# Company search: industries and real project context

## Intent and authority
Continue the owner-requested company view in Draft PR 386. Extend the existing read-only SCB adapter, not the outreach engine. The owner's autonomous development standard authorizes routine design and implementation without micro approvals.

## Approach
Reuse the company directory and fixed-origin SCB client. A separate paid Maps provider creates avoidable configuration/cost; a second CRM would split history. Neither is introduced.

## Scope and decisions
- Four explicit SNI2025 choices: car_dealer 47.811; restaurant 56.110; hairdresser 96.210; house_builder 41.000. Labels describe the narrow registered category, not all construction or food businesses. Codes verified against https://snisok.scb.se/47811, /56110, /96210 and /41000 on 2026-11-04.
- All 290 municipalities, five identity-reviewed workplaces per explicit page. Preserve 10,000 source row cap, two page cap, timeout, no automatic retry and legal-entity privacy filtering. Raw SNI/path/URL input is not accepted. Reserve Overpass supports only the intersection with its existing categories.
- Owner-only project selection populated from real projects with matching owner_id and allowedProjectIds. Preview SCB availability enables only this read-only directory for owned projects; Sales project allowlist, workers and sending stay unchanged. Existing sales-enabled scope remains available independently.
- Each project navigation reloads a scoped directory, with no carried result/history. Only the selected project's contacts/timing are read; HB archives, pilot dialogue and registration snapshot apply only to HB. Other-project coverage explicitly remains unknown. Cross-project stop aggregation is a later increment, not falsely advertised as completed.
- Live same-owner inventory currently contains seven projects, none named/registered as Webbuilder/Web Studio. Do not create or guess that identity. Show the gap; other owned projects can use the generic research view. Demo customer projects are not treated as Webbuilder.
- Changing search fields clears old result/pagination state. Labels identify actual registered category and query area, never infer location or complete coverage.
- No persistence, lead selection, website fetching, paid model work, customer messages, new credentials, production release or SQL mutation. Website analysis and lead saving remain subsequent increments.

## Acceptance
Server rejects unowned/disabled/malformed scope before any source read. Selected industry reaches the real raw SCB request path and row filtering; each returned branch retains CFAR. Non-HB view cannot show HB dialogue, registered-pilot exclusions or archived data. Project options reject foreign, duplicate, malformed or oversized rows. Search/pagination, state reset, empty/error states and project links work on desktop/mobile. Meaningful unit/API/raw-client and browser tests pass, typecheck passes. Live authenticated UI verification is separately reported; browser currently returns HTTP401, no credential/session extraction is allowed.

## Preflight
Script receipt HARVEY-COMPANY-MULTIBRANCH-20261104 returned review_required due generic read-only wording matching creative PRs. Actual file paths and current head confirm existing Harvey PR386 owns companies, sales history and SCB. Reuse clean detached hb-sales-slim-20261029 at 07bbdf0. No new branch/worktree/PR.
