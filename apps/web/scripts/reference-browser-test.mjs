// Isolated Linux/CI integration. Generates a Next shell; never starts the real deployment.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,mkdtemp,writeFile,readFile,copyFile,rm} from 'node:fs/promises'
import {createServer} from 'node:net'
import {fileURLToPath} from 'node:url'
import {resolve,join} from 'node:path'
import {createClient} from '@supabase/supabase-js'
import sharp from 'sharp'
import {startReferenceStack} from './reference-local-stack.mjs'
import {managedProcess,stopManagedProcess,attemptCleanup} from '../e2e/reference-auth/lifecycle.mjs'
const web=fileURLToPath(new URL('../',import.meta.url)),repo=resolve(web,'../..')
if(process.env.ATLAS_REFERENCE_TEST_MODE!=='isolated-local'||process.platform!=='linux')throw Error('Explicit isolated-local Linux fixture required')
let stack,app,nextProcess,playwrightProcess
const quote=v=>"'"+v.replaceAll("'","''")+"'"
const source=path=>JSON.stringify(join(web,path).replaceAll('\\','/'))
const secrets=[]
function redact(value){
 let text=String(value)
 for(const secret of secrets)text=text.replaceAll(secret,'[fixture-secret]')
 return text.replace(/[A-Za-z0-9_-]{12,}[.][A-Za-z0-9_-]{12,}[.][A-Za-z0-9_-]{12,}/g,'[fixture-token]').replace(/base64-[A-Za-z0-9_-]{60,}/g,'[fixture-cookie]')
}
function log(child){child.stdout?.on('data',x=>process.stdout.write(redact(x)));child.stderr?.on('data',x=>process.stderr.write(redact(x)))}

