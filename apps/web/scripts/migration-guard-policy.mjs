import { createHash } from 'node:crypto'

/**
 * Migration Guard v2 policy.
 *
 * This is deliberately a set-integrity contract. It proves that every enforced
 * canonical migration is represented in the production ledger and that every
 * ledger name is known to one of the two explicit repository histories. It does
 * NOT prove application order, ledger versions, SQL content hashes, or replayability.
 */
export const MIGRATION_GUARD_POLICY_VERSION = 2
// 95 + 20260923120000_survival_state_events.sql (Atlas Survival Phase 2A)
//    + 20260923150000_sdf1c1_trusted_broker_identity.sql (Phase 1C1A — trusted broker
//      device identity and enrollment only)
//    + 20260924080000_sdf1c1b_broker_claim_credentials.sql (Phase 1C1B — claim-scoped
//      credential foundation only)
//    + 20260924120000_survival_funding_phase2b.sql (Atlas Survival Phase 2B —
//      owner-declared operating capital, its audit ledger, and derivation v2 coverage)
//    + 20260924140000_sdf1c2_broker_control_channel.sql (Phase 1C2 — broker control
//      channel, database side only).
// Enforced trips together: 100 = 14 grandfathered + 86 enforced.
//
// 1C1A, 1C1B, 2B and 1C2 each arrived on their own branch and each moved this tripwire by
// one, so the reconciled total is the sum of all five additions rather than any one
// branch's value. Phase 2B is ENFORCED, not grandfathered: it is a live repository
// migration whose absence from the production ledger must fail the guard until the
// approved apply happens.
export const EXPECTED_CANONICAL_SQL_COUNT = 100
export const EXPECTED_ENFORCED_COUNT = 86

