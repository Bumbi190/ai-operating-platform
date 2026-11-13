import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { evaluateAppliedMigrationLedger, inspectCanonicalMigrationFiles } from '../../scripts/migration-guard-policy.mjs'

const canonical = resolve(__dirname, '../../supabase/migrations')
const legacy = resolve(__dirname, '../../../../supabase/migrations')
const state = inspectCanonicalMigrationFiles(readdirSync(canonical))
const observation = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/verification/office/2026-11-13-applied-migration-dependency.json'), 'utf8'))
const name = 'office_visit_sessions'

it('enforces the Office visit migration from the canonical build history, never the legacy root', () => {
  expect(readdirSync(canonical).filter(file => file.endsWith('_' + name + '.sql'))).toHaveLength(1)
  expect(readdirSync(legacy).filter(file => file.endsWith('_' + name + '.sql'))).toHaveLength(0)
  expect(state.enforcedNames).toContain(name)
})

it('blocks the captured real pre-Office ledger and accepts only the hypothetical reviewed addition', () => {
  expect(observation.databaseMutationsPerformed).toBe(false)
  expect(observation.migrationNames).not.toContain(name)
  expect(() => evaluateAppliedMigrationLedger(observation.migrationNames, state)).toThrow(/office_visit_sessions/)
  const hypotheticalAfterApply = [...observation.migrationNames, name]
  expect(evaluateAppliedMigrationLedger(hypotheticalAfterApply, state)).toMatchObject({
    canonicalSqlCount: 176, enforcedCount: 162, appliedLedgerCount: 199,
  })
})
