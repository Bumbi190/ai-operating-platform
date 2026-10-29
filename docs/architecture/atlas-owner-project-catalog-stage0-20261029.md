# Atlas/Nova global owner project catalogue – Stage 0 (2026-10-29)

**Status: INERT POLICY FOUNDATION. NOT CONNECTED TO NOVA CHAT OR LIVE PROVIDERS.**

Work ID: [#604](https://github.com/Bumbi190/ai-operating-platform/issues/604). Owner-approved target architecture: [Notion](https://app.notion.com/p/4087b977c5b8819f8122de73ab8f0b91). Existing Nova source read pilot: [#576](https://github.com/Bumbi190/ai-operating-platform/issues/576).

## Collaboration boundary: Prime Agent
Prime Agent is being developed separately on `codex/atlas-model-agent-router-20261022`. Its current local worktree has uncommitted Windows broker/TPM and model router code. **This change does not touch any model-router, code broker, TPM, SDF, chat dispatch, provider credential or database files.** No Prime Agent run, approval or model budget is reused. It does not increase the previously agreed 5 USD/day Prime budget or the 3 Codex calls/day limit.

## Delivered contract
`apps/web/lib/atlas/project-connections/owner-github-catalog.ts` is a pure TypeScript module:
- Reads a **caller-provided owner-approved catalogue** by project UUID, not a hardcoded slug or single repository name. An authenticated caller must independently derive `ownedProjectIds` from `apps/web/lib/atlas/isolation.ts` and verify owner record membership.
- Rejects missing/duplicate/conflicting records, foreign owners, disabled records, unsafe names/branches and ambiguous shared-repo mappings. A model-provided project slug/URL is never sufficient authority.
- Returns an immutable **candidate read scope** for a single known project. A nonenumerable module-local marker makes accidental caller-made scopes fail; this is *not* a substitute for session, RLS or provider verification.
- Validates independently obtained **App-JWT parent-installation receipt** against numeric App ID, installation ID, owner ID/login/type, read-only Contents+Metadata, no events or suspension. Accepts a parent installation with either `repository_selection='all'` or `'selected'`; it never converts this into a broad token.
- Constructs only `repository_ids: [oneVerifiedRepoId]` and `permissions: { contents: 'read' }` for the future token mint; checks live repository numeric identity, owner and branch, and rejects broad/other-repo/write-capable/expired minted-token receipts.
- Does not store secrets, supply a network client, mint tokens, query Supabase or Vercel, create a repository, or start a Pling/Prime Agent. No new feature flag, schema, migration, cron or paid provider calls.

**Crucial:** Any future server route must still authenticate the owner, derive the project ownership allowlist from trusted database rows, validate current GitHub responses over an authenticated App transport, bind every provider operation to a fresh project/installation/repository, and independently deny unapproved reads. The pure candidate scope is never a sufficient runtime authorization by itself.

## Existing live limitations deliberately preserved
- The shipping `source-inspection/policy.ts`, `atlas-tool.ts` and `github.ts` remain Handlarbörsen-only, Preview-gated and OFF. `github.ts` still denies a parent All-repositories installation.
- Existing SDF Code Broker repository allowlist and Windows/Prime Agent identity are unchanged. **Do not add new repositories to that allowlist** as a side effect of Atlas read-only discovery.
- `apps/web/app/api/chat/route.ts` is untouched because a separate Nova Source Curator PR #602 owns overlapping chat routing.

## Next milestones (not implemented by Stage 0)
1. **Owner catalog persistence**: security-reviewed `projectId + ownerId + verified provider IDs + connection status` mapping, RLS/ACL, immutable approval/revoke history and a filtered owner-only list. Propose migration separately; do not apply production DML or add a service-role bypass.
2. **GitHub read-only runtime**: independently verify new GitHub App installation identity, discover accessible repository metadata in a bounded owner session, let owner approve mapping to Omnira project, then mint only one-repo tokens for per-project read/commit inspection. Prove cross-project and forged-SHA denial, output redaction and owner revoke. **Do not place a PEM key in chat, PR, Notion or logs.**
3. **Supabase optional connector**: per-project immutable Supabase project ref and environment, read-only schema/status/logs first, no secret/service-role exposure to LLM or Pling. Authenticated owner + project ACL and narrow data access. SQL writes, migrations, RLS, admin and key changes are separate critical owner approvals.
4. **Vercel optional connector**: verified team/project ID + branch/commit + environment, read-only deployment/build/Preview status first; deploy/promotion/rollback/env-secret changes require explicit owner action, estimated costs and rollback details.
5. **Pling lifecycle**: each active agent instance references one active project-workflow/job, per-run budget and separate credentials/memory. No cross-project data and no idle/orphaned billable agents.
6. **Browser/Desktop**: bounded observation with provenance; any effectful computer/browser action delegated under separate auditable permissions; Prime Agent keeps exclusive ownership of the code-execution implementation.

## Tested
`node --experimental-strip-types --test apps/web/lib/qa/atlas-owner-github-catalog.test.mjs` (Node 22): **15/15 tests PASS**, no skips, offline, synthetic objects. Tests cover three dynamically added projects, foreign owners, ambiguous repo mappings, selected/all parent receipt, one-repo scope, forged scope, repo identity, and token permissions/TTL. Clean CI and full TypeScript checks must still run before merge. This proves only the pure policy logic, not a live installation, Supabase/Vercel integration, or autonomous code agent.

## Cost and release rule
Stage 0 ran no network provider calls or paid models. Keep all new provider integrations disabled by default. Before approval of a real connection, show the owner the exact project, scopes, source, potential cost, data-security risk and rollback plan. Production and write authority are separate approvals.
