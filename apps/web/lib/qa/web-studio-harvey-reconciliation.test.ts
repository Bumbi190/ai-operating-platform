import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger,GRANDFATHERED_MIGRATION_NAMES,LEGACY_ONLY_PRODUCTION_LEDGER_NAMES} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(__dirname,'../../../..'),dir=resolve(root,'apps/web/supabase/migrations')
const observedPosthog=JSON.parse(readFileSync(resolve(root,'docs/verification/web-studio/2026-11-04-posthog-ledger-observation.json'),'utf8')).migrationNames as string[]
const observation=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-02-web-studio-harvey-observation.json'),'utf8'))
const state=()=>inspectCanonicalMigrationFiles(readdirSync(dir))
const latest=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-04-web-studio-initial-send-observation.json'),'utf8'))
const names=latest.migration_names as string[]
const targets=['handlarborsen_scb_live_preview_candidates','sales_editorial_only_drafts','sales_initial_sending']
describe('Studio source-only reconciliation of already applied Harvey migrations',()=>{
 it.each(observation.migrations as Array<{file:string;sha256:string;bytes:number}>)('preserves exact reviewed Git SQL bytes: $file',entry=>{
  const bytes=readFileSync(resolve(dir,entry.file))
  expect(bytes.byteLength).toBe(entry.bytes)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
 })
 it('preserves the real195-name observation and enforces the pending allowance',()=>{
  const current=state()
  expect(names).toHaveLength(195);expect(new Set(names).size).toBe(195)
  expect(current.sqlFiles).toHaveLength(174);expect(current.enforcedNames).toHaveLength(160)
  for(const name of targets){
   expect(current.enforcedNames).toContain(name)
   expect(GRANDFATHERED_MIGRATION_NAMES).not.toContain(name)
   expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).not.toContain(name)
  }
  // The immutable real195-name capture predates the proposed allowance.
 expect(()=>evaluateAppliedMigrationLedger(names,current)).toThrow(/project_total_allowance/)
 // The historical allowance extension is still incomplete; the separately observed PostHog ledger passes.
 expect(()=>evaluateAppliedMigrationLedger([...names,'project_total_allowance'],current)).toThrow(/posthog_approved_read/)
 expect(evaluateAppliedMigrationLedger(observedPosthog,current)).toMatchObject({enforcedCount:160,appliedLedgerCount:197,unknownLedgerNames:[],duplicateLedgerNames:[]})
 })
 it.each(targets)('rejects a ledger missing the enforced migration %s',name=>{
  expect(()=>evaluateAppliedMigrationLedger(names.filter(n=>n!==name),state())).toThrow(/not applied/)
 })
 it.each(targets)('rejects duplicate applied migration %s',name=>{
  expect(()=>evaluateAppliedMigrationLedger([...names,name],state())).toThrow(/duplicate/)
 })
 it('still rejects an unrelated unknown migration',()=>{
  expect(()=>evaluateAppliedMigrationLedger([...observedPosthog,'unreviewed_future_schema'],state())).toThrow(/unknown/)
 })
 it('preserves the historical192-name snapshot and reports its missing Harvey migrations',()=>{
  const prior=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-01-web-studio-campaign-observation.json'),'utf8')).migration_names
  expect(prior).toHaveLength(192)
  expect(()=>evaluateAppliedMigrationLedger(prior,state())).toThrow(/not applied/)
 })
})

it('matches the applied initial-send source and its exact timeout wrapper',()=>{
 const entry=latest.migration,bytes=readFileSync(resolve(dir,entry.file))
 expect(bytes.byteLength).toBe(entry.bytes)
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
 const stored=Buffer.concat([Buffer.from(entry.prefix,'utf8'),bytes])
 expect(stored.byteLength).toBe(entry.stored_bytes)
 expect(createHash('sha256').update(stored).digest('hex')).toBe(entry.stored_sha256)
})
it('keeps the194-name historical capture immutable and identifies only the newer enforced name',()=>{
 const prior=observation.migration_names as string[]
 expect(prior).toHaveLength(194)
 expect(names.filter(n=>!prior.includes(n))).toEqual(['sales_initial_sending'])
 expect(prior.filter(n=>!names.includes(n))).toEqual([])
 expect(()=>evaluateAppliedMigrationLedger(prior,state())).toThrow(/sales_initial_sending/)
})

it('classifies all three applied initial-send tables using the observed server-only grants',()=>{
 const registry=JSON.parse(readFileSync(resolve(root,'apps/web/tests/isolation/schema-security.json'),'utf8'))
 for(const name of ['sales_initial_send_policies','sales_initial_send_jobs','sales_initial_send_events']){
  expect(registry.tables[name]).toEqual({class:'SERVER_ONLY',rls:true,policies:0,anon_grants:false,authenticated_grants:false,service_role:true})
  expect(registry._meta.created_not_live.tables).not.toContain(name)
 }
})
