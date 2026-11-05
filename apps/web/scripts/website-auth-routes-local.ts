// Test-only runner: real route exports, SSR cookies, Auth, access resolver and RPC store.
// Next request storage is supplied by this runner; no Next HTTP server/browser/middleware.
import {readFileSync} from 'node:fs'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {createServerClient} from '@supabase/ssr'
import {requestAsyncStorage} from 'next/dist/client/components/request-async-storage.external'
import {actionAsyncStorage} from 'next/dist/client/components/action-async-storage.external'
import {RequestCookies} from 'next/dist/server/web/spec-extension/cookies'
import * as settings from '../app/api/website-build-settings/route'
import * as plans from '../app/api/website-build-plans/route'
import * as planRead from '../app/api/website-build-plans/[planId]/route'
import * as planApprove from '../app/api/website-build-plans/[planId]/approve/route'
import * as mockupApprove from '../app/api/website-build-plans/[planId]/mockups/approve/route'
import {resolveProjectAccess} from '../lib/auth/project-access'
const checks:{name:string;passed:boolean}[]=[]
function check(name:string,ok:unknown){checks.push({name,passed:Boolean(ok)});if(!ok)throw Error(name)}
async function main(){
 const f=JSON.parse(readFileSync(0,'utf8')),base='http://client:3080',appBase=f.nextServer?'http://client:3100':base
 let nextProcess:ReturnType<typeof spawn>|null=null
 let refreshRequests=0
 const nativeFetch=globalThis.fetch
 globalThis.fetch=(async(input:any,init:any)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
  if(![base,appBase,'http://auth:9999','http://rest:3000'].includes(url.origin))throw Error('NONLOCAL_FETCH_REFUSED')
  return nativeFetch(input,{...init,signal:init?.signal??AbortSignal.timeout(10000)})
 }) as typeof fetch
 // SDK gateway paths only. No fabricated Auth or database responses.
 const server=createServer(async(req,res)=>{
  try{
   const path=req.url??'/',target=path.startsWith('/auth/v1/')?'http://auth:9999'+path.slice(8):path.startsWith('/rest/v1/')?'http://rest:3000'+path.slice(8):null
   if(!target){res.writeHead(404).end();return}
   if(req.method==='POST'&&path.startsWith('/auth/v1/token?grant_type=refresh_token'))refreshRequests++
   const parts:Buffer[]=[];for await(const part of req)parts.push(Buffer.from(part))
   const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length']
   const result=await fetch(target,{method:req.method,headers:headers as any,...(parts.length?{body:Buffer.concat(parts)}:{})})
   res.statusCode=result.status
   for(const [name,value] of result.headers)if(!['transfer-encoding','content-encoding','content-length','connection'].includes(name))res.setHeader(name,value)
   res.end(Buffer.from(await result.arrayBuffer()))
  }catch{res.writeHead(502).end()}
 })
 await new Promise<void>(r=>server.listen(3080,'0.0.0.0',r))
 process.env.NEXT_PUBLIC_SUPABASE_URL=base
 process.env.SUPABASE_SERVICE_ROLE_KEY=f.service
 // Anon key will be supplied separately by the harness; never use service credentials for a session client.
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=f.anon
 if(!f.anon||f.anon===f.service)throw Error('ANON_KEY_REQUIRED')
 try{
  if(f.nextServer){
   nextProcess=spawn(process.execPath,[f.nextServer],{env:{...process.env,NODE_ENV:'production',PORT:'3100',HOSTNAME:'0.0.0.0',NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'})
   let ready=false
   for(let n=0;n<100;n++){try{const r=await fetch(appBase+'/api/website-build-settings');if(r.status===401){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
   check('next_http_server_ready',ready)
   const redirect=await fetch(appBase+'/',{redirect:'manual'})
   check('next_middleware_redirects_missing_session',redirect.status===307&&new URL(redirect.headers.get('location')??'',appBase).pathname==='/login')
  }
  type Cookie={name:string;value:string}
  async function cookieSession(user:any){
   const jar:Cookie[]=[]
   const client=createServerClient(base,f.anon,{cookies:{getAll:()=>jar,setAll:values=>{for(const value of values){const old=jar.find(c=>c.name===value.name);if(old)old.value=value.value;else jar.push({name:value.name,value:value.value})}}}})
   const {data,error}=await client.auth.setSession({access_token:user.access_token,refresh_token:user.refresh_token})
   check('ssr_session_'+user.alias,!error&&data.user?.id===user.id&&jar.some(c=>c.name.startsWith('sb-')))
   return jar
  }
  const jarA=await cookieSession({...f.a,alias:'owner_a'}),jarB=await cookieSession({...f.b,alias:'owner_b'})
  async function scope<T>(jar:Cookie[],run:()=>Promise<T>):Promise<T>{
   const cookies=new RequestCookies(new Headers({cookie:jar.map(c=>c.name+'='+c.value).join('; ')}))
   return requestAsyncStorage.run({cookies,mutableCookies:cookies,headers:new Headers()} as any,()=>actionAsyncStorage.run({isAppRoute:true},run))
  }
  async function route(handler:any,jar:Cookie[],body?:unknown,query='',params={},origin=appBase){
   const method=body===undefined?'GET':'POST',headers={host:new URL(appBase).host,origin,'content-type':'application/json',cookie:jar.map(c=>c.name+'='+c.value).join('; ')}
   const path=handler===settings.GET||handler===settings.POST?'/api/website-build-settings':handler===plans.POST?'/api/website-build-plans':handler===planRead.GET?'/api/website-build-plans/'+(params as any).planId:handler===planApprove.POST?'/api/website-build-plans/'+(params as any).planId+'/approve':'/api/website-build-plans/'+(params as any).planId+'/mockups/approve'
   const options={method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}
   const response:Response=f.nextServer?await fetch(appBase+path+query,{...options,redirect:'manual'}):await scope(jar,()=>handler(new Request(appBase+path+query,options),{params:Promise.resolve(params)}))
   const data=await response.json()
   check('route_response_private_'+checks.length,response.headers.get('cache-control')==='private, no-store')
   return {status:response.status,data}
  }
  const [projectA,projectB]=f.context.projects
  const unauth=await route(settings.GET,[],undefined,'?projectId='+projectA)
  check('route_no_session_401',unauth.status===401)
  const corrupt=jarA.map(c=>({...c,value:'invalid-session'}))
  check('route_invalid_cookie_401',(await route(settings.GET,corrupt,undefined,'?projectId='+projectA)).status===401)
  const a=await scope(jarA,resolveProjectAccess),b=await scope(jarB,resolveProjectAccess)
  check('real_resolver_owner_a',a.ok&&a.userId===f.a.id&&a.allowedProjectIds.length===1&&a.allowedProjectIds[0]===projectA)
  check('real_resolver_owner_b',b.ok&&b.userId===f.b.id&&b.allowedProjectIds.length===1&&b.allowedProjectIds[0]===projectB)
  check('route_own_setting_read',(await route(settings.GET,jarA,undefined,'?projectId='+projectA)).status===200)
  check('route_foreign_setting_hidden',(await route(settings.GET,jarB,undefined,'?projectId='+projectA)).status===404)
  const builder={projectId:projectA,agentId:f.context.agents[0]}
  check('route_cross_origin_refused',(await route(settings.POST,jarA,builder,'',{},'https://evil.example')).status===403)
  check('route_builder_selected',(await route(settings.POST,jarA,builder)).status===200)
  check('route_foreign_agent_refused',(await route(settings.POST,jarA,{...builder,agentId:f.context.agents[1]})).status===404)
  const content={title:'Cookie route plan',purpose:'Test actual route',audience:'Fictional users',pages:[{key:'index',title:'Home',purpose:'Test'}],design:{style:'Clear',reference:null},features:[],architecture:'Static pages',steps:['Build','Check'],domain:{registrar:'strato',requestedName:null}}
  const input={projectId:projectA,conversationId:f.context.routeConversation,expectedRevisionId:null,content,idempotencyKey:'cookie-route-plan'}
  const forged=await route(plans.POST,jarA,{...input,userId:f.b.id})
  check('route_body_cannot_override_identity',forged.status===400&&forged.data.code==='INVALID_BODY')
  check('route_cross_project_save_refused',(await route(plans.POST,jarB,input)).status===404)
  const saved=await route(plans.POST,jarA,input)
  check('route_plan_saved',saved.status===201&&saved.data.currentRevision?.content.title==='Cookie route plan')
  const plan=saved.data,planId=plan.ref.planId,params={planId}
  check('route_generated_three_mockups',plan.designReview?.options.length===3)
  const again=await route(plans.POST,jarA,input)
  check('route_plan_save_idempotent',again.status===201&&again.data.currentRevision.revisionId===plan.currentRevision.revisionId)
  const read=await route(planRead.GET,jarA,undefined,'?projectId='+projectA,params)
  check('route_plan_read',read.status===200&&read.data.ref.planId===planId)
  check('route_foreign_plan_hidden',(await route(planRead.GET,jarB,undefined,'?projectId='+projectA,params)).status===404)
  const approval={projectId:projectA,revisionId:plan.currentRevision.revisionId,sha256:plan.currentRevision.sha256,idempotencyKey:'cookie-route-approval'}
  const missing=await route(planApprove.POST,jarA,approval,'',params)
  check('route_mockup_approval_required',missing.status===409&&missing.data.code==='MOCKUP_REVIEW_REQUIRED')
  const option=plan.designReview.options[0]
  const mockup=await route(mockupApprove.POST,jarA,{...approval,mockupId:option.id,mockupSha256:option.sha256,idempotencyKey:'cookie-route-mockup'},'',params)
  check('route_mockup_approved',mockup.status===200&&mockup.data.designReview.approved.mockupId===option.id)
  const approved=await route(planApprove.POST,jarA,{...approval,mockupDecisionId:mockup.data.designReview.approved.id},'',params)
  check('route_plan_approved_by_session_user',approved.status===200&&approved.data.approvedBy===f.a.id&&approved.data.sessionId===null)
  if(f.nextServer){
   // Only local expiry metadata is aged; real GoTrue JWT/refresh tokens are preserved.
   const name=jarA[0].name.replace(/\.\d+$/,'')
   const value=jarA.filter(c=>c.name===name||c.name.startsWith(name+'.')).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('')
   if(!value.startsWith('base64-'))throw Error('SSR_COOKIE_ENCODING_UNEXPECTED')
   const session=JSON.parse(Buffer.from(value.slice(7),'base64url').toString('utf8'))
   session.expires_at=Math.floor(Date.now()/1000)-60
   const stale='base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),before=refreshRequests
   const refreshed=await fetch(appBase+'/api/website-build-settings?projectId='+projectA,{headers:{cookie:name+'='+stale},redirect:'manual'})
   check('next_middleware_refresh_preserves_owner',refreshed.status===200&&(await refreshed.json()).builderAgentId===f.context.agents[0])
   check('next_middleware_called_real_refresh_endpoint',refreshRequests>before)
   check('next_middleware_returns_refreshed_cookie',refreshed.headers.getSetCookie().some(v=>v.startsWith(name)&&v.includes('Path=/')))
   check('refreshed_route_response_private',refreshed.headers.get('cache-control')==='private, no-store')
  }
 }finally{if(nextProcess){nextProcess.kill();await Promise.race([new Promise<void>(r=>nextProcess!.once('exit',()=>r())),new Promise<void>(r=>setTimeout(r,2000))])}await new Promise<void>(r=>server.close(()=>r()))}
}
main().then(()=>process.stdout.write(JSON.stringify({completed:true,checks}))).catch(error=>{
 process.stdout.write(JSON.stringify({completed:false,checks,failure:checks.some(c=>!c.passed)?String(error.message):'ROUTE_RUNNER_FAILED'}))
})
