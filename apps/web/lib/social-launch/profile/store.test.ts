import {beforeAll,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {initializeProfileDb} from './test-db'
import {testSql,TEST_PRINCIPAL} from '../../website-build/test-db'
import {readSocialProfile,saveSocialProfile} from './store'
let db:ReturnType<typeof initializeProfileDb>
beforeAll(()=>{db=initializeProfileDb()})
const profile=()=>({description:'Aktiviteter för familjer',audience:'Föräldrar',tone:'Varm och tydlig',websiteUrl:'https://example.test',callToAction:'Upptäck mer',factualBoundaries:'Inga garanterade resultat',preferredMediaIds:[] as string[]})
export function profileFixture(){
 const projectId=randomUUID(),conversationId=randomUUID(),p={...TEST_PRINCIPAL,allowedProjectIds:[projectId]}
 testSql("insert into projects(id,owner_id,name,slug) values('"+projectId+"','"+p.userId+"','Familje-Stunden','profile-"+projectId+"');insert into conversations(id,user_id,project_id) values('"+conversationId+"','"+p.userId+"','"+projectId+"');")
 return {p,projectId,conversationId,expectedRevisionId:null as string|null,idempotencyKey:randomUUID(),profile:profile()}
}
const input=(f:ReturnType<typeof profileFixture>)=>{const {p,...v}=f;return v}
it('saves exact project context without creating posts, bindings or authority',async()=>{
 const f=profileFixture();expect((await readSocialProfile(db,f.p,{projectId:f.projectId})).revision).toBeNull()
 const v=await saveSocialProfile(db,f.p,input(f));expect(v.revision!.profile).toEqual(f.profile);expect(v.revision!.sequence).toBe(1);expect(v.revision!.sha256).toMatch(/^[a-f0-9]{64}$/);expect(v.workspaceUrl).toBe('/projects/profile-'+f.projectId+'/social#profile')
 expect(testSql("select count(*) from social_content_posts where project_id='"+f.projectId+"';")).toBe('0');expect(testSql("select count(*) from social_account_bindings where project_id='"+f.projectId+"';")).toBe('0')
})
it('refuses foreign users, omitted allowed scope and another project conversation',async()=>{
 const f=profileFixture(),other=profileFixture()
 await expect(readSocialProfile(db,{...f.p,userId:randomUUID()},{projectId:f.projectId})).rejects.toMatchObject({code:'NOT_FOUND'})
 await expect(readSocialProfile(db,{...f.p,allowedProjectIds:[]},{projectId:f.projectId})).rejects.toMatchObject({code:'NOT_FOUND'})
 await expect(saveSocialProfile(db,f.p,{...input(f),conversationId:other.conversationId})).rejects.toMatchObject({code:'NOT_FOUND'})
})
it('replays the latest head, refuses changed intent and stale edits',async()=>{
 const f=profileFixture(),a=await saveSocialProfile(db,f.p,input(f)),b=await saveSocialProfile(db,f.p,{...input(f),expectedRevisionId:a.revision!.id,idempotencyKey:randomUUID(),profile:{...f.profile,tone:'Lugn'}})
 expect((await saveSocialProfile(db,f.p,input(f))).revision!.id).toBe(b.revision!.id)
 await expect(saveSocialProfile(db,f.p,{...input(f),profile:{...f.profile,tone:'Annan'}})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
 await expect(saveSocialProfile(db,f.p,{...input(f),idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'})
 expect(testSql("select count(*) from social_project_profile_revisions where project_id='"+f.projectId+"';")).toBe('2')
})
it('only accepts active assets owned by this project',async()=>{
 const f=profileFixture(),other=profileFixture(),id=randomUUID();testSql("insert into assets(id,project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path) values('"+id+"','"+other.projectId+"','image','image/jpeg',10,'"+'a'.repeat(64)+"','media-assets-private','"+id+"');")
 await expect(saveSocialProfile(db,f.p,{...input(f),profile:{...f.profile,preferredMediaIds:[id]}})).rejects.toMatchObject({code:'INVALID_BODY'})
 testSql("update assets set project_id='"+f.projectId+"' where id='"+id+"';")
 const v=await saveSocialProfile(db,f.p,{...input(f),profile:{...f.profile,preferredMediaIds:[id]}});expect(v.assets.some(a=>a.id===id)).toBe(true)
 testSql("update assets set status='archived' where id='"+id+"';")
 await expect(saveSocialProfile(db,f.p,{...input(f),idempotencyKey:randomUUID(),expectedRevisionId:v.revision!.id,profile:{...f.profile,preferredMediaIds:[id]}})).rejects.toMatchObject({code:'INVALID_BODY'})
})
it('stops writes to paused and archived projects',async()=>{
 const f=profileFixture();testSql("update projects set execution_paused=true where id='"+f.projectId+"';")
 await expect(saveSocialProfile(db,f.p,input(f))).rejects.toMatchObject({code:'STOPPED'})
 testSql("update projects set execution_paused=false where id='"+f.projectId+"';insert into project_lifecycle(project_id,state,owner_id) values('"+f.projectId+"','archived','"+f.p.userId+"');")
 await expect(saveSocialProfile(db,f.p,input(f))).rejects.toMatchObject({code:'STOPPED'})
})
it('keeps history immutable and client roles denied',async()=>{
 const f=profileFixture(),v=await saveSocialProfile(db,f.p,input(f))
 expect(()=>testSql("update social_project_profile_revisions set profile='{}' where id='"+v.revision!.id+"';",true)).toThrow()
 expect(()=>testSql("delete from social_project_profile_revisions where id='"+v.revision!.id+"';",true)).toThrow()
 expect(testSql("select bool_and(relrowsecurity) from pg_class where oid in('social_project_profiles'::regclass,'social_project_profile_revisions'::regclass);")).toBe('t')
 for(const role of ['anon','authenticated'])expect(testSql("select has_table_privilege('"+role+"','social_project_profiles','select') or has_function_privilege('"+role+"','social_profile_save(jsonb,jsonb)','execute');")).toBe('f')
})
it('SQL independently rejects malformed context even when TypeScript is bypassed',async()=>{
 const f=profileFixture();const {data,error}=await (db as any).rpc('social_profile_save',{p_principal:f.p,p_input:{...input(f),profile:{...f.profile,publish:true}}});expect(data).toBeNull();expect(error?.message).toContain('SOCIAL_PROFILE_INVALID_BODY')
})

function asyncSql(statement:string,onText?:(s:string)=>void,applicationName='profile_sql_test'):Promise<{code:number|null;out:string;err:string}>{
 const dbName=process.env.WEBSITE_BUILD_TEST_DATABASE_NAME
 if(!/^website_test_[0-9]+$/.test(dbName??''))throw Error('Owned database required')
 return new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i','-e','PGAPPNAME='+applicationName,'omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',dbName!],{stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>{out+=b;onText?.(out)});child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));child.stdin.end(statement)})
}
const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb"
it('serializes two independent SQL writers without duplicate revisions',async()=>{
 const f=profileFixture();const outcomes=await Promise.all([input(f),{...input(f),idempotencyKey:randomUUID(),profile:{...f.profile,tone:'Annan ton'}}].map(v=>asyncSql('set role service_role;select public.social_profile_save('+literal(f.p)+','+literal(v)+');')))
 expect(outcomes.filter(o=>o.code===0)).toHaveLength(1);expect(outcomes.find(o=>o.code!==0)!.err).toContain('SOCIAL_PROFILE_REVISION_CONFLICT')
 expect(testSql("select count(*) from social_project_profile_revisions where project_id='"+f.projectId+"';")).toBe('1')
})
it('rechecks ownership after waiting for a concurrent project transfer',async()=>{
 const f=profileFixture(),newOwner=randomUUID(),tag='profile_transfer_'+f.projectId.replaceAll('-',''),writerTag='profile_writer_'+f.projectId.replaceAll('-','')
 testSql("insert into auth.users(id) values('"+newOwner+"');")
 const database=process.env.WEBSITE_BUILD_TEST_DATABASE_NAME!
 if(!/^website_test_[0-9]+$/.test(database))throw Error('Owned database required')
 const owner=spawn('docker',['exec','-i','-e','PGAPPNAME='+tag,'omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],{stdio:['pipe','pipe','pipe']})
 const ownerDone=new Promise<number|null>((resolve,reject)=>{owner.on('close',resolve);owner.on('error',reject)})
 owner.stdin.write("begin;update projects set owner_id='"+newOwner+"' where id='"+f.projectId+"';\n")
 async function waitState(name:string,predicate:string){for(let i=0;i<30;i++){if(testSql("select count(*) from pg_stat_activity where application_name='"+name+"' and "+predicate+";")==='1')return;await new Promise(r=>setTimeout(r,20))}throw Error('Expected controlled SQL state missing: '+name)}
 let result:Awaited<ReturnType<typeof asyncSql>>|undefined
 try{
  await waitState(tag,"state='idle in transaction'")
  const writer=asyncSql('set role service_role;select public.social_profile_save('+literal(f.p)+','+literal(input(f))+');',undefined,writerTag)
  await waitState(writerTag,"wait_event_type='Lock'")
  owner.stdin.end('commit;\n');expect(await ownerDone).toBe(0)
  result=await writer
 }finally{if(!owner.stdin.writableEnded)owner.stdin.end('rollback;\n')}
 expect(result!.code).not.toBe(0);expect(result!.err).toContain('SOCIAL_LAUNCH_NOT_FOUND')
 expect(testSql("select count(*) from social_project_profile_revisions where project_id='"+f.projectId+"';")).toBe('0')
},15000)
