import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger,GRANDFATHERED_MIGRATION_NAMES,LEGACY_ONLY_PRODUCTION_LEDGER_NAMES} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(__dirname,'../../../..'),dir=resolve(root,'apps/web/supabase/migrations')
const name='human_story_exact_claim',filename='20261031204433_'+name+'.sql'
const observation=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-01-web-studio-exact-claim-observation.json'),'utf8'))
const state=()=>inspectCanonicalMigrationFiles(readdirSync(dir))
function sql(){const path=resolve(dir,filename);expect(existsSync(path),'registered canonical SQL must exist').toBe(true);return readFileSync(path,'utf8').replaceAll('\r\n','\n')}
describe('exact-claim source history, not migration execution',()=>{
 it('retains exactly the registered source filename and approved bytes',()=>{
  expect(readdirSync(dir).filter(f=>f.endsWith('_'+name+'.sql'))).toEqual([filename])
  expect(createHash('sha256').update(sql()).digest('hex')).toBe(observation.sqlSha256)
 })
 it('matches read-only function body digests without calling the functions',()=>{
  const source=sql()
  for(const [entry,tag] of [['claim_runs_selected','fn'],['claim_runs','shared'],['approve_and_claim_human_story','atomic']]){
   const pattern=new RegExp('as \\$'+tag+'\\$([\\s\\S]*?)\\$'+tag+'\\$;')
   const match=source.match(pattern);expect(match,entry).not.toBeNull()
   expect(createHash('md5').update(match![1]).digest('hex')).toBe(observation.bodyMd5[entry])
  }
 })
 it('preserves the historical191-name digest and enforces the newer campaign history',()=>{
  const names=observation.migration_names as string[]
  expect(names).toHaveLength(191);expect(new Set(names).size).toBe(191)
  expect(createHash('md5').update([...names].sort().join('\n')).digest('hex')).toBe(observation.orderedNameMd5)
  expect(()=>evaluateAppliedMigrationLedger(names,state())).toThrow(/social_campaign_preparation/)
  const current=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-01-web-studio-campaign-observation.json'),'utf8'))
  expect(evaluateAppliedMigrationLedger(current.migration_names,state())).toMatchObject({canonicalSqlCount:169,enforcedCount:155,appliedLedgerCount:192,unknownLedgerNames:[],duplicateLedgerNames:[]})
  expect(GRANDFATHERED_MIGRATION_NAMES).toHaveLength(14);expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).toHaveLength(30)
  expect(GRANDFATHERED_MIGRATION_NAMES).not.toContain(name);expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).not.toContain(name)
 })
 it('still refuses missing, duplicated and unrelated unknown migration names',()=>{
  const names=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-01-web-studio-campaign-observation.json'),'utf8')).migration_names as string[],current=state()
  expect(()=>evaluateAppliedMigrationLedger(names.filter(n=>n!==name),current)).toThrow(/human_story_exact_claim/)
  expect(()=>evaluateAppliedMigrationLedger([...names,name],current)).toThrow(/duplicate/)
  expect(()=>evaluateAppliedMigrationLedger([...names,'unreviewed_future_change'],current)).toThrow(/unknown/)
 })
 it('retains ordinary worker routing, exact lane permission and predecessor guards',()=>{
  const source=sql()
  expect(source).toContain("is distinct from 'b57f9daf82e944428a3f3f3deeefcfa1'")
  expect(source).toContain('select * from public.claim_runs_selected(p_limit,p_lease_seconds,null);')
  expect(source).toContain('revoke all on function public.claim_runs_selected(integer,integer,uuid) from public,anon,authenticated,service_role;')
  expect(source).toContain('grant execute on function public.claim_runs(integer,integer) to service_role;')
  expect(source).toContain('grant execute on function public.approve_and_claim_human_story(uuid,text,text) to authenticated;')
 })
})