try{
 stack=await startReferenceStack();secrets.push(stack.anonKey,stack.serviceKey)
 const admin=createClient(stack.url,stack.serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
 const password='Fixture-'+randomUUID()+'-9!',emails=['owner','other','collaborator'].map(role=>role+'-'+randomUUID()+'@example.test')
 secrets.push(password)
 const ids=[]
 for(const email of emails){const result=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(result.error);ids.push(result.data.user.id)}
 const projectId=randomUUID(),conversationId=randomUUID(),otherProjectId=randomUUID(),otherConversationId=randomUUID()
 // Membership table is synthetic but its owner-readable RLS is real; production middleware is unchanged.
 stack.sql(`create table public.omnira_organization_memberships(user_id uuid primary key references auth.users(id),role text not null,revoked_at timestamptz);
 alter table public.omnira_organization_memberships enable row level security;
 create policy fixture_membership_self on public.omnira_organization_memberships for select to authenticated using(user_id=auth.uid());
 grant select on public.omnira_organization_memberships to authenticated;
 insert into public.omnira_organization_memberships(user_id,role) values(${quote(ids[2])},'collaborator');
 insert into public.projects(id,owner_id) values(${quote(projectId)},${quote(ids[0])}),(${quote(otherProjectId)},${quote(ids[1])});
 insert into public.conversations(id,user_id,project_id) values(${quote(conversationId)},${quote(ids[0])},${quote(projectId)}),(${quote(otherConversationId)},${quote(ids[1])},${quote(otherProjectId)});
 insert into public.project_budgets values(${quote(projectId)},10),(${quote(otherProjectId)},10);notify pgrst,'reload schema';`)
 await mkdir(resolve(repo,'.superpowers'),{recursive:true})
 app=await mkdtemp(resolve(repo,'.superpowers/reference-next-'))
 async function put(path,text){await mkdir(resolve(app,path,'..'),{recursive:true});await writeFile(resolve(app,path),text)}
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r))
 const port=reservation.address().port;await new Promise(r=>reservation.close(r))
 // Next14 canonicalizes loopback URLs to localhost. Use one browser cookie origin.
 const appUrl='http://localhost:'+port,denied=resolve(app,'denied-origins.log')
 stack.allowBrowserOrigin(appUrl)
 await writeFile(denied,'')
 await put('package.json',JSON.stringify({private:true}))
 const originalTs=JSON.parse(await readFile(resolve(web,'tsconfig.json'),'utf8'))
 await put('tsconfig.json',JSON.stringify({...originalTs,compilerOptions:{...originalTs.compilerOptions,baseUrl:web,paths:{'@/*':['./*']},incremental:false},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts']}))
 await put('next.config.mjs',`export default {experimental:{externalDir:true,serverComponentsExternalPackages:['sharp','ws']},images:{unoptimized:true},webpack(config){config.resolve.alias['@']=${JSON.stringify(web)};return config}}`)
 await put('middleware.ts',await readFile(resolve(web,'middleware.ts'),'utf8'))
 await put('app/layout.tsx',`import React from 'react';export default function Layout({children}:{children:React.ReactNode}){return <html lang="sv"><body>{children}</body></html>}`)
 // Keep the production client page and its relative CSS inside Next's app CSS entry graph.
 await put('app/login/page.tsx',await readFile(resolve(web,'app/(auth)/login/page.tsx'),'utf8'))
 await put('app/login/login.module.css',await readFile(resolve(web,'app/(auth)/login/login.module.css'),'utf8'))
 await mkdir(resolve(app,'public'),{recursive:true})
 for(const name of ['omnira-favicon.svg','atlas-orb-login-masked.png'])await copyFile(resolve(web,'public',name),resolve(app,'public',name))
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
 const owner=user.id===${JSON.stringify(ids[0])}
 return <Shell projectId={owner?${JSON.stringify(projectId)}:${JSON.stringify(otherProjectId)}} conversationId={owner?${JSON.stringify(conversationId)}:${JSON.stringify(otherConversationId)}} email={user.email!} owned={owner} saved={data??[]}/>
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
 nextProcess=managedProcess(process.execPath,[resolve(repo,'node_modules/next/dist/bin/next'),'dev',app,'--hostname','127.0.0.1','--port',String(port)],{cwd:app,env,detached:true,stdio:['ignore','pipe','pipe']});log(nextProcess.child)
 const deadline=Date.now()+120000;let ready=false
 while(Date.now()<deadline){
  if(nextProcess.failure||nextProcess.child.exitCode!==null)throw Error('Next fixture exited before readiness')
  try{if((await fetch(appUrl+'/login',{signal:AbortSignal.timeout(5000)})).ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,300))
 }
 assert(ready,'Next fixture login readiness timed out')
 const fixture={appUrl,storageUrl:stack.url,projectId,conversationId,ownerId:ids[0],ownerEmail:emails[0],otherEmail:emails[1],collaboratorEmail:emails[2],password,images}
 playwrightProcess=managedProcess(process.execPath,[resolve(repo,'node_modules/@playwright/test/cli.js'),'test','--config=playwright.reference-auth.config.ts'],{
 cwd:web,env:{...baseEnv,NODE_OPTIONS:'--max-old-space-size=512',ATLAS_REFERENCE_BROWSER_URL:appUrl,ATLAS_REFERENCE_BROWSER_FIXTURE:JSON.stringify(fixture)},
 detached:true,stdio:['ignore','pipe','pipe']});log(playwrightProcess.child)
 const result=await playwrightProcess.done
 assert.ifError(result.error)
 const deniedOrigins=await readFile(denied,'utf8')
 if(deniedOrigins)console.error('Server guard denied: '+deniedOrigins)
 assert.equal(result.code,0,'Chromium reference integration failed')
 assert.equal(await readFile(denied,'utf8'),'','Server attempted external HTTP')
 assert.equal(stack.sql('select count(*) from public.conversation_messages;'),'1')
 assert.equal(stack.sql('select count(*) from public.website_build_reference_messages;'),'1')
 console.log('PASS real browser + Next + Auth/Storage; exactly one actual message and manifest; no external fetch')
}finally{
 await attemptCleanup([
  ()=>stopManagedProcess(playwrightProcess),
  ()=>stopManagedProcess(nextProcess),
  async()=>{if(stack){stack.diagnostics();await stack.close()}},
  async()=>{if(app)await rm(app,{recursive:true,force:true})},
 ])
}
