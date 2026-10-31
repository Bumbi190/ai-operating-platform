import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
const root=fileURLToPath(new URL('../../',import.meta.url))
const migration='20261031150000_social_owner_crosschat_context.sql'
const path=name=>root+'apps/web/supabase/migrations/'+name
const container='omnira-nova-crosschat-'+randomUUID().slice(0,8)
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
 const run=command(['run','--detach','--rm','--network','none','--memory','256m','--cpus','0.5','--tmpfs','/var/lib/postgresql/data:rw,size=192m','--label','com.omnira.testplan=nova-crosschat-social-20261031','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
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
 'grant update on public.projects to service_role;',
 'grant select on public.projects,public.conversations,public.project_lifecycle,public.platform_config,public.assets,public.social_account_bindings to service_role;',
 ].join('\n'))
 for(const file of ['20261016052226_social_launch_plans_v1.sql','20261016100941_social_content_preparation_v1.sql','20261016113247_social_project_profiles_v1.sql'])scalar(readFileSync(path(file),'utf8'))
 if(existsSync(path(migration)))scalar(readFileSync(path(migration),'utf8'))
})
after(()=>{
 if(!started)return
 const label=command(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',container])
 assert.equal(label.stdout.trim(),'nova-crosschat-social-20261031')
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
test('existing same-project conversation remains supported',()=>{
 const f=fixture(),view=plan(f,f.same);assert.equal(view.project.id,f.target);assert.equal(view.decision,null)
})
test('global source saves channel plan and retains source audit without retagging',()=>{
 const f=fixture(),view=plan(f)
 assert.equal(view.project.id,f.target);assert.equal(view.decision,null)
 assert.equal(scalar("select conversation_id from social_launch_plan_revisions where id='"+view.currentRevision.id+"';"),f.global)
 assert.equal(scalar("select project_id is null from conversations where id='"+f.global+"';"),'t')
})
test('another owned project conversation can save target profile without moving the chat',()=>{
 const f=fixture()
 const view=rpc('social_profile_save',f.p,{projectId:f.target,conversationId:f.cross,expectedRevisionId:null,idempotencyKey:randomUUID(),
 profile:{description:'A dealer marketplace',audience:'Professional dealers',tone:'Clear',websiteUrl:null,callToAction:'Apply for pilot',factualBoundaries:'Do not invent metrics',preferredMediaIds:[]}})
 assert.equal(view.project.id,f.target)
 assert.equal(scalar("select conversation_id from social_project_profile_revisions where id='"+view.revision.id+"';"),f.cross)
 assert.equal(scalar("select project_id from conversations where id='"+f.cross+"';"),f.sibling)
})
test('three LinkedIn image drafts save for review from global chat and retries do not duplicate',()=>{
 const f=fixture(),view=approvePlan(f,plan(f)),inputs=[0,1,2].map(i=>draft(f,view,i))
 for(const input of inputs)rpc('social_content_save',f.p,input)
 const result=rpc('social_content_save',f.p,inputs[0])
 assert.equal(result.posts.length,3)
 assert.ok(result.posts.every(p=>p.status==='proposal'&&p.decision===null&&p.revision.media.length===1))
 assert.equal(result.publicationReady,false);assert.equal(result.dispatchEnabled,false)
 assert.equal(scalar("select count(*) from social_content_revisions where project_id='"+f.target+"' and conversation_id='"+f.global+"';"),'3')
 assert.equal(scalar("select count(*) from social_content_decisions where project_id='"+f.target+"';"),'0')
 assert.equal(scalar("select count(*) from social_content_posts where project_id='"+f.sibling+"';"),'0')
})
test('target owner check defeats forged allow-list and source conversation remains private',()=>{
 const f=fixture()
 for(const [p,projectId,conversationId] of [
 [f.p,f.foreign,f.global],
 [{...f.p,allowedProjectIds:[f.foreign]},f.foreign,f.global],
 [{...f.p,allowedProjectIds:[]},f.target,f.global],
 [f.p,f.target,f.theirs],
 [f.p,f.target,randomUUID()],
 [f.p,randomUUID(),f.global],
 ])assert.throws(()=>rpc('social_launch_plan_read',p,{projectId,conversationId}),/SOCIAL_LAUNCH_NOT_FOUND/)
})
test('owner transfer revokes a previously allowed target',()=>{
 const f=fixture()
 scalar("update projects set owner_id=(select owner_id from projects where id='"+f.foreign+"') where id='"+f.target+"';")
 assert.throws(()=>rpc('social_profile_read',f.p,{projectId:f.target,conversationId:f.global}),/SOCIAL_LAUNCH_NOT_FOUND/)
})
test('project stop and missing plan approval still prevent content preparation',()=>{
 const f=fixture(),view=plan(f),input=draft(f,view)
 assert.throws(()=>rpc('social_content_save',f.p,input),/SOCIAL_CONTENT_REVIEW_REQUIRED/)
 approvePlan(f,view)
 scalar("update projects set execution_paused=true where id='"+f.target+"';")
 assert.throws(()=>rpc('social_content_save',f.p,input),/SOCIAL_CONTENT_STOPPED/)
})
test('native no-conversation read remains compatible; anon and authenticated have no RPC authority',()=>{
 const f=fixture();assert.equal(rpc('social_launch_plan_read',f.p,{projectId:f.target}).project.id,f.target)
 for(const role of ['anon','authenticated'])assert.equal(scalar("select has_function_privilege('"+role+"','public.social_launch_assert_owner(jsonb,jsonb)','execute');"),'f')
 assert.equal(scalar("select prosecdef from pg_proc where oid='public.social_launch_assert_owner(jsonb,jsonb)'::regprocedure;"),'f')
})

test('rollback restores old admission without deleting source audit or target drafts',()=>{
 const f=fixture(),view=plan(f)
 const original=readFileSync(path('20261016052226_social_launch_plans_v1.sql'),'utf8')
 const start=original.indexOf('create function public.social_launch_assert_owner(')
 const end=original.indexOf('$fn$;',start)+6
 assert.ok(start>=0&&end>start)
 scalar(original.slice(start,end).replace('create function','create or replace function'))
 assert.throws(()=>rpc('social_launch_plan_read',f.p,{projectId:f.target,conversationId:f.global}),/SOCIAL_LAUNCH_NOT_FOUND/)
 assert.equal(rpc('social_launch_plan_read',f.p,{projectId:f.target,conversationId:f.same}).currentRevision.id,view.currentRevision.id)
 assert.equal(scalar("select conversation_id from social_launch_plan_revisions where id='"+view.currentRevision.id+"';"),f.global)
 scalar(readFileSync(path(migration),'utf8'))
 assert.equal(rpc('social_launch_plan_read',f.p,{projectId:f.target,conversationId:f.global}).currentRevision.id,view.currentRevision.id)
})
