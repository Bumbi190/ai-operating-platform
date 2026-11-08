// Test-only bundle; production route and auth modules are included unchanged.
import {spawn,spawnSync} from 'node:child_process';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export function buildRouteRunner(){
 const directory=mkdtempSync(join(tmpdir(),'omnira-auth-routes-')),path=join(directory,'routes.mjs');
 try{
  buildSync({entryPoints:[fileURLToPath(new URL('./website-auth-routes-local.ts',import.meta.url))],outfile:path,bundle:true,platform:'node',format:'esm',target:'node22',alias:{'@':join(root,'apps/web'),'server-only':join(root,'apps/web/lib/qa/__stubs__/server-only.ts')},banner:{js:"import {createRequire as __makeRequire} from 'node:module';import {AsyncLocalStorage as __ALS} from 'node:async_hooks';const require=__makeRequire(import.meta.url);globalThis.AsyncLocalStorage=__ALS;const __filename=new URL(import.meta.url).pathname;const __dirname=__filename.slice(0,__filename.lastIndexOf('/'));"},logLevel:'silent'});
  return {path,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
 }catch(error){rmSync(directory,{recursive:true,force:true});throw error}
}
async function browserPhase({client,browserProxy,fixture,docker,receipt,password,a,b}){
 const info=JSON.parse(docker(['inspect',browserProxy]))[0],bindings=info.NetworkSettings.Ports??{};
 const clientInfo=JSON.parse(docker(['inspect',client]))[0];
 if(Object.keys(clientInfo.HostConfig.PortBindings??{}).length||!info.NetworkSettings.Networks[clientInfo.HostConfig.NetworkMode])throw Error('BROWSER_BACKEND_ISOLATION_REFUSED');
 const expected={'54393/tcp':'54393','54394/tcp':'54394'};
 if(Object.keys(bindings).length!==2||!Object.entries(expected).every(([key,port])=>bindings[key]?.length===1&&bindings[key][0].HostIp==='127.0.0.1'&&bindings[key][0].HostPort===port))throw Error('BROWSER_PORT_BINDING_REFUSED');
 receipt.browserPortBindings=bindings;
 const child=spawn('docker',['exec','-i',client,'node','/tmp/omnira-routes.mjs'],{stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',ended=false,ready=null,result=null,protocolError=false;
 child.stdout.on('data',v=>{
  stdout+=v;if(stdout.length>1024*1024){protocolError=true;child.kill();return;}
  let end;while((end=stdout.indexOf('\n'))>=0){
   const line=stdout.slice(0,end);stdout=stdout.slice(end+1);if(!line.trim())continue;
   try{const message=JSON.parse(line);if(message.event==='browser-ready')ready=message.ready;else result=message;}catch{protocolError=true;child.kill();}
  }
 });child.stderr.on('data',v=>{stderr=(stderr+v).slice(-8000);});
 const complete=new Promise(resolve=>{child.on('exit',code=>{ended=true;resolve({code});});child.on('error',()=>{ended=true;resolve({code:-1});});});
 child.stdin.write(fixture+'\n');
 for(let n=0;n<240&&!ended;n++){
  if(ready)break;
  await new Promise(r=>setTimeout(r,500));
 }
 if(!ready){child.kill();throw Error('BROWSER_SERVER_NOT_READY');}
 const {runBrowserAcceptance}=await import('./website-auth-browser-local.mjs');
 receipt.browser=await runBrowserAcceptance({password,a,b,ready});
 child.stdin.end(JSON.stringify({event:'browser-done',completed:receipt.browser.completed})+'\n');
 const {code}=await complete;
 if(code!==0||protocolError||!result)throw Error('BROWSER_CONTAINER_RUNNER_FAILED');
 return result;
}
export async function runRouteChecks({bundle,nextFixture,withWorker,withFeedback,withSpendGuard,withDrain,withBrowser,password,docker,sql,check,receipt,client,browserProxy,service,anon,a,b,context}){
 if(withWorker){sql('insert into public.platform_config(id,automation_paused) values(1,false) on conflict(id) do nothing;');check('local_worker_authority_available',sql('select automation_paused from public.platform_config where id=1;')==='f');}
 if(withSpendGuard)sql('update public.platform_config set global_daily_sek=1000,global_weekly_sek=1000,global_monthly_sek=1000 where id=1;');
 const routeConversation=randomUUID();
 sql("insert into public.conversations(id,project_id,user_id) values('"+routeConversation+"','"+context.projects[0]+"','"+a.id+"');");
 if(nextFixture)docker(['cp',nextFixture.directory,client+':/tmp/omnira-next']);
 docker(['cp',bundle.path,client+':/tmp/omnira-routes.mjs']);
 const fixture=JSON.stringify({drain:withDrain,spendGuard:withSpendGuard,feedback:withFeedback,browser:withBrowser,worker:withWorker,nextServer:nextFixture?'/tmp/omnira-next/'+nextFixture.serverRelative:null,service,anon,a,b,context:{...context,routeConversation}});
 const result=withBrowser?await browserPhase({client,browserProxy,fixture,docker,receipt,password,a,b}):JSON.parse(docker(['exec','-i',client,'node','/tmp/omnira-routes.mjs'],fixture));
 receipt.routes=result;
 check('actual_routes_with_real_cookie_sessions',result.completed&&result.checks.every(c=>c.passed));
 check('original_projects_have_no_build_jobs',sql("select count(*) from public.runs where project_id in ('"+context.projects.join("','")+"');")==='0');
 if(withWorker){check('worker_completed_preview_runs_match_expected',sql("select count(*) from public.runs where context->>'websiteBuildCompleted'='true';")===(withFeedback?'2':'1'));check('worker_created_no_cost_events',sql('select count(*) from public.cost_events;')==='0');}
 if(withSpendGuard){check('spend_no_provider_dispatch_intents',sql('select count(*) from public.spend_reservations where dispatched_at is not null;')==='0');check('spend_no_open_reservations',sql("select count(*) from public.spend_reservations where status='open';")==='0');}
 if(withBrowser)check('actual_browser_ui_acceptance',receipt.browser?.completed===true&&receipt.browser.checks.every(c=>c.passed));
}
if(process.argv.includes('--check-bundle')){const bundle=buildRouteRunner();const result=spawnSync(process.execPath,[bundle.path],{input:'',encoding:'utf8',timeout:10000});bundle.cleanup();if(result.status!==0)throw Error(result.stderr);console.log('Route bundle compiled and imports executed');}
