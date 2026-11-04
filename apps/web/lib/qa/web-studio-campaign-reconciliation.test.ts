import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger,GRANDFATHERED_MIGRATION_NAMES,LEGACY_ONLY_PRODUCTION_LEDGER_NAMES} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(__dirname,'../../../..'),dir=resolve(root,'apps/web/supabase/migrations')
const observedPosthog=JSON.parse(readFileSync(resolve(root,'docs/verification/web-studio/2026-11-04-posthog-ledger-observation.json'),'utf8')).migrationNames as string[]
const observation=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-01-web-studio-campaign-observation.json'),'utf8'))
const name='social_campaign_preparation',file='20261101062259_'+name+'.sql'
const state=()=>inspectCanonicalMigrationFiles(readdirSync(dir))
describe('Studio integration preserves campaign source and fail-closed history',()=>{
 it('contains exactly the reviewed upstream campaign SQL without rewriting its filename',()=>{
  expect(readdirSync(dir).filter(f=>f.endsWith('_'+name+'.sql'))).toEqual([file])
  const path=resolve(dir,file);expect(existsSync(path)).toBe(true)
  const source=readFileSync(path,'utf8').replaceAll('\r\n','\n')
  expect(createHash('sha256').update(source).digest('hex')).toBe(observation.sourceSqlSha256)
 })
 it('preserves the192-name observation and rejects the195-name ledger pending the total allowance',()=>{
  const names=observation.migration_names as string[]
  expect(names).toHaveLength(192);expect(new Set(names).size).toBe(192)
  expect(createHash('md5').update([...names].sort().join('\n')).digest('hex')).toBe(observation.orderedNameMd5)
  expect(()=>evaluateAppliedMigrationLedger(names,state())).toThrow(/handlarborsen_scb_live_preview_candidates|sales_editorial_only_drafts/)
  const current=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-04-web-studio-initial-send-observation.json'),'utf8'))
  // The immutable real195-name capture predates the proposed allowance.
 expect(()=>evaluateAppliedMigrationLedger(current.migration_names,state())).toThrow(/project_total_allowance/)
 // The historical allowance extension is still incomplete; the separately observed PostHog ledger passes.
 expect(()=>evaluateAppliedMigrationLedger([...current.migration_names,'project_total_allowance'],state())).toThrow(/posthog_approved_read/)
 expect(evaluateAppliedMigrationLedger(observedPosthog,state())).toMatchObject({enforcedCount:160,appliedLedgerCount:197,unknownLedgerNames:[],duplicateLedgerNames:[]})
 })
 it('does not grandfather the campaign or permit missing, duplicated or unknown names',()=>{
  const names=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-04-web-studio-initial-send-observation.json'),'utf8')).migration_names as string[],current=state()
  expect(GRANDFATHERED_MIGRATION_NAMES).toHaveLength(14);expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).toHaveLength(30)
  expect(GRANDFATHERED_MIGRATION_NAMES).not.toContain(name);expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).not.toContain(name)
  expect(()=>evaluateAppliedMigrationLedger(names.filter(n=>n!==name),current)).toThrow(/social_campaign_preparation/)
  expect(()=>evaluateAppliedMigrationLedger([...names,name],current)).toThrow(/duplicate/)
  expect(()=>evaluateAppliedMigrationLedger([...observedPosthog,'unapproved_future_schema'],current)).toThrow(/unknown/)
 })
 it('keeps the prior191-name snapshot immutable and correctly incomplete',()=>{
  const prior=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-01-web-studio-exact-claim-observation.json'),'utf8'))
  expect(prior.migration_names).toHaveLength(191);expect(prior.migration_names).not.toContain(name)
  expect(()=>evaluateAppliedMigrationLedger(prior.migration_names,state())).toThrow(/social_campaign_preparation/)
 })
})
