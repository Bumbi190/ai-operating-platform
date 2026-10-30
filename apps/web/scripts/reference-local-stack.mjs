// Disposable test infrastructure only. Never consumes a hosted endpoint or credentials.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {randomUUID,randomBytes,createHmac} from 'node:crypto'
import {createServer} from 'node:http'
import {isIP} from 'node:net'
import {freemem} from 'node:os'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {fixtureStorageCors} from '../e2e/reference-auth/cors.mjs'
export const REFERENCE_TEST_IMAGES={
 db:'postgres:17-alpine',
 auth:'supabase/gotrue:v2.197.0',
 rest:'postgrest/postgrest:v16.5',
 storage:'supabase/storage-api:v1.79.36',
}
export function assertReferenceLocalConfig({mode,url}={}){
 if(mode!=='isolated-local')throw Error('Explicit isolated-local mode required')
 let u;try{u=new URL(url)}catch{throw Error('Literal loopback URL required')}
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||Number(u.port)<1024||u.username||u.password||u.pathname!=='/'||u.search||u.hash)
  throw Error('Literal loopback URL with explicit high port required')
}
const web=fileURLToPath(new URL('../',import.meta.url))
const repo=fileURLToPath(new URL('../../../',import.meta.url))
const q=s=>"'"+String(s).replaceAll("'","''")+"'"
// Discover by intended name, then prove the unique run label before deletion.
// Attempt every candidate even when a previous Docker operation fails.
export async function cleanupReferenceResources({id,label,names,docker}){
 const errors=[]
 for(const name of names.slice().reverse()){
  try{
   const found=docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'])
   if(!found)continue
   if(found!==name||docker(['inspect','--format','{{index .Config.Labels "'+label+'"}}',name])!==id)throw Error('ownership mismatch: '+name)
   docker(['rm','-f',name])
  }catch(error){errors.push(error.message)}
 }
 try{
  const found=docker(['network','ls','--filter','name=^'+id+'$','--format','{{.Name}}'])
  if(found){
   if(found!==id||docker(['network','inspect','--format','{{index .Labels "'+label+'"}}',id])!==id)throw Error('network ownership mismatch')
   docker(['network','rm',id])
  }
 }catch(error){errors.push(error.message)}
 try{
  if(docker(['ps','-a','--filter','label='+label+'='+id,'--format','{{.Names}}']))errors.push('owned containers remain')
 }catch(error){errors.push(error.message)}
 if(errors.length)throw Error('Fixture cleanup failed: '+errors.join('; '))
}
export async function startReferenceStack(){
 if(process.env.ATLAS_REFERENCE_TEST_MODE!=='isolated-local')throw Error('Explicit isolated-local mode required')
 if(process.platform!=='linux')throw Error('Run the isolated fixture on Linux/CI; no Docker resources started')
 if(freemem()<2*1024**3)throw Error('Need 2GiB free RAM; no Docker resources started')
 const nativeFetch=globalThis.fetch
 const id='omnira-reference-auth-'+randomUUID(),label='omnira.reference.auth.fixture'
 const secret=randomBytes(48).toString('hex'),password=randomBytes(24).toString('hex')
 const token=role=>{
  const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000)
  const data=part({alg:'HS256',typ:'JWT'})+'.'+part({role,iss:'supabase',iat:now,exp:now+3600})
  return data+'.'+createHmac('sha256',secret).update(data).digest('base64url')
 }
 const anonKey=token('anon'),serviceKey=token('service_role')
 const containers=Object.keys(REFERENCE_TEST_IMAGES).map(name=>id+'-'+name)
 let gateway,browserOrigin
 const allowBrowserOrigin=origin=>{fixtureStorageCors(origin,origin);browserOrigin=origin}
 function docker(args,input,environment={}){
  const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,maxBuffer:2**20,env:{...process.env,...environment}})
  if(result.status!==0)throw Error('Fixture Docker operation failed: '+(result.stderr||result.error?.message||'unknown').slice(0,700))
  return (result.stdout+(args[0]==='logs'?result.stderr:'')).trim()
 }
 const sql=text=>docker(['exec','-i',id+'-db','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],text)
 function diagnostics(){
  for(const name of containers){
   try{
    let tail=docker(['logs','--tail','8',name])
    for(const value of [secret,password,anonKey,serviceKey])tail=tail.replaceAll(value,'[fixture-secret]')
    tail=tail.replace(/[A-Za-z0-9_-]{12,}[.][A-Za-z0-9_-]{12,}[.][A-Za-z0-9_-]{12,}/g,'[fixture-token]')
    console.error(name.split('-').at(-1)+': '+tail.slice(-1400))
   }catch{}
  }
 }
 async function close(){
  if(gateway){gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));gateway=undefined}
  await cleanupReferenceResources({id,label,names:containers,docker})
  console.log('CLEANUP owned Auth/Storage fixture removed')
 }
 function run(name,image,memory,port,environment,extra=[],command=[]){
  const full=id+'-'+name
  docker(['run','--pull=never','-d','--name',full,'--label',label+'='+id,
   '--network',id,'--network-alias',name,'--memory',memory,'--memory-swap',memory,'--cpus','1','--pids-limit','128',
   ...Object.keys(environment).flatMap(key=>['-e',key]),...extra,image,...command],undefined,environment)
  if(!port)return null
  // Linux host reaches its own internal bridge; no service port is published.
  const ip=docker(['inspect','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',full])
  if(isIP(ip)!==4)throw Error('Invalid fixture container address')
  return 'http://'+ip+':'+port
 }
 async function wait(url){
  const deadline=Date.now()+25000
  while(Date.now()<deadline){
   try{const r=await fetch(url,{signal:AbortSignal.timeout(1500)});if(r.ok)return}catch{}
   await new Promise(resolve=>setTimeout(resolve,300))
  }
  throw Error('Fixture service health timeout at '+new URL(url).pathname)
 }
 try{
  for(const image of Object.values(REFERENCE_TEST_IMAGES))docker(['image','inspect',image,'--format','{{.Id}}'])
  docker(['network','create','--internal','--label',label+'='+id,id])
  run('db',REFERENCE_TEST_IMAGES.db,'384m',null,{POSTGRES_PASSWORD:password},
   ['--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=192m'],['-c','shared_buffers=32MB','-c','max_connections=40','-c','work_mem=1MB'])
  let ready=false
  for(let i=0;i<60;i++){
   try{
    // Postgres entrypoint's temporary init server accepts Unix sockets only.
    // Require TCP readiness so its shutdown cannot race application bootstrap.
    docker(['exec',id+'-db','pg_isready','-h','127.0.0.1','-U','postgres'])
    if(sql('select 1')==='1'){ready=true;break}
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,250))
  }
  assert(ready,'Fixture database not ready')
  sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   create role authenticator login noinherit password ${q(password)};grant anon,authenticated,service_role to authenticator;
   create role supabase_auth_admin login password ${q(password)};create schema auth authorization supabase_auth_admin;
   create role supabase_storage_admin login noinherit bypassrls password ${q(password)};create schema storage authorization supabase_storage_admin;
   grant anon,authenticated,service_role to supabase_storage_admin;
   grant usage on schema storage to anon,authenticated,service_role;
   alter default privileges for role supabase_storage_admin in schema storage grant all on tables to anon,authenticated,service_role;
   alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to anon,authenticated,service_role;
   alter default privileges for role supabase_storage_admin in schema storage grant all on functions to anon,authenticated,service_role;
   create schema extensions;create extension if not exists pgcrypto with schema extensions;
   create extension if not exists "uuid-ossp" with schema extensions;
   grant usage on schema public,extensions,auth to anon,authenticated,service_role,supabase_auth_admin,supabase_storage_admin;
   grant all on schema public to service_role;
   alter role supabase_auth_admin set search_path=auth,public,extensions;
   alter role supabase_storage_admin set search_path=storage,public,extensions;
   alter default privileges in schema public grant all on tables to service_role;
   alter default privileges in schema public grant all on sequences to service_role;`)
  const auth=run('auth',REFERENCE_TEST_IMAGES.auth,'128m',9999,{
   GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:54489/auth/v1',
   GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:'+password+'@db:5432/postgres',
   GOTRUE_SITE_URL:'http://127.0.0.1:54489',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',
   GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',
   GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_SECRET:secret,
  })
  await wait(auth+'/health')
  // GoTrue must own and migrate its helpers first. Modern PostgREST supplies
  // request.jwt.claims; adapt only the disposable schema's RLS helper contract.
  sql(`create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;
   create or replace function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb->>'role'$$;
   grant execute on all functions in schema auth to anon,authenticated,service_role;
   grant select,references on auth.users to supabase_storage_admin;`)
  const rest=run('rest',REFERENCE_TEST_IMAGES.rest,'96m',3000,{
   PGRST_DB_URI:'postgres://authenticator:'+password+'@db:5432/postgres',PGRST_DB_SCHEMAS:'public,storage',
   PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_POOL:'4',
  })
  await wait(rest+'/')
  const storage=run('storage',REFERENCE_TEST_IMAGES.storage,'384m',5000,{
   ANON_KEY:anonKey,SERVICE_KEY:serviceKey,AUTH_JWT_SECRET:secret,POSTGREST_URL:'http://rest:3000',
   DATABASE_URL:'postgres://supabase_storage_admin:'+password+'@db:5432/postgres',
   PGOPTIONS:'-c search_path=storage,public,extensions',DATABASE_POOL_MAX:'4',
   STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',GLOBAL_S3_BUCKET:'stub',
   TENANT_ID:'fixture',REGION:'local',FILE_SIZE_LIMIT:String(10*1024*1024),ENABLE_IMAGE_TRANSFORMATION:'false',
  },['--tmpfs','/var/lib/storage:rw,nosuid,size=64m'])
  await wait(storage+'/status')
  assert.equal(sql("select relrowsecurity from pg_class where oid='storage.objects'::regclass"),'t','Real Storage object RLS must remain enabled')
  sql(readFileSync(web+'lib/website-build/assets/fixtures/reference-auth-bootstrap.sql','utf8'))
  for(const file of [web+'supabase/migrations/20260902_media_asset_foundation.sql',
   repo+'docs/sql/atlas-builder-reference-upload-tickets-proposed.sql',repo+'docs/sql/atlas-builder-reference-message-binding-proposed.sql'])sql(readFileSync(file,'utf8'))
  sql("notify pgrst,'reload schema';")
  gateway=createServer(async(req,res)=>{
   try{
    const u=new URL(req.url,'http://127.0.0.1'),prefix=['/auth/v1','/rest/v1','/storage/v1'].find(p=>u.pathname===p||u.pathname.startsWith(p+'/'))
    if(!prefix){res.writeHead(404).end();return}
    const cors=prefix==='/storage/v1'&&browserOrigin?fixtureStorageCors(browserOrigin,req.headers.origin):{}
    if(req.method==='OPTIONS'&&Object.keys(cors).length){res.writeHead(204,cors).end();return}
    const target={'/auth/v1':auth,'/rest/v1':rest,'/storage/v1':storage}[prefix]+u.pathname.slice(prefix.length)+u.search
    const body=[];let size=0
    for await(const chunk of req){size+=chunk.length;if(size>11*1024*1024){res.writeHead(413).end();return}body.push(chunk)}
    const headers=new Headers()
    for(const [key,value]of Object.entries(req.headers))if(value&&!['host','connection','content-length','accept-encoding'].includes(key))headers.set(key,String(value))
    const r=await nativeFetch(target,{method:req.method,headers,body:body.length?Buffer.concat(body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)})
    res.writeHead(r.status,{...Object.fromEntries([...r.headers].filter(([k])=>!['transfer-encoding','connection','content-encoding','content-length'].includes(k))),...cors})
    res.end(Buffer.from(await r.arrayBuffer()))
   }catch{res.writeHead(502).end('Fixture gateway failure')}
  })
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve))
  const url='http://127.0.0.1:'+gateway.address().port
  assertReferenceLocalConfig({mode:'isolated-local',url})
  return {url,anonKey,serviceKey,sql,close,diagnostics,allowBrowserOrigin}
 }catch(error){
  for(const name of containers){
   try{console.error(name.split('-').at(-1)+' state: '+docker(['inspect','--format','{{.State.Status}}/{{.State.ExitCode}}/oom={{.State.OOMKilled}}',name]));let tail=docker(['logs','--tail','8',name]);for(const value of [secret,password,anonKey,serviceKey])tail=tail.replaceAll(value,'[fixture-secret]');console.error(name.split('-').at(-1)+': '+tail.slice(-1000))}catch{}
  }
  await close();throw error
 }
}
