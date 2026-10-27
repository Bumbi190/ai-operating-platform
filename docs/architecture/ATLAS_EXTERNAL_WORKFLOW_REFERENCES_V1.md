# Atlas – external workflow references (research-only v1)

**2026-10-27 · Isolated implementation branch · No deployment or approval to run third-party code.**

## Decision and scope
The operator wants Atlas to discover reusable improvements for the systems already
being built: Handlarbörsen, Familje-Stunden, The Prompt and Omnira. The external
n8n catalog is a **reference source**, not an approved automation engine.

This extends (does not replace) the canonical internal Atlas workflow catalog in
`apps/web/lib/atlas/workflow-catalog.ts`. That existing catalog reflects Omnira's
`ACTION_REGISTRY`. The new external catalog is explicitly less authoritative.

Prior research was recorded in workspace notes:
`Omnira/Docs/ATLAS_WORKFLOW_REFERENCE_INTAKE_2026-10-27.md`
(the workspace note is a pointer, not canonical application code).

## Implementation
- `apps/web/scripts/build-external-workflow-reference-index.mjs` performs a
  deliberate, operator-invoked, metadata-only snapshot fetch. It uses exactly
  one pinned Git commit, two pinned URLs, bounded payloads and a strict
  `workflows/<directory>/<filename>.json` path allowlist.
- `apps/web/lib/atlas/workflow-references/catalog-index.json` stores the
  sanitized metadata snapshot **in the codebase**. The runtime does not
  fetch GitHub, access credentials or evaluate workflow JSON.
- `catalog-search.mjs` provides deterministic, bounded offline matching and
  returns 1–8 references. No `eval`, `fetch`, `spawn`, DB or dispatch.
- `catalog-search.d.mts` gives the Node-compatible `.mjs` core strict
  TypeScript contracts without adding runtime dependencies.
- `index.ts` is the Atlas-facing adapter.
- `app/api/chat/route.ts` adds the tool
  `search_external_workflow_references(query, project?, limit?)`, with the same
  `resolvePlatformOperator()` access gate used by the internal workflow catalog.
- Studio scope excludes the tool by default. No scheduler, cron, data
  migrations, social publishing code or permission grants were modified.

## Source discrepancy, stated explicitly
- Pinned external Git commit: `94007c1445d9258a7da116646b79473e7c7c3282`.
- Upstream search index says it was generated `2025-11-03`; its own aggregate
  claims **4,343**, but contains only **2,057 metadata records**.
- The pinned Git tree has **2,060 strictly allowlisted JSON workflow paths**
  in the indexer output (one extra JSON path did not match the path allowlist).
- **Four** allowlisted source paths have no unique matching metadata row and
  are preserved as clearly incomplete filename-only references.
- Counts do not establish operational, integration or licensing quality.
  During a separate five-file spot check, three had zero source nodes in
  `connections`. Even references labeled active by upstream are UNREVIEWED.

Each result has `reviewState: unreviewed_reference_only` and
`runnableInOmnira: false` and a GitHub URL pinned to the same commit.
The reference tool does not grant authority to copy, install, execute,
publish or send. A found workflow must pass source/license review, current
code comparison, security audit, fixture tests, operator approval and a
separate implementation PR before adoption.

## Operator priority
1. **Handlarbörsen:** SCB lead intake, identity/deduplication, draft outreach,
   guarded Resend handoff, response tracking (never send from search results).
2. **Familje-Stunden:** Meta comments/DM classification and draft replies
   with approval (never auto-reply from search results).
3. **The Prompt:** content reuse, short-video pipeline reliability and replay
   while retaining the current media setup.
4. **Atlas:** new optional knowledge discovery only; no new n8n runtime.
5. **Trading:** at most general monitoring/journal concepts, no strategies or trades.

## Repeatability and tests
Run from `apps/web` in a clean, isolated branch:
```powershell
node scripts/check-external-workflow-references.mjs
node scripts/build-external-workflow-reference-index.mjs --update
node scripts/check-external-workflow-references.mjs
```
- A refresh is *never* scheduled and requires explicit `--update`, review of
  pinned SHA plus an index diff. The SHA must be changed deliberately in code
  to opt into a new upstream revision.
- Offline smoke checks run with Node 20 or Node 22, no dependencies or backend.
- `.github/workflows/atlas-external-workflow-references.yml` runs focused
  Vitest, an anti-skip proof and full TypeScript checks on a GitHub runner
  when a relevant PR is opened. It requires no production secrets or database.
- `lib/qa/atlas-external-workflow-references.test.ts` holds Vitest regression
  coverage to run in a dependency-provisioned workspace/CI.
- Static smoke checks prove only the index/parser/tool registration shape; they
  **cannot** prove a live authenticated chat, production deployment or full
  TypeScript build.
- The live Atlas cannot use this tool until the ordinary review, verified
  CI, merge and production deployment have explicitly completed. Never
  treat a draft PR as operational authorization.

## No implicit future autonomy
Do not turn on background searches, import third-party JSON, spawn n8n, grant
tokens, run agents or modify existing Omnira runtime schedules as a result of
this research-only feature. Any such later phase is a separate decision.
