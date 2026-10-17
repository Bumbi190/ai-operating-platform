import {describe,it,expect} from 'vitest'
import {readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
describe('sales migration enforcement',()=>{
 it('advances the canonical source count without pretending the migration was applied',()=>{
  const state=inspectCanonicalMigrationFiles(readdirSync(resolve(process.cwd(),'supabase/migrations')))
  expect(state.sqlFiles).toHaveLength(131);expect(state.enforcedNames).toHaveLength(117)
  expect(state.enforcedNames).toContain('atlas_sales_pilot');expect(state.grandfatheredNames).not.toContain('atlas_sales_pilot')
  expect(()=>evaluateAppliedMigrationLedger(state.repositoryNames.filter(n=>n!=='atlas_sales_pilot'),state)).toThrow(/atlas_sales_pilot/)
 })
})
