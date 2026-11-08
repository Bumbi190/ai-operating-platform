// Run with Node 22: --test, or --serve/--stop with an optional --port 19996 or 19997.
// The two enabled dealers and the opted-out dealer are fictional, with fresh
// accounts in an isolated PostgreSQL/GoTrue/PostgREST stack on every run.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomBytes,randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {constants} from 'node:fs'
import {lstat,mkdir,open,readFile,rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import net from 'node:net'
import {homedir} from 'node:os'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {createClient} from '@supabase/supabase-js'
import {closeHttp,fixtureEnv,listenLocally,matchesOrigin,startDealerStack} from './dealer-customer-stack.mjs'

const root=fileURLToPath(new URL('../../../',import.meta.url)),web=path.join(root,'apps/web')
const primaryPort=19996
const stateHome=process.env.LOCALAPPDATA||path.join(homedir(),'.local','state')

export function pilotTarget(args,home=stateHome) {
  const [mode,flag,value]=args
  const interactive=mode==='--serve'||mode==='--stop'
  const explicitPort=interactive&&args.length===3&&flag==='--port'&&['19996','19997'].includes(value)
  if(!(args.length===1&&(interactive||mode==='--test'))&&!explicitPort){
    throw Error('Usage: --test | --serve [--port 19996|19997] | --stop [--port 19996|19997]')
  }
  const port=explicitPort?Number(value):primaryPort
  const folder=port===primaryPort?'kundadmin-prov':'kundadmin-prov-'+port
  const qaPath=path.join(home,'Omnira','WebStudio',folder)
  return {mode,port,localUrl:'http://127.0.0.1:'+port,qaPath,
    accessFile:path.join(qaPath,'Testinloggning.txt'),controlFile:path.join(qaPath,'aktiv.json')}
}

// Hold both exclusive handles until shutdown. Never overwrite an earlier guide
// or remove a replacement file when releasing a partially acquired pair.
export async function reservePilotFiles({qaPath,controlFile,accessFile}) {
  await mkdir(qaPath,{recursive:true,mode:0o700})
  let control,access
  async function releaseFile(file,name) {
    if(!file)return
    try{
      const held=await file.stat({bigint:true})
      const current=await lstat(name,{bigint:true})
      if(held.dev===current.dev&&held.ino===current.ino)await rm(name)
    }catch(error){if(error.code!=='ENOENT')throw error}
    finally{await file.close()}
  }
  async function release() {
    try{await releaseFile(access,accessFile)}finally{await releaseFile(control,controlFile)}
  }
  try{
    control=await open(controlFile,'wx+',0o600)
    access=await open(accessFile,'wx',0o600)
    return {control,access,release}
  }catch(error){
    await release()
    if(error.code==='EEXIST'){
      error.message='Private trial files already exist in '+qaPath+
        '. If this trial has stopped, move the remaining files to a private backup folder and retry.'
    }
    throw error
  }
}

// Both peers keep the original file open. A replaced pathname cannot stop a
// later run. Separate one-byte flags also make simultaneous stop requests safe.
const readyControl='{"protocol":2,"request":0,"ack":0}\n'
const requestOffset=readyControl.indexOf('0'), ackOffset=readyControl.lastIndexOf('0')
const one=Buffer.from('1')
async function flagIsSet(file,offset) {
  const data=Buffer.alloc(1)
  const {bytesRead}=await file.read(data,0,1,offset)
  return bytesRead===1&&data[0]===one[0]
}

export async function createPilotControl(file,stop) {
  await file.writeFile(readyControl)
  const abort=new AbortController()
  const task=(async()=>{
    while(!abort.signal.aborted){
      await delay(500,undefined,{signal:abort.signal})
      if(await flagIsSet(file,requestOffset)){
        await file.write(one,0,1,ackOffset)
        stop()
        return
      }
    }
  })().catch(error=>{
    if(error.name!=='AbortError'){console.error('Private trial control failed');stop()}
  })
  return {close:async()=>{abort.abort();await task}}
}

// Old, already-running servers understand only this POST. Use a direct IPv4
// socket so its actual peer is checked before sending the short-lived bearer.
// No proxy, DNS, redirection or endpoint from a file is involved.
async function stopLegacyPilot(port,token) {
  if(port!==19996&&port!==19997)throw Error('Invalid legacy trial port')
  const loopback='127.0.0.1'
  const socket=net.createConnection({host:loopback,localAddress:loopback,port,family:4,signal:AbortSignal.timeout(5000)})
  try{
    await once(socket,'connect')
    if(socket.remoteAddress!==loopback||socket.localAddress!==loopback||socket.remotePort!==port)throw Error('Invalid legacy trial peer')
    socket.write('POST /__pilot_stop HTTP/1.1\r\nHost: 127.0.0.1:'+port+'\r\nAuthorization: Bearer '+token+
      '\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
    let firstLine=''
    for await(const bytes of socket){
      firstLine+=bytes.toString('latin1',0,128-firstLine.length)
      if(firstLine.includes('\r\n')||firstLine.length>=128)break
    }
    if(!/^HTTP\/1\.[01] 204(?: [^\r\n]*)?\r\n/.test(firstLine))throw Error('The legacy trial did not acknowledge shutdown')
  }finally{socket.destroy()}
}

// A listener that reuses a crashed pilot's port can see that dead run's bearer.
// Other runs have independent credentials. Such a listener cannot confirm a stop
// with HTTP 204 alone: the original private control file must also be retired.
async function confirmLegacyCleanup(controlFile,original) {
  const until=performance.now()+3000
  do{
    try{
      const current=await lstat(controlFile,{bigint:true})
      if(current.dev!==original.dev||current.ino!==original.ino)return
    }catch(error){
      if(error.code==='ENOENT')return
      if(error.code!=='EBUSY'&&error.code!=='EPERM')throw error
    }
    await delay(75)
  }while(performance.now()<until)
  throw Error('The legacy trial did not retire its private control file')
}

export async function requestPilotStop({controlFile,port}) {
  const file=await open(controlFile,constants.O_RDWR|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0))
  let original
  try{
    const info=await file.stat({bigint:true}), current=await lstat(controlFile,{bigint:true})
    if(!info.isFile()||!current.isFile()||current.ino!==info.ino||current.dev!==info.dev||info.size>180n||
       (process.getuid&&(info.uid!==BigInt(process.getuid())||(info.mode&0o077n)!==0n)))throw Error('Invalid private trial control')
    const data=Buffer.alloc(181)
    const {bytesRead}=await file.read(data,0,data.length,0)
    const record=data.toString('utf8',0,bytesRead)
    if(/^\{"protocol":2,"request":[01],"ack":[01]\}\n$/.test(record)){
      await file.write(one,0,1,requestOffset)
      const until=Date.now()+5000
      do{if(await flagIsSet(file,ackOffset))return;await delay(100)}while(Date.now()<until)
      throw Error('The local trial did not acknowledge shutdown')
    }
    const old=/^\{"runId":"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}","token":"([0-9a-f]{64})"\}$/.exec(record)
    if(!old)throw Error('Invalid private trial control')
    const age=Date.now()-Number(info.mtimeMs)
    if(age< -5000||age>125*60000)throw Error('Expired legacy trial control')
    original=info
    await stopLegacyPilot(port,old[1])
  }finally{await file.close()}
  // Release our file handle before waiting for Windows to complete deletion.
  await confirmLegacyCleanup(controlFile,original)
}

const sqlLiteral=x=>"'"+String(x).replaceAll("'","''")+"'"
const syntheticClient=(url,key)=>createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}})
const dealers=[
  {key:'A',slug:'bjorkglantan',brand:'Björkgläntans Demobilar',name:'Skog E',price:429000,year:2025,mileage:360,fuel:'El',photo:'concept-green.webp'},
  {key:'B',slug:'strandvik',brand:'Strandvik Motor',name:'Kust Touring',price:369000,year:2024,mileage:1850,fuel:'Hybrid',photo:'concept-silver.webp'},
  {key:'C',slug:'ekbacken',brand:'Ekbackens Demobilar'},
]
function assertResult(result,step) {
  if(result.error)throw Error(step+' failed ('+(result.error.code||result.error.status||'request')+')')
  return result.data
}
async function seed(stack) {
  stack.sql(await readFile(path.join(root,'docs/sql/web-studio-customer-admin-pilot.sql'),'utf8'))
  const admin=syntheticClient(stack.url,stack.serviceKey),accounts={}
  for(const dealer of dealers) {
    const email=dealer.slug+'-'+randomUUID().slice(0,8)+'@example.test',password=randomBytes(18).toString('base64url')+'!7'
    const user=assertResult(await admin.auth.admin.createUser({email,password,email_confirm:true}),'Creating test account').user
    assert.match(user.id,/^[0-9a-f-]{36}$/)
    stack.sql('insert into dealer_pilot.sites(slug,brand,admin_enabled) values ('+
      [sqlLiteral(dealer.slug),sqlLiteral(dealer.brand),dealer.photo?'true':'false'].join(',')+');'+
      'insert into dealer_pilot.members(site_slug,user_id) values ('+sqlLiteral(dealer.slug)+','+sqlLiteral(user.id)+');')
    accounts[dealer.key]={email,password,slug:dealer.slug,vehicle:dealer.photo?randomUUID():null}
  }
  stack.sql("notify pgrst,'reload schema'")
  // PostgREST rebuilds its RPC schema asynchronously after NOTIFY.
  for(let attempt=0;attempt<35;attempt++){
    const result=await syntheticClient(stack.url,stack.anonKey).rpc('dealer_pilot_catalog',{p_slug:dealers[0].slug})
    if(!result.error)break
    if(result.error.code!=='PGRST202'||attempt===34)assertResult(result,'Loading pilot schema')
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  for(const dealer of dealers.filter(d=>d.photo)) {
    const {email,password,vehicle}=accounts[dealer.key],owner=syntheticClient(stack.url,stack.anonKey)
    assertResult(await owner.auth.signInWithPassword({email,password}),'Signing in fixture merchant')
    const bytes=await readFile(path.join(web,'e2e/website-catalog/assets/premium',dealer.photo))
    const hash=assertResult(await owner.rpc('dealer_pilot_put_photo',{p_slug:dealer.slug,p_bytes:bytes.toString('base64')}),'Uploading original fixture photo')
    assert.match(hash,/^[a-f0-9]{64}$/)
    const p_content={name:dealer.name,price:dealer.price,year:dealer.year,mileage:dealer.mileage,fuel:dealer.fuel,sold:false,photos:[hash]}
    const base={p_slug:dealer.slug,p_vehicle:vehicle,p_revision:null}
    const saved=assertResult(await owner.rpc('dealer_pilot_edit',{...base,p_version:0,p_action:'save',p_content}),'Saving dealership sample')
    assertResult(await owner.rpc('dealer_pilot_edit',{...base,p_version:saved.version,p_action:'publish',p_content:null}),'Publishing dealership sample')
  }
  return accounts
}

async function run() {
  const target=pilotTarget(process.argv.slice(2))
  const {mode,port,accessFile}=target
  if(mode==='--stop'){
    await requestPilotStop(target)
    console.log('Shutdown requested for the current customer-admin rehearsal.')
    return
  }
  process.env.TSX_TSCONFIG_PATH=path.join(web,'e2e/website-cinematic/tsconfig.json')
  const {require:loadTypeScript}=await import('tsx/cjs/api')
  const {handleDealerPilot:handle}=loadTypeScript('../lib/website-build/customer-admin/http.ts',import.meta.url)
  assert.equal(typeof handle,'function','Customer-admin HTTP handler is missing')
  let origin,stack,child,accounts,expiry,files,pilotControl,stopping=false
  let signalStop
  const stopped=new Promise(resolve=>{signalStop=resolve})
  const stop=()=>{stopping=true;signalStop();if(child&&!child.killed)child.kill()}
  let activePosts=0
  const server=createServer(async(req,res)=>{
    let counted=false
    try{
      if(!origin||!matchesOrigin(req,origin))return res.writeHead(403).end()
      const url=new URL(req.url,origin)
      if(url.origin!==origin)return res.writeHead(403).end()
      if(!accounts)return res.writeHead(503,{'cache-control':'no-store'}).end('Provet startar.')
      if(req.method==='GET'&&url.pathname==='/')return res.writeHead(303,{location:'/hall/bjorkglantan','cache-control':'no-store'}).end()
      if(!['GET','HEAD','POST'].includes(req.method))return res.writeHead(405,{allow:'GET, HEAD, POST','connection':'close'}).end()
      let body
      if(req.method==='POST'){
        if(req.headers.origin!==origin)return res.writeHead(403,{'connection':'close'}).end()
        if(Number(req.headers['content-length'])>10*1024*1024)return res.writeHead(413,{'connection':'close'}).end()
        if(activePosts>=4)return res.writeHead(429,{'connection':'close'}).end()
        activePosts++;counted=true
        // A request with no eligible session must never need to buffer uploaded photos.
        // The route reads with its own per-form limit, after origin and entitlement checks.
        const stream=req.iterator({destroyOnReturn:false})
        body=new ReadableStream({
          async pull(controller){const {value,done}=await stream.next();if(done)controller.close();else controller.enqueue(value)},
          async cancel(){await stream.return()},
        },{highWaterMark:0})
      }
      const request=new Request(url,{method:req.method,headers:req.headers,body,duplex:'half'})
      const result=await handle(request,{url:stack.url,anonKey:stack.anonKey,origin})
      const headers=Object.fromEntries(result.headers)
      const cookies=result.headers.getSetCookie()
      if(cookies.length)headers['set-cookie']=cookies
      if(!req.complete)headers.connection='close'
      res.writeHead(result.status,headers)
      res.end(req.method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()))
    }catch(error){
      if(!res.headersSent)res.writeHead(error instanceof RangeError?413:500,{'cache-control':'no-store','connection':'close'})
      res.end()
    }finally{if(counted)activePosts--}
  })
  server.requestTimeout=30000
  process.once('SIGINT',stop);process.once('SIGTERM',stop)
  try{
    origin=await listenLocally(server,mode==='--serve'?port:0)
    if(mode==='--serve'){
      files=await reservePilotFiles(target)
      pilotControl=await createPilotControl(files.control,stop)
    }
    stack=await startDealerStack(origin)
    if(stopping)return
    accounts=await seed(stack)
    if(stopping)return
    if(mode==='--test'){
      const proof=await readFile(path.join(root,'docs/verification/web-studio/web-studio-customer-admin-pilot-proof.sql'),'utf8')
      assert.match(stack.sql(proof),/PASS: dealer pilot content/,'SQL isolation and revision proof did not finish')
      console.log('PASS local SQL proof: drafts, publications, history, photo access, concurrent-version guards and dealer isolation')
      const env={...fixtureEnv,DEALER_PILOT_URL:origin,DEALER_PILOT_SUPABASE_URL:stack.url,DEALER_PILOT_ANON_KEY:stack.anonKey}
      for(const [key,account] of Object.entries(accounts)){
        env['DEALER_PILOT_'+key+'_EMAIL']=account.email
        env['DEALER_PILOT_'+key+'_PASSWORD']=account.password
        if(account.vehicle)env['DEALER_PILOT_'+key+'_VEHICLE']=account.vehicle
      }
      child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test',
        '--config=apps/web/e2e/website-customer-admin/playwright.config.ts','--reporter=line'],{cwd:root,env,stdio:'inherit',windowsHide:true})
      const timeout=setTimeout(()=>child.kill(),600000)
      try{const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
        assert.equal(status,0,'Customer-admin browser test run failed')
      }finally{clearTimeout(timeout)}
    }else{
      const guide=['WEB STUDIO · Privat kundadminprov','Gäller denna fiktiva visning på den här datorn.','',
        ...dealers.flatMap(d=>[d.brand+(d.photo?'':' (utan Kundadmin)'),origin+'/hall/'+d.slug+'/login',
          'E-post: '+accounts[d.key].email,'Lösenord: '+accounts[d.key].password,'']),
        'Provet stängs efter två timmar. Vid omstart skapas nya konton och nytt exempellager.'].join('\n')
      await files.access.writeFile(guide+'\n')
      console.log('READY '+origin+'/hall/bjorkglantan')
      console.log('Local test account instructions: '+accessFile)
      console.log('Stop with --stop'+(port===primaryPort?'':' --port '+port)+'. Automatic cleanup in two hours.')
      expiry=setTimeout(stop,2*3600*1000)
      await stopped
    }
  }finally{
    clearTimeout(expiry)
    process.off('SIGINT',stop);process.off('SIGTERM',stop)
    // Reserve the fixed listener until its owning credentials and database are removed.
    accounts=null
    try{
      try{await pilotControl?.close()}finally{await files?.release()}
    }finally{
      try{await stack?.close()}finally{await closeHttp(server)}
    }
  }
}
if(process.argv[1]&&path.relative(fileURLToPath(import.meta.url),path.resolve(process.argv[1]))===''){
  run().catch(error=>{console.error(error.message);process.exitCode=1})
}
