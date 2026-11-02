import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(__dirname,'../../../..'),dir=resolve(root,'apps/web/supabase/migrations')
const observation=JSON.parse(readFileSync(resolve(root,'docs/validation/nova-voice-migration-observation-20261102.json'),'utf8'))
const names=observation.migrationNames as string[]
const state=()=>inspectCanonicalMigrationFiles(readdirSync(dir))
const files=[
 ['20261102064659_handlarborsen_scb_live_preview_candidates.sql','cf12468800265c9b54f42fdaa5f27f2eadb9357eb6ede833d95b5f3a0a3f26b7'],
 ['20261102090200_sales_editorial_only_drafts.sql','072897c68f1ed2d85b0f84bed1f5214bb56f9290170b58e8d3c284012e5d7ec1'],
]
describe('Nova preview exact source parity for existing migrations',()=>{
 it.each(files)('matches the independently reviewed SQL blob %s',(file,sha)=>{
  expect(createHash('sha256').update(readFileSync(resolve(dir,file))).digest('hex')).toBe(sha)
 })
 it('accepts the current real ledger with both entries enforced',()=>{
  expect(evaluateAppliedMigrationLedger(names,state())).toMatchObject({enforcedCount:157,appliedLedgerCount:194,unknownLedgerNames:[],duplicateLedgerNames:[]})
 })
 it.each(['handlarborsen_scb_live_preview_candidates','sales_editorial_only_drafts'])('refuses a missing applied migration %s',name=>{
  expect(()=>evaluateAppliedMigrationLedger(names.filter(n=>n!==name),state())).toThrow(/not applied/)
  expect(()=>evaluateAppliedMigrationLedger([...names,name],state())).toThrow(/duplicate/)
 })
 it('continues refusing an unrelated unknown migration',()=>{
  expect(()=>evaluateAppliedMigrationLedger([...names,'unapproved_schema'],state())).toThrow(/unknown/)
 })
})
