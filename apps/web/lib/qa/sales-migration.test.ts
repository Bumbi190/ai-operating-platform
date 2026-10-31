import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  EXPECTED_CANONICAL_SQL_COUNT,
  EXPECTED_ENFORCED_COUNT,
  inspectCanonicalMigrationFiles,
  evaluateAppliedMigrationLedger,
} from '../../scripts/migration-guard-policy.mjs'

describe('sales migration enforcement', () => {
  it('enforces every sales migration without treating source files as applied', () => {
    const state = inspectCanonicalMigrationFiles(readdirSync(resolve(process.cwd(), 'supabase/migrations')))
    expect(state.sqlFiles).toHaveLength(EXPECTED_CANONICAL_SQL_COUNT)
    expect(state.enforcedNames).toHaveLength(EXPECTED_ENFORCED_COUNT)
    for (const name of [
      'atlas_sales_pilot', 'sales_managed_host', 'sales_strato_connection',
      'sales_strato_inbox', 'sales_reply_preparation', 'sales_reply_sending',
      'sales_contact_timing', 'sales_email_copy_versions',
      'sales_b2b_offers', 'sales_discovery_candidates',
    ]) {
      expect(state.enforcedNames).toContain(name)
      expect(state.grandfatheredNames).not.toContain(name)
      expect(() => evaluateAppliedMigrationLedger(state.repositoryNames.filter(n => n !== name), state))
        .toThrow(new RegExp(name))
    }
  })
})

it('keeps new sales SQL in the canonical web migration directory exactly once', () => {
  const state = inspectCanonicalMigrationFiles(readdirSync(resolve(process.cwd(), 'supabase/migrations')))
  for (const file of [
    '20261031100000_sales_b2b_offers.sql',
    '20261031110000_sales_discovery_candidates.sql',
  ]) {
    expect(state.sqlFiles.filter(name => name === file)).toHaveLength(1)
  }
})
