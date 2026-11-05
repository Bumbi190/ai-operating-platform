// Test-only bundle; production route and auth modules are included unchanged.
import {spawnSync} from 'node:child_process';
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
export function runRouteChecks({bundle,docker,sql,check,receipt,client,service,anon,a,b,context}){
 const routeConversation=randomUUID();
 sql("insert into public.conversations(id,project_id,user_id) values('"+routeConversation+"','"+context.projects[0]+"','"+a.id+"');");
 docker(['cp',bundle.path,client+':/tmp/omnira-routes.mjs']);
 const result=JSON.parse(docker(['exec','-i',client,'node','/tmp/omnira-routes.mjs'],JSON.stringify({service,anon,a,b,context:{...context,routeConversation}})));
 receipt.routes=result;
 check('actual_routes_with_real_cookie_sessions',result.completed&&result.checks.every(c=>c.passed));
 check('routes_created_no_build_jobs',sql("select count(*) from public.runs where project_id in ('"+context.projects.join("','")+"');")==='0');
}
if(process.argv.includes('--check-bundle')){const bundle=buildRouteRunner();const result=spawnSync(process.execPath,[bundle.path],{input:'',encoding:'utf8',timeout:10000});bundle.cleanup();if(result.status!==0)throw Error(result.stderr);console.log('Route bundle compiled and imports executed');}
