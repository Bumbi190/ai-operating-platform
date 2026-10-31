import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync,spawn} from 'node:child_process'
import {readFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
const root=fileURLToPath(new URL('../../',import.meta.url))
const migration='20261031150000_social_owner_crosschat_context.sql'
const path=name=>root+'apps/web/supabase/migrations/'+name
const container='omnira-nova-campaign-'+randomUUID().slice(0,8)
let started=false
const command=(args,input)=>spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024})
const quote=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
function sql(source,role='service_role'){
 const result=command(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],(role?'set role '+role+';\n':'')+source)
 if(result.status!==0)throw Error(result.stderr||result.error?.message||'psql failed')
 return result.stdout.trim()
}
const rpc=(name,p,input)=>JSON.parse(sql('select public.'+name+'('+quote(p)+','+quote(input)+');'))
const scalar=source=>sql(source,'')
before(()=>{
 const cached=command(['image','inspect','postgres:17-alpine','--format','{{.Id}}'])
 assert.equal(cached.status,0,'Use already cached PG17; never pull implicitly')
 const run=command(['run','--detach','--rm','--network','none','--memory','256m','--cpus','0.5','--tmpfs','/var/lib/postgresql/data:rw,size=192m','--label','com.omnira.testplan=nova-social-campaign-20261031','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
 assert.equal(run.status,0,run.stderr);started=true
 let ready=false
 for(let i=0;i<50;i++){
  if(command(['exec',container,'pg_isready','-U','postgres']).status===0){ready=true;break}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200)
 }
 assert.ok(ready,'Disposable PostgreSQL startup')
 scalar([
 'create role anon;create role authenticated;create role service_role bypassrls;',
 'create schema auth;create table auth.users(id uuid primary key);',
 'create table public.projects(id uuid primary key,owner_id uuid references auth.users,name text,slug text,execution_paused boolean default false);',
 'create table public.conversations(id uuid primary key,user_id uuid references auth.users,project_id uuid references projects);',
 'create table public.project_lifecycle(project_id uuid,state text);',
 'create table public.platform_config(automation_paused boolean);',
 'create table public.assets(id uuid primary key,project_id uuid,kind text,checksum_sha256 text,mime_type text,width int,height int,status text,created_at timestamptz default now());',
 'create table public.social_account_bindings(binding_id uuid primary key,project_id uuid,platform text,superseded_at timestamptz,blocked_at timestamptz,external_account_id text,account_label text);',
 'grant usage on schema public,auth to service_role;',
 'grant update on public.projects,public.conversations to service_role;',
 'grant select on public.projects,public.conversations,public.project_lifecycle,public.platform_config,public.assets,public.social_account_bindings to service_role;',
 ].join('\n'))
 for(const file of ['20261016052226_social_launch_plans_v1.sql','20261016100941_social_content_preparation_v1.sql','20261016113247_social_project_profiles_v1.sql'])scalar(readFileSync(path(file),'utf8'))
 if(existsSync(path(migration)))scalar(readFileSync(path(migration),'utf8'))
 scalar("create table public.runs(id uuid primary key default gen_random_uuid(),project_id uuid references projects not null,workflow_id uuid,status text not null default 'pending',kind text,input jsonb default '{}',context jsonb default '{}',max_attempts int default 3,claim_id uuid,lease_until timestamptz,cancel_requested boolean default false,reconciliation_required boolean default false,reconciliation_reason text,finished_at timestamptz,claimed_at timestamptz); grant select,insert,update on runs to service_role;")
 const proposed=root+'docs/architecture/proposed-sql/social_campaign_preparation_NOT_APPLIED.sql'
 if(existsSync(proposed))scalar(readFileSync(proposed,'utf8'))
})
after(()=>{
 if(!started)return
 const label=command(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',container])
 assert.equal(label.stdout.trim(),'nova-social-campaign-20261031')
 assert.equal(command(['rm','--force',container]).status,0)
 assert.notEqual(command(['inspect',container]).status,0,'Test container must be absent')
})
function fixture(){
 const userId=randomUUID(),otherUser=randomUUID(),target=randomUUID(),sibling=randomUUID(),foreign=randomUUID()
 const global=randomUUID(),same=randomUUID(),cross=randomUUID(),theirs=randomUUID()
 scalar("insert into auth.users values('"+userId+"'),('"+otherUser+"');"+
 "insert into projects(id,owner_id,name,slug) values('"+target+"','"+userId+"','Target','target-"+target+"'),('"+sibling+"','"+userId+"','Sibling','sibling-"+sibling+"'),('"+foreign+"','"+otherUser+"','Private','private-"+foreign+"');"+
 "insert into conversations values('"+global+"','"+userId+"',null),('"+same+"','"+userId+"','"+target+"'),('"+cross+"','"+userId+"','"+sibling+"'),('"+theirs+"','"+otherUser+"','"+foreign+"');")
 return {p:{userId,allowedProjectIds:[target,sibling]},target,sibling,foreign,global,same,cross,theirs}
}
function plan(f,conversationId=f.global){
 return rpc('social_launch_plan_save',f.p,{projectId:f.target,conversationId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices:[{channel:'linkedin',purpose:'Prepare dealer content for review',format:'image',cadence:'weekly'}]})
}
function approvePlan(f,view){
 return rpc('social_launch_plan_decide',f.p,{projectId:f.target,revisionId:view.currentRevision.id,sha256:view.currentRevision.sha256,decision:'approve',idempotencyKey:randomUUID()})
}
function draft(f,view,index=0,conversationId=f.global){
 const asset=randomUUID()
 scalar("insert into assets values('"+asset+"','"+f.target+"','image','"+'a'.repeat(64)+"','image/jpeg',1080,1080,'active',now());")
 return {projectId:f.target,conversationId,postId:randomUUID(),planRevisionId:view.currentRevision.id,expectedRevisionId:null,idempotencyKey:randomUUID(),
 draft:{channel:'linkedin',format:'image',title:'Dealer post '+index,text:'A distinct dealer message for review '+index,linkUrl:null,mediaIds:[asset],mediaBrief:'Existing owned synthetic image; no generation claimed',scheduledAt:new Date(Date.now()+(7+index*2)*86400000).toISOString()}}
}
function ready(source='global'){
 const f=fixture(),v=approvePlan(f,plan(f,f[source]))
 const profile=rpc('social_profile_save',f.p,{projectId:f.target,conversationId:f[source],expectedRevisionId:null,idempotencyKey:randomUUID(),profile:{description:'A dealer marketplace',audience:'Professional dealers',tone:'Clear',websiteUrl:null,callToAction:'Review pilot',factualBoundaries:'No invented facts',preferredMediaIds:[]}})
 const dates=[7,9,10].map(offset=>new Date(Math.floor((Date.now()+offset*86400000)/60000)*60000).toISOString())
 const input={projectId:f.target,campaignId:randomUUID(),planRevisionId:v.currentRevision.id,profileRevisionId:profile.revision.id,idempotencyKey:randomUUID(),items:dates.map((t,i)=>({title:'Dealer draft '+i,text:'Review only dealer information number '+i,imagePrompt:'A dealership without text',localMinute:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t)).replace(' ','T'),scheduledAt:t}))}
 return {...f,input,source:f[source]}
}
function enqueue(f){return JSON.parse(sql('select public.social_campaign_enqueue('+quote(f.p)+','+quote({...f.input,conversationId:f.source})+',1.0000);'))}
function writer(f,item){
 const claimId=randomUUID()
 scalar("update runs set status='running',claim_id='"+claimId+"',lease_until=now()+interval '5 minutes' where id='"+item.runId+"';")
 return {projectId:f.target,campaignId:f.input.campaignId,itemId:item.id,runId:item.runId,claimId}
}
function writeRpc(name,w,extra={}){return JSON.parse(sql('select public.'+name+'('+quote(w)+','+quote(extra)+');'))}

