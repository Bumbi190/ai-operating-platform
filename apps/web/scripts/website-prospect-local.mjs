// Attended local Etapp 1 environment. Real Auth/PostgREST/Storage, persistent owned volumes.
// No production database, no email delivery, no paid model credentials, no deployment commands.
import {spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {resolve,join,isAbsolute} from 'node:path'
import {parse} from 'dotenv'
import {startCmsStorageStack,fixtureEnv,openPrivateLocalDirectory,readPrivateLocalJson,localProspectRequest} from './customer-storage-stack.mjs'
import {bootstrapApplication} from './website-auth-application-local.mjs'

export async function startLocalProspect(args=process.argv.slice(2)) {
if(!args.includes('--start'))throw Error('Explicit --start required')
const option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined}
const requestedDirectory=option('--directory')
const directory=requestedDirectory&&requestedDirectory.replaceAll('/','\\')
if(!directory||!isAbsolute(directory))throw Error('Absolute local --directory required')
const harveyOrigin=option('--harvey-bridge-origin')
if(harveyOrigin){
  let u
  try{u=new URL(harveyOrigin)}catch{throw Error('HARVEY_BRIDGE_ORIGIN_INVALID')}
  if(u.protocol!=='https:'||!/^ai-operating-platform-[a-z0-9]+-bumbi190s-projects\.vercel\.app$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.port){
    throw Error('HARVEY_BRIDGE_ORIGIN_INVALID')
  }
}
if(args.includes('--scb-env')&&harveyOrigin)throw Error('SCB_ENV_AND_HARVEY_BRIDGE_MUTUALLY_EXCLUSIVE')
const web=fileURLToPath(new URL('../',import.meta.url)),appOrigin='http://127.0.0.1:56994'
const privateFiles=await openPrivateLocalDirectory(directory,{create:true})
try {
// This is the PUBLIC P-256 verifier only, never Harvey's branch-private signer.
// The fixed local file lives outside Git and is provided once by the owner after approval.
let harveyPublicJwk
if(harveyOrigin){
  try{
    const publicKey=await readPrivateLocalJson(privateFiles,'harvey-public-jwk.json')
    if(!publicKey||typeof publicKey!=='object'||Array.isArray(publicKey)||
       Object.keys(publicKey).sort().join(',')!=='crv,kty,x,y'||
       publicKey.kty!=='EC'||publicKey.crv!=='P-256'||
       typeof publicKey.x!=='string'||typeof publicKey.y!=='string')throw Error('PUBLIC_KEY_INVALID')
    harveyPublicJwk=JSON.stringify(publicKey)
  }catch{throw Error('HARVEY_PUBLIC_KEY_INVALID')}
}
const receiptPath=join(directory,'runtime-receipt.json')
let state=await readPrivateLocalJson(privateFiles,'runtime-private.json')
if(state&&(state.version!==1||state.appOrigin!==appOrigin||typeof state.password!=='string'||!/^[A-Za-z0-9_-]{38}$/.test(state.password)||typeof state.cronSecret!=='string'||!/^[a-f0-9]{64}$/.test(state.cronSecret)||typeof state.initialized!=='boolean'))throw Error('LOCAL_STATE_MISMATCH')
if(!state){state={version:1,appOrigin,password:randomBytes(28).toString('base64url'),cronSecret:randomBytes(32).toString('hex'),initialized:false};await privateFiles.write('runtime-private.json',JSON.stringify(state),{exclusive:true})}
const receipt={version:1,startedAt:new Date().toISOString(),appOrigin,browserOrigin:'http://localhost:56994',checks:[],schema:null,persistent:true,production:false,outreach:false,providerCredentials:false}
const check=(name,ok)=>{receipt.checks.push({name,passed:Boolean(ok)});if(!ok)throw Error(name)}
// Legacy key import is restricted to one dedicated file inside the held root.
const source=option('--scb-env')
if(source&&source!==join(directory,'scb.env'))throw Error('SCB_ENV_PATH_DENIED')
let scb
if(source){
  const text=await privateFiles.read('scb.env')
  if(text===null)throw Error('SCB_ENV_UNAVAILABLE')
  const values=parse(text)
  if(Object.keys(values).join(',')!=='SCB_API_KEY'||!values.SCB_API_KEY)throw Error('SCB_ENV_INVALID')
  scb=values.SCB_API_KEY
}
let stack,app,output,closing=false,workerTimer
const save=async()=>{await privateFiles.write('runtime-private.json',JSON.stringify(state,null,2));await privateFiles.write('runtime-receipt.json',JSON.stringify(receipt,null,2))}
async function close(){
  if(closing)return;closing=true;clearTimeout(workerTimer)
  try {if(app){app.kill();await new Promise(r=>setTimeout(r,500))}await stack?.close();await save()}
  finally {if(output&&!output.destroyed)await new Promise(r=>output.end(r));await privateFiles.close()}
}
process.on('SIGINT',()=>void close().then(()=>process.exit(0)))
process.on('SIGTERM',()=>void close().then(()=>process.exit(0)))
try{
  stack=await startCmsStorageStack(appOrigin,{privateFiles,persistentPath:join(directory,'stack-private.json'),applicationDatabase:true,gatewayPort:56993})
  state.supabaseUrl=stack.url;state.anonKey=stack.anonKey;state.serviceKey=stack.serviceKey;state.stackId=stack.id
  check('local_services_only',stack.url==='http://127.0.0.1:56993')
  if(!state.initialized){
    if(!state.users){
      state.users=[]
      for(const email of ['webbuilder-review@omnira.local','webbuilder-other@omnira.local']){
        const user=await localProspectRequest('create-user',{privateFiles,email,password:state.password,serviceKey:stack.serviceKey})
        state.users.push({id:user.id,email});await save()
      }
    }
    if(state.users.length!==2)throw Error('LOCAL_AUTH_SETUP_INCOMPLETE')
    const schemaReceipt={}
    receipt.schema=schemaReceipt
    const context=bootstrapApplication({sql:stack.sql,docker:stack.docker,check,receipt:schemaReceipt,a:state.users[0],b:state.users[1],asPostgres:true,storageReady:true})
    receipt.schema=schemaReceipt;state.context=context
    // Explicit local execution fixture. No production settings are read or changed.
    stack.sql("insert into public.platform_config(id,automation_paused,global_daily_sek,global_weekly_sek,global_monthly_sek) values(1,false,0,0,0) on conflict(id) do nothing;")
    stack.sql("notify pgrst, 'reload schema';")
    state.initialized=true;await save()
  }else{
    check('saved_prospect_schema_reopened',stack.sql("select to_regclass('public.website_prospects') is not null;")==='t')
    check('schedules_remain_inactive',stack.sql('select count(*) from cron.job where active;')==='0')
  }
  // Read only this one explicitly requested existing secret; never copy a production env file.
  receipt.scbKeyConfigured=Boolean(scb)
  const env={...fixtureEnv,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:stack.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:stack.anonKey,SUPABASE_SERVICE_ROLE_KEY:stack.serviceKey,
    WEBBUILDER_PROSPECTS_ENABLED:'true',WEBBUILDER_LOCAL_CAPTURE:'isolated-local',HB_LEADFINDER_SCB_PREVIEW_ENABLED:'true',H1_SPEND_GATE:'1',CRON_SECRET:state.cronSecret,...(scb?{SCB_API_KEY:scb}:{}),...(harveyOrigin?{WEBBUILDER_HARVEY_BRIDGE_ENABLED:'true',WEBBUILDER_HARVEY_BRIDGE_ORIGIN:harveyOrigin,WEBBUILDER_HARVEY_PUBLIC_JWK:harveyPublicJwk}:{})}
  output=privateFiles.log()
  output.once('error',()=>{receipt.appError='LOCAL_LOG_FAILED';void close()})
  app=spawn(process.execPath,[resolve(web,'../../node_modules/next/dist/bin/next'),'dev','-H','127.0.0.1','-p','56994'],{cwd:web,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
  app.stdout.pipe(output);app.stderr.pipe(output)
  app.once('error',()=>{receipt.appError='LOCAL_NEXT_START_FAILED';void close()})
  app.once('exit',code=>{if(!closing){receipt.appExit=code;void close()}})
  for(let n=0;n<90;n++){
    try{if(await localProspectRequest('ready',{privateFiles,expectedPid:app.exitCode===null?app.pid:undefined})){check('real_app_auth_gate',true);break}}catch{}
    if(n===89)throw Error('LOCAL_APP_NOT_READY')
    await new Promise(r=>setTimeout(r,500))
  }
  async function drain(){
    if(closing)return
    try{await localProspectRequest('drain',{privateFiles,expectedPid:app.exitCode===null?app.pid:undefined,cronSecret:state.cronSecret})}catch{receipt.workerError='LOCAL_DRAIN_FAILED'}
    if(!closing)workerTimer=setTimeout(()=>void drain(),3000)
  }
  void drain();await save()
  console.log('READY '+receipt.browserOrigin+'/build/prospects · persistent isolated local Auth/DB/Storage · no model or outreach credentials')
  console.log('Receipt: '+receiptPath)
}catch{receipt.failure='LOCAL_START_FAILED';console.error(receipt.failure);await close();process.exitCode=1}
} catch {await privateFiles.close();throw Error('LOCAL_START_FAILED')}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startLocalProspect().catch(()=>{console.error('LOCAL_START_FAILED');process.exitCode=1})
}
