import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {
 acquirePaidAttemptOnce,isPaidAttemptRequest,saveEditorialWithFrozenAuthority,
 validatePaidAttemptReceipt,
 type PaidAttemptRequest,
} from './paid-attempt'
import {weeklyPaidAttemptDbPort} from './paid-attempt-db'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'
import type {WeeklySave} from './service'

const ids={
 owner:'77777777-7777-4777-8777-777777777777',
 conversation:'55555555-5555-4555-8555-555555555555',
 run:'66666666-6666-4666-8666-666666666666',
 claim:'88888888-8888-4888-8888-888888888888',
 attempt:'99999999-9999-4999-8999-999999999999',
}
const request=():PaidAttemptRequest=>({
 projectId:FAMILY,ownerId:ids.owner,weekStart:'2027-01-04',
 runId:ids.run,claimId:ids.claim,conversationId:ids.conversation,eventId:1,
})
const receipt=()=>({...request(),status:'admitted' as const,
 attemptId:ids.attempt,publicationAuthority:false as const})
const save=():WeeklySave=>({
 projectId:FAMILY,conversationId:ids.conversation,weekStart:'2027-01-04',
 generation:1,contextHash:'a'.repeat(64),
 idempotencyKey:'weekly_20270104_'+'a'.repeat(24),
 drafts:['facebook','instagram'].map(channel=>({
  slotKey:'2027-01-05T17:00:ordinary',
  channel:channel as 'facebook'|'instagram',
  assetId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title:'Nova och Pling',text:'Sagor och pyssel',
  sourceReferences:['profile:'+'b'.repeat(64)],
 })),
})
function fakeDB(){
 const operations:Array<{name:string;args:Record<string,unknown>}>=[]
 const client={
  async rpc(name:string,args:Record<string,unknown>){
   operations.push({name,args})
   if(name==='family_weekly_admit_once')return {data:receipt(),error:null}
   if(name==='family_weekly_save_editorial_if_current'){
    return {data:{preparationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
     status:'editorial_review_required',publicationAuthority:false,posts:[{},{}]},
     error:null}
   }
   return {data:null,error:'UNKNOWN_WRITE'}
  },
 }
 return {operations,port:weeklyPaidAttemptDbPort(client as never)}
}
describe('One permitted paid attempt per Family week, no automatic retries',()=>{
 it('validates the exact real DB admission for project, run, claim, user, week and consent event',()=>{
  expect(isPaidAttemptRequest(request())).toBe(true)
  expect(validatePaidAttemptReceipt(receipt(),request())).toEqual(receipt())
  for(const wrong of [
   {...receipt(),attemptId:'fake'},
   {...receipt(),status:'finished'},
   {...receipt(),projectId:'11111111-1111-4111-8111-111111111111'},
   {...receipt(),ownerId:'11111111-1111-4111-8111-111111111111'},
   {...receipt(),eventId:2},
   {...receipt(),runId:'11111111-1111-4111-8111-111111111111'},
   {...receipt(),claimId:'11111111-1111-4111-8111-111111111111'},
   {...receipt(),publicationAuthority:true},
   {...receipt(),sendAllowed:true},
  ])expect(validatePaidAttemptReceipt(wrong,request())).toBeNull()
 })
 it('rejects invalid requests before touching paid or persistence boundaries',async()=>{
  const f=fakeDB()
  for(const bad of [
   {...request(),projectId:'11111111-1111-4111-8111-111111111111'},
   {...request(),ownerId:'fake'},
   {...request(),weekStart:'2027-01-05'},
   {...request(),eventId:0},
  ]){
   expect(await acquirePaidAttemptOnce(f.port,bad)).toBeNull()
  }
  expect(f.operations).toEqual([])
 })
 it('the adapter calls ONLY the two restricted service-role SQL endpoints',async()=>{
  const f=fakeDB()
  const admitted=await acquirePaidAttemptOnce(f.port,request())
  expect(admitted).toEqual(receipt())
  const result=await saveEditorialWithFrozenAuthority(f.port,admitted!,save())
  expect(result).toMatchObject({status:'editorial_review_required',publicationAuthority:false})
  expect(f.operations.map(x=>x.name)).toEqual([
   'family_weekly_admit_once','family_weekly_save_editorial_if_current',
  ])
  expect(f.operations[0].args).toMatchObject({
   p_owner_id:ids.owner,p_week_start:'2027-01-04',
   p_run_id:ids.run,p_claim_id:ids.claim,
   p_consent_event_id:1,p_conversation_id:ids.conversation,
  })
  const payload=f.operations[1].args.p_input as WeeklySave&{
   drafts:Array<WeeklySave['drafts'][number]&{scheduledAt:string}>
  }
  expect(payload).toMatchObject({projectId:FAMILY,weekStart:'2027-01-04',
   contextHash:'a'.repeat(64),generation:1})
  expect(payload.drafts).toEqual(save().drafts.map(d=>({
   ...d,scheduledAt:'2027-01-05T16:00:00.000Z',
  })))
 })
 it('rejects a model-supplied or malformed date and never sends it to native SQL',async()=>{
  const f=fakeDB()
  const bad={...save(),drafts:save().drafts.map(d=>({
   ...d,slotKey:'2027-01-05T23:59:ordinary',
   scheduledAt:'2027-01-05T21:00:00Z',
  }))} as never
  await expect(saveEditorialWithFrozenAuthority(f.port,receipt(),bad)).rejects.toThrow('WEEKLY_NATIVE_TIME_INVALID')
  expect(f.operations).toEqual([])
 })
 it('native weekly SQL contract explicitly requires scheduledAt on EACH draft',()=>{
  const native=readFileSync(resolve(__dirname,
   '../../../supabase/migrations/20261026090516_family_weekly_preparation.sql'),'utf8')
  expect(native).toContain("array['slotKey','channel','assetId','text','title','sourceReferences','scheduledAt']")
  expect(native).toContain("public.social_schedule_resolve_minute(local_minute)")
  expect(native).toContain("'editorial_review_required'")
 })
 it('cannot save with an alien week, project or conversation even after valid admission',async()=>{
  const f=fakeDB(),r=receipt()
  for(const changed of [
   {...save(),weekStart:'2027-01-11'},
   {...save(),projectId:'11111111-1111-4111-8111-111111111111'},
   {...save(),conversationId:'11111111-1111-4111-8111-111111111111'},
   {...save(),generation:2},
  ])await expect(saveEditorialWithFrozenAuthority(f.port,r,changed)).rejects.toThrow('PAID_ATTEMPT_SCOPE_MISMATCH')
  expect(f.operations).toEqual([])
 })
 it('does not infer a paid attempt after an RPC error or ambiguous reply',async()=>{
  const port={
   admitOnce:vi.fn(async()=>{throw Error('unknown network outcome')}),
   saveEditorialAtomically:vi.fn(async()=>({})),
  }
  expect(await acquirePaidAttemptOnce(port,request())).toBeNull()
  expect(port.saveEditorialAtomically).not.toHaveBeenCalled()
 })
 it('proposed SQL is review-only, locks revoke and save, and has once-per-week ledger',()=>{
  const attempt=readFileSync(resolve(__dirname,
   '../../../../../docs/sql/20261028_family_weekly_once_only_model_attempt_proposed.sql'),'utf8')
  const consent=readFileSync(resolve(__dirname,
   '../../../../../docs/sql/20261028_family_weekly_auto_consent_proposed.sql'),'utf8')
  expect(attempt).toContain('constraint family_weekly_model_attempt_one_per_week unique(project_id,week_start)')
  expect(attempt).toContain("admission_state='may_have_incurred_cost'")
  expect(attempt).toContain('on conflict do nothing returning id into v_id')
  expect(attempt).toContain("r.status='running'")
  expect(attempt).toContain('r.claim_id=p_claim_id')
  expect(attempt).toContain('r.max_attempts=1')
  expect(attempt).toContain("r.kind='family_weekly_editorial_drafts'")
  expect(attempt).toContain('e.event_id=(')
  expect(attempt).toContain('public.social_weekly_save(')
  expect(attempt).toContain('family_weekly_authority_current(')
  expect(attempt).toContain('grant execute on function public.family_weekly_admit_once')
  expect(attempt).toContain('grant execute on function public.family_weekly_save_editorial_if_current')
  expect(attempt).toContain("extract(hour from v_local)<>15")
  expect(attempt).not.toMatch(/(cron\.schedule|grant\s+execute.*to\s+(anon|authenticated))/i)
  const mutex="pg_catalog.hashtextextended('family-weekly:'||"
  expect(consent).toContain(mutex)
  expect(attempt.match(/pg_catalog\.hashtextextended\('family-weekly:'\|\|/g)).toHaveLength(2)
 })
})