test('atomic enqueue creates three actual pending native runs and preserves global provenance',()=>{
 const f=ready(),view=enqueue(f)
 assert.equal(view.items.length,3);assert.equal(view.status,'queued');assert.equal(view.publicationAuthority,false)
 assert.equal(scalar("select count(*) from runs where project_id='"+f.target+"' and kind='social.campaign.image.v1' and status='pending';"),'3')
 assert.equal(view.conversationId,f.global)
 assert.equal(scalar("select project_id is null from conversations where id='"+f.global+"';"),'t')
 assert.equal(scalar("select count(*) from social_content_posts where project_id='"+f.target+"';"),'0')
})
test('identical request replays without new jobs; changed content conflicts',()=>{
 const f=ready(),first=enqueue(f);assert.deepEqual(enqueue(f),first)
 f.input.items[0].text='Changed';assert.throws(()=>enqueue(f),/CAMPAIGN_CONFLICT/)
 assert.equal(scalar("select count(*) from runs where project_id='"+f.target+"';"),'3')
})
test('cross-project owned source remains attached to the original project',()=>{
 const f=ready('cross'),v=enqueue(f);assert.equal(v.conversationId,f.cross)
 assert.equal(scalar("select project_id from conversations where id='"+f.cross+"';"),f.sibling)
})
test('foreign or nonexistent source and forged allow-list cannot enqueue',()=>{
 for(const mode of ['foreignTarget','foreignSource','missingSource','emptyScope']){
  const f=ready()
  if(mode==='foreignTarget'){f.input.projectId=f.foreign;f.p.allowedProjectIds=[f.foreign]}
  if(mode==='foreignSource')f.source=f.theirs
  if(mode==='missingSource')f.source=randomUUID()
  if(mode==='emptyScope')f.p.allowedProjectIds=[]
  assert.throws(()=>enqueue(f),/NOT_FOUND/)
 }
})
test('package cap and max-three bound refuse atomically before run creation',()=>{
 const f=ready()
 assert.throws(()=>JSON.parse(sql('select public.social_campaign_enqueue('+quote(f.p)+','+quote({...f.input,conversationId:f.source})+',2);')),/COST_LIMIT/)
 f.input.items.push({...f.input.items[0]});assert.throws(()=>enqueue(f),/INVALID_BODY/)
 assert.equal(scalar("select count(*) from runs where project_id='"+f.target+"';"),'0')
})
test('generation latch permits one dispatch and recovered/reentrant claims cannot regenerate',()=>{
 const f=ready(),v=enqueue(f),w=writer(f,v.items[0])
 const first=writeRpc('social_campaign_claim_item',w);assert.equal(first.shouldGenerate,true)
 const second=writeRpc('social_campaign_claim_item',w);assert.equal(second.shouldGenerate,false);assert.equal(second.item.state,'uncertain')
})
test('stale or expired claims never admit a physical image',()=>{
 const f=ready(),v=enqueue(f),w=writer(f,v.items[0])
 assert.throws(()=>writeRpc('social_campaign_claim_item',{...w,claimId:randomUUID()}),/FENCED/)
 scalar("update runs set lease_until=now()-interval '1 second' where id='"+w.runId+"';")
 assert.throws(()=>writeRpc('social_campaign_claim_item',w),/FENCED/)
})
test('admitted image checkpoint resumes proposal save without another generation',()=>{
 const f=ready(),v=enqueue(f),w=writer(f,v.items[0]);writeRpc('social_campaign_claim_item',w)
 const asset=randomUUID();scalar("insert into assets values('"+asset+"','"+f.target+"','image','"+'a'.repeat(64)+"','image/jpeg',1080,1080,'active',now());")
 writeRpc('social_campaign_record_asset',w,{assetId:asset})
 const resumed=writeRpc('social_campaign_claim_item',w);assert.equal(resumed.shouldGenerate,false);assert.equal(resumed.item.state,'asset_admitted')
 const saved=writeRpc('social_campaign_commit_item',w);assert.equal(saved.item.state,'review_ready');assert.ok(saved.item.revisionId)
 assert.equal(writeRpc('social_campaign_commit_item',w).item.revisionId,saved.item.revisionId)
 assert.equal(scalar("select count(*) from social_content_revisions where project_id='"+f.target+"' and conversation_id='"+f.global+"';"),'1')
 assert.equal(scalar("select count(*) from social_content_decisions where project_id='"+f.target+"';"),'0')
})
test('cancellation preserves generated evidence and refuses content commit',()=>{
 const f=ready(),v=enqueue(f),w=writer(f,v.items[0]);writeRpc('social_campaign_claim_item',w)
 const asset=randomUUID();scalar("insert into assets values('"+asset+"','"+f.target+"','image','"+'b'.repeat(64)+"','image/png',1080,1080,'active',now());")
 rpc('social_campaign_cancel',f.p,{projectId:f.target,campaignId:f.input.campaignId})
 writeRpc('social_campaign_record_asset',w,{assetId:asset})
 assert.throws(()=>writeRpc('social_campaign_commit_item',w),/CANCELLED/)
 assert.equal(scalar("select count(*) from social_content_revisions where project_id='"+f.target+"';"),'0')
})
test('owner transfer and stale profile revoke queued image admission',()=>{
 for(const mode of ['owner','profile','stop']){
  const f=ready(),v=enqueue(f),w=writer(f,v.items[0])
  if(mode==='owner')scalar("update projects set owner_id=(select owner_id from projects where id='"+f.foreign+"') where id='"+f.target+"';")
  if(mode==='profile')rpc('social_profile_save',f.p,{projectId:f.target,conversationId:f.source,expectedRevisionId:f.input.profileRevisionId,idempotencyKey:randomUUID(),profile:{description:'Changed facts',audience:'Dealers',tone:'Clear',websiteUrl:null,callToAction:'Read',factualBoundaries:'No claims',preferredMediaIds:[]}})
  if(mode==='stop')scalar("update projects set execution_paused=true where id='"+f.target+"';")
  assert.throws(()=>writeRpc('social_campaign_claim_item',w),/NOT_FOUND|REVIEW_REQUIRED|STOPPED/)
 }
})
test('all campaign RPCs and tables stay service-only with RLS',()=>{
 for(const role of ['anon','authenticated']){
  assert.equal(scalar("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'social_campaign_%' and has_function_privilege('"+role+"',oid,'execute');"),'0')
  assert.equal(scalar("select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('social_campaigns','social_campaign_items') and has_table_privilege('"+role+"',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');"),'0')
 }
 assert.equal(scalar("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'social_campaign_%' and prosecdef;"),'0')
 assert.equal(scalar("select count(*) from pg_class where relnamespace='public'::regnamespace and relname in ('social_campaigns','social_campaign_items') and relrowsecurity and relforcerowsecurity;"),'2')
})

