import {describe,it,expect} from 'vitest'
import {readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
describe('sales migration enforcement',()=>{
 it('advances the canonical source count without pretending the migration was applied',()=>{
  const state=inspectCanonicalMigrationFiles(readdirSync(resolve(process.cwd(),'supabase/migrations')))
  expect(state.sqlFiles).toHaveLength(138);expect(state.enforcedNames).toHaveLength(124)
  for(const name of ['sales_strato_inbox','sales_reply_preparation','atlas_sales_pilot']){
   expect(state.enforcedNames).toContain(name);expect(state.grandfatheredNames).not.toContain(name)
   expect(()=>evaluateAppliedMigrationLedger(state.repositoryNames.filter(n=>n!==name),state)).toThrow(new RegExp(name))
  }
 })
})
