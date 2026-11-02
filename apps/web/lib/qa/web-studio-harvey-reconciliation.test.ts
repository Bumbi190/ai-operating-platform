import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger,GRANDFATHERED_MIGRATION_NAMES,LEGACY_ONLY_PRODUCTION_LEDGER_NAMES} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(__dirname,'../../../..'),dir=resolve(root,'apps/web/supabase/migrations')
const observation=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-02-web-studio-harvey-observation.json'),'utf8'))
const state=()=>inspectCanonicalMigrationFiles(readdirSync(dir))
const names=observation.migration_names as string[]
const targets=['handlarborsen_scb_live_preview_candidates','sales_editorial_only_drafts']
describe('Studio source-only reconciliation of already applied Harvey migrations',()=>{
 it.each(observation.migrations as Array<{file:string;sha256:string;bytes:number}>)('preserves exact reviewed Git SQL bytes: $file',entry=>{
  const bytes=readFileSync(resolve(dir,entry.file))
  expect(bytes.byteLength).toBe(entry.bytes)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
 })
 it('accepts the real194-name observation with both migrations enforced',()=>{
  const current=state()
  expect(names).toHaveLength(194);expect(new Set(names).size).toBe(194)
  expect(current.sqlFiles).toHaveLength(171);expect(current.enforcedNames).toHaveLength(157)
  for(const name of targets){
   expect(current.enforcedNames).toContain(name)
   expect(GRANDFATHERED_MIGRATION_NAMES).not.toContain(name)
   expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).not.toContain(name)
  }
  expect(evaluateAppliedMigrationLedger(names,current)).toMatchObject({enforcedCount:157,appliedLedgerCount:194,unknownLedgerNames:[],duplicateLedgerNames:[]})
 })
 it.each(targets)('rejects a ledger missing the enforced migration %s',name=>{
  expect(()=>evaluateAppliedMigrationLedger(names.filter(n=>n!==name),state())).toThrow(/not applied/)
 })
 it.each(targets)('rejects duplicate applied migration %s',name=>{
  expect(()=>evaluateAppliedMigrationLedger([...names,name],state())).toThrow(/duplicate/)
 })
 it('still rejects an unrelated unknown migration',()=>{
  expect(()=>evaluateAppliedMigrationLedger([...names,'unreviewed_future_schema'],state())).toThrow(/unknown/)
 })
 it('preserves the historical192-name snapshot and reports its missing Harvey migrations',()=>{
  const prior=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-01-web-studio-campaign-observation.json'),'utf8')).migration_names
  expect(prior).toHaveLength(192)
  expect(()=>evaluateAppliedMigrationLedger(prior,state())).toThrow(/not applied/)
 })
})
