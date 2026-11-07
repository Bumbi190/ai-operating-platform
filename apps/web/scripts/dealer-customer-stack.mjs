// Only used by the standalone customer-admin rehearsal. It never opens a hosted database.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createHmac,randomBytes,randomUUID} from 'node:crypto'
import {createServer as httpServer,request as httpRequest} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import {createServer as tcpServer} from 'node:net'
import {freemem,tmpdir} from 'node:os'
import {REFERENCE_TEST_IMAGES,assertReferenceLocalConfig,cleanupReferenceResources} from './reference-local-stack.mjs'

export const fixtureEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>
  /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programdata|playwright_browsers_path)$/i.test(key)))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const sqlLiteral=value=>"'"+value.replaceAll("'","''")+"'"
const byteLimit=1024*1024 // Three normalised 180 kB WEBPs, base64-encoded, plus their metadata.

async function bodyBytes(req) {
  if (Number(req.headers['content-length'])>byteLimit) throw RangeError('Body exceeds 10 MiB')
  let size=0
  const parts=[]
  for await(const chunk of req.iterator({destroyOnReturn:false})) {
    size+=chunk.length
    if(size>byteLimit) throw RangeError('Body exceeds 10 MiB')
    parts.push(chunk)
  }
  return parts.length?Buffer.concat(parts):undefined
}

export async function listenLocally(server,port=0) {
  await new Promise((resolve,reject)=>{
    server.once('error',reject)
    server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve()})
  })
  return 'http://127.0.0.1:'+server.address().port
}

export function matchesOrigin(req,origin) {
  return req.headers.host===new URL(origin).host && /^\/(?!\/)/.test(req.url||'') && !/[\\\r\n]/.test(req.url)
}

export async function closeHttp(server) {
  if(!server?.listening) return
  const closed=new Promise(resolve=>server.close(resolve))
  server.closeAllConnections()
  await closed
}

// Windows Docker drops published ports on a strictly internal network. Use the
// owned PostgreSQL Alpine container's nc, reached over an OS-local pipe, to the
// two fixed upstreams. The browser cannot open either raw service over TCP.
async function serviceRelay(service,port,dockerPrefix,dbContainer) {
  const directory=process.platform==='win32'?null:await mkdtemp(path.join(tmpdir(),'omnira-dlr-'))
  const socketPath=directory?path.join(directory,'relay.sock'):'\\\\.\\pipe\\omnira-customer-'+randomUUID()
  const active=new Map()
  const server=tcpServer(socket=>{
    if(active.size>=16){socket.destroy();return}
    const remote=spawn('docker',[...dockerPrefix,'exec','-i',dbContainer,'busybox','nc',service,String(port)],{
      env:fixtureEnv,windowsHide:true,stdio:['pipe','pipe','ignore'],
    })
    active.set(socket,remote)
    const end=()=>{
      if(!active.delete(socket))return
      socket.destroy();remote.stdin.destroy();remote.stdout.destroy()
      if(remote.exitCode===null)remote.kill()
    }
    socket.on('error',end);socket.on('close',end)
    remote.on('error',end);remote.on('exit',()=>socket.end())
    remote.stdin.on('error',end);remote.stdout.on('error',end)
    socket.setTimeout(25000,end)
    socket.pipe(remote.stdin);remote.stdout.pipe(socket)
  })
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,()=>{server.off('error',reject);resolve()})})
  }catch(error){if(directory)await rm(directory,{recursive:true,force:true});throw error}
  function exchange(endpoint,method='GET',headers={},body=undefined,timeout=20000){
    return new Promise((resolve,reject)=>{
      const request=httpRequest({socketPath,path:endpoint,method,headers,agent:false,signal:AbortSignal.timeout(timeout)},async response=>{
        try{
          let size=0
          const chunks=[]
          for await(const chunk of response){
            size+=chunk.length
            if(size>4*1024*1024)throw Error('Oversized local service response')
            chunks.push(chunk)
          }
          resolve({status:response.statusCode,headers:response.headers,bytes:Buffer.concat(chunks)})
        }catch(error){reject(error)}
      })
      request.once('error',reject);request.end(body)
    })
  }
  return {exchange,close:async()=>{
    const closed=new Promise(resolve=>server.close(resolve))
    for(const [socket,remote] of active){socket.destroy();remote.kill()}
    await closed
    if(directory)await rm(directory,{recursive:true,force:true})
  }}
}

async function waitHealthy(relay,endpoint,label) {
  const until=Date.now()+30000
  while(Date.now()<until){
    try{const reply=await relay.exchange(endpoint,'GET',{},undefined,1500);if(reply.status===200)return}catch{}
    await sleep(240)
  }
  throw Error(label+' failed to become ready')
}

