import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateAppliedMigrationLedger, inspectCanonicalMigrationFiles } from '../../scripts/migration-guard-policy.mjs'

const files = readdirSync(resolve(__dirname, '../../supabase/migrations'))
const websiteMigration = 'website_build_sessions'

describe('website build canonical migration enforcement', () => {
  it('registers the website migration as enforced in the complete source set', () => {
    const state = inspectCanonicalMigrationFiles(files)
    expect(state.enforcedNames).toContain(websiteMigration)
    expect(state.grandfatheredNames).not.toContain(websiteMigration)
    expect(state.legacyOnlyNames).not.toContain(websiteMigration)
  })

  it('refuses a ledger missing only the website migration', () => {
    const state = inspectCanonicalMigrationFiles(files)
    const ledger = state.repositoryNames.filter(name => name !== websiteMigration)
    expect(() => evaluateAppliedMigrationLedger(ledger, state)).toThrow(/website_build_sessions/)
  })

  it('accepts the complete set and still refuses a duplicate website entry', () => {
    const state = inspectCanonicalMigrationFiles(files)
    const result = evaluateAppliedMigrationLedger(state.repositoryNames, state)
    expect(result.enforcedCount).toBe(state.enforcedNames.length)
    expect(() => evaluateAppliedMigrationLedger([...state.repositoryNames, websiteMigration], state)).toThrow(/duplicate/)
  })
})

it('planning v1 is enforced and neither a missing nor duplicate planning ledger entry is accepted',()=>{const state=inspectCanonicalMigrationFiles(files),name='website_build_planning_v1';expect(state.enforcedNames).toContain(name);expect(state.grandfatheredNames).not.toContain(name);expect(state.legacyOnlyNames).not.toContain(name);expect(()=>evaluateAppliedMigrationLedger(state.repositoryNames.filter(n=>n!==name),state)).toThrow(/website_build_planning_v1/);expect(()=>evaluateAppliedMigrationLedger([...state.repositoryNames,name],state)).toThrow(/duplicate/)})


it('enforces the studio migration and rejects missing or duplicate ledger entries', () => {
  const state = inspectCanonicalMigrationFiles(files)
  const name = 'atlas_builder_studio_workspace'
  expect(state.enforcedNames).toContain(name)
  expect(state.grandfatheredNames).not.toContain(name)
  expect(state.legacyOnlyNames).not.toContain(name)
  expect(() => evaluateAppliedMigrationLedger(state.repositoryNames.filter(n => n !== name), state)).toThrow(/atlas_builder_studio_workspace/)
  expect(() => evaluateAppliedMigrationLedger([...state.repositoryNames, name], state)).toThrow(/duplicate/)
})
