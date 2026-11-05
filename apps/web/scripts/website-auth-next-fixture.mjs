// Test-only minimal Next app: real production route exports and middleware.
// Build on the host; execute the standalone Node server on the owned internal network.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),app=join(root,'apps/web');
export function buildNextFixture(){
 const directory=mkdtempSync(join(app,'.auth-next-')),buildLog=join(directory,'build.log');
 const write=(path,body)=>{mkdirSync(join(directory,path,'..'),{recursive:true});writeFileSync(join(directory,path),body);};
 write('package.json',JSON.stringify({name:'omnira-auth-http-fixture',private:true}));
 write('app/layout.js',"export default function Layout({children}){return <html><body>{children}</body></html>}");
 write('app/page.js',"export default function Page(){return <main>Isolated WebBuilder HTTP acceptance fixture</main>}");
 const routes=[
 ['website-build-settings',['GET','POST']],
 ['website-build-plans',['POST']],
 ['website-build-plans/[planId]',['GET']],
 ['website-build-plans/[planId]/approve',['POST']],
 ['website-build-plans/[planId]/mockups/approve',['POST']],
 ['website-build-plans/[planId]/start',['POST']],
 ['website-build/studio',['POST']],
 ['website-build/studio/budget',['POST']],
 ['website-builds/[sessionId]',['GET']],
 ['website-builds/[sessionId]/revisions/[revisionId]',['GET']]
 ];
 for(const [path,verbs] of routes)write('app/api/'+path+'/route.ts',"export const dynamic='force-dynamic';export {"+verbs.join(',')+"} from '@/app/api/"+path+"/route';");
 // Copy exact middleware bytes: no relaxation of membership/ownership checks.
 write('middleware.ts',readFileSync(join(app,'middleware.ts'),'utf8'));
 write('next.config.mjs',"export default {output:'standalone',experimental:{outputFileTracingRoot:"+JSON.stringify(root)+",cpus:1},typescript:{ignoreBuildErrors:true},eslint:{ignoreDuringBuilds:true},webpack(config){config.resolve.alias['@']="+JSON.stringify(app)+";return config}}");
 const env={...process.env,NEXT_TELEMETRY_DISABLED:'1'};
 // Never load/inject production credentials or public build-time values into this test app.
 for(const key of Object.keys(env))if(/SUPABASE|VERCEL|ANTHROPIC|OPENAI|STRIPE|RESEND|DATABASE_URL|NEXT_PUBLIC/.test(key))delete env[key];
 const cleanup=()=>rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 console.log('Building isolated Next HTTP fixture (production route exports + middleware).');
 try{
  const result=spawnSync(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build',directory],{cwd:directory,env,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
  writeFileSync(buildLog,(result.stdout??'')+'\n'+(result.stderr??''));
  if(result.status!==0)throw Error('NEXT_FIXTURE_BUILD_FAILED\n'+readFileSync(buildLog,'utf8').slice(-5000));
  const standalone=join(directory,'.next/standalone'),serverRelative=relative(root,directory).replaceAll('\\','/')+'/server.js';
  if(!existsSync(join(standalone,serverRelative)))throw Error('NEXT_STANDALONE_SERVER_MISSING');
  console.log('Next HTTP fixture built.');
  return {directory:standalone,serverRelative,cleanup};
 }catch(error){cleanup();throw error}
}
if(process.argv.includes('--check-build')){const fixture=buildNextFixture();console.log('Standalone ready: '+fixture.serverRelative);fixture.cleanup();}
