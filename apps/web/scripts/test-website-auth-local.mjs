// Attended real Auth/PostgREST backend test. Cached images only; no production env or data.
// Usage: node apps/web/scripts/test-website-auth-local.mjs --run
import {spawnSync} from 'node:child_process';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const withApplication=process.argv.includes('--application');
const applicationModule=withApplication?await import('./website-auth-application-local.mjs'):null;
let applicationContext=null;
const withRoutes=process.argv.includes('--routes');
if(withRoutes&&!withApplication)throw Error('--routes requires --application');
const routeModule=withRoutes?await import('./website-auth-routes-bundle.mjs'):null;
const routeBundle=routeModule?.buildRouteRunner();
const withHttp=process.argv.includes('--next-http');
if(withHttp&&!withRoutes)throw Error('--next-http requires --routes');
const withWorker=process.argv.includes('--worker');
if(withWorker&&!withHttp)throw Error('--worker requires --next-http');
const withBrowser=process.argv.includes('--browser');
if(withBrowser&&!withWorker)throw Error('--browser requires --worker');
const IMAGES={
 db:'public.ecr.aws/supabase/postgres@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108',
 auth:'public.ecr.aws/supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',
 rest:'public.ecr.aws/supabase/postgrest@sha256:1347d7552b88f17832912c06afbf7c43209af6eeeb60834b04aae12c9bd9d5cc',
 client:'node@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914'
};
const runId=randomUUID(),prefix='omnira-web-auth-'+runId,network=prefix+'-net';
const names={db:prefix+'-db',auth:prefix+'-auth',rest:prefix+'-rest',client:prefix+'-client'};
const browserNetwork=network+'-browser';
if(withBrowser){names.browserProxy=prefix+'-browser-proxy';IMAGES.browserProxy=IMAGES.client;}
const label='com.omnira.real-auth-test',password=randomBytes(24).toString('hex'),jwtSecret=randomBytes(32).toString('hex');
const secrets=[password,jwtSecret];
const nextFixture=withHttp?(await import('./website-auth-next-fixture.mjs')).buildNextFixture(withBrowser?{url:'http://127.0.0.1:54393',anon:serviceJWT('anon')}:null):null;
const receipt={schema:'omnira.website-real-auth-local.v1',startedAt:new Date().toISOString(),images:IMAGES,checks:[],completed:false,cleanup:{},limitations:['Real local Auth/PostgREST and a fictional RLS table only. No WebBuilder UI, canonical application schema, worker, hosted Auth, Storage HTTP or paid models are tested.']};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(name,ok)=>{receipt.checks.push({name,passed:Boolean(ok)});if(!ok)throw Error(name);};
const safe=s=>secrets.reduce((v,key)=>v.replaceAll(key,'[synthetic-redacted]'),String(s??'')).slice(-2200);
function docker(args,input,raw=false){
 const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:4*1024*1024,timeout:60000});
 if(r.status!==0){const e=Error('DOCKER_COMMAND_FAILED');e.detail=safe(r.stderr||r.error?.message);throw e;}
 return raw?r.stdout:r.stdout.trim();
}
const sql=body=>docker(['exec','-i',names.db,'psql','-X','-q','-A','-t','--single-transaction','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],body);
function start(key,env,port,args=[]){
 const options=['run','-d','--pull=never','--name',names[key],'--label',label+'='+runId,'--network',key==='browserProxy'?browserNetwork:network,'--memory',key==='db'?'768m':key==='client'&&withHttp?'512m':'256m'];
 if(key==='browserProxy'&&withBrowser)options.push('--cap-drop','ALL','--security-opt','no-new-privileges','-p','127.0.0.1:54393:54393','-p','127.0.0.1:54394:54394');
 options.push('--network-alias',key); // Core services stay internal; browser mode adds an owned fixed-upstream loopback proxy.
 for(const [k,v] of Object.entries(env))options.push('-e',k+'='+v);
 docker([...options,IMAGES[key],...args]);
}
function endpoint(key,port){
 const info=JSON.parse(docker(['inspect',names[key]]))[0];
 check(key+'_internal_network',info.HostConfig.NetworkMode===network&&info.Mounts.every(m=>m.Type!=='bind')&&!info.HostConfig.Privileged);
 receipt[key+'PortMetadata']={state:info.State.Status,requested:info.HostConfig.PortBindings,mapped:info.NetworkSettings.Ports};
 check(key+'_no_published_ports',!Object.keys(info.HostConfig.PortBindings??{}).length&&Object.values(info.NetworkSettings.Ports??{}).every(p=>!p||p.length===0));
 return 'http://'+key+':'+port;
}
async function waitHttp(url){
 const target=new URL(url);
 for(let n=0;n<45;n++){try{const r=await request(target.origin,target.pathname);if(r.status===200)return;}catch{}await sleep(400);}
 throw Error('SERVICE_NOT_READY');
}
async function request(base,path,{token,method='GET',body,prefer}={}){
 const headers={};if(token)headers.authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';if(prefer)headers.Prefer=prefer;
 const clientCode="const fs=require('node:fs');(async()=>{const x=JSON.parse(fs.readFileSync(0,'utf8'));const u=new URL(x.url);if(!['http://auth:9999','http://rest:3000'].includes(u.origin))throw Error('NONLOCAL_HTTP_REFUSED');try{const r=await fetch(u,{method:x.method,headers:x.headers,body:x.body,signal:AbortSignal.timeout(5000)});const text=await r.text();let data=null;try{data=JSON.parse(text)}catch{}process.stdout.write(JSON.stringify({status:r.status,data}));}catch{process.stdout.write(JSON.stringify({status:0,data:null}));}})().catch(()=>process.exit(1));";
 return JSON.parse(docker(['exec','-i',names.client,'node','-e',clientCode],JSON.stringify({url:base+path,method,headers,body:body===undefined?undefined:JSON.stringify(body)})));
}
function serviceJWT(role='service_role'){
 const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const value=b({alg:'HS256',typ:'JWT'})+'.'+b({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});
 const token=value+'.'+createHmac('sha256',jwtSecret).update(value).digest('base64url');secrets.push(token);return token;
}
try{
 const host=docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']);
 check('local_docker_only',/^(npipe|unix):\/\//.test(host)&&(!process.env.DOCKER_HOST||/^(npipe|unix):\/\//.test(process.env.DOCKER_HOST)));
 for(const image of Object.values(IMAGES))docker(['image','inspect',image]);
 docker(['network','create','--internal','--label',label+'='+runId,network]);
 const net=JSON.parse(docker(['network','inspect',network]))[0];check('network_has_no_external_gateway',net.Internal===true);
 start('db',{POSTGRES_PASSWORD:password},null,['postgres','-c','shared_preload_libraries=pg_stat_statements,pg_cron,pg_net','-c','cron.database_name=postgres','-c','cron.launch_active_jobs=off','-c','listen_addresses=*']);
 let ready=false;for(let n=0;n<100;n++){
  try{const pid=docker(['exec',names.db,'cat','/proc/1/comm']);docker(['exec',names.db,'pg_isready','-U','postgres']);if(['postgres','.postgres-wrapp'].includes(pid)){ready=true;break;}}catch{}await sleep(400);
 }
 check('database_ready',ready);
 sql("alter role supabase_auth_admin with password '"+password+"';alter role authenticator with password '"+password+"';grant anon,authenticated,service_role to authenticator;");
 check('managed_auth_uid_available',sql("select to_regprocedure('auth.uid()') is not null;")==='t');
 start('client',{},null,['node','-e','setInterval(()=>{},1000000)']);
 if(withBrowser){
  docker(['network','create','--label',label+'='+runId,browserNetwork]);
  const {BROWSER_PROXY_CODE}=await import('./website-auth-browser-proxy.mjs');
  start('browserProxy',{},null,['node','-e',BROWSER_PROXY_CODE]);
  docker(['network','connect',network,names.browserProxy]);
 }
 start('auth',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:'postgres://supabase_auth_admin:'+password+'@db:5432/postgres',GOTRUE_SITE_URL:'http://127.0.0.1',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:'1025'},9999);
 const auth=endpoint('auth',9999);await waitHttp(auth+'/health');check('real_auth_health',true);
 const service=serviceJWT(),users=[];
 for(const alias of ['one','two']){
  const email=alias+'-'+runId+'@example.invalid';
  const created=await request(auth,'/admin/users',{token:service,method:'POST',body:{email,password,email_confirm:true}});
  check('create_'+alias,created.status===200&&/^[0-9a-f-]{36}$/.test(created.data?.id??''));
  const login=await request(auth,'/token?grant_type=password',{method:'POST',body:{email,password}});
  check('password_login_'+alias,login.status===200&&login.data?.user?.id===created.data.id&&Boolean(login.data?.access_token)&&Boolean(login.data?.refresh_token));
  secrets.push(login.data.access_token,login.data.refresh_token);users.push({id:created.data.id,email,...login.data});
 }
 const [a,b]=users;
 const bad=await request(auth,'/token?grant_type=password',{method:'POST',body:{email:a.email,password:'incorrect-synthetic-password'}});
 check('wrong_password_denied',bad.status===400||bad.status===401);
 const identity=await request(auth,'/user',{token:a.access_token});check('server_validates_user_token',identity.status===200&&identity.data?.id===a.id);
 const renewed=await request(auth,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.refresh_token}});
 check('refresh_session',renewed.status===200&&renewed.data?.user?.id===a.id&&Boolean(renewed.data?.access_token));
 secrets.push(renewed.data.access_token,renewed.data.refresh_token);
 if(applicationModule)applicationContext=applicationModule.bootstrapApplication({sql,docker,check,receipt,a,b});
 sql(`create table public.webbuilder_auth_probe(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),body text not null);
 alter table public.webbuilder_auth_probe enable row level security;
 create policy probe_read on public.webbuilder_auth_probe for select to authenticated using((select auth.uid())=owner_id);
 create policy probe_insert on public.webbuilder_auth_probe for insert to authenticated with check((select auth.uid())=owner_id);
 create policy probe_update on public.webbuilder_auth_probe for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
 grant usage on schema public,auth to anon,authenticated,service_role;
 revoke all on public.webbuilder_auth_probe from anon;
 grant select,insert,update,delete on public.webbuilder_auth_probe to authenticated;
 grant all on public.webbuilder_auth_probe to service_role;
 insert into public.webbuilder_auth_probe(owner_id,body) values('${a.id}','one'),('${b.id}','two');`);
 start('rest',{PGRST_DB_URI:'postgres://authenticator:'+password+'@db:5432/postgres',PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_SERVER_PORT:'3000',PGRST_DB_USE_LEGACY_GUCS:'false'},3000);
 const rest=endpoint('rest',3000);await waitHttp(rest+'/');check('real_postgrest_health',true);
 const one=await request(rest,'/webbuilder_auth_probe?select=id,owner_id,body',{token:renewed.data.access_token});
 const two=await request(rest,'/webbuilder_auth_probe?select=id,owner_id,body',{token:b.access_token});
 check('owner_one_sees_only_own_row',one.status===200&&one.data?.length===1&&one.data[0].owner_id===a.id);
 check('owner_two_sees_only_own_row',two.status===200&&two.data?.length===1&&two.data[0].owner_id===b.id);
 const foreign=await request(rest,'/webbuilder_auth_probe?id=eq.'+two.data[0].id,{token:renewed.data.access_token});
 check('foreign_read_hidden',foreign.status===200&&foreign.data?.length===0);
 const patch=await request(rest,'/webbuilder_auth_probe?id=eq.'+two.data[0].id,{token:renewed.data.access_token,method:'PATCH',body:{body:'forbidden'},prefer:'return=representation'});
 check('foreign_update_no_rows',patch.status===200&&patch.data?.length===0);
 const reassign=await request(rest,'/webbuilder_auth_probe?id=eq.'+one.data[0].id,{token:renewed.data.access_token,method:'PATCH',body:{owner_id:b.id},prefer:'return=representation'});
 check('owner_reassignment_denied',reassign.status===403);
 const insert=await request(rest,'/webbuilder_auth_probe',{token:renewed.data.access_token,method:'POST',body:{owner_id:b.id,body:'forbidden'}});
 check('foreign_insert_denied',insert.status===403);
 const anon=await request(rest,'/webbuilder_auth_probe');check('anonymous_denied',anon.status===401||anon.status===403);
 const admin=await request(rest,'/webbuilder_auth_probe?select=id',{token:service});check('service_sees_two_fictional_rows',admin.status===200&&admin.data?.length===2);
 if(applicationModule)await applicationModule.testApplicationHTTP({sql,check,request,rest,auth,service,a,b,token:renewed.data.access_token,context:applicationContext});
 if(routeModule)await routeModule.runRouteChecks({bundle:routeBundle,nextFixture,withWorker,withBrowser,password,docker,sql,check,receipt,client:names.client,browserProxy:names.browserProxy,service,anon:serviceJWT('anon'),a:{...a,access_token:renewed.data.access_token,refresh_token:renewed.data.refresh_token},b,context:applicationContext});
 const signedOut=await request(auth,'/logout',{token:renewed.data.access_token,method:'POST'});
 check('signout',signedOut.status===204);
 const revoked=await request(auth,'/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:renewed.data.refresh_token}});
 check('refresh_after_signout_denied',revoked.status===400||revoked.status===401||revoked.status===403);
 check('cron_launching_off',sql("select current_setting('cron.launch_active_jobs');")==='off');
 receipt.completed=true;
}catch(error){
 receipt.failure={code:safe(error.message),detail:safe(error.detail??'')};
 const logs={};for(const key of ['db','auth','rest']){const r=spawnSync('docker',['logs','--tail','18',names[key]],{encoding:'utf8',timeout:5000});if(r.status===0)logs[key]=safe(r.stderr||r.stdout);}
 writeFileSync(join(tmpdir(),'omnira-website-auth-local-diagnostics.json'),JSON.stringify(logs,null,2));
}finally{
 for(const key of (withBrowser?['browserProxy','rest','auth','client','db']:['rest','auth','client','db'])){
  try{const item=JSON.parse(docker(['inspect',names[key]]))[0];if(item.Config.Labels?.[label]!==runId)throw Error('LABEL_MISMATCH');docker(['rm','-f','-v',names[key]]);receipt.cleanup[key]='removed';}catch{const r=spawnSync('docker',['inspect',names[key]],{encoding:'utf8',timeout:5000});receipt.cleanup[key]=r.status!==0?'not_present':'cleanup_failed';}
 }
 try{const item=JSON.parse(docker(['network','inspect',network]))[0];if(item.Labels?.[label]!==runId)throw Error('LABEL_MISMATCH');docker(['network','rm',network]);receipt.cleanup.network='removed';}catch{receipt.cleanup.network='not_present_or_failed';}
 if(withBrowser){try{const item=JSON.parse(docker(['network','inspect',browserNetwork]))[0];if(item.Labels?.[label]!==runId)throw Error('LABEL_MISMATCH');docker(['network','rm',browserNetwork]);receipt.cleanup.browserNetwork='removed';}catch{receipt.cleanup.browserNetwork='not_present_or_failed';}}
 if(Object.values(receipt.cleanup).some(v=>!['removed','not_present'].includes(v)))receipt.completed=false;
 receipt.finishedAt=new Date().toISOString();
 routeBundle?.cleanup();
 nextFixture?.cleanup();
 receipt.mode=withBrowser?'real-browser':withWorker?'preset-worker':withHttp?'next-http':withRoutes?'application-route-cookies':withApplication?'canonical-application':'auth-probe';
 if(withApplication)receipt.limitations=['Real local Auth and canonical application SQL through PostgREST only; no Next.js UI/cookies, application route/context resolver, worker, hosted acceptance, Storage HTTP or paid model calls.'];
 if(withRoutes)receipt.limitations=['Real route exports invoked in-process with Next request storage and real SSR cookies, GoTrue and PostgREST. No Next HTTP server, middleware, browser UI, worker, hosted acceptance, Storage HTTP or paid models.'];
 if(withHttp)receipt.limitations=['Actual standalone Next HTTP routes and production middleware against real local Auth/canonical SQL. Minimal test app, not full WebBuilder browser UI; no worker, hosted acceptance, Storage HTTP or paid models.'];
 if(withWorker)receipt.limitations=['Real Next approvals/budget/queue and canonical preset worker with zero provider steps. No browser UI, drain terminalization, paid generation, media/export or hosted acceptance.'];
 if(withBrowser)receipt.limitations=['Actual Chromium login and Studio components in minimal Next shell with real Auth/SQL and preset worker. Loopback-only temporary browser ports. No full platform shell, chat generation, provider spend, complete media/export or hosted target.'];
 const path=fileURLToPath(new URL('../../../docs/validation/'+(withBrowser?'website-real-auth-browser-20261105.json':withWorker?'website-real-auth-worker-20261105.json':withHttp?'website-real-auth-next-http-20261105.json':withRoutes?'website-real-auth-routes-local-20261105.json':withApplication?'website-real-auth-application-local-20261105.json':'website-real-auth-local-20261105.json'),import.meta.url));
 writeFileSync(path,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));process.exitCode=receipt.completed?0:1;
}
