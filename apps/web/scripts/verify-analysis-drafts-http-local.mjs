/**
 * Genuine local HTTP stack: real GoTrue, Next routes/default service/store,
 * PostgREST and PostgreSQL. Synthetic P1 dependency fixture, not schema replay.
 * Requires cached Docker images and offline installed repository dependencies.
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')
import { createHmac, randomBytes, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import http from 'node:http'
const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const prefix = 'omnira-p1-http-' + process.pid + '-' + randomBytes(3).toString('hex')
const network = prefix + '-net', owned = [], project = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const images = {
 db: 'public.ecr.aws/supabase/postgres:17.11.0.004',
 auth: 'public.ecr.aws/supabase/gotrue:v2.197.0',
 rest: 'public.ecr.aws/supabase/postgrest:v16.4',
 gateway: 'node:22-bookworm',
}
const hostEnv = {}
for (const key of ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','TEMP','TMP','COMSPEC','APPDATA','LOCALAPPDATA','USERPROFILE'])
 if (process.env[key]) hostEnv[key] = process.env[key]
const env = { ...hostEnv, DOCKER_API_VERSION: '1.47' }
const docker = (args, input) => spawnSync('docker', args, { env, input, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
const check = (r) => { assert.equal(r.status, 0, r.stderr); return r.stdout.trim() }
const sql = text => check(docker(['exec', '-i', prefix + '-db', 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], text))
const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
const secret = randomBytes(32).toString('hex')
function jwt(role) {
 const body = [ {alg:'HS256',typ:'JWT'}, {role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600} ].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')
 return body + '.' + createHmac('sha256', secret).update(body).digest('base64url')
}
const anon = jwt('anon'), service = jwt('service_role'), password = 'Synthetic-only-' + randomBytes(12).toString('hex')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label, timeout=60000) {
 const deadline=Date.now()+timeout
 while(Date.now()<deadline){if(await fn())return;await sleep(200)}
 throw Error('timeout: ' + label)
}
function run(kind, extra=[]) {
 const name = prefix + '-' + kind
 assert.notEqual(docker(['container','inspect',name]).status,0,'refusing existing container')
 check(docker(['run','--pull=never','--detach','--name',name,'--network',network,'--network-alias',kind,...extra,images[kind],...(kind==='db'?['postgres','-c','listen_addresses=*','-c','shared_preload_libraries=pg_stat_statements','-c','cron.launch_active_jobs=off']:kind==='gateway'?['node','-e','setInterval(()=>{},10000)']:[])]))
 owned.push(name)
}
let app, gateway, appLog='', networkOwned=false
try {
 for(const image of Object.values(images))check(docker(['image','inspect',image]))
 for(const filename of ['.env','.env.local','.env.development','.env.development.local'])
   assert.ok(!existsSync(resolve(web,filename)),'refusing app environment file: '+filename)
 assert.ok(existsSync(nextCli),'offline Next dependencies required')
 check(docker(['network','create','--internal',network]));networkOwned=true
 assert.equal(JSON.parse(check(docker(['network','inspect',network])))[0].Internal,true)
 run('db',['--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB=postgres'])
 await until(()=>['postgres','.postgres-wrapp'].includes(docker(['exec',prefix+'-db','cat','/proc/1/comm']).stdout.trim())&&docker(['exec',prefix+'-db','pg_isready','-U','postgres']).status===0,'Postgres initialized')
 sql("ALTER ROLE supabase_auth_admin PASSWORD "+quote(password)+"; ALTER ROLE authenticator PASSWORD "+quote(password)+"; GRANT anon,authenticated,service_role TO authenticator;")
 run('auth',[
 '--env','GOTRUE_API_HOST=0.0.0.0','--env','GOTRUE_API_PORT=9999',
 '--env','API_EXTERNAL_URL=http://gateway:8000',
 '--env','GOTRUE_DB_DRIVER=postgres','--env','GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:'+password+'@db:5432/postgres',
 '--env','GOTRUE_SITE_URL=http://127.0.0.1','--env','GOTRUE_JWT_SECRET='+secret,
 '--env','GOTRUE_JWT_EXP=3600','--env','GOTRUE_JWT_AUD=authenticated','--env','GOTRUE_JWT_DEFAULT_GROUP=authenticated',
 '--env','GOTRUE_JWT_ADMIN_ROLES=service_role','--env','GOTRUE_DISABLE_SIGNUP=false',
 '--env','GOTRUE_MAILER_AUTOCONFIRM=true','--env','GOTRUE_RATE_LIMIT_EMAIL_SENT=100',
 ])
 run('rest',['--env','PGRST_DB_URI=postgres://authenticator:'+password+'@db:5432/postgres','--env','PGRST_DB_SCHEMAS=public','--env','PGRST_DB_ANON_ROLE=anon','--env','PGRST_JWT_SECRET='+secret])
 run('gateway',['--mount','type=bind,source='+resolve(web,'scripts/analysis-drafts-e2e-gateway.mjs')+',target=/gateway.mjs,readonly'])
 gateway = http.createServer(async (request,response)=>{
  try {
  const chunks=[];for await(const chunk of request)chunks.push(chunk)
  const forwarded=docker(['exec','-i',prefix+'-gateway','node','/gateway.mjs'],JSON.stringify({method:request.method,path:request.url,headers:request.headers,body:Buffer.concat(chunks).toString('base64')}))
  if(forwarded.status!==0){response.writeHead(502);response.end('local upstream unavailable');return}
  const result=JSON.parse(forwarded.stdout)
  if(result.status>=400 && request.url.startsWith('/rest/v1/'))console.log('LOCAL REST FAILURE '+request.url+' '+result.status+' '+Buffer.from(result.body,'base64').toString())
  response.writeHead(result.status,result.headers);response.end(Buffer.from(result.body,'base64'))
  } catch(error) {
   console.error('LOCAL GATEWAY FAILURE: '+error.message)
   if(!response.headersSent)response.writeHead(502)
   response.end('local gateway failure')
  }
 })
 gateway.on('clientError',(_error,socket)=>socket.destroy())
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r))
 const base='http://127.0.0.1:'+gateway.address().port
 await until(async()=>{try{return (await fetch(base+'/auth/v1/health')).ok}catch{return false}},'actual GoTrue ready')
 async function login(email) {
  const sign=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,role:'authenticated'})})
  const created=await sign.json();assert.ok(sign.status===200||sign.status===201,JSON.stringify(created));assert.equal(created.role,'authenticated')
  const token=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})})
  const session=await token.json();assert.equal(token.status,200,JSON.stringify(session))
  return session
 }
 const owner=await login('owner-'+prefix+'@example.invalid'),foreign=await login('foreign-'+prefix+'@example.invalid')
 console.log('AUTH PASS: two synthetic authenticated-role users created and password-authenticated by actual GoTrue')
 sql(readFileSync(resolve(web,'lib/qa/fixtures/analysis-drafts-local-bootstrap.sql'),'utf8'))
 // Match the app named-column project resolver and production owner policy.
 // Synthetic fixture resolver reads PostgREST verified JWT claims, not a mocked user.
 // This is not verification of the live deployment's auth.uid() definition.
 sql(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 ALTER TABLE public.projects ADD name text DEFAULT 'Synthetic P1 project', ADD color text, ADD settings jsonb DEFAULT '{}', ADD execution_paused boolean DEFAULT false, ADD paused_at timestamptz, ADD paused_reason text;
 ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
 CREATE POLICY projects_owner_select ON public.projects FOR SELECT TO authenticated USING(owner_id=auth.uid());
 UPDATE public.projects SET owner_id=${quote(owner.user.id)} WHERE id=${quote(project)};`)
 const files=['20261010100000_handlarborsen_marketplace_snapshots.sql','20261010130000_handlarborsen_guarded_snapshot_store.sql',...readdirSync(resolve(web,'supabase/migrations')).filter(x=>/^\d+_atlas_analysis_drafts\.sql$/.test(x))]
 for(const file of files){
  const bytes=readFileSync(resolve(web,'supabase/migrations',file),'utf8').replaceAll('\r\n','\n')
  sql(bytes);console.log('SQL '+file+' sha256='+createHash('sha256').update(bytes).digest('hex'))
 }
 const source=JSON.parse(readFileSync(resolve(web,'lib/qa/fixtures/analysis-source-parity.json'),'utf8'))[0].source
 const now=new Date(), observed=new Date(now.getTime()-1000).toISOString(),captured=now.toISOString(),day=observed.slice(0,10)
 const snapshot={...source.snapshots[0],observed_at:observed,captured_at:captured,snapshot_date:day,companies_registered_total:10,companies_verified_total:6,bids_total:2,bids_last_24h:0}
 const columns=['id','project_id','snapshot_date','observed_at','captured_at','schema_version','window_hours','completeness','unavailable',...source.semantics.map(x=>x.key)]
 sql('INSERT INTO public.handlarborsen_marketplace_snapshots('+columns.join(',')+') VALUES('+columns.map(k=>snapshot[k]===null?'NULL':quote(k==='unavailable'?JSON.stringify(snapshot[k]):snapshot[k])).join(',')+');')
 const audit={...source.runs[0],ran_at:captured,snapshot_date:day}
 sql('INSERT INTO public.collector_runs(id,project_id,collector_id,status,ran_at,snapshot_date,metadata) VALUES('+[audit.id,audit.project_id,audit.collector_id,audit.status,audit.ran_at,audit.snapshot_date,JSON.stringify({storage_outcome:audit.storage_outcome})].map(quote).join(',')+'); NOTIFY pgrst, \'reload schema\';')
 const hash=sql("SELECT encode(extensions.digest(convert_to(public.atlas_analysis_encode(public.atlas_analysis_source_rows("+quote(project)+")),'UTF8'),'sha256'),'hex')")
 const preflight=await fetch(base+'/rest/v1/projects?select=id,name,slug,color,settings,execution_paused,paused_at,paused_reason',{headers:{apikey:anon,Authorization:'Bearer '+owner.access_token}})
 const preflightBody=await preflight.json();assert.equal(preflight.status,200,JSON.stringify(preflightBody));assert.equal(preflightBody.length,1,JSON.stringify(preflightBody))
 const adminPreflight=await fetch(base+'/rest/v1/projects?select=id&owner_id=eq.'+owner.user.id,{headers:{apikey:service,Authorization:'Bearer '+service}})
 const adminBody=await adminPreflight.json();assert.equal(adminPreflight.status,200,JSON.stringify(adminBody));assert.equal(adminBody.length,1,JSON.stringify(adminBody))
 console.log('REST PREFLIGHT PASS: real owner RLS project resolver columns and service-role owner enumeration')
 const cleanEnv={...hostEnv}
 Object.assign(cleanEnv,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:base,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,ATLAS_ANALYSIS_DRAFTS_ENABLED:'true',NODE_OPTIONS:'--import='+pathToFileURL(resolve(web,'scripts/analysis-drafts-e2e-fetch-guard.mjs')).href})
 app=spawn(process.execPath,[nextCli,'dev','-H','127.0.0.1','-p','0'],{cwd:web,env:cleanEnv,stdio:['ignore','pipe','pipe']})
 app.stdout.on('data',d=>{appLog+=d});app.stderr.on('data',d=>{appLog+=d})
 app.on('error',error=>{appLog+='NEXT CHILD START ERROR: '+error.message})
 app.on('exit',(code,signal)=>{appLog+='NEXT CHILD EXIT code='+code+' signal='+signal})
 await until(()=>/Local:\s+http:\/\/127\.0\.0\.1:\d+/.test(appLog),'actual Next startup')
 const appBase=appLog.match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)/)[1],api='/api/projects/handlarborsen/atlas/analysis-drafts'
 function cookie(session){return 'sb-127-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')}
 async function request(path,session=owner,body){
  const r=await fetch(appBase+path,{method:body?'POST':'GET',headers:{...(session?{Cookie:cookie(session)}:{}),...(body?{Origin:appBase,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const text=await r.text()
  assert.match(r.headers.get('cache-control')||'',/no-store/)
  let json;try{json=JSON.parse(text)}catch{throw Error('non-JSON '+r.status+' '+text.slice(0,600)+'\n'+appLog.slice(-4000))}
  return {status:r.status,json}
 }
 await sleep(1000)
 assert.equal((await request(api,null)).status,401,'anonymous list denied')
 assert.equal((await request(api,foreign)).status,404,'foreign list isolated')
 const selector={ruleId:'company-status',ruleVersion:'handlarborsen-insights-1.0.0',expectedEvidenceHash:hash}
 const saved=await request(api,owner,selector)
 assert.equal(saved.status,201,JSON.stringify(saved)+'\n'+appLog.slice(-4000));assert.equal(saved.json.created,true)
 assert.match(saved.json.id,/^[0-9a-f-]{36}$/)
 const retry=await request(api,owner,selector);assert.equal(retry.status,200);assert.equal(retry.json.created,false);assert.equal(retry.json.id,saved.json.id)
 assert.equal(sql('SELECT count(*) FROM public.atlas_analysis_drafts'),'1');assert.equal(sql("SELECT count(*) FROM public.atlas_analysis_draft_events WHERE kind='created'"),'1')
 assert.equal((await request(api,foreign,selector)).status,404)
 const list=await request(api);assert.equal(list.status,200);assert.equal(list.json.items.length,1);assert.equal(list.json.items[0].draft.id,saved.json.id)
 const detail=await request(api+'/'+saved.json.id);assert.equal(detail.status,200)
 const snapshotAtSave=detail.json.draft.sourceEnvelope.snapshots[0]
 for(const [metric,want] of Object.entries({companies_registered_total:10,companies_verified_total:6,bids_total:2,bids_last_24h:0}))
  assert.equal(Number(snapshotAtSave[metric]),want,'frozen '+metric)
 assert.equal(detail.json.draft.createdBy,owner.user.id,'session-derived persisted owner')
 const frozen=JSON.stringify(detail.json.draft)
 const reloaded=await request(api+'/'+saved.json.id);assert.equal(reloaded.status,200);assert.equal(JSON.stringify(reloaded.json.draft),frozen)
 assert.equal((await request(api+'/'+saved.json.id,foreign)).status,404)
 const ownerProject=await fetch(base+'/rest/v1/projects?select=id',{headers:{apikey:anon,Authorization:'Bearer '+owner.access_token}});assert.equal((await ownerProject.json()).length,1)
 const foreignProject=await fetch(base+'/rest/v1/projects?select=id',{headers:{apikey:anon,Authorization:'Bearer '+foreign.access_token}});assert.deepEqual(await foreignProject.json(),[])
 console.log('HTTP STACK PASS: actual Next API + default auth/service/store + GoTrue + PostgREST + PostgreSQL; save 201, retry 200 same UUID, one SQL draft/created event, owner history/detail/reload 200, anonymous 401, foreign list/save/detail 404, owner RLS enforced')
 console.log('FROZEN DETAIL sha256='+createHash('sha256').update(frozen).digest('hex')+' draft='+saved.json.id)
 const bidSelector={...selector,ruleId:'bid-window'}
 const bidSaved=await request(api,owner,bidSelector);assert.equal(bidSaved.status,201,JSON.stringify(bidSaved))
 const bidRetry=await request(api,owner,bidSelector);assert.equal(bidRetry.status,200);assert.equal(bidRetry.json.id,bidSaved.json.id);assert.equal(bidRetry.json.created,false)
 const bidDetail=await request(api+'/'+bidSaved.json.id);assert.equal(bidDetail.status,200);assert.equal(bidDetail.json.draft.ruleId,'bid-window')
 const bidReload=await request(api+'/'+bidSaved.json.id);assert.deepEqual(bidReload.json.draft,bidDetail.json.draft)
 const finalList=await request(api);assert.equal(finalList.json.items.length,2)
 assert.equal(sql('SELECT count(*) FROM public.atlas_analysis_drafts'),'2')
 assert.equal(sql("SELECT count(*) FROM public.atlas_analysis_draft_events WHERE kind='created'"),'2')
 assert.equal(sql("SELECT count(*) FROM public.atlas_analysis_draft_events WHERE kind='superseded'"),'0')
 console.log('BID WINDOW PASS: 2 total / 0 rolling; save201, retry200 same UUID; frozen detail/refetch200; one created event per saved rule; history contains both rules')
 sql("UPDATE public.handlarborsen_marketplace_snapshots SET captured_at=captured_at+interval '1 microsecond'")
 const afterRefresh=await request(api+'/'+saved.json.id)
 assert.equal(afterRefresh.status,200);assert.equal(JSON.stringify(afterRefresh.json.draft),frozen);assert.equal(afterRefresh.json.applicability,'new_evidence')
 assert.equal((await request(api,owner,selector)).status,409)
 assert.equal(sql('SELECT count(*) FROM public.atlas_analysis_drafts'),'2')
 assert.equal(sql('SELECT count(*) FROM public.atlas_analysis_draft_events'),'2')
 console.log('SOURCE REFRESH PASS: same snapshot UUID refreshed; old selector409; persisted frozen company detail unchanged with new_evidence warning; no extra draft/event')
 console.log('LIMIT: HTTP refetch proves persisted frozen API detail; browser click/navigation/reload and full production schema are separate checks')
 for(const name of owned){
  const inspection=JSON.parse(check(docker(['inspect',name])))[0]
  assert.deepEqual(Object.keys(inspection.NetworkSettings.Networks),[network])
  assert.equal(Object.keys(inspection.HostConfig.PortBindings??{}).length,0)
  assert.equal(inspection.Mounts.filter(mount=>mount.Type==='volume').length,0,'no retained anonymous or named data volume')
 }
 assert.equal(gateway.address().address,'127.0.0.1')
 const guardProof=spawnSync(process.execPath,['--import',pathToFileURL(resolve(web,'scripts/analysis-drafts-e2e-fetch-guard.mjs')).href,'--input-type=module','-e',`import net from 'node:net';import assert from 'node:assert/strict';assert.throws(()=>fetch('https://example.invalid'),/denied external fetch/);assert.throws(()=>net.connect(443,'198.51.100.1'),/denied external socket/);`],{env:hostEnv,encoding:'utf8'})
 assert.equal(guardProof.status,0,guardProof.stderr)
 console.log('ISOLATION CHECKS: cached images only; unique Docker internal network; zero Docker port bindings; loopback host gateway; synthetic environment; app external fetch/socket denial tested')
} catch(error) {
 console.error('HTTP STACK FAILED:',error)
 if(appLog)console.error(appLog.slice(-8000))
 for(const name of owned.filter(n=>n.endsWith('-auth')||n.endsWith('-rest')))console.error(name+' logs: '+docker(['logs','--tail','20',name]).stderr)
 process.exitCode=1
} finally {
 const cleanupErrors=[]
 const attempt=async(label,fn)=>{try{await fn()}catch(error){cleanupErrors.push(label+': '+error.message)}}
 await attempt('owned Next process tree',async()=>{
  if(!app)return
  if(app.exitCode!==null){cleanupErrors.push('Next exited before cleanup: '+appLog.slice(-1000));return}
  if(process.platform==='win32'){
   const killed=spawnSync('taskkill',['/PID',String(app.pid),'/T','/F'],{env:hostEnv,encoding:'utf8'})
   assert.equal(killed.status,0,'taskkill failed: '+killed.stderr)
  }else assert.ok(app.kill(),'app kill refused')
  await until(()=>app.exitCode!==null||app.signalCode!==null,'owned Next child exit',10000)
 })
 await attempt('loopback gateway',async()=>{if(gateway)await new Promise(r=>gateway.close(r))})
 for(const name of owned.reverse())await attempt(name,()=>check(docker(['rm','--force','--volumes',name])))
 if(networkOwned)await attempt(network,()=>check(docker(['network','rm',network])))
 for(const name of owned)await attempt('absence '+name,()=>assert.notEqual(docker(['container','inspect',name]).status,0,'owned container remains'))
 if(networkOwned)await attempt('absence '+network,()=>assert.notEqual(docker(['network','inspect',network]).status,0,'owned network remains'))
 if(cleanupErrors.length){console.error('CLEANUP FAILED: '+cleanupErrors.join('; '));process.exitCode=1}
 else console.log('CLEANUP PASS: owned Next process tree exit confirmed, gateway, containers and network removed')
}
