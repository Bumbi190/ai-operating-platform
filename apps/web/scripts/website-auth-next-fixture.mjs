// Test-only minimal Next app: real production route exports and middleware.
// Build on the host; execute the standalone Node server on the owned internal network.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,cpSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)),app=join(root,'apps/web');
export function buildNextFixture(browser=null){
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
 ['website-build/studio',['GET','POST']],
 ['website-build/studio/budget',['POST']],
 ['website-builds/[sessionId]',['GET']],
 ['website-builds/[sessionId]/revisions/[revisionId]',['GET']]
 ];
 for(const [path,verbs] of routes)write('app/api/'+path+'/route.ts',"export const dynamic='force-dynamic';export {"+verbs.join(',')+"} from '@/app/api/"+path+"/route';");
 if(browser){
  write('app/layout.js',"import './globals.css';export default function Layout({children}){return <html><body>{children}</body></html>}");
  write('app/globals.css',readFileSync(join(app,'app/globals.css'),'utf8'));
  write('app/login/page.tsx',"export {default} from '@/app/(auth)/login/page';");
  write('app/build/page.tsx',"export const dynamic='force-dynamic';export {default} from '@/app/(platform)/build/page';");
  write('app/dashboard/page.js',"import {redirect} from 'next/navigation';export default function Page(){redirect('/build')}");
  write('postcss.config.cjs',"module.exports={plugins:{tailwindcss:{},autoprefixer:{}}}");
  write('tailwind.config.ts',"import config from "+JSON.stringify(join(app,'tailwind.config').replaceAll('\\','/'))+";export default {...config,content:["+JSON.stringify(join(app,'app/**/*.{ts,tsx}').replaceAll('\\','/'))+","+JSON.stringify(join(app,'components/**/*.{ts,tsx}').replaceAll('\\','/'))+","+JSON.stringify(join(app,'lib/**/*.{ts,tsx}').replaceAll('\\','/'))+"]}");
 }
 // Copy exact middleware bytes: no relaxation of membership/ownership checks.
 write('middleware.ts',readFileSync(join(app,'middleware.ts'),'utf8'));
 write('next.config.mjs',"export default {output:'standalone',images:{unoptimized:true},experimental:{outputFileTracingRoot:"+JSON.stringify(root)+",cpus:1},typescript:{ignoreBuildErrors:true},eslint:{ignoreDuringBuilds:true},webpack(config){config.resolve.alias['@']="+JSON.stringify(app)+";return config}}");
 const env={...process.env,NEXT_TELEMETRY_DISABLED:'1'};
 // Never load/inject production credentials or public build-time values into this test app.
 for(const key of Object.keys(env))if(/SUPABASE|VERCEL|ANTHROPIC|OPENAI|STRIPE|RESEND|DATABASE_URL|NEXT_PUBLIC/.test(key))delete env[key];
 if(browser){env.NEXT_PUBLIC_SUPABASE_URL=browser.url;env.NEXT_PUBLIC_SUPABASE_ANON_KEY=browser.anon;}
 const cleanup=()=>rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 console.log('Building isolated Next HTTP fixture (production route exports + middleware).');
 try{
  const result=spawnSync(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build',directory],{cwd:directory,env,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
  writeFileSync(buildLog,(result.stdout??'')+'\n'+(result.stderr??''));
  if(result.status!==0)throw Error('NEXT_FIXTURE_BUILD_FAILED\n'+readFileSync(buildLog,'utf8').slice(-5000));
  const standalone=join(directory,'.next/standalone'),serverRelative=relative(root,directory).replaceAll('\\','/')+'/server.js';
  if(!existsSync(join(standalone,serverRelative)))throw Error('NEXT_STANDALONE_SERVER_MISSING');
  if(browser){
   const serverDir=join(standalone,relative(root,directory));
   cpSync(join(directory,'.next/static'),join(serverDir,'.next/static'),{recursive:true});
   for(const name of ['omnira-favicon.svg','atlas-orb-login-masked.png']){
    const source=join(app,'public',name);if(existsSync(source)){mkdirSync(join(serverDir,'public'),{recursive:true});cpSync(source,join(serverDir,'public',name));}
   }
  }
  console.log('Next HTTP fixture built.');
  return {directory:standalone,serverRelative,cleanup};
 }catch(error){cleanup();throw error}
}
if(process.argv.includes('--check-build')){const fixture=buildNextFixture();console.log('Standalone ready: '+fixture.serverRelative);fixture.cleanup();}
