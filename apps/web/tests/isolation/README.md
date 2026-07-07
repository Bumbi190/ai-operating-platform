# Isolation measurement layer (PR-0)

**PR-0 measures. It does not fix.** This directory is a pure red/green dashboard of
Omnira's project-isolation posture. No P0 fixes live here — later PRs improve the
metrics this layer reports.

## What's here

| File | Role |
|---|---|
| `route-manifest.json` | Approved source of truth: every `/api` route → class, auth, service-role, scope, kill switch, risk. Two routes carry **verified P0 findings**. |
| `sql/omnira_isolation_inventory.sql` | Read-only RPC enumerating each table's RLS/policy/nullable/index posture. |
| `config.ts` | Table classification (tenant / global allowlist / unscoped candidate / system). |
| `enumerate.ts` | Runs the RPC → prints the **inventory-drift** dashboard. |
| `route-drift.ts` | Checks the manifest against the filesystem (new/unclassified/stray routes). |
| `clients.ts` | The three roles: service / asUser(token) / anon. |
| `fixtures.ts` | Two-owner, two-project fixture + per-table B seed. |
| `tables.test.ts` | Proves A and anon cannot read B's rows (+ negative self-test). |
| `routes.test.ts` | Manifest-driven: U routes don't leak B to A; S routes require the cron secret. |

## Reporting mode (important)

Everything runs in **reporting mode** in PR-0 — the leak tests are *expected to be red*
today, and the checks exit 0 so `main` is not blocked. The red list **is** the deliverable.
A later PR flips `--strict` / required-checks once the system is green (see `OMNIRA_FAS0_PR_SEKVENS.md`, PR-6).

## Running (needs a disposable Supabase test branch — never prod)

```bash
# 1. apply the inventory function to the test branch
psql "$SUPABASE_TEST_DB_URL" -f tests/isolation/sql/omnira_isolation_inventory.sql

# 2. inventory dashboard
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx tests/isolation/enumerate.ts

# 3. route-drift dashboard
npx tsx tests/isolation/route-drift.ts

# 4. leak tests (table-level always; route-level needs a running app)
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx vitest run tests/isolation
#   optional for route-level: TEST_BASE_URL=... TEST_TOKEN_A=... TEST_B_RESOURCE_ID=...
```

Required env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(+ `TEST_BASE_URL`, `TEST_TOKEN_A`, `TEST_B_*` for route-level).

> Authored in PR-0; **not executed** in the authoring environment (no DB/secrets there).
> First green run wires the fixtures against the live schema and confirms the ⚠ rows.

## Red-flag burn-down (subsequent PRs, in order)

1. `media/render/status/[renderId]` — unauthenticated service-role write
2. Instagram webhook — unsigned POST + `comment_replies` has no `project_id`
3. Cron scope / `claim_runs` — move per-project scope + kill switch into the drainer
4. Token scope — `media/token`, `refresh-tokens`
5. Admin routes — `migrate`, `seed`, `debug/subscribe-webhooks`
6. Service-role + param-scope paths — `business/*`, `v1/*` via tenancy guard