// Frozen baseline present when the original guard was introduced. NEVER grows.
export const GRANDFATHERED_MIGRATION_NAMES = Object.freeze([
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

// Production ledger names backed by the documented legacy migration history.
// This allowlist is exact and frozen; future entries belong in the canonical dir.
export const LEGACY_ONLY_PRODUCTION_LEDGER_NAMES = Object.freeze([
  'media_scripts_updated_at_and_stuck_watchdog',
  'add_render_input_props_for_edge_render',
  '20260601_business_metrics',
  '20260601_media_insights',
  '20260601_insights_cron',
  '20260601_briefing_cron',
  'add_youtube_columns',
  'atlas_growth_account_snapshots',
  'atlas_growth_opportunities',
  'atlas_growth_script_topic_format',
  'g1_multitenant_platform_tokens',
  'stripe_intelligence_revenue_snapshots',
  'durable_runs_claim_reaper',
  'durable_runs_claim_public_rpc',
  'token_health_monitoring',
  'pipeline_retry_state',
  'cron_heartbeat',
  'marketing_engine_foundation',
  'media_insights_multiplatform',
  'media_insights_retention',
  'media_scripts_breaking_flag',
  'pr2_route_webhook_isolation',
  'schedule_dream_cron',
  'bug_monitoring_foundation',
  'manager_task_dream_link',
  'dream_issues_ledger',
  'enable_rls_cost_rates_dream_issues',
  'harden_set_updated_at_search_path',
  'atlas_actions',
  'enable_public_rls_for_internal_tables',
])

const EXPECTED_GRANDFATHERED_COUNT = 14
const EXPECTED_LEGACY_ONLY_COUNT = 30
const EXPECTED_GRANDFATHERED_SHA256 = 'c13bd57d6eea2f8670847196e3d6e0ffad9e1af7116b49f04019628fabb88791'
const EXPECTED_LEGACY_ONLY_SHA256 = '3537f80525d036363358e8c5725530c3939c7508d49e509637a2f4232380dec4'
const EXPLICIT_LEDGER_NAME = /^[a-z0-9_]+$/

function sha256Names(names) {
  return createHash('sha256').update(names.join('\n')).digest('hex')
}

function duplicates(names) {
  const seen = new Set()
  const duplicateNames = new Set()
  for (const name of names) {
    if (seen.has(name)) duplicateNames.add(name)
    seen.add(name)
  }
  return [...duplicateNames].sort()
}

function formatNames(names) {
  return names.map((name) => `   • ${name}`).join('\n')
}

export function migrationNameFromFile(file) {
  const match = /^(\d+)_(.+)\.sql$/.exec(file)
  if (!match || !EXPLICIT_LEDGER_NAME.test(match[2])) {
    throw new Error(`canonical migration filename is malformed: ${file}`)
  }
  return match[2]
}

export function assertMigrationGuardPolicyIntegrity({
  grandfatheredNames = GRANDFATHERED_MIGRATION_NAMES,
  legacyOnlyNames = LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
} = {}) {
  if (MIGRATION_GUARD_POLICY_VERSION !== 2) {
    throw new Error(`unexpected migration guard policy version: ${MIGRATION_GUARD_POLICY_VERSION}`)
  }
  if (EXPECTED_CANONICAL_SQL_COUNT !== EXPECTED_GRANDFATHERED_COUNT + EXPECTED_ENFORCED_COUNT) {
    throw new Error('canonical, grandfathered, and enforced count tripwires disagree')
  }
  if (grandfatheredNames.length !== EXPECTED_GRANDFATHERED_COUNT) {
    throw new Error(`grandfathered migration list drifted: expected ${EXPECTED_GRANDFATHERED_COUNT}, got ${grandfatheredNames.length}`)
  }
  if (legacyOnlyNames.length !== EXPECTED_LEGACY_ONLY_COUNT) {
    throw new Error(`legacy-only production ledger allowlist drifted: expected ${EXPECTED_LEGACY_ONLY_COUNT}, got ${legacyOnlyNames.length}`)
  }
  if (sha256Names(grandfatheredNames) !== EXPECTED_GRANDFATHERED_SHA256) {
    throw new Error('grandfathered migration list contents or order drifted')
  }
  if (sha256Names(legacyOnlyNames) !== EXPECTED_LEGACY_ONLY_SHA256) {
    throw new Error('legacy-only production ledger allowlist contents or order drifted')
  }

  for (const [label, names] of [
    ['grandfathered migration list', grandfatheredNames],
    ['legacy-only production ledger allowlist', legacyOnlyNames],
  ]) {
    const malformed = names.filter((name) => typeof name !== 'string' || !EXPLICIT_LEDGER_NAME.test(name))
    if (malformed.length > 0) throw new Error(`${label} contains non-explicit names: ${malformed.join(', ')}`)
    const duplicateNames = duplicates(names)
    if (duplicateNames.length > 0) throw new Error(`${label} contains duplicate names: ${duplicateNames.join(', ')}`)
  }

  const grandfathered = new Set(grandfatheredNames)
  const overlap = legacyOnlyNames.filter((name) => grandfathered.has(name))
  if (overlap.length > 0) throw new Error(`migration policy categories overlap: ${overlap.join(', ')}`)
}

export function inspectCanonicalMigrationFiles(
  files,
  {
    expectedCanonicalCount = EXPECTED_CANONICAL_SQL_COUNT,
    expectedEnforcedCount = EXPECTED_ENFORCED_COUNT,
    grandfatheredNames = GRANDFATHERED_MIGRATION_NAMES,
    legacyOnlyNames = LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
  } = {},
) {
  assertMigrationGuardPolicyIntegrity({ grandfatheredNames, legacyOnlyNames })
  if (!Array.isArray(files)) throw new Error('canonical migration directory did not return a file list')

  const sqlFiles = files.filter((file) => file.endsWith('.sql'))
  if (sqlFiles.length !== expectedCanonicalCount) {
    throw new Error(`canonical SQL count drifted: expected ${expectedCanonicalCount}, got ${sqlFiles.length}`)
  }

  const repositoryNames = sqlFiles.map(migrationNameFromFile)
  const duplicateRepositoryNames = duplicates(repositoryNames)
  if (duplicateRepositoryNames.length > 0) {
    throw new Error(`duplicate canonical migration ledger name(s):\n${formatNames(duplicateRepositoryNames)}`)
  }

  const repositoryNameSet = new Set(repositoryNames)
  const missingGrandfathered = grandfatheredNames.filter((name) => !repositoryNameSet.has(name))
  if (missingGrandfathered.length > 0) {
    throw new Error(`frozen grandfathered migration(s) missing from canonical repository:\n${formatNames(missingGrandfathered)}`)
  }

  const legacyOverlap = legacyOnlyNames.filter((name) => repositoryNameSet.has(name))
  if (legacyOverlap.length > 0) {
    throw new Error(`legacy-only name(s) unexpectedly became canonical:\n${formatNames(legacyOverlap)}`)
  }

  const grandfathered = new Set(grandfatheredNames)
  const enforcedNames = repositoryNames.filter((name) => !grandfathered.has(name))
  if (enforcedNames.length !== expectedEnforcedCount) {
    throw new Error(`enforced migration count drifted: expected ${expectedEnforcedCount}, got ${enforcedNames.length}`)
  }

  return {
    policyVersion: MIGRATION_GUARD_POLICY_VERSION,
    sqlFiles,
    repositoryNames,
    enforcedNames,
    grandfatheredNames: [...grandfatheredNames],
    legacyOnlyNames: [...legacyOnlyNames],
  }
}

export function evaluateAppliedMigrationLedger(appliedNames, repositoryState) {
  if (!Array.isArray(appliedNames)) throw new Error('ledger RPC did not return an array (fail-closed)')
  const malformed = appliedNames.filter((name) => typeof name !== 'string' || !EXPLICIT_LEDGER_NAME.test(name))
  if (malformed.length > 0) throw new Error('ledger RPC returned malformed migration name(s) (fail-closed)')

  // Duplicate detection MUST happen before Set construction; Set alone would hide it.
  const duplicateLedgerNames = duplicates(appliedNames)
  if (duplicateLedgerNames.length > 0) {
    throw new Error(`production ledger contains duplicate migration name(s):\n${formatNames(duplicateLedgerNames)}`)
  }

  const appliedSet = new Set(appliedNames)
  const missingEnforcedNames = repositoryState.enforcedNames.filter((name) => !appliedSet.has(name))
  if (missingEnforcedNames.length > 0) {
    throw new Error(`repo migration(s) are not applied to the production ledger:\n${formatNames(missingEnforcedNames)}`)
  }

  const knownNames = new Set([...repositoryState.repositoryNames, ...repositoryState.legacyOnlyNames])
  const unknownLedgerNames = appliedNames.filter((name) => !knownNames.has(name)).sort()
  if (unknownLedgerNames.length > 0) {
    throw new Error(`production ledger contains unknown migration name(s):\n${formatNames(unknownLedgerNames)}`)
  }

  return {
    policyVersion: repositoryState.policyVersion,
    canonicalSqlCount: repositoryState.sqlFiles.length,
    enforcedCount: repositoryState.enforcedNames.length,
    grandfatheredCount: repositoryState.grandfatheredNames.length,
    legacyOnlyAllowlistCount: repositoryState.legacyOnlyNames.length,
    appliedLedgerCount: appliedNames.length,
    unknownLedgerNames,
    duplicateLedgerNames,
    verifies: Object.freeze({
      canonicalSetIntegrity: true,
      enforcedPresence: true,
      knownLedgerNamesOnly: true,
      uniqueRepositoryLedgerNames: true,
      uniqueProductionLedgerNames: true,
    }),
    doesNotVerify: Object.freeze([
      'application order',
      'ledger version values',
      'migration SQL content hashes',
      'full-schema replayability',
    ]),
  }
}