function asyncSql(source){
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],{stdio:['pipe','pipe','pipe']})
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b)
  child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error(err)))
  child.stdin.end('set role service_role;\n'+source)
 })
}
test('independent PostgreSQL sessions serialize identical enqueue and exactly one generation admission',async()=>{
 const f=ready(),query='select public.social_campaign_enqueue('+quote(f.p)+','+quote({...f.input,conversationId:f.source})+',1);'
 const [a,b]=await Promise.all([asyncSql(query),asyncSql(query)])
 assert.deepEqual(JSON.parse(a),JSON.parse(b));assert.equal(scalar("select count(*) from runs where project_id='"+f.target+"';"),'3')
 const w=writer(f,JSON.parse(a).items[0]),claim='select public.social_campaign_claim_item('+quote(w)+",'{}');"
 const results=await Promise.all([asyncSql(claim),asyncSql(claim)])
 assert.equal(results.map(x=>JSON.parse(x)).filter(x=>x.shouldGenerate).length,1)
})
test('SQL refuses forged nested fields, local time mismatch and duplicate slots before any run',()=>{
 for(const mode of ['field','time','duplicate','past']){
  const f=ready()
  if(mode==='field')f.input.items[0].approval=true
  if(mode==='time')f.input.items[0].localMinute='2026-12-01T10:00'
  if(mode==='duplicate')f.input.items[1]={...f.input.items[0]}
  if(mode==='past')f.input.items[0].scheduledAt='2000-01-01T00:00:00.000Z'
  assert.throws(()=>enqueue(f),/INVALID_BODY/)
  assert.equal(scalar("select count(*) from runs where project_id='"+f.target+"';"),'0')
 }
})
test('plan change or cancellation between image admission and commit cannot save a draft',()=>{
 const f=ready(),v=enqueue(f),w=writer(f,v.items[0]);writeRpc('social_campaign_claim_item',w)
 const asset=randomUUID();scalar("insert into assets values('"+asset+"','"+f.target+"','image','"+'b'.repeat(64)+"','image/png',1080,1080,'active',now());")
 writeRpc('social_campaign_record_asset',w,{assetId:asset})
 rpc('social_launch_plan_save',f.p,{projectId:f.target,conversationId:f.source,expectedRevisionId:f.input.planRevisionId,idempotencyKey:randomUUID(),choices:[{channel:'linkedin',purpose:'Changed plan',format:'text',cadence:'manual'}]})
 assert.throws(()=>writeRpc('social_campaign_commit_item',w),/REVIEW_REQUIRED/)
 assert.equal(scalar("select count(*) from social_content_revisions where project_id='"+f.target+"';"),'0')
})
