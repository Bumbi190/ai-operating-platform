import {spawnSync} from 'node:child_process'
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
const enabled=container==='omnira-atlas-p1-cross-tree-replay'&&
 /^[0-9a-f-]{36}$/.test(projectId??'')&&/^[0-9a-f-]{36}$/.test(jobId??'')&&
 (!httpGateway||Boolean(httpToken))

it.skipIf(!enabled)('runs the real scheduled worker with the restricted SQL role and fake Meta response',async()=>{
 const inspect=spawnSync('docker',['inspect','--format','{{.HostConfig.NetworkMode}}',container!],{encoding:'utf8'})
 expect(inspect.status).toBe(0)
 expect(inspect.stdout.trim()).toBe(httpGateway?'omnira-atlas-p1-cross-tree-replay-http-net':'none')
 vi.stubGlobal('fetch',()=>{throw Error('External network denied in isolated replay')})
 const calls:{name:string;args:Record<string,unknown>}[]=[]
 const allowed=new Set(['social_schedule_claim','social_schedule_authorize_write',
  'social_schedule_step','social_schedule_receipt','social_schedule_recover_checkpoint','social_schedule_peek'])
 const literal=(value:unknown)=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 const db={rpc:async(name:string,args:Record<string,unknown>)=>{
  if(!allowed.has(name)||Object.keys(args).some(key=>!/^p_[a-z_]+$/.test(key)))throw Error('Unreviewed worker RPC')
  calls.push({name,args})
  const statement='SET ROLE social_schedule_full_publisher_fixture; SELECT to_jsonb(public.'+
   name+'('+Object.entries(args).map(([key,value])=>key+'=>'+literal(value)).join(',')+'));'
  const requestScript=`const q=JSON.parse(Buffer.from(process.argv[1],'base64').toString());fetch('http://rest:3000/rpc/'+q.name,{method:'POST',headers:{Authorization:'Bearer '+q.token,'Content-Type':'application/json'},body:JSON.stringify(q.args)}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(e=>{console.error(e.message);process.exitCode=1})`
  const request=Buffer.from(JSON.stringify({name,args,token:httpToken})).toString('base64')
  const result=httpGateway
   ?spawnSync('docker',['exec',httpGateway,'node','-e',requestScript,request],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024})
   :spawnSync('docker',['exec','-i',container!,'psql','-X','-q','-A','-t',
    '-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],
    {input:'\\set VERBOSITY verbose\n'+statement,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})
  if(httpGateway&&result.status===0){
   const response=JSON.parse(result.stdout.trim())
   if(response.status>=400){const error=JSON.parse(response.body);return {data:null,error:{code:error.code??'XX000',message:error.message??response.body}}}
   return {data:JSON.parse(response.body||'null'),error:null}
  }
  if(result.status!==0){
   console.error('ISOLATED_WORKER_RPC_DENIED',name,result.stderr.trim().slice(0,1200))
   return {data:null,error:{code:result.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??'XX000',message:result.stderr}}
  }
  return {data:JSON.parse(result.stdout.trim()||'null'),error:null}
 }} as any
 vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','true')
 vi.stubEnv('SOCIAL_SCHEDULE_PROJECT_IDS',projectId!)
 let posts=0
 const provider=new MetaManualProvider(async(url,init)=>{
  expect(url).toBe('https://graph.facebook.com/v21.0/12345/photos')
  expect(init.method).toBe('POST')
  posts++
  return Response.json({post_id:'12345_99999'})
 })
 const mediaDb={} as any
 const result=await runScheduleTick(db,{workerId:'isolated_worker',now:new Date().toISOString(),dryRun:false},{
  provider,now:()=>Date.now(),verifyImage:async(imageDb)=>{
   expect(imageDb).toBe(mediaDb)
   return {bytes:new Uint8Array(),width:600,height:600}
  },
  resolveCredential:async()=>({projectId:projectId!,channel:'facebook',bindingId:'20000000-0000-4000-8000-000000000018',
   accountId:'12345',token:'synthetic-only',apiBase:'https://graph.facebook.com/v21.0'}),
 },mediaDb)
 expect(result).toMatchObject({mode:'execute',jobId,result:'published'})
 expect(posts).toBe(1)
 expect(calls.map(call=>call.name)).toEqual(expect.arrayContaining([
  'social_schedule_claim','social_schedule_authorize_write','social_schedule_step','social_schedule_receipt',
 ]))
 expect(calls.filter(call=>call.name==='social_schedule_step').map(call=>(call.args.p_step as {action:string}).action))
  .toEqual(['prepare','claim_create','complete'])
 vi.unstubAllGlobals()
 vi.unstubAllEnvs()
},30000)
