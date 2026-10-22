import {spawnSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {createPrivilegedPublicationBrokerFixture} from './privileged-publication-broker-fixture'
import {createScopedScheduleFixtureClient} from './scoped-client-fixture'
import {createApprovedScheduleMediaScopeFixture} from './approved-media-scope-fixture'
import type {ApprovedScheduleSnapshot,ScheduleClaim} from './types'
import {expect,it,vi} from 'vitest'

// The SQL authority is exercised in the disposable database. The dispatch
// stop guard has its own tests and is kept out of this provider/RPC probe.
vi.mock('@/lib/governance/execution-dispatch',()=>({
 assertExecutionDispatchAllowed:async()=>{},isExecutionStopped:()=>false,
}))

import {runScheduleTick} from './worker'
import {MetaManualProvider} from '../publication/provider'

const container=process.env.OMNIRA_SCHEDULE_REPLAY_CONTAINER
const projectId=process.env.OMNIRA_SCHEDULE_REPLAY_PROJECT
const jobId=process.env.OMNIRA_SCHEDULE_REPLAY_JOB
const httpGateway=process.env.OMNIRA_SCHEDULE_REPLAY_HTTP_GATEWAY
const httpToken=process.env.OMNIRA_SCHEDULE_REPLAY_HTTP_TOKEN
const httpSubject=process.env.OMNIRA_SCHEDULE_REPLAY_SUBJECT
const enabled=container==='omnira-atlas-p1-cross-tree-replay'&&
 /^[0-9a-f-]{36}$/.test(projectId??'')&&/^[0-9a-f-]{36}$/.test(jobId??'')&&
 (!httpGateway||Boolean(httpToken)&&/^[0-9a-f-]{36}$/.test(httpSubject??''))

it.skipIf(!enabled)('runs the real scheduled worker with the restricted SQL role and fake Meta response',async()=>{
 const inspect=spawnSync('docker',['inspect','--format','{{.HostConfig.NetworkMode}}',container!],{encoding:'utf8'})
 expect(inspect.status).toBe(0)
 expect(inspect.stdout.trim()).toBe(httpGateway?'omnira-atlas-p1-cross-tree-replay-http-net':'none')
 vi.stubGlobal('fetch',()=>{throw Error('External network denied in isolated replay')})
 const calls:{name:string;args:Record<string,unknown>}[]=[]
 const allowed=new Set(['social_schedule_claim','social_schedule_authorize_write',
  'social_schedule_step','social_schedule_receipt','social_schedule_recover_checkpoint','social_schedule_peek'])
 const mediaDb=Object.freeze({}) as any
 let authorizedMedia:ReturnType<typeof createApprovedScheduleMediaScopeFixture>|null=null
 let claimedFromSql:ScheduleClaim|null=null
 let tokenReads=0,imageReads=0
 let providerCalls=0
 let activeClaim:Pick<ScheduleClaim,'jobId'|'claimId'|'version'>|null=null
 let publicationId:string|null=null
 let broker:ReturnType<typeof createPrivilegedPublicationBrokerFixture>|null=null
 const brokerKey=randomBytes(36).toString('base64url')
 const literal=(value:unknown)=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 const httpDb=httpGateway?createScopedScheduleFixtureClient({
  url:'https://schedule-fixture.invalid',
  publishableKey:'sb_publishable_fixture_http',
  expectedSubject:httpSubject!,
  getAccessToken:async()=>httpToken!,
  transport:async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
   if(url.origin!=='https://schedule-fixture.invalid'||!url.pathname.startsWith('/rest/v1/rpc/'))throw Error('Unreviewed HTTP endpoint')
   const headers=Object.fromEntries(new Headers(init?.headers).entries())
   const requestScript=`const q=JSON.parse(Buffer.from(process.argv[1],'base64').toString());fetch('http://rest:3000'+q.path,{method:q.method,headers:q.headers,body:q.body}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(e=>{console.error(e.message);process.exitCode=1})`
   const request=Buffer.from(JSON.stringify({path:url.pathname.replace('/rest/v1',''),method:init?.method,headers,body:init?.body})).toString('base64')
   const result=spawnSync('docker',['exec',httpGateway,'node','-e',requestScript,request],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024})
   if(result.status!==0)throw Error('Internal PostgREST request failed: '+result.stderr.trim().slice(0,500))
   const response=JSON.parse(result.stdout.trim())
   return new Response(response.body,{status:response.status,headers:{'content-type':'application/json'}})
  },
 }):null
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{
  if(!allowed.has(name)||Object.keys(args).some(key=>!/^p_[a-z_]+$/.test(key)))throw Error('Unreviewed worker RPC')
  calls.push({name,args})
  let outcome:{data:any;error:any}
  if(httpDb)outcome=await httpDb.rpc(name,args)
  else{
   const statement='SET ROLE social_schedule_full_publisher_fixture; SELECT to_jsonb(public.'+
    name+'('+Object.entries(args).map(([key,value])=>key+'=>'+literal(value)).join(',')+'));'
   const result=spawnSync('docker',['exec','-i',container!,'psql','-X','-q','-A','-t',
     '-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],
     {input:'\\set VERBOSITY verbose\n'+statement,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})
   if(result.status!==0){
    console.error('ISOLATED_WORKER_RPC_DENIED',name,result.stderr.trim().slice(0,1200))
    return {data:null,error:{code:result.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??'XX000',message:result.stderr}}
   }
   outcome={data:JSON.parse(result.stdout.trim()||'null'),error:null}
  }
  if(!outcome.error&&name==='social_schedule_claim'&&outcome.data){
   claimedFromSql=outcome.data as ScheduleClaim
   activeClaim={jobId:claimedFromSql.jobId,claimId:claimedFromSql.claimId,version:claimedFromSql.version}
  }
  if(!outcome.error&&name==='social_schedule_step'&&outcome.data?.claim){
   const claim=outcome.data.claim as ScheduleClaim
   activeClaim={jobId:claim.jobId,claimId:claim.claimId,version:claim.version}
   if(outcome.data.publication?.id)publicationId=outcome.data.publication.id
  }
  // Grant only after the actual SQL authorize_write RPC, never from
  // caller-selected project, asset or account fields.
  if(!outcome.error&&name==='social_schedule_authorize_write'&&outcome.data&&!authorizedMedia){
   if(!claimedFromSql)throw Error('No SQL claim to bind media access')
   authorizedMedia=createApprovedScheduleMediaScopeFixture(
    outcome.data as ApprovedScheduleSnapshot,{
     expectedProjectId:claimedFromSql.snapshot.projectId,
     leaseExpiresAt:claimedFromSql.leaseExpiresAt,mediaDb,
     resolveCredential:async(project,channel)=>{
      tokenReads++
      return {projectId:project,channel,bindingId:'20000000-0000-4000-8000-000000000018',
       accountId:'12345',token:'synthetic-only',apiBase:'https://graph.facebook.com/v21.0'}
     },
     verifyImage:async(imageDb)=>{
      expect(imageDb).toBe(mediaDb)
      imageReads++
      return {bytes:new Uint8Array(),width:600,height:600}
     },
    })
  }
  return outcome
 }} as any
 vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','true')
 vi.stubEnv('SOCIAL_SCHEDULE_PROJECT_IDS',projectId!)
 // This privileged fixture object owns the real synthetic Meta credential.
 // The actual TypeScript worker receives only a non-Meta opaque reference.
 const privateProvider=new MetaManualProvider(async(url,init)=>{
  expect(url).toBe('https://graph.facebook.com/v21.0/12345/photos')
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer synthetic-only')
  providerCalls++
  return Response.json({post_id:'12345_99999'})
 })
 broker=createPrivilegedPublicationBrokerFixture({
  brokerKey,expectedProjectId:projectId!,mediaDb,provider:privateProvider,
  now:()=>Date.now(),
  resolveCredential:async(project,channel)=>{
   if(!authorizedMedia)throw Error('Privileged token requested before SQL authorization')
   return authorizedMedia.resolveCredential(project,channel)
  },
  verifyImage:async(imageDb,project,asset)=>{
   if(!authorizedMedia)throw Error('Privileged image requested before SQL authorization')
   return authorizedMedia.verifyImage(imageDb,project,asset)
  },
  authorizeClaim:async(claim)=>{
   const auth=await db.rpc('social_schedule_authorize_write',{
    p_claim:claim,p_project_ids:[projectId!]})
   const receipt=await db.rpc('social_schedule_receipt',{p_input:{jobId:claim.jobId}})
   if(auth.error||receipt.error||!auth.data||!receipt.data?.claim||
     receipt.data.claim.claimId!==claim.claimId||
     receipt.data.claim.version!==claim.version)throw Error('BROKER_SQL_AUTHORITY_DENIED')
   return {snapshot:auth.data as ApprovedScheduleSnapshot,
    leaseExpiresAt:receipt.data.claim.leaseExpiresAt as string,claim}
  },
 })
 const provider=new MetaManualProvider(async(url,init)=>{
  expect(url).toBe('https://graph.facebook.com/v21.0/12345/photos')
  expect(init.method).toBe('POST')
  expect(new Headers(init.headers).get('authorization'))
   .toBe('Bearer broker-opaque-non-meta-reference')
  if(!broker||!activeClaim||!publicationId)throw Error('Broker claim unavailable')
  const values=init.body as URLSearchParams
  return broker.handle(new Request('https://broker-fixture.invalid/v1/facebook-photo',{
   method:'POST',headers:{authorization:'Bearer '+brokerKey,'content-type':'application/json'},
   body:JSON.stringify({claim:activeClaim,publicationId,
    text:values.get('message'),imageUrl:values.get('url')}),
  }))
 })
 const result=await runScheduleTick(db,{workerId:'isolated_worker',now:new Date().toISOString(),dryRun:false},{
  provider,now:()=>Date.now(),
  verifyImage:async(imageDb,project,asset)=>{
   if(!authorizedMedia)throw Error('Media access attempted before SQL authorization')
   return authorizedMedia.verifyImage(imageDb,project,asset)
  },
  // The worker sees this unusable reference, never the private Meta token.
  resolveCredential:async(project,channel)=>{
   if(!authorizedMedia)throw Error('Account reference requested before SQL authorization')
   const snapshot=claimedFromSql?.snapshot
   if(!snapshot||project!==snapshot.projectId||channel!==snapshot.item.channel)
    throw Error('Account reference scope denied')
   return {projectId:project,channel,accountId:snapshot.item.accountId,
    bindingId:snapshot.item.bindingId,token:'broker-opaque-non-meta-reference',
    apiBase:'https://graph.facebook.com/v21.0'}
  },
 },mediaDb)
 expect(result).toMatchObject({mode:'execute',jobId,result:'published'})
 expect(providerCalls).toBe(1)
 expect(tokenReads).toBe(1)
 expect(imageReads).toBe(2)
 expect(authorizedMedia).not.toBeNull()
 expect(broker).not.toBeNull()
 // The signed SQL claim cannot be re-used for a second provider call.
 const repeat=await broker!.handle(new Request('https://broker-fixture.invalid/v1/facebook-photo',{
  method:'POST',headers:{authorization:'Bearer '+brokerKey,'content-type':'application/json'},
  body:JSON.stringify({claim:activeClaim,publicationId,text:'Synthetic caption',
   imageUrl:'https://app.omniraos.se/api/social-publication-media?publicationId='+publicationId+'&key='+'a'.repeat(43)}),
 }))
 expect(repeat.status).toBe(403)
 expect(providerCalls).toBe(1)
 // Even after the successful simulated post, the scoped broker cannot
 // be used for another project or an unrelated image/account.
 const scoped=authorizedMedia!
 await expect(scoped.resolveCredential('10000000-0000-4000-8000-000000000099','facebook'))
  .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 await expect(scoped.resolveCredential(projectId!,'instagram'))
  .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 await expect(scoped.verifyImage(mediaDb,projectId!,{
   id:'30000000-0000-4000-8000-000000000099',sha256:'e'.repeat(64),
 })).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 expect(tokenReads).toBe(1)
 expect(imageReads).toBe(2)
 expect(providerCalls).toBe(1)
 expect(calls.map(call=>call.name)).toEqual(expect.arrayContaining([
  'social_schedule_claim','social_schedule_authorize_write','social_schedule_step','social_schedule_receipt',
 ]))
 expect(calls.filter(call=>call.name==='social_schedule_step').map(call=>(call.args.p_step as {action:string}).action))
  .toEqual(['prepare','claim_create','complete'])
 vi.unstubAllGlobals()
 vi.unstubAllEnvs()
},30000)
