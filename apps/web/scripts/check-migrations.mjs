#!/usr/bin/env node
/**
 * Migration Guard v2 (H1 process hardening — NOT a feature).
 *
 * Fails the Vercel build unless the canonical repository migration set and the
 * production ledger satisfy the frozen policy in migration-guard-policy.mjs.
 * The guard remains Vercel-only, fail-closed, and read-only. It does not apply,
 * repair, reorder, or rewrite migrations.
 */

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateAppliedMigrationLedger,
  inspectCanonicalMigrationFiles,
} from './migration-guard-policy.mjs'

// This file lives at apps/web/scripts/ → migrations are one dir up.
const MIGRATIONS_DIR = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))

function guardError(message) {
  return new Error(`migration-guard: ${message}`)
}

export async function runMigrationGuard({
  env = process.env,
  fetchImpl = globalThis.fetch,
  readDirectory = readdirSync,
  logger = console,
  migrationsDir = MIGRATIONS_DIR,
} = {}) {
  // Only gate real deploys. Local builds are unaffected.
  if (env.VERCEL !== '1') {
    logger.log('migration-guard: not on Vercel — skipping (local build).')
    return { skipped: true, reason: 'not-vercel' }
  }

  // Booleans only: never print values or secrets.
  logger.log(
    `migration-guard: build env — service_role=${Boolean(env.SUPABASE_SERVICE_ROLE_KEY)} url=${Boolean(env.NEXT_PUBLIC_SUPABASE_URL)}`,
  )

  if (env.MIGRATION_GUARD_OVERRIDE === '1') {
    logger.warn('⚠️  migration-guard: MIGRATION_GUARD_OVERRIDE=1 — gate BYPASSED (must be a deliberate, audited emergency).')
    return { skipped: true, reason: 'emergency-override' }
  }

  let files
  try {
    files = readDirectory(migrationsDir)
  } catch (error) {
    throw guardError(`cannot read migrations dir ${migrationsDir}: ${error.message}`)
  }

  let repositoryState
  try {
    repositoryState = inspectCanonicalMigrationFiles(files)
  } catch (error) {
    throw guardError(`${error.message} (fail-closed)`)
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw guardError('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — cannot verify migrations (fail-closed).')
  }
  if (typeof fetchImpl !== 'function') {
    throw guardError('fetch is unavailable — cannot verify migrations (fail-closed).')
  }

  let applied
  try {
    const response = await fetchImpl(`${url}/rest/v1/rpc/omnira_applied_migrations`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (!response.ok) throw new Error(`ledger RPC returned HTTP ${response.status}`)
    applied = await response.json()
  } catch (error) {
    throw guardError(`ledger RPC call failed: ${error.message} (fail-closed).`)
  }

  let result
  try {
    result = evaluateAppliedMigrationLedger(applied, repositoryState)
  } catch (error) {
    throw guardError(`${error.message} (fail-closed)`)
  }

  logger.log(
    `migration-guard: ✓ policy v${result.policyVersion}; ${result.enforcedCount}/${result.enforcedCount} enforced migration(s) applied; ` +
      `${result.appliedLedgerCount} unique known ledger name(s).`,
  )
  return { skipped: false, ...result }
}

const isDirectInvocation = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectInvocation) {
  runMigrationGuard().catch((error) => {
    console.error(`\n❌ ${error?.message ?? error}\n`)
    process.exitCode = 1
  })
}
