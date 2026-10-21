
import {beforeAll,afterAll,it,expect,vi} from 'vitest'
const admin=vi.hoisted(()=>({db:null as any}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>admin.db}))
import {initializeSchedulingDb} from './test-db'
import {scheduleFixture,setScheduleClock,appendScheduleFixtureItem} from './fixtures.test-utils'
import {proposeSchedule,approveSchedule,claimScheduleJob,readScheduleReceipt,revokeSchedule} from './store'
import {runScheduleTick,runScheduledPublication} from './worker'
import {MetaManualProvider} from '../publication/provider'
import {testSql} from '../../website-build/test-db'
let db:ReturnType<typeof initializeSchedulingDb>
beforeAll(()=>{db=initializeSchedulingDb();admin.db=db})
afterAll(()=>{setScheduleClock(null);vi.unstubAllEnvs()})
type Fixture=Awaited<ReturnType<typeof scheduleFixture>>
function dependencies(f:Fixture,handler?:(url:string,init:RequestInit)=>Promise<Response>){
 const calls:{url:string;init:RequestInit}[]=[]
 const provider=new MetaManualProvider(async(url,init)=>{calls.push({url,init});return handler?handler(url,init):Response.json(init.method==='POST'?{id:'222',post_id:'12345_222'}:{permalink:'https://www.instagram.com/p/fixture/'})})
 return {calls,deps:{provider,resolveCredential:async(_project:string,channel:'facebook'|'instagram')=>({channel,bindingId:f.manifest.items[0].bindingId,accountId:f.manifest.items[0].accountId,token:'fixture-token',apiBase:'https://graph.facebook.com/v21.0'}),verifyImage:async()=>({bytes:new Uint8Array(),width:320,height:400}),now:()=>Date.parse(f.dueAt)}}
}
async function approved(options:Parameters<typeof scheduleFixture>[1]={}){
 const f=await scheduleFixture(db,options);const approvedBatch=await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt);return {...f,approvedBatch}
}
it('one_post_for_two_workers',async()=>{
 const f=await approved(),d=dependencies(f)
 const results=await Promise.all(['a','b'].map(workerId=>runScheduleTick(db,{workerId,now:f.dueAt,dryRun:false},d.deps)))
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
 expect(results.some(r=>r.result==='published')).toBe(true)
},20000)
it('no_send_after_stop_during_image_read',async()=>{
 const f=await approved(),d=dependencies(f)
 d.deps.verifyImage=async()=>{testSql("update projects set execution_paused=true where id='"+f.manifest.projectId+"';");return {bytes:new Uint8Array(),width:320,height:400}}
 await runScheduleTick(db,{workerId:'a',now:f.dueAt,dryRun:false},d.deps)
 expect(d.calls).toHaveLength(0)
 expect(testSql("select state from social_schedule_jobs where project_id='"+f.manifest.projectId+"';")).toBe('blocked')
},20000)
it('unknown_write_never_reclaimed',async()=>{
 const f=await approved(),d=dependencies(f,async()=>{throw Error('lost reply')})
 await runScheduleTick(db,{workerId:'a',now:f.dueAt,dryRun:false},d.deps)
 await runScheduleTick(db,{workerId:'b',now:f.dueAt,dryRun:false},d.deps)
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
 expect(testSql("select state from social_schedule_jobs where project_id='"+f.manifest.projectId+"';")).toBe('uncertain')
},20000)
it('cross-page Facebook provider receipt never reaches completion or retries',async()=>{
 const f=await approved(),d=dependencies(f,async()=>Response.json({id:'99999_222'}))
 const completions:unknown[]=[]
 const original=db.rpc.bind(db)
 const observed={...db,rpc:async(name:string,args:any)=>{
  if(name==='social_schedule_step'&&args.p_step.action==='complete')completions.push(args)
  return original(name,args)
 }} as typeof db
 const first=await runScheduleTick(observed,{workerId:'malformed_a',now:f.dueAt,dryRun:false},d.deps)
 expect(first.result).toBe('uncertain')
 expect(completions).toHaveLength(0)
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
 expect(testSql("select state||'|'||coalesce(provider_id,'') from social_publications where project_id='"+f.manifest.projectId+"';")).toBe('uncertain|')
 await runScheduleTick(observed,{workerId:'malformed_b',now:f.dueAt,dryRun:false},d.deps)
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
},20000)
it('checkpoint_loss_is_uncertain_without_retry even after lease expiry',async()=>{
 for(const committed of [false,true]){
  const f=await approved(),d=dependencies(f),claim=(await claimScheduleJob(db,{workerId:'a',now:f.dueAt,dryRun:false}))!
  let once=true
  const faultDb={...db,rpc:async(name:string,args:any)=>{
   if(name==='social_schedule_step'&&args.p_step.action==='complete'&&once){
    once=false;if(committed)await (db as any).rpc(name,args)
    setScheduleClock(new Date(Date.parse(f.dueAt)+91000).toISOString())
    return {data:null,error:{message:'lost checkpoint acknowledgement',code:'XX000'}}
   }
   return (db as any).rpc(name,args)
  }} as any
  const result=await runScheduledPublication(faultDb,claim,d.deps)
  expect(result.publication!.state).toBe(committed?'published':'uncertain')
  expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
  const before=d.calls.length
  await runScheduleTick(db,{workerId:'b',now:new Date(Date.parse(f.dueAt)+91000).toISOString(),dryRun:false},{...d.deps,now:()=>Date.parse(f.dueAt)+91000})
  expect(d.calls).toHaveLength(before)
 }
},35000)
it('uses an inclusive ten-minute write window and never backfills',async()=>{
 for(const offset of [-1,600000,600001]){
  const f=await scheduleFixture(db);await approveSchedule(db,f.principal,f.approval)
  const now=new Date(Date.parse(f.dueAt)+offset).toISOString();setScheduleClock(now);const d=dependencies(f)
  await runScheduleTick(db,{workerId:'a',now,dryRun:false},{...d.deps,now:()=>Date.parse(now)})
  expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(offset===600000?1:0)
 }
},35000)
it('dry run changes no row or event and creates no media capability',async()=>{
 const f=await approved(),d=dependencies(f)
 const before=testSql("select jsonb_build_object('jobs',(select jsonb_agg(row_to_json(j)) from social_schedule_jobs j where project_id='"+f.manifest.projectId+"'),'events',(select count(*) from social_schedule_events),'publications',(select count(*) from social_publications));")
 const result=await runScheduleTick(db,{workerId:'a',now:f.dueAt,dryRun:true},d.deps)
 expect(result.mode).toBe('dry_run');expect(d.calls).toHaveLength(0)
 expect(testSql("select jsonb_build_object('jobs',(select jsonb_agg(row_to_json(j)) from social_schedule_jobs j where project_id='"+f.manifest.projectId+"'),'events',(select count(*) from social_schedule_events),'publications',(select count(*) from social_publications));")).toBe(before)
},20000)

