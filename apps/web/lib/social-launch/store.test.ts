import {beforeAll,describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {initializeWorkerDb,testSql,TEST_PRINCIPAL} from '../website-build/test-db'
import {readSocialLaunchPlan,proposeSocialLaunchPlan,decideSocialLaunchPlan} from './store'
let db:ReturnType<typeof initializeWorkerDb>
const choices=[{channel:'pinterest',purpose:'Familjeaktiviteter',format:'image',cadence:'weekly'}]
function fixture(){
 const id=randomUUID(),conversationId=randomUUID(),p={...TEST_PRINCIPAL,allowedProjectIds:[id]}
 testSql("insert into projects(id,owner_id,name,slug) values('"+id+"','"+p.userId+"','Familje-Stunden','family-"+id+"');insert into conversations(id,user_id,project_id) values('"+conversationId+"','"+p.userId+"','"+id+"');")
 return {p,projectId:id,conversationId,expectedRevisionId:null,idempotencyKey:randomUUID(),choices}
}
const request=(f:ReturnType<typeof fixture>)=>{const {p,...input}=f;return input}
const ref=(f:ReturnType<typeof fixture>)=>({projectId:f.projectId,conversationId:f.conversationId})
beforeAll(()=>{db=initializeWorkerDb();if(testSql("select to_regclass('public.social_launch_plans') is null;")==='t'){const dir=resolve(process.cwd(),'supabase/migrations'),file=readdirSync(dir).find(f=>f.endsWith('_social_launch_plans_v1.sql'))!;testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;')}})
describe('real SQL social launch plans',()=>{
 it('saves a proposed immutable revision and reads it without approving or running anything',async()=>{
  const f=fixture(),v=await proposeSocialLaunchPlan(db,f.p,request(f))
  expect(v.currentRevision?.choices).toEqual(choices);expect(v.currentRevision?.sha256).toMatch(/^[a-f0-9]{64}$/);expect(v.decision).toBeNull()
  expect(await readSocialLaunchPlan(db,f.p,ref(f))).toEqual(v)
  expect(()=>testSql("update social_launch_plan_revisions set choices='[]' where id='"+v.currentRevision!.id+"';")).toThrow('SOCIAL_LAUNCH_IMMUTABLE')
  expect(testSql("select count(*) from runs where project_id='"+f.projectId+"';")).toBe('0')
 })
 it('returns an empty owned plan without creating a revision',async()=>{const f=fixture();expect((await readSocialLaunchPlan(db,f.p,ref(f))).currentRevision).toBeNull()})
 it('refuses a project outside server scope and independently rechecks actual ownership in SQL',async()=>{
  const f=fixture();await expect(readSocialLaunchPlan(db,{...f.p,allowedProjectIds:[]},ref(f))).rejects.toMatchObject({code:'NOT_FOUND'})
  await expect(readSocialLaunchPlan(db,{...f.p,userId:'20000000-0000-4000-8000-000000000002'},ref(f))).rejects.toMatchObject({code:'NOT_FOUND'})
 })
 it('refuses a conversation from another project or owner',async()=>{
  const f=fixture(),other=fixture()
  await expect(proposeSocialLaunchPlan(db,f.p,{...request(f),conversationId:other.conversationId})).rejects.toMatchObject({code:'NOT_FOUND'})
  testSql("update conversations set user_id='20000000-0000-4000-8000-000000000002' where id='"+f.conversationId+"';")
  await expect(readSocialLaunchPlan(db,f.p,ref(f))).rejects.toMatchObject({code:'NOT_FOUND'})
 })
 it('reuses the same intent but rejects changed content or stale expected revisions',async()=>{
  const f=fixture(),v=await proposeSocialLaunchPlan(db,f.p,request(f))
  expect((await proposeSocialLaunchPlan(db,f.p,request(f))).currentRevision!.id).toBe(v.currentRevision!.id)
  await expect(proposeSocialLaunchPlan(db,f.p,{...request(f),choices:[]})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
  await expect(proposeSocialLaunchPlan(db,f.p,{...request(f),idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
 })
 it('serializes simultaneous first saves from independent SQL connections',async()=>{
  const f=fixture()
  const sql=(key:string)=>"set role service_role;select public.social_launch_plan_save('"+JSON.stringify(f.p)+"'::jsonb,'"+JSON.stringify({...request(f),idempotencyKey:key})+"'::jsonb);"
  const run=(body:string)=>new Promise<{code:number|null;out:string;error:string}>(resolve=>{
   const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',process.env.WEBSITE_BUILD_TEST_DATABASE_NAME!])
   let out='',error='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>error+=b)
   child.on('close',code=>resolve({code,out,error}));child.stdin.end(body)
  })
  const results=await Promise.all([run(sql(randomUUID())),run(sql(randomUUID()))])
  expect(results.filter(r=>r.code===0)).toHaveLength(1)
  expect(results.find(r=>r.code!==0)?.error).toContain('SOCIAL_LAUNCH_CONFLICT')
  expect(testSql("select count(*) from social_launch_plan_revisions where project_id='"+f.projectId+"';")).toBe('1')
 })
 it('binds a decision to the exact current revision and hash',async()=>{
  const f=fixture(),v=await proposeSocialLaunchPlan(db,f.p,request(f)),r=v.currentRevision!,input={projectId:f.projectId,revisionId:r.id,sha256:r.sha256,decision:'approve' as const,idempotencyKey:randomUUID()}
  await expect(decideSocialLaunchPlan(db,f.p,{...input,sha256:'0'.repeat(64)})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
  const approved=await decideSocialLaunchPlan(db,f.p,input)
  expect(approved.decision?.revisionId).toBe(r.id);expect(approved.decision?.decision).toBe('approve')
  expect((await decideSocialLaunchPlan(db,f.p,input)).decision!.id).toBe(approved.decision!.id)
  expect(()=>testSql("delete from social_launch_plan_decisions where id='"+approved.decision!.id+"';")).toThrow('SOCIAL_LAUNCH_IMMUTABLE')
 })
 it('new choices invalidate the current decision and old retries cannot overwrite the new revision',async()=>{
  const f=fixture(),a=await proposeSocialLaunchPlan(db,f.p,request(f)),r=a.currentRevision!
  const decision={projectId:f.projectId,revisionId:r.id,sha256:r.sha256,decision:'approve' as const,idempotencyKey:randomUUID()}
  await decideSocialLaunchPlan(db,f.p,decision)
  const b=await proposeSocialLaunchPlan(db,f.p,{...request(f),expectedRevisionId:r.id,choices:[],idempotencyKey:randomUUID()})
  expect(b.decision).toBeNull();expect(b.currentRevision!.sequence).toBe(2)
  expect((await proposeSocialLaunchPlan(db,f.p,request(f))).currentRevision!.id).toBe(b.currentRevision!.id)
  await expect(decideSocialLaunchPlan(db,f.p,{...decision,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
 })
 it('rejects contradictory decisions on one revision and unexpected fields',async()=>{
  const f=fixture(),v=await proposeSocialLaunchPlan(db,f.p,request(f)),r=v.currentRevision!,input={projectId:f.projectId,revisionId:r.id,sha256:r.sha256,decision:'reject' as const,idempotencyKey:randomUUID()}
  await decideSocialLaunchPlan(db,f.p,input)
  await expect(decideSocialLaunchPlan(db,f.p,{...input,decision:'approve',idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
  await expect(proposeSocialLaunchPlan(db,f.p,{...request(f),publish:true} as any)).rejects.toMatchObject({code:'INVALID_BODY'})
 })
 it('denies direct web-role table/RPC access and enables RLS on all three tables',()=>{
  expect(testSql("select count(*) from pg_class where relname in ('social_launch_plans','social_launch_plan_revisions','social_launch_plan_decisions') and relrowsecurity;")).toBe('3')
  expect(testSql("select has_table_privilege('authenticated','social_launch_plans','select') or has_function_privilege('anon','social_launch_plan_save(jsonb,jsonb)','execute');")).toBe('f')
 })
})
