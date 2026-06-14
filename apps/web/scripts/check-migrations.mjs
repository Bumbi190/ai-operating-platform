#!/usr/bin/env node
/**
 * Migration guard (H1 process hardening — NOT a feature).
 *
 * Fails the Vercel build when a repo migration in the canonical directory has NOT
 * been applied to the Supabase ledger — preventing another P3-style "code deployed
 * before its migration" incident. Wired into apps/web/package.json `build`, which is
 * what Vercel actually runs (Vercel Root Directory = apps/web).
 *
 * Design (locked):
 *  - Canonical dir: apps/web/supabase/migrations (resolved relative to this file).
 *  - Enforces ONLY migrations NOT in the frozen GRANDFATHERED set. Everything present
 *    at guard introduction is grandfathered (so the guard never false-positives on
 *    pre-ledger / stale history); the set NEVER grows, so every NEW migration is
 *    strictly enforced. First enforced migration: H1.P4's `h1p4_run_policy_snapshot`.
 *  - Reads applied migration names via the public RPC `omnira_applied_migrations`
 *    over PostgREST with the service-role key — the same mechanism the drain already
 *    uses for `claim_runs`. No new secrets, no new infrastructure.
 *  - Enforces only on Vercel (`process.env.VERCEL === '1'`); local `next build` is
 *    skipped so dev DX is unaffected.
 *  - FAIL-CLOSED: any inability to verify (missing env, RPC error, bad payload)
 *    blocks the build.
 *  - Emergency bypass: `MIGRATION_GUARD_OVERRIDE=1` (deliberate, audited).
 *
 * Naming contract: every migration file is `<digits>_<name>.sql` and is applied via
 * `apply_migration(name='<name>')`, so the derived name equals the ledger name.
 */

import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// This file lives at apps/web/scripts/ → migrations are one dir up.
const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))

// Frozen baseline — migration names present at guard introduction. NEVER grows.
const GRANDFATHERED = new Set([
  'media_images',
  'media_tables',
  'media_scripts_facebook',
  'media_scripts_quality_music',
  'platform_tokens',
  'agent_decisions',
  'revenue_os',
  'atlas_bi_foundation',
  'cost_events',
  'project_budgets',
  'h1p1_execution_policy_foundation',
  'media_rls_hardening',
  'h1p3_run_steps_snapshot',
  'migration_guard_fn',
])

function fail(msg) {
  console.error(`\n❌ migration-guard: ${msg}\n`)
  process.exit(1)
}

function migrationNameFromFile(file) {
  return file.replace(/^\d+_/, '').replace(/\.sql$/, '')
}

async function main() {
  // Only gate real deploys. Local builds are unaffected.
  if (process.env.VERCEL !== '1') {
    console.log('migration-guard: not on Vercel — skipping (local build).')
    return
  }

  // Permanent build-env diagnostic — booleans ONLY, never values/secrets. Lets every
  // Vercel build confirm the guard's credentials are present, even when nothing is
  // enforced (the enforced.length===0 path short-circuits before the RPC).
  console.log(
    `migration-guard: build env — service_role=${Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} url=${Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}`,
  )

  if (process.env.MIGRATION_GUARD_OVERRIDE === '1') {
    console.warn('⚠️  migration-guard: MIGRATION_GUARD_OVERRIDE=1 — gate BYPASSED (must be a deliberate, audited emergency).')
    return
  }

  let files
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  } catch (e) {
    fail(`cannot read migrations dir ${MIGRATIONS_DIR}: ${e.message}`)
  }

  const enforced = files.map(migrationNameFromFile).filter((name) => !GRANDFATHERED.has(name))
  if (enforced.length === 0) {
    console.log('migration-guard: no enforced (post-baseline) migrations — OK.')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    fail('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — cannot verify migrations (fail-closed).')
  }

  let applied
  try {
    const res = await fetch(`${url}/rest/v1/rpc/omnira_applied_migrations`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (!res.ok) fail(`ledger RPC returned HTTP ${res.status} (fail-closed).`)
    applied = await res.json()
  } catch (e) {
    fail(`ledger RPC call failed: ${e.message} (fail-closed).`)
  }

  if (!Array.isArray(applied)) {
    fail('ledger RPC did not return an array (fail-closed).')
  }
  const appliedSet = new Set(applied)

  const missing = enforced.filter((name) => !appliedSet.has(name))
  if (missing.length > 0) {
    fail(
      'the following migration(s) are in the repo but NOT applied to the database:\n' +
        missing.map((m) => `   • ${m}`).join('\n') +
        '\n\nApply them via the Supabase migration flow BEFORE deploying. ' +
        'This deploy is blocked to prevent a code-ahead-of-schema incident.',
    )
  }

  console.log(`migration-guard: ✓ all ${enforced.length} enforced migration(s) applied.`)
}

main().catch((e) => fail(`unexpected error: ${e?.message ?? e} (fail-closed).`))