it('no_publish_after_revoked_instagram_container',async()=>{
 const f=await approved({channel:'instagram'});let revoked=false
 const d=dependencies(f,async(url,init)=>{
  if(init.method==='POST')return Response.json({id:url.endsWith('/media')?'111':'222'})
  if(url.includes('status_code')){if(!revoked){revoked=true;await revokeSchedule(db,f.principal,{projectId:f.manifest.projectId,batchId:f.approvedBatch.batchId,expectedVersion:f.approvedBatch.version})}return Response.json({status_code:'FINISHED'})}
  return Response.json({permalink:'https://www.instagram.com/p/fixture/'})
 })
 await runScheduleTick(db,{workerId:'a',now:f.dueAt,dryRun:false},d.deps)
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
 expect(d.calls.some(c=>c.url.endsWith('/media_publish'))).toBe(false)
},20000)
it('Instagram final publish is refused if image verification crosses the ten-minute deadline',async()=>{
 const f=await approved({channel:'instagram'}),d=dependencies(f,async(url,init)=>Response.json(init.method==='POST'?{id:url.endsWith('/media')?'111':'222'}:url.includes('status_code')?{status_code:'FINISHED'}:{permalink:'https://www.instagram.com/p/fixture/'}))
 let images=0
 d.deps.verifyImage=async()=>{if(++images===2)setScheduleClock(new Date(Date.parse(f.dueAt)+600001).toISOString());return {bytes:new Uint8Array(),width:320,height:400}}
 await runScheduleTick(db,{workerId:'a',now:f.dueAt,dryRun:false},d.deps)
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
 expect(testSql("select state from social_schedule_jobs where project_id='"+f.manifest.projectId+"';")).toBe('missed')
},20000)

it('processing Instagram containers yield to other jobs and remain eligible on later ticks',async()=>{
 const f=await scheduleFixture(db,{channel:'instagram'})
 const second=await appendScheduleFixtureItem(db,f)
 const b=await proposeSchedule(db,f.principal,{projectId:f.manifest.projectId,manifest:{projectId:f.manifest.projectId,items:[second]},expectedRevisionId:null,idempotencyKey:crypto.randomUUID()})
 await approveSchedule(db,f.principal,f.approval)
 await approveSchedule(db,f.principal,{...f.approval,batchId:b.batchId,revisionId:b.revisionId,sha256:b.sha256,idempotencyKey:crypto.randomUUID()})
 let created=0
 const d=dependencies(f,async(url,init)=>Response.json(init.method==='POST'?{id:String(++created)}:url.includes('status_code')?{status_code:'IN_PROGRESS'}:{permalink:'https://www.instagram.com/p/fixture/'}))
 for(let minute=0;minute<4;minute++){
  const now=new Date(Date.parse(f.dueAt)+minute*60000).toISOString();setScheduleClock(now)
  const result=await runScheduleTick(db,{workerId:'fair_'+minute,now,dryRun:false},{...d.deps,now:()=>Date.parse(now)})
  expect(result.result).toBe('waiting')
 }
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(2)
 expect(d.calls.filter(c=>c.url.includes('/1?')&&c.url.includes('status_code')).length).toBeGreaterThan(1)
 expect(d.calls.filter(c=>c.url.includes('/2?')&&c.url.includes('status_code')).length).toBeGreaterThan(1)
},35000)
