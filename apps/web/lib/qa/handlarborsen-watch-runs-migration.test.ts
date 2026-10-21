import {createHash} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect} from 'vitest'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(process.cwd(),'../..'),dir=resolve(root,'apps/web/supabase/migrations')
const name='handlarborsen_watch_runs_v1',normalize=(s:string)=>s.replace(/\r\n/g,'\n')
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const canonical=()=>{const files=readdirSync(dir).filter(n=>n.endsWith('_'+name+'.sql'));expect(files).toHaveLength(1);return normalize(readFileSync(resolve(dir,files[0]),'utf8'))}
describe('reviewed weekly watch journal schema promotion',()=>{
 it('preserves the exact reviewed SQL body and pinned proposal hash',()=>{
  const proposal=normalize(readFileSync(resolve(root,'docs/sql/handlarborsen_watch_runs_p1_proposed.sql'),'utf8'))
  expect(hash(proposal)).toBe('25301e60468986f276b2d32e630867782764d94304c38831f368414725939da6')
  expect(canonical().split('\n').slice(1).join('\n')).toBe(proposal.split('\n').slice(1).join('\n'))
 })
 it('fails closed on a missing or duplicated journal ledger name',()=>{
  const state=inspectCanonicalMigrationFiles(readdirSync(dir))
  expect(state.enforcedNames).toContain(name);expect(state.grandfatheredNames).not.toContain(name)
  expect(()=>evaluateAppliedMigrationLedger(state.repositoryNames.filter(n=>n!==name),state)).toThrow(/handlarborsen_watch_runs_v1/)
  expect(()=>evaluateAppliedMigrationLedger([...state.repositoryNames,name],state)).toThrow(/duplicate/)
 })
 it('classifies both tables as server-only without broadening the live-catalog class',()=>{
  const registry=JSON.parse(readFileSync(resolve(process.cwd(),'tests/isolation/schema-security.json'),'utf8'))
  for(const table of ['handlarborsen_watch_runs','handlarborsen_watch_run_events'])
   expect(registry.tables[table]).toMatchObject({class:'SERVER_ONLY',rls:true,policies:0,anon_grants:false,authenticated_grants:false,service_role:true})
 })
 it('binds the actual canonical database proof to the exact canonical source',()=>{
  const receipt=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-10-17-hb-watch-runs-canonical-db.json'),'utf8'))
  expect(receipt).toMatchObject({status:'passed',sourceSha256:hash(canonical()),productionAccess:false,providerCalls:0,containerRemoved:true})
  expect(receipt.sourcePath).toMatch(/apps\/web\/supabase\/migrations\/\d+_handlarborsen_watch_runs_v1\.sql$/)
  expect(receipt.checks).toContain('row-lock wait crossing expiry cannot complete with stale time')
  expect(receipt.checks).toContain('claim lease starts after queued row lock release')
 })
})
