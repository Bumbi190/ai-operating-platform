import {createHash} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect} from 'vitest'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
const migrations=[
 {file:'20261031100000_sales_b2b_offers.sql',name:'sales_b2b_offers',sha:'800f26eae81dd488c6940685b57a85ab5bb5dce5f216d804276f94b596c3b0a3'},
 {file:'20261031110000_sales_discovery_candidates.sql',name:'sales_discovery_candidates',sha:'d4554400122bb3e29cf02b5aa49a2a4230409f8e0dd09ce5e1aededc3b485174'},
]
describe('source-only reconciliation of already-applied parallel sales migrations',()=>{
 for(const migration of migrations){
  it('pins exact production SQL body for '+migration.name,()=>{
   const source=readFileSync(resolve(process.cwd(),'supabase/migrations',migration.file),'utf8').replace(/\r\n/g,'\n')
   expect(createHash('sha256').update(source).digest('hex')).toBe(migration.sha)
  })
  it('keeps '+migration.name+' enforced exactly once',()=>{
   const state=inspectCanonicalMigrationFiles(readdirSync(resolve(process.cwd(),'supabase/migrations')))
   expect(state.enforcedNames).toContain(migration.name)
   expect(state.grandfatheredNames).not.toContain(migration.name)
   expect(()=>evaluateAppliedMigrationLedger(state.repositoryNames.filter(n=>n!==migration.name),state)).toThrow(new RegExp(migration.name))
   expect(()=>evaluateAppliedMigrationLedger([...state.repositoryNames,migration.name],state)).toThrow(/duplicate/)
   expect(()=>evaluateAppliedMigrationLedger([...state.repositoryNames,'invented_release_name'],state)).toThrow(/unknown/)
  })
 }
})
