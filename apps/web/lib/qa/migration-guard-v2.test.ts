import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runMigrationGuard } from '../../scripts/check-migrations.mjs'
import {
  assertMigrationGuardPolicyIntegrity,
  evaluateAppliedMigrationLedger,
  EXPECTED_CANONICAL_SQL_COUNT,
  EXPECTED_ENFORCED_COUNT,
  GRANDFATHERED_MIGRATION_NAMES,
  inspectCanonicalMigrationFiles,
  LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
  MIGRATION_GUARD_POLICY_VERSION,
} from '../../scripts/migration-guard-policy.mjs'

const CANONICAL_DIR = resolve(__dirname, '../../supabase/migrations')
const canonicalFiles = readdirSync(CANONICAL_DIR)
const repositoryState = inspectCanonicalMigrationFiles(canonicalFiles)

const GRANDFATHERED_PRESENT_IN_VERIFIED_LEDGER = [
  'atlas_bi_foundation',
  'cost_events',
  'project_budgets',
  'h1p1_execution_policy_foundation',
  'media_rls_hardening',
  'h1p3_run_steps_snapshot',
  'migration_guard_fn',
]

const exactVerifiedKnownLedger = [
  ...repositoryState.enforcedNames,
  ...GRANDFATHERED_PRESENT_IN_VERIFIED_LEDGER,
  ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
]

const quietLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
const runtimeHarness = {
  readDirectory: (() => canonicalFiles) as unknown as typeof readdirSync,
  logger: quietLogger as unknown as Console,
}

describe('Migration Guard v2 — frozen policy and repository set', () => {
  it('pins policy v2 and the current 93/79/14/30 counts', () => {
    expect(MIGRATION_GUARD_POLICY_VERSION).toBe(2)
    expect(EXPECTED_CANONICAL_SQL_COUNT).toBe(93)
    expect(EXPECTED_ENFORCED_COUNT).toBe(79)
    expect(GRANDFATHERED_MIGRATION_NAMES).toHaveLength(14)
    expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).toHaveLength(30)
    expect(repositoryState.sqlFiles).toHaveLength(93)
    expect(repositoryState.enforcedNames).toHaveLength(79)
  })

  it('uses exact explicit names with no wildcard policy entries', () => {
    for (const name of [...GRANDFATHERED_MIGRATION_NAMES, ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES]) {
      expect(name).toMatch(/^[a-z0-9_]+$/)
      expect(name).not.toMatch(/[?*\[\]]/)
    }
    expect(() => assertMigrationGuardPolicyIntegrity()).not.toThrow()
  })

  it('fails on accidental grandfathered-list growth', () => {
    expect(() => assertMigrationGuardPolicyIntegrity({
      grandfatheredNames: [...GRANDFATHERED_MIGRATION_NAMES, 'new_grandfathered_name'],
    })).toThrow(/grandfathered migration list drifted/)
  })

  it('fails when the canonical SQL count drifts', () => {
    expect(() => inspectCanonicalMigrationFiles(canonicalFiles.slice(1))).toThrow(/canonical SQL count drifted/)
  })

  it('fails when the enforced count tripwire drifts', () => {
    expect(() => inspectCanonicalMigrationFiles(canonicalFiles, {
      expectedEnforcedCount: EXPECTED_ENFORCED_COUNT - 1,
    })).toThrow(/enforced migration count drifted/)
  })

  it('fails when two canonical files derive the same ledger name', () => {
    const enforcedFile = canonicalFiles.find((file) => file.endsWith('_youtube_project_oauth.sql'))
    expect(enforcedFile).toBeTruthy()
    const duplicate = `99999999_${enforcedFile!.replace(/^\d+_/, '')}`
    const files = canonicalFiles.map((file) => file === canonicalFiles[0] ? duplicate : file)
    expect(() => inspectCanonicalMigrationFiles(files)).toThrow(/duplicate canonical migration ledger name/)
  })
})

describe('Migration Guard v2 — production ledger set integrity', () => {
  it('passes the exact current synthetic known history', () => {
    const result = evaluateAppliedMigrationLedger(exactVerifiedKnownLedger, repositoryState)
    expect(result.appliedLedgerCount).toBe(116)
    expect(result.unknownLedgerNames).toEqual([])
    expect(result.duplicateLedgerNames).toEqual([])
  })

  it('passes when every grandfathered name is absent', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...repositoryState.enforcedNames,
      ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
    ], repositoryState)).not.toThrow()
  })

  it('passes when every grandfathered name is present', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...repositoryState.repositoryNames,
      ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
    ], repositoryState)).not.toThrow()
  })

  it('accepts every exact documented legacy-only ledger row', () => {
    const result = evaluateAppliedMigrationLedger([
      ...repositoryState.enforcedNames,
      ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
    ], repositoryState)
    expect(result.legacyOnlyAllowlistCount).toBe(30)
  })

  it('does not claim order, version, SQL hashes, or replayability', () => {
    const result = evaluateAppliedMigrationLedger([...exactVerifiedKnownLedger].reverse(), repositoryState)
    expect(result.doesNotVerify).toEqual([
      'application order',
      'ledger version values',
      'migration SQL content hashes',
      'full-schema replayability',
    ])
  })

  it('fails when an enforced migration is missing', () => {
    const missing = repositoryState.enforcedNames[0]
    expect(() => evaluateAppliedMigrationLedger(
      exactVerifiedKnownLedger.filter((name) => name !== missing),
      repositoryState,
    )).toThrow(/not applied to the production ledger/)
  })

  it('fails on an unknown production ledger name', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...exactVerifiedKnownLedger,
      'unknown_production_migration',
    ], repositoryState)).toThrow(/unknown migration name/)
  })

  it('fails on a duplicate production ledger name before Set construction can hide it', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...exactVerifiedKnownLedger,
      exactVerifiedKnownLedger[0],
    ], repositoryState)).toThrow(/duplicate migration name/)
  })

  it('fails on a malformed ledger payload', () => {
    expect(() => evaluateAppliedMigrationLedger({ names: exactVerifiedKnownLedger }, repositoryState)).toThrow(/did not return an array/)
    expect(() => evaluateAppliedMigrationLedger([...exactVerifiedKnownLedger, 'not-explicit-*'], repositoryState)).toThrow(/malformed migration name/)
  })
})

describe('Migration Guard v2 — Vercel fail-closed runtime', () => {
  const vercelEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    VERCEL: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key',
  }

  it('fails when the Vercel build lacks required credentials', async () => {
    await expect(runMigrationGuard({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        VERCEL: '1',
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
      ...runtimeHarness,
    })).rejects.toThrow(/missing — cannot verify migrations/)
  })

  it('fails closed when the ledger RPC request fails', async () => {
    await expect(runMigrationGuard({
      env: vercelEnv,
      fetchImpl: vi.fn().mockRejectedValue(new Error('synthetic network failure')),
      ...runtimeHarness,
    })).rejects.toThrow(/ledger RPC call failed/)
  })

  it('fails closed when the ledger RPC payload has the wrong shape', async () => {
    await expect(runMigrationGuard({
      env: vercelEnv,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: [] }) }),
      ...runtimeHarness,
    })).rejects.toThrow(/did not return an array/)
  })

  it('passes a Vercel build only for the validated known ledger set', async () => {
    const result = await runMigrationGuard({
      env: vercelEnv,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => exactVerifiedKnownLedger }),
      ...runtimeHarness,
    })
    expect(result).toMatchObject({
      skipped: false,
      policyVersion: 2,
      canonicalSqlCount: 93,
      enforcedCount: 79,
      appliedLedgerCount: 116,
    })
  })
})