export async function startDealerStack(siteOrigin) {
  assertReferenceLocalConfig({mode:'isolated-local',url:siteOrigin})
  if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT) throw Error('Unset Docker endpoint overrides for this local-only rehearsal')
  if(freemem()<1536*1024**2)throw Error('1.5 GiB free host RAM required for the bounded dealer pilot')
  const id='omnira-customer-admin-'+randomUUID(),label='omnira.customer.admin.fixture'
  const names=['db','auth','rest'].map(service=>id+'-'+service)
  const password=randomBytes(32).toString('hex'),secret=randomBytes(48).toString('hex')
  const q=sqlLiteral
  const dockerPrefix=[]
  function docker(args,input,extra={}) {
    const result=spawnSync('docker',[...dockerPrefix,...args],{input,encoding:'utf8',timeout:30000,maxBuffer:2**20,
      env:{...fixtureEnv,...extra},windowsHide:true})
    if(result.status!==0){
      const brief=(result.stderr||result.error?.message||'failed').replaceAll(secret,'[secret]').replaceAll(password,'[secret]')
      throw Error('Dealer fixture Docker '+args[0]+': '+brief.slice(0,450))
    }
    return result.stdout.trim()
  }
  const context=docker(['context','show'])
  assert.match(context,/^[a-zA-Z0-9_.-]+$/)
  const endpoint=docker(['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'])
  assert(/^unix:\/\/\/(?!\/)[^\r\n]+$/.test(endpoint)||/^npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9._-]+$/.test(endpoint),'Local Docker engine required')
  dockerPrefix.push('--context',context)
  const sql=text=>docker(['exec','-i',names[0],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],text)
  function token(role){
    const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
    const issued=Math.floor(Date.now()/1000)
    const data=part({alg:'HS256',typ:'JWT'})+'.'+part({role,iss:'supabase',iat:issued,exp:issued+4*3600})
    return data+'.'+createHmac('sha256',secret).update(data).digest('base64url')
  }
  const serviceKey=token('service_role'),anonKey=token('anon')
  const relays=[]
  let gateway,gatewayOrigin
  let ownedNetwork=false,closed=false
  async function close(){
    if(closed)return
    closed=true
    try{
      if(gateway)await closeHttp(gateway)
      for(const relay of relays) await relay.close()
    }finally{
      if(ownedNetwork)await cleanupReferenceResources({id,label,names,docker})
    }
  }
  function container(name,memory,env,extra=[],command=[]){
    docker(['run','--pull=never','-d','--name',id+'-'+name,'--label',label+'='+id,'--network',id,'--network-alias',name,
      '--memory',memory,'--memory-swap',memory,'--cpus','1','--pids-limit','96','--restart','no',
      ...Object.keys(env).flatMap(key=>['-e',key]),...extra,REFERENCE_TEST_IMAGES[name],...command],undefined,env)
  }
  try{
    for(const service of ['db','auth','rest'])docker(['image','inspect',REFERENCE_TEST_IMAGES[service],'--format','{{.Id}}'])
    docker(['network','create','--internal','--label',label+'='+id,id])
    ownedNetwork=true
    container('db','192m',{POSTGRES_PASSWORD:password},['--shm-size','32m','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=128m'],
      ['-c','shared_buffers=16MB','-c','max_connections=24','-c','work_mem=1MB'])
    let ready=false
    for(let i=0;i<70;i++){
      try{docker(['exec',names[0],'pg_isready','-h','127.0.0.1','-U','postgres']);if(sql('select 1')==='1'){ready=true;break}}catch{}
      await sleep(250)
    }
    assert(ready,'New PostgreSQL fixture did not start')
    sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;'+
      'create role authenticator login noinherit password '+q(password)+';grant anon,authenticated,service_role to authenticator;'+
      'create role supabase_auth_admin login password '+q(password)+';create schema auth authorization supabase_auth_admin;'+
      'create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;'+
      'grant usage on schema public,auth,extensions to anon,authenticated,service_role,supabase_auth_admin;'+
      'alter role supabase_auth_admin set search_path=auth,public,extensions;')
    container('auth','128m',{
      GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:siteOrigin+'/auth/v1',
      GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:'+password+'@db:5432/postgres',
      GOTRUE_SITE_URL:siteOrigin,GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',
      GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',
      GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_SECRET:secret,
    })
    const auth=await serviceRelay('auth',9999,dockerPrefix,names[0]);relays.push(auth)
    await waitHealthy(auth,'/health','Local GoTrue')
    sql("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;"+
      "create or replace function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;")
    container('rest','80m',{PGRST_DB_URI:'postgres://authenticator:'+password+'@db:5432/postgres',PGRST_DB_SCHEMAS:'public',
      PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_POOL:'4'})
    const rest=await serviceRelay('rest',3000,dockerPrefix,names[0]);relays.push(rest)
    await waitHealthy(rest,'/','Local PostgREST')
    let inFlight=0
    gateway=httpServer(async(req,res)=>{
      if(inFlight>=8)return res.writeHead(429,{'connection':'close'}).end()
      inFlight++
      try{
        if(!gatewayOrigin||!matchesOrigin(req,gatewayOrigin)||req.headers.origin||
           ![anonKey,serviceKey].includes(req.headers.apikey))return res.writeHead(403,{'connection':'close'}).end()
        const u=new URL(req.url,gatewayOrigin)
        const prefix=['/auth/v1','/rest/v1'].find(p=>u.pathname===p||u.pathname.startsWith(p+'/'))
        if(!prefix)return res.writeHead(404).end()
        const relay=prefix==='/auth/v1'?auth:rest
        const headers={}
        for(const key of ['authorization','apikey','content-type','accept','prefer','x-client-info','x-supabase-api-version']){
          if(req.headers[key])headers[key]=String(req.headers[key])
        }
        const body=await bodyBytes(req)
        if(body)headers['content-length']=String(body.length)
        const reply=await relay.exchange((u.pathname.slice(prefix.length)||'/')+u.search,req.method,headers,body)
        const outgoing={'cache-control':'no-store','x-content-type-options':'nosniff'}
        for(const name of ['content-type','content-range','preference-applied']){
          const value=reply.headers[name];if(value)outgoing[name]=value
        }
        res.writeHead(reply.status,outgoing).end(reply.bytes)
      }catch(error){if(!res.headersSent)res.writeHead(error instanceof RangeError?413:502,{'connection':'close'});res.end()}finally{inFlight--}
    })
    gateway.requestTimeout=25000
    gatewayOrigin=await listenLocally(gateway)
    return {url:gatewayOrigin,anonKey,serviceKey,sql,close}
  }catch(error){await close();throw error}
}
