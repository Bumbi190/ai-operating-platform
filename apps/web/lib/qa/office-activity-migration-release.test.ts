import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { evaluateAppliedMigrationLedger, inspectCanonicalMigrationFiles } from '../../scripts/migration-guard-policy.mjs'
const files = readdirSync(resolve(__dirname, '../../supabase/migrations'))
const state = inspectCanonicalMigrationFiles(files)
const before = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/verification/office/2026-11-13-applied-migration-dependency.json'), 'utf8'))
const base = [...before.migrationNames, 'office_visit_sessions', 'family_daily_social_capacity_20261114']
it('blocks the identity-only hypothetical ledger until the exact activity migration is applied', () => {
  expect(files.filter(file => file.endsWith('_office_step_activity.sql'))).toHaveLength(1)
  expect(state.enforcedNames).toContain('office_step_activity')
  expect(state.grandfatheredNames).not.toContain('office_step_activity')
  expect(() => evaluateAppliedMigrationLedger(base, state)).toThrow(/office_step_activity/)
  expect(() => evaluateAppliedMigrationLedger([...base, 'office_step_activity'], state)).toThrow(/office_workflow_state/)
  expect(evaluateAppliedMigrationLedger([...base, 'office_step_activity', 'office_workflow_state'], state)).toMatchObject({ canonicalSqlCount: 179, enforcedCount: 165, appliedLedgerCount: 202 })
  expect(() => evaluateAppliedMigrationLedger([...base, 'office_step_activity', 'office_step_activity'], state)).toThrow(/duplicate/)
})
