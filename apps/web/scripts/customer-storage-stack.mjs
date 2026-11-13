// Reused from the reviewed local CMS/Storage rehearsal. Default remains disposable.
// Persistent Etapp 1 mode uses uniquely owned local volumes; never a hosted endpoint.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createHmac,randomBytes,randomUUID} from 'node:crypto'
import {createServer as httpServer,request as httpRequest} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {createServer as tcpServer} from 'node:net'
import {freemem,tmpdir} from 'node:os'
import {REFERENCE_TEST_IMAGES,assertReferenceLocalConfig,cleanupReferenceResources} from './reference-local-stack.mjs'
const LOCAL_TEST_IMAGES={...REFERENCE_TEST_IMAGES,storage:'supabase/storage-api:v1.81.0'}

export const fixtureEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>
  /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programdata|playwright_browsers_path)$/i.test(key)))
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const sqlLiteral=value=>"'"+value.replaceAll("'","''")+"'"
const byteLimit=10*1024*1024 // Three normalised 180 kB WEBPs, base64-encoded, plus their metadata.

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
            if(size>12*1024*1024)throw Error('Oversized local service response')
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

export async function startCmsStorageStack(siteOrigin,options={}) {
  assertReferenceLocalConfig({mode:'isolated-local',url:siteOrigin})
  if(process.env.DOCKER_HOST||process.env.DOCKER_CONTEXT) throw Error('Unset Docker endpoint overrides for this local-only rehearsal')
  if(freemem()<1536*1024**2)throw Error('1.5 GiB free host RAM required for the bounded dealer pilot')
  const persistent=Boolean(options.persistentPath),applicationDatabase=Boolean(options.applicationDatabase)
  // Next's development middleware normalizes loopback redirects to localhost.
  // Both names reach the same fixed, owned port; no wildcard CORS origin.
  const browserOrigins=new Set([siteOrigin,...(persistent&&applicationDatabase&&new URL(siteOrigin).hostname==='127.0.0.1'?['http://localhost:'+new URL(siteOrigin).port]:[])])
  if(persistent&&(!path.isAbsolute(options.persistentPath)||!applicationDatabase))throw Error('Absolute local state path and application database required')
  const saved=persistent&&existsSync(options.persistentPath)?JSON.parse(readFileSync(options.persistentPath,'utf8')):null
  if(saved&&(saved.version!==1||saved.siteOrigin!==siteOrigin||!/^omnira-etapp1-[a-f0-9-]{36}$/.test(saved.id)||typeof saved.secret!=='string'||typeof saved.password!=='string'))throw Error('INVALID_LOCAL_STACK_STATE')
  const id=saved?.id??(persistent?'omnira-etapp1-':'omnira-cms-storage-')+randomUUID(),label=persistent?'omnira.etapp1.local':'omnira.cms.storage.fixture'
  const names=['db','auth','rest','storage'].map(service=>id+'-'+service)
  const password=saved?.password??randomBytes(32).toString('hex'),secret=saved?.secret??randomBytes(48).toString('hex')
  const images={...LOCAL_TEST_IMAGES,...(applicationDatabase?{db:'public.ecr.aws/supabase/postgres@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108'}:{})}
  if(persistent&&!saved){mkdirSync(path.dirname(options.persistentPath),{recursive:true});writeFileSync(options.persistentPath,JSON.stringify({version:1,id,siteOrigin,password,secret}),{flag:'wx',mode:0o600})}
  const q=sqlLiteral
  const dockerPrefix=[]
  function docker(args,input,extra={}) {
    const result=spawnSync('docker',[...dockerPrefix,...args],{input,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,
      env:{...fixtureEnv,...extra},windowsHide:true})
    if(result.status!==0){
      const brief=(result.stderr||result.error?.message||'failed').replaceAll(secret,'[secret]').replaceAll(password,'[secret]')
      throw Error('Dealer fixture Docker '+args[0]+': '+brief.slice(0,450))
    }
    return extra.raw?result.stdout:result.stdout.trim()
  }
  const context=docker(['context','show'])
  assert.match(context,/^[a-zA-Z0-9_.-]+$/)
  const endpoint=docker(['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'])
  assert(/^unix:\/\/\/(?!\/)[^\r\n]+$/.test(endpoint)||/^npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9._-]+$/.test(endpoint),'Local Docker engine required')
  dockerPrefix.push('--context',context)
  const sql=text=>docker(['exec','-i',names[0],'psql','-X','-qAt',...(applicationDatabase?['--single-transaction']:[]),'-v','ON_ERROR_STOP=1','-U',applicationDatabase?'supabase_admin':'postgres','-d','postgres'],text)
  function token(role){
    const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
    const issued=Math.floor(Date.now()/1000)
    const data=part({alg:'HS256',typ:'JWT'})+'.'+part({role,iss:'supabase',iat:issued,exp:issued+(persistent?14*24:4)*3600})
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
      if(ownedNetwork&&!persistent)await cleanupReferenceResources({id,label,names,docker})
      if(ownedNetwork&&persistent)for(const name of names.slice().reverse()){
        const found=docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'])
        if(found&&docker(['inspect','--format','{{index .Config.Labels "'+label+'"}}',name])===id)docker(['stop','--time','5',name])
      }
    }
  }
  function container(name,memory,env,extra=[],command=[]){
    const found=docker(['ps','-a','--filter','name=^/'+id+'-'+name+'$','--format','{{.Names}}'])
    if(found){
      if(!persistent||docker(['inspect','--format','{{index .Config.Labels "'+label+'"}}',found])!==id||docker(['inspect','--format','{{.Config.Image}}',found])!==images[name])throw Error('LOCAL_CONTAINER_OWNERSHIP_MISMATCH')
      const actualCommand=JSON.parse(docker(['inspect','--format','{{json .Config.Cmd}}',found]))
      if(command.length&&JSON.stringify(actualCommand)!==JSON.stringify(command)){
        // Replace only our container configuration. Named volumes remain intact.
        docker(['rm','-f',found])
      }else{docker(['start',found]);return}
    }
    docker(['run','--pull=never','-d','--name',id+'-'+name,'--label',label+'='+id,'--network',id,'--network-alias',name,
      '--memory',memory,'--memory-swap',memory,'--cpus','1','--pids-limit','96','--restart','no',
      ...Object.keys(env).flatMap(key=>['-e',key]),...extra,images[name],...command],undefined,env)
  }
  try{
    for(const service of ['db','auth','rest','storage'])docker(['image','inspect',images[service],'--format','{{.Id}}'])
    const existingNetwork=docker(['network','ls','--filter','name=^'+id+'$','--format','{{.Name}}'])
    if(existingNetwork){
      if(!persistent||docker(['network','inspect','--format','{{index .Labels "'+label+'"}}',id])!==id||docker(['network','inspect','--format','{{.Internal}}',id])!=='true')throw Error('LOCAL_NETWORK_OWNERSHIP_MISMATCH')
    }else docker(['network','create','--internal','--label',label+'='+id,id])
    if(persistent)for(const name of ['db','storage']){
      const volume=id+'-'+name+'-data',found=docker(['volume','ls','--filter','name=^'+volume+'$','--format','{{.Name}}'])
      if(found){if(docker(['volume','inspect','--format','{{index .Labels "'+label+'"}}',volume])!==id)throw Error('LOCAL_VOLUME_OWNERSHIP_MISMATCH')}
      else docker(['volume','create','--label',label+'='+id,volume])
    }
    ownedNetwork=true
    container('db',applicationDatabase?'768m':'384m',{POSTGRES_PASSWORD:password},['--shm-size','32m',...(persistent?['--mount','type=volume,source='+id+'-db-data,target=/var/lib/postgresql/data']:['--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=192m'])],
      [...(applicationDatabase?['postgres','-c','shared_preload_libraries=pg_stat_statements,pg_cron,pg_net','-c','cron.database_name=postgres','-c','cron.launch_active_jobs=off','-c','listen_addresses=*']:[]),'-c','shared_buffers=24MB','-c','max_connections=60','-c','work_mem=1MB'])
    let ready=false
    for(let i=0;i<70;i++){
      try{docker(['exec',names[0],'pg_isready','-h','127.0.0.1','-U','postgres']);if(sql('select 1')==='1'){ready=true;break}}catch{}
      await sleep(250)
    }
    assert(ready,'New PostgreSQL fixture did not start')
    if(applicationDatabase){
      sql('alter role supabase_auth_admin with password '+q(password)+';alter role authenticator with password '+q(password)+';alter role supabase_storage_admin with password '+q(password)+';grant anon,authenticated,service_role to authenticator;grant usage on schema public,auth,extensions to supabase_storage_admin;')
    }else sql('create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;'+
      'create role authenticator login noinherit password '+q(password)+';grant anon,authenticated,service_role to authenticator;'+
      'create role supabase_auth_admin login password '+q(password)+';create schema auth authorization supabase_auth_admin;'+
      'create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;'+
      'grant usage on schema public,auth,extensions to anon,authenticated,service_role,supabase_auth_admin;'+
      'alter role supabase_auth_admin set search_path=auth,public,extensions;'+
      'create role supabase_storage_admin login noinherit bypassrls password '+q(password)+';'+
      'create schema storage authorization supabase_storage_admin;'+
      'grant anon,authenticated,service_role to supabase_storage_admin;'+
      'grant usage on schema storage to anon,authenticated,service_role;'+
      'alter default privileges for role supabase_storage_admin in schema storage grant all on tables to anon,authenticated,service_role;'+
      'alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to anon,authenticated,service_role;'+
      'alter default privileges for role supabase_storage_admin in schema storage grant all on functions to anon,authenticated,service_role;'+
      'grant usage on schema public,auth,extensions to supabase_storage_admin;'+
      'alter role supabase_storage_admin set search_path=storage,public,extensions;'+
      'grant all on schema public to service_role;')
    container('auth','128m',{
      GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:siteOrigin+'/auth/v1',
      GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:'+password+'@db:5432/postgres',
      GOTRUE_SITE_URL:siteOrigin,GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',
      GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',
      GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_SECRET:secret,
    })
    const auth=await serviceRelay('auth',9999,dockerPrefix,applicationDatabase?names[1]:names[0]);relays.push(auth)
    await waitHealthy(auth,'/health','Local GoTrue')
    if(!applicationDatabase)sql("create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;"+
      "create or replace function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;"+
      "grant execute on all functions in schema auth to anon,authenticated,service_role,supabase_storage_admin;"+
      "grant select,references on auth.users to supabase_storage_admin;")
    container('rest','80m',{PGRST_DB_URI:'postgres://authenticator:'+password+'@db:5432/postgres',PGRST_DB_SCHEMAS:'public',
      PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_POOL:'4'})
    const rest=await serviceRelay('rest',3000,dockerPrefix,applicationDatabase?names[1]:names[0]);relays.push(rest)
    await waitHealthy(rest,'/','Local PostgREST')
    container('storage','384m',{
      ANON_KEY:anonKey,SERVICE_KEY:serviceKey,
      AUTH_JWT_SECRET:secret,POSTGREST_URL:'http://rest:3000',
      DATABASE_URL:'postgres://supabase_storage_admin:'+password+'@db:5432/postgres',
      PGOPTIONS:'-c search_path=storage,public,extensions',
      DATABASE_POOL_MAX:'4',STORAGE_BACKEND:'file',
      FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',GLOBAL_S3_BUCKET:'stub',
      TENANT_ID:'fixture',REGION:'local',FILE_SIZE_LIMIT:String(applicationDatabase?10*1024*1024:2*1024*1024),
      ENABLE_IMAGE_TRANSFORMATION:'false',
    },persistent?['--mount','type=volume,source='+id+'-storage-data,target=/var/lib/storage']:['--tmpfs','/var/lib/storage:rw,nosuid,size=64m'])
    const storage=await serviceRelay('storage',5000,dockerPrefix,applicationDatabase?names[1]:names[0]);relays.push(storage)
    await waitHealthy(storage,'/status','Local Supabase Storage')
    assert.equal(sql("select relrowsecurity from pg_class where oid='storage.objects'::regclass"),'t',
      'Real isolated Storage objects RLS must be enabled')
    // Next.js layout and Studio load several owner-scoped resources concurrently.
    // Keep the original eight active gateway slots, but wait briefly for a free
    // slot rather than returning a transient 429 during normal cold navigation.
    // A bounded FIFO and deadline preserve the existing overload protection.
    let inFlight=0
    const waiters=[]
    function acquireSlot(){
      if(inFlight<8&&waiters.length===0){inFlight++;return Promise.resolve(true)}
      if(waiters.length>=64)return Promise.resolve(false)
      return new Promise(resolve=>{
        let settled=false
        const enter=()=>{
          if(settled)return
          settled=true
          clearTimeout(timer)
          inFlight++
          resolve(true)
        }
        const timer=setTimeout(()=>{
          if(settled)return
          settled=true
          const index=waiters.indexOf(enter)
          if(index>=0)waiters.splice(index,1)
          resolve(false)
        },15000)
        waiters.push(enter)
      })
    }
    function releaseSlot(){
      inFlight--
      const next=waiters.shift()
      if(next)next()
    }
    gateway=httpServer(async(req,res)=>{
      if(!(await acquireSlot()))return res.writeHead(429,{'connection':'close'}).end()
      try{
        const browserOrigin=applicationDatabase&&typeof req.headers.origin==='string'&&browserOrigins.has(req.headers.origin)?req.headers.origin:null
        if(!gatewayOrigin||!matchesOrigin(req,gatewayOrigin)||(req.headers.origin&&!browserOrigin)||
           (![anonKey,serviceKey].includes(req.headers.apikey)&&!(browserOrigin&&req.method==='OPTIONS')))return res.writeHead(403,{'connection':'close'}).end()
        if(browserOrigin&&req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':browserOrigin,'access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','vary':'Origin'}).end();return}
        const u=new URL(req.url,gatewayOrigin)
        const prefix=['/auth/v1','/rest/v1','/storage/v1'].find(p=>u.pathname===p||u.pathname.startsWith(p+'/'))
        if(!prefix)return res.writeHead(404).end()
        const relay=prefix==='/auth/v1'?auth:prefix==='/storage/v1'?storage:rest
        const headers={}
        for(const key of ['authorization','apikey','content-type','accept','prefer','x-client-info','x-supabase-api-version','x-upsert','cache-control','range']){
          if(req.headers[key])headers[key]=String(req.headers[key])
        }
        const body=await bodyBytes(req)
        if(body)headers['content-length']=String(body.length)
        const reply=await relay.exchange((u.pathname.slice(prefix.length)||'/')+u.search,req.method,headers,body)
        const outgoing={'cache-control':'no-store','x-content-type-options':'nosniff',...(browserOrigin?{'access-control-allow-origin':browserOrigin,'vary':'Origin'}:{})}
        for(const name of ['content-type','content-range','preference-applied']){
          const value=reply.headers[name];if(value)outgoing[name]=value
        }
        res.writeHead(reply.status,outgoing).end(reply.bytes)
      }catch(error){if(!res.headersSent)res.writeHead(error instanceof RangeError?413:502,{'connection':'close'});res.end()}finally{releaseSlot()}
    })
    gateway.requestTimeout=25000
    gatewayOrigin=await listenLocally(gateway,options.gatewayPort??0)
    return {url:gatewayOrigin,anonKey,serviceKey,sql,close,storage:true,id,images,docker:(args,input,raw=false)=>docker(args,input,{raw})}
  }catch(error){await close();throw error}
}
