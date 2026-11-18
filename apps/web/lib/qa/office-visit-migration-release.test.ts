import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { evaluateAppliedMigrationLedger, inspectCanonicalMigrationFiles } from '../../scripts/migration-guard-policy.mjs'

const canonical = resolve(__dirname, '../../supabase/migrations')
const legacy = resolve(__dirname, '../../../../supabase/migrations')
const state = inspectCanonicalMigrationFiles(readdirSync(canonical))
const observation = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/verification/office/2026-11-13-applied-migration-dependency.json'), 'utf8'))
const name = 'office_visit_sessions'
const family = 'family_daily_social_capacity_20261114'

it('enforces the Office visit migration from the canonical build history, never the legacy root', () => {
  expect(readdirSync(canonical).filter(file => file.endsWith('_' + name + '.sql'))).toHaveLength(1)
  expect(readdirSync(legacy).filter(file => file.endsWith('_' + name + '.sql'))).toHaveLength(0)
  expect(state.enforcedNames).toContain(name)
  expect(state.sqlFiles).toHaveLength(177)
  expect(new Set(state.repositoryNames).size).toBe(177)
  expect(state.enforcedNames).toContain(family)
})

it('blocks the historical ledger until both reviewed Office and Family additions are present', () => {
  expect(observation.databaseMutationsPerformed).toBe(false)
  expect(observation.migrationNames).not.toContain(name)
  expect(() => evaluateAppliedMigrationLedger(observation.migrationNames, state)).toThrow(/office_visit_sessions/)
  expect(observation.migrationNames).not.toContain(family)
  expect(() => evaluateAppliedMigrationLedger([...observation.migrationNames, name], state)).toThrow(/family_daily_social_capacity_20261114/)
  expect(() => evaluateAppliedMigrationLedger([...observation.migrationNames, family], state)).toThrow(/office_visit_sessions/)
  const hypotheticalAfterApply = [...observation.migrationNames, name, family]
  expect(evaluateAppliedMigrationLedger(hypotheticalAfterApply, state)).toMatchObject({
    canonicalSqlCount: 177, enforcedCount: 163, appliedLedgerCount: 200,
  })
  for (const duplicate of [name, family]) {
    expect(() => evaluateAppliedMigrationLedger([...hypotheticalAfterApply, duplicate], state)).toThrow(/duplicate migration name/)
  }
  expect(() => evaluateAppliedMigrationLedger([...hypotheticalAfterApply, 'unreviewed_migration'], state)).toThrow(/unknown migration name/)
})
