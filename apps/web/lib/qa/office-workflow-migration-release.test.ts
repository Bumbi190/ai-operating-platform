import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { evaluateAppliedMigrationLedger, inspectCanonicalMigrationFiles } from '../../scripts/migration-guard-policy.mjs'

const files = readdirSync(resolve(__dirname, '../../supabase/migrations'))
const state = inspectCanonicalMigrationFiles(files)
const observed = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/verification/office/2026-11-18-applied-migration-dependency.json'), 'utf8'))
const pending = ['office_step_activity', 'office_workflow_state']
const proposed = [...observed.migrationNames, ...pending]

it('retains the captured read-only ledger and requires both exact pending Office migrations', () => {
  expect(observed.readOnly).toBe(true)
  expect(observed.databaseMutationsPerformed).toBe(false)
  expect(observed.rowCount).toBe(200)
  expect(observed.migrationNames).toHaveLength(200)
  expect(new Set(observed.migrationNames).size).toBe(200)
  expect(createHash('sha256').update([...observed.migrationNames].sort().join('\n')).digest('hex')).toBe(observed.sortedNameSetSha256)
  expect(observed.migrationNames).toContain('office_visit_sessions')
  expect(observed.migrationNames).toContain('family_daily_social_capacity_20261114')
  for (const name of pending) {
    expect(observed.migrationNames).not.toContain(name)
    expect(state.enforcedNames).toContain(name)
    expect(state.grandfatheredNames).not.toContain(name)
    expect(files.filter(file => file.endsWith('_' + name + '.sql'))).toHaveLength(1)
    expect(() => evaluateAppliedMigrationLedger(proposed.filter(n => n !== name), state)).toThrow(new RegExp(name))
  }
  expect(() => evaluateAppliedMigrationLedger(observed.migrationNames, state)).toThrow(/office_step_activity/)
  // This is a hypothetical after-apply ledger, never evidence of a live apply.
  expect(evaluateAppliedMigrationLedger(proposed, state)).toMatchObject({
    canonicalSqlCount: 179, enforcedCount: 165, appliedLedgerCount: 202,
    unknownLedgerNames: [], duplicateLedgerNames: [],
  })
  expect(() => evaluateAppliedMigrationLedger([...proposed, pending[1]], state)).toThrow(/duplicate/)
  expect(() => evaluateAppliedMigrationLedger([...proposed, 'office_unreviewed_dependency'], state)).toThrow(/unknown migration name/)
})
