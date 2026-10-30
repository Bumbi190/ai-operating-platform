// Isolated Linux/CI integration. Generates a Next shell; never starts the real deployment.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {createServer} from 'node:net'
import {fileURLToPath} from 'node:url'
import {resolve,join} from 'node:path'
import {createClient} from '@supabase/supabase-js'
import sharp from 'sharp'
import {startReferenceStack} from './reference-local-stack.mjs'
const web=fileURLToPath(new URL('../',import.meta.url)),repo=resolve(web,'../..')
if(process.env.ATLAS_REFERENCE_TEST_MODE!=='isolated-local'||process.platform!=='linux')throw Error('Explicit isolated-local Linux fixture required')
let stack,app,nextChild,playwrightChild
const quote=v=>"'"+v.replaceAll("'","''")+"'"
const source=path=>JSON.stringify(join(web,path).replaceAll('\\','/'))
const secrets=[]
function redact(value){
 let text=String(value)
 for(const secret of secrets)text=text.replaceAll(secret,'[fixture-secret]')
 return text.replace(/[A-Za-z0-9_-]{12,}[.][A-Za-z0-9_-]{12,}[.][A-Za-z0-9_-]{12,}/g,'[fixture-token]')
}
function log(child){child.stdout?.on('data',x=>process.stdout.write(redact(x)));child.stderr?.on('data',x=>process.stderr.write(redact(x)))}
function exited(child){return new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}))})}
async function stop(child){
 if(!child||child.exitCode!==null||child.signalCode)return
 // Own detached process group only, including Next's dev worker.
 const done=exited(child)
 try{process.kill(-child.pid,'SIGTERM')}catch(error){if(error.code!=='ESRCH')throw error}
 const ended=await Promise.race([done.then(()=>true),new Promise(r=>{const t=setTimeout(()=>r(false),5000);t.unref()})])
 if(!ended){try{process.kill(-child.pid,'SIGKILL')}catch(error){if(error.code!=='ESRCH')throw error}await done}
}
try{
 stack=await startReferenceStack();secrets.push(stack.anonKey,stack.serviceKey)
 const admin=createClient(stack.url,stack.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const password='Fixture-'+randomUUID()+'-9!',emails=['owner','other','collaborator'].map(role=>role+'-'+randomUUID()+'@example.test')
 secrets.push(password)
 const ids=[]
 for(const email of emails){const result=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(result.error);ids.push(result.data.user.id)}
 const projectId=randomUUID(),conversationId=randomUUID(),otherProjectId=randomUUID()
 // Membership table is synthetic but its owner-readable RLS is real; production middleware is unchanged.
 stack.sql(`create table public.omnira_organization_memberships(user_id uuid primary key references auth.users(id),role text not null,revoked_at timestamptz);
 alter table public.omnira_organization_memberships enable row level security;
 create policy fixture_membership_self on public.omnira_organization_memberships for select to authenticated using(user_id=auth.uid());
 grant select on public.omnira_organization_memberships to authenticated;
 insert into public.omnira_organization_memberships(user_id,role) values(${quote(ids[2])},'collaborator');
 insert into public.projects(id,owner_id) values(${quote(projectId)},${quote(ids[0])}),(${quote(otherProjectId)},${quote(ids[1])});
 insert into public.conversations(id,user_id,project_id) values(${quote(conversationId)},${quote(ids[0])},${quote(projectId)});
 insert into public.project_budgets values(${quote(projectId)},10);notify pgrst,'reload schema';`)
 await mkdir(resolve(repo,'.superpowers'),{recursive:true})
 app=await mkdtemp(resolve(repo,'.superpowers/reference-next-'))
 async function put(path,text){await mkdir(resolve(app,path,'..'),{recursive:true});await writeFile(resolve(app,path),text)}
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r))
 const port=reservation.address().port;await new Promise(r=>reservation.close(r))
 const appUrl='http://127.0.0.1:'+port,denied=resolve(app,'denied-origins.log')
 await writeFile(denied,'')
 await put('package.json',JSON.stringify({private:true}))
 const originalTs=JSON.parse(await readFile(resolve(web,'tsconfig.json'),'utf8'))
 await put('tsconfig.json',JSON.stringify({...originalTs,compilerOptions:{...originalTs.compilerOptions,baseUrl:web,paths:{'@/*':['./*']},incremental:false},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts']}))
 await put('next.config.mjs',`export default {experimental:{externalDir:true,serverComponentsExternalPackages:['sharp','ws']},images:{unoptimized:true},webpack(config){config.resolve.alias['@']=${JSON.stringify(web)};return config}}`)
 await put('middleware.ts',await readFile(resolve(web,'middleware.ts'),'utf8'))
 await put('app/layout.tsx',`import React from 'react';export default function Layout({children}:{children:React.ReactNode}){return <html lang="sv"><body>{children}</body></html>}`)
 await put('app/login/page.tsx',`export {default} from ${source('app/(auth)/login/page.tsx')}`)
 await put('app/organization/page.tsx',`export default function Page(){return <h1>Isolerad organisation</h1>}`)
 for(const name of ['tickets','finish','image','library']){
  await put('app/api/website-build/references/'+name+'/route.ts',`export const dynamic='force-dynamic';export const runtime='nodejs';export {${name==='tickets'?'GET,POST':name==='finish'?'POST':'GET'}} from ${source('app/api/website-build/references/'+name+'/route.ts')}`)
 }
 await put('app/api/chat/route.ts',`export const dynamic='force-dynamic';export const runtime='nodejs';export {POST} from ${source('app/api/chat/route.ts')}`)
 await put('app/dashboard/page.tsx',`import {redirect} from 'next/navigation'
 import {createClient} from '@/lib/supabase/server'
 import Shell from ${source('e2e/reference-auth/shell.tsx')}
 export const dynamic='force-dynamic'
 export default async function Page(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect('/login')
 const {data,error}=await db.from('conversation_messages').select('id,role,content,tool_data,created_at').eq('conversation_id',${JSON.stringify(conversationId)}).order('created_at')
 if(error)throw Error('Fixture history unavailable')
 return <Shell projectId=${JSON.stringify(projectId)} conversationId=${JSON.stringify(conversationId)} email={user.email!} owned={user.id===${JSON.stringify(ids[0])}} saved={data??[]}/>
 }`)
 await put('app/fixture/state/route.ts',`import {createClient} from '@/lib/supabase/server'
 import {createAdminClient} from '@/lib/supabase/admin'
 export const dynamic='force-dynamic'
 export async function GET(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser()
 if(!user)return Response.json({error:'Unauthorized'},{status:401})
 const {data:messages,error}=await db.from('conversation_messages').select('id,content').eq('conversation_id',${JSON.stringify(conversationId)})
 if(error)throw Error('Fixture state unavailable')
 // No caller-supplied owner/project/conversation. Admin manifest read is gated to the seeded owner.
 let manifests=[]
 if(user.id===${JSON.stringify(ids[0])}){const r=await (createAdminClient() as any).from('website_build_reference_messages').select('message_id,images').eq('owner_id',user.id).eq('conversation_id',${JSON.stringify(conversationId)});if(r.error)throw Error('Fixture manifest unavailable');manifests=r.data}
 return Response.json({messages,manifests},{headers:{'cache-control':'private, no-store'}})
 }`)
 // Tiny synthetic images. No user file or network image is consumed.
 const images=[]
 for(const color of ['#276e9b','#bf7631']){const path=resolve(app,'image-'+images.length+'.png');await sharp({create:{width:73,height:47,channels:3,background:color}}).png().toFile(path);images.push(path)}
 const baseEnv={}
 for(const name of ['PATH','HOME','TMPDIR','TMP','TEMP','LANG','CI'])if(process.env[name])baseEnv[name]=process.env[name]
 const env={...baseEnv,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development',NODE_OPTIONS:'--max-old-space-size=1536 --require '+resolve(web,'e2e/reference-auth/fetch-guard.cjs'),
 NEXT_PUBLIC_SUPABASE_URL:stack.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:stack.anonKey,SUPABASE_SERVICE_ROLE_KEY:stack.serviceKey,
 ATLAS_REFERENCE_UPLOAD_ENABLED:'true',ATLAS_REFERENCE_CHAT_SAVE_ENABLED:'true',ATLAS_MODEL_PROFILE:'standard',
 ANTHROPIC_API_KEY:'fixture-no-provider-access',ATLAS_CTX_ASSEMBLER:'off',ATLAS_REFERENCE_FETCH_ORIGINS:JSON.stringify([stack.url,appUrl]),ATLAS_REFERENCE_FETCH_DENIED:denied}
 nextChild=spawn(process.execPath,[resolve(repo,'node_modules/next/dist/bin/next'),'dev',app,'--hostname','127.0.0.1','--port',String(port)],{cwd:app,env,detached:true,stdio:['ignore','pipe','pipe']});log(nextChild)
 const deadline=Date.now()+120000;let ready=false
 while(Date.now()<deadline){
  if(nextChild.exitCode!==null)throw Error('Next fixture exited before readiness')
  try{if((await fetch(appUrl+'/login',{signal:AbortSignal.timeout(5000)})).ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,300))
 }
 assert(ready,'Next fixture login readiness timed out')
 const fixture={appUrl,storageUrl:stack.url,projectId,conversationId,ownerId:ids[0],ownerEmail:emails[0],otherEmail:emails[1],collaboratorEmail:emails[2],password,images}
 playwrightChild=spawn(process.execPath,[resolve(repo,'node_modules/@playwright/test/cli.js'),'test','--config=playwright.reference-auth.config.ts'],{
 cwd:web,env:{...baseEnv,NODE_OPTIONS:'--max-old-space-size=512',ATLAS_REFERENCE_BROWSER_URL:appUrl,ATLAS_REFERENCE_BROWSER_FIXTURE:JSON.stringify(fixture)},
 detached:true,stdio:['ignore','pipe','pipe']});log(playwrightChild)
 const result=await exited(playwrightChild)
 assert.equal(result.code,0,'Chromium reference integration failed')
 assert.equal(await readFile(denied,'utf8'),'','Server attempted external HTTP')
 assert.equal(stack.sql('select count(*) from public.conversation_messages;'),'1')
 assert.equal(stack.sql('select count(*) from public.website_build_reference_messages;'),'1')
 console.log('PASS real browser + Next + Auth/Storage; exactly one actual message and manifest; no external fetch')
}finally{
 await stop(playwrightChild)
 await stop(nextChild)
 if(stack){stack.diagnostics();await stack.close()}
 if(app)await rm(app,{recursive:true,force:true})
}
