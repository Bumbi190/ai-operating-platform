
import {beforeAll,afterAll,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const admin=vi.hoisted(()=>({db:null as any}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>admin.db}))
import {initializeSchedulingDb} from './test-db'
import {scheduleFixture,setScheduleClock,appendScheduleFixtureItem} from './fixtures.test-utils'
import {proposeSchedule,approveSchedule,claimScheduleJob,recordScheduleStep,readScheduleReceipt,revokeSchedule} from './store'
import {runScheduleTick,runScheduledPublication} from './worker'
import {MetaManualProvider} from '../publication/provider'
import {testSql} from '../../website-build/test-db'
let db:ReturnType<typeof initializeSchedulingDb>
beforeAll(()=>{db=initializeSchedulingDb();admin.db=db})
afterAll(()=>{setScheduleClock(null);vi.unstubAllEnvs()})
type Fixture=Awaited<ReturnType<typeof scheduleFixture>>
function dependencies(f:Fixture,handler?:(url:string,init:RequestInit)=>Promise<Response>){
 const calls:{url:string;init:RequestInit}[]=[]
 const provider=new MetaManualProvider(async(url,init)=>{calls.push({url,init});return handler?handler(url,init):Response.json(init.method==='POST'?{id:'222',post_id:f.manifest.items[0].accountId+'_222'}:{permalink:'https://www.instagram.com/p/fixture/'})})
 return {calls,deps:{provider,resolveCredential:async(_project:string,channel:'facebook'|'instagram')=>({projectId:f.manifest.projectId,channel,bindingId:f.manifest.items[0].bindingId,accountId:f.manifest.items[0].accountId,token:'fixture-token',apiBase:'https://graph.facebook.com/v21.0'}),verifyImage:async()=>({bytes:new Uint8Array(),width:320,height:400}),now:()=>Date.parse(f.dueAt)}}
}
async function approved(options:Parameters<typeof scheduleFixture>[1]={}){
 const f=await scheduleFixture(db,options);const approvedBatch=await approveSchedule(db,f.principal,f.approval);setScheduleClock(f.dueAt);return {...f,approvedBatch}
}
it('records the canonical shared-role writer surface in the full SQL fixture',()=>{
 const rights=JSON.parse(testSql(`select jsonb_build_object(
  'publication_update',has_table_privilege('service_role','public.social_publications','UPDATE'),
  'job_update',has_table_privilege('service_role','public.social_schedule_jobs','UPDATE'),
  'proof_insert',has_table_privilege('service_role','public.social_publication_reconciliation_proofs','INSERT'),
  'manual_step',has_function_privilege('service_role','public.social_publication_step(jsonb,jsonb)','EXECUTE'),
  'scheduled_step',has_function_privilege('service_role','public.social_schedule_step(jsonb,jsonb)','EXECUTE'),
  'inspect',has_function_privilege('service_role','public.social_publication_reconciliation_inspect(jsonb,jsonb)','EXECUTE'),
  'complete',has_function_privilege('service_role','public.social_publication_reconciliation_complete(jsonb,jsonb)','EXECUTE'),
  'browser_complete',has_function_privilege('authenticated','public.social_publication_reconciliation_complete(jsonb,jsonb)','EXECUTE')
 );`))
 expect(rights).toEqual({
  publication_update:true,job_update:true,proof_insert:true,
  manual_step:true,scheduled_step:true,inspect:true,complete:true,
  browser_complete:false
 })
})
it('exercises the optional news-review grant branch in an owned SQL projection',()=>{
 // The older worker fixture omits the October news-review migration. These
 // objects activate the candidate's conditional grants, not its production SQL.
 const candidate=readFileSync(resolve(process.cwd(),
  'lib/calendar/direct-write-gate-scheduled-full-role-candidate.sql'),'utf8')
 const output=testSql(`begin;
  create table public.media_scripts(id uuid);
  create table public.media_news_items(id uuid);
  create table public.asset_provenance(id uuid);
  create table public.cost_events(id uuid);
  create table public.media_news_review_evidence(id uuid);
  -- The larger owned fixture already has platform_tokens. Never insert a real token.
  revoke all on public.platform_tokens from public,anon,authenticated;
  grant select on public.platform_tokens to service_role;
  create function public.media_news_canonical_json(jsonb) returns text
   language sql security invoker set search_path='' as $news$ select $1::text $news$;
  create function public.media_news_review_caption(public.media_scripts) returns text
   language sql security invoker set search_path='' as $news$ select ''::text $news$;
  create function public.media_news_snapshot_requirements(uuid,jsonb) returns text[]
   language sql security invoker set search_path='' as $news$ select array[]::text[] $news$;
  create function public.media_news_review_requirements(uuid) returns text[]
   language sql security invoker set search_path='' as $news$
   select array[
    (select count(*)::text from public.media_news_review_evidence),
    (select count(*)::text from public.media_scripts),
    (select count(*)::text from public.media_news_items),
    (select count(*)::text from public.asset_provenance),
    (select count(*)::text from public.cost_events)
   ] $news$;
  revoke all on public.media_news_review_evidence,public.media_scripts,
   public.media_news_items,public.asset_provenance,public.cost_events from public;
  revoke all on function public.media_news_canonical_json(jsonb),
   public.media_news_review_caption(public.media_scripts),
   public.media_news_snapshot_requirements(uuid,jsonb),
   public.media_news_review_requirements(uuid) from public;
  ${candidate}
  set local role social_schedule_full_publisher_fixture;
  do $probe$ begin
   perform access_token from public.platform_tokens;
   raise exception 'UNEXPECTED_TOKEN_READ';
   exception when insufficient_privilege then null;
  end $probe$;
  select jsonb_build_object(
   'token_select',has_table_privilege(current_user,'public.platform_tokens','SELECT'),
   'reads',public.media_news_review_requirements(null::uuid),
   'snapshot',public.media_news_snapshot_requirements(null::uuid,'{}'::jsonb),
   'canonical',public.media_news_canonical_json('{}'::jsonb),
   'caption',public.media_news_review_caption(null::public.media_scripts),
   'evidence_select',has_table_privilege(current_user,'public.media_news_review_evidence','SELECT')
  );
  rollback;`)
 expect(JSON.parse(output)).toEqual({
  reads:['0','0','0','0','0'],snapshot:[],canonical:'{}',caption:'',evidence_select:true,token_select:false
 })
 expect(testSql("select to_regclass('public.media_news_review_evidence') is null")).toBe('t')
 expect(testSql("select to_regrole('social_schedule_full_publisher_fixture') is null")).toBe('t')
},20000)
it('prepares an approved claim through the rollback-only scheduled role',async()=>{
 const f=await approved()
 const claim=(await claimScheduleJob(db,{workerId:'prepare_role_probe',now:f.dueAt,dryRun:false}))!
 const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 const prepare=`public.social_schedule_step(${literal({jobId:claim.jobId,claimId:claim.claimId,version:claim.version})},
  '{"action":"prepare"}'::jsonb)`
 const candidate=readFileSync(resolve(process.cwd(),
  'lib/calendar/direct-write-gate-scheduled-full-role-candidate.sql'),'utf8')
 const output=testSql(`begin; ${candidate}
  select has_table_privilege('service_role','public.social_publications','INSERT')::text||
   has_function_privilege('service_role','public.social_schedule_step(jsonb,jsonb)','EXECUTE')::text;
  set local role service_role;
  do $probe$ begin perform ${prepare};
   raise exception 'UNEXPECTED_SHARED_PREPARE';
   exception when insufficient_privilege then null; end $probe$;
  set local role social_schedule_full_publisher_fixture;
  select ${prepare};
  rollback;`).split('\n')
 expect(output[0]).toBe('falsefalse')
 const receipt=JSON.parse(output.at(-1)!)
 expect(receipt.jobState).toBe('claimed')
 expect(receipt.publication.state).toBe('requested')
 const restored=await readScheduleReceipt(db,claim)
 expect(restored.jobState).toBe('claimed')
 expect(restored.publication).toBeNull()
 expect(testSql("select to_regrole('social_schedule_full_publisher_fixture') is null")).toBe('t')
},20000)
it('rolls back a separated publisher role against the canonical scheduled step',async()=>{
 const f=await approved()
 const claimed=(await claimScheduleJob(db,{workerId:'role_probe',now:f.dueAt,dryRun:false}))!
 const prepared=await recordScheduleStep(db,claimed,{action:'prepare'})
 const publishing=await recordScheduleStep(db,prepared.claim,{
  action:'claim_create',expectedVersion:prepared.publication!.version,capabilityHash:'c'.repeat(64)
 })
 expect(publishing.publication!.state).toBe('publishing')
 const claim=publishing.claim,publication=publishing.publication!
 const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 const complete=`public.social_schedule_step(${literal({jobId:claim.jobId,claimId:claim.claimId,version:claim.version})},
  ${literal({action:'complete',expectedVersion:publication.version,providerId:f.manifest.items[0].accountId+'_999',
   permalink:'https://www.facebook.com/'+f.manifest.items[0].accountId+'_999'})})`
 const candidate=readFileSync(resolve(process.cwd(),
  'lib/calendar/direct-write-gate-scheduled-full-role-candidate.sql'),'utf8')
 const output=testSql(`begin; ${candidate}
  select has_table_privilege('service_role','public.social_publications','UPDATE')::text||
   has_table_privilege('service_role','public.social_schedule_jobs','UPDATE')::text||
   has_function_privilege('service_role','public.social_schedule_step(jsonb,jsonb)','EXECUTE')::text;
  set local role service_role;
  do $probe$ begin perform ${complete};
   raise exception 'UNEXPECTED_SHARED_STEP';
   exception when insufficient_privilege then null; end $probe$;
  set local role social_schedule_full_publisher_fixture;
  select ${complete};
  rollback;`).split('\n')
 expect(output[0]).toBe('falsefalsefalse')
 const receipt=JSON.parse(output.at(-1)!)
 expect(receipt.jobState).toBe('published')
 expect(receipt.publication.providerId).toBe(f.manifest.items[0].accountId+'_999')
 const restored=await readScheduleReceipt(db,claim)
 expect(restored.jobState).toBe('claimed')
 expect(restored.publication!.state).toBe('publishing')
 expect(restored.claim.version).toBe(claim.version)
 expect(testSql("select to_regrole('social_schedule_full_publisher_fixture') is null")).toBe('t')
},20000)
it('recovers an expired unknown write under the rollback-only scheduled role',async()=>{
 const f=await approved()
 const claimed=(await claimScheduleJob(db,{workerId:'recovery_role_probe',now:f.dueAt,dryRun:false}))!
 const prepared=await recordScheduleStep(db,claimed,{action:'prepare'})
 const publishing=await recordScheduleStep(db,prepared.claim,{
  action:'claim_create',expectedVersion:prepared.publication!.version,capabilityHash:'d'.repeat(64)
 })
 expect(publishing.publication!.state).toBe('publishing')
 const later=new Date(Date.parse(f.dueAt)+91000).toISOString()
 setScheduleClock(later)
 const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
 const recover=`public.social_schedule_claim(${literal({workerId:'recovery_fixture',now:later,dryRun:false,projectIds:[f.manifest.projectId]})})`
 const candidate=readFileSync(resolve(process.cwd(),
  'lib/calendar/direct-write-gate-scheduled-full-role-candidate.sql'),'utf8')
 const output=testSql(`begin; ${candidate}
  select has_function_privilege('service_role','public.social_schedule_claim(jsonb)','EXECUTE')::text||
   has_table_privilege('service_role','public.social_schedule_jobs','UPDATE')::text;
  set local role service_role;
  do $probe$ begin perform ${recover};
   raise exception 'UNEXPECTED_SHARED_RECOVERY';
   exception when insufficient_privilege then null; end $probe$;
  set local role social_schedule_full_publisher_fixture;
  select ${recover};
  select jsonb_build_object('jobState',j.state,'publicationState',p.state,'failureCode',p.failure_code)
   from public.social_schedule_jobs j join public.social_publications p on p.id=j.publication_id
   where j.id='${claimed.jobId}';
  rollback;`).split('\n')
 expect(output[0]).toBe('truefalse')
 const recovered=JSON.parse(output.at(-1)!)
 expect(recovered).toEqual({jobState:'uncertain',publicationState:'uncertain',failureCode:'receipt_unavailable'})
 const restored=await readScheduleReceipt(db,publishing.claim)
 expect(restored.jobState).toBe('claimed')
 expect(restored.publication!.state).toBe('publishing')
 expect(testSql("select to_regrole('social_schedule_full_publisher_fixture') is null")).toBe('t')
},20000)
it('one_post_for_two_workers',async()=>{
 const f=await approved(),d=dependencies(f)
 const results=await Promise.all(['a','b'].map(workerId=>runScheduleTick(db,{workerId,now:f.dueAt,dryRun:false},d.deps)))
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
 expect(results.some(r=>r.result==='published')).toBe(true)
},20000)
it('keeps scheduling RPCs on the scheduler client and verifies image through the media client',async()=>{
 const f=await approved(),d=dependencies(f)
 const mediaDb={rpc:()=>{throw Error('scheduler RPC used media client')}} as any
 let imageReads=0
 const separated={...d.deps,verifyImage:async(imageDb:any)=>{
  expect(imageDb).toBe(mediaDb)
  imageReads++
  return {bytes:new Uint8Array(),width:320,height:400}
 }}
 const result=await runScheduleTick(db,{workerId:'separate_media_client',now:f.dueAt,dryRun:false},separated,mediaDb)
 expect(result.result).toBe('published')
 expect(imageReads).toBe(1)
 expect(d.calls.filter(c=>c.init.method==='POST')).toHaveLength(1)
},20000)
it('rejects a credential resolved for a different project before any provider write',async()=>{
 const f=await approved(),d=dependencies(f)
 const otherProjectId=crypto.randomUUID()
 expect(otherProjectId).not.toBe(f.manifest.projectId)
 const result=await runScheduleTick(db,{workerId:'cross_project',now:f.dueAt,dryRun:false},{
  ...d.deps,
  resolveCredential:async(projectId,channel)=>({...await d.deps.resolveCredential(projectId,channel),projectId:otherProjectId})
 })
 expect(result.result).toBe('blocked')
 expect(d.calls).toHaveLength(0)
 expect(testSql("select state from social_schedule_jobs where project_id='"+f.manifest.projectId+"';")).toBe('blocked')
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
 const original=(db as any).rpc.bind(db)
 const observed={...db,rpc:async(name:string,args:any)=>{
  if(name==='social_schedule_step'&&args.p_step.action==='complete')completions.push(args)
  return original(name,args)
 }} as any
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
  expect(once).toBe(false)
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
