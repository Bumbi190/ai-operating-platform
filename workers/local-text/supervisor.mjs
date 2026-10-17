import {setTimeout as delay} from 'node:timers/promises';import {mkdir,appendFile,stat,rename,unlink,readFile,writeFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';import {identityEnvironment} from './identity.mjs';
const codes=new Set(['SESSION_START','SESSION_EXIT','CRASH_LIMIT','UNCERTAIN_HOLD','KERNEL_UNCONFIRMED','STOPPED']);
export const restartDelay=n=>Math.min(30000,1000*2**Math.min(5,Math.max(0,n)));
/** Serialized metadata-only log. Child stdout/stderr is never copied into it. */
export function createLifecycleLog(dir,{maxBytes=65536,files=3}={}){
 if(!path.isAbsolute(dir)||!Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>65536||files!==3)throw Error('INVALID_LOG_CONFIG');let pending=Promise.resolve();
 return value=>{const work=async()=>{if(!codes.has(value?.code))throw Error('INVALID_LIFECYCLE_CODE');const line=JSON.stringify({version:1,at:new Date().toISOString(),code:value.code,...(['crashed','stopped','needs_input','paused'].includes(value.status)?{status:value.status}:{})})+'\n';await mkdir(dir,{recursive:true});const target=path.join(dir,'lifecycle.log');let size=0;try{size=(await stat(target)).size;}catch(e){if(e.code!=='ENOENT')throw e;}if(size+Buffer.byteLength(line)>maxBytes){await unlink(target+'.2').catch(e=>{if(e.code!=='ENOENT')throw e;});for(let i=1;i>=0;i--){const from=target+(i?'.'+i:'');await rename(from,target+'.'+(i+1)).catch(e=>{if(e.code!=='ENOENT')throw e;});}}await appendFile(target,line,{mode:0o600});};const result=pending.then(work);pending=result.catch(()=>{});return result;};
}
export async function supervise(config,signal,{session,now=Date.now,wait=ms=>delay(ms,undefined,{signal}),log=async()=>{}}={}){
 if(typeof session!=='function')throw Error('OWNED_SESSION_REQUIRED');const crashes=[];let attempt=0;
 while(!signal.aborted){await log({code:'SESSION_START'});let result;try{result=await session(config,signal);}catch{result={status:'crashed',kernelEmpty:false};}
  await log({code:'SESSION_EXIT',status:result?.status});
  if(result?.status==='needs_input'||result?.kernelEmpty!==true){await log({code:result?.status==='needs_input'?'UNCERTAIN_HOLD':'KERNEL_UNCONFIRMED',status:'paused'});return {status:'paused'};}
  if(signal.aborted||result.status==='stopped'){await log({code:'STOPPED',status:'stopped'});return {status:'stopped'};}
  const current=now();crashes.push(current);while(crashes[0]<current-600000)crashes.shift();if(crashes.length>=5){await log({code:'CRASH_LIMIT',status:'paused'});return {status:'paused'};}
  try{await wait(restartDelay(attempt++));}catch{if(!signal.aborted)throw Error('SUPERVISOR_WAIT_FAILED');}
 }
 await log({code:'STOPPED',status:'stopped'});return {status:'stopped'};
}
const helper=fileURLToPath(new URL('./scripts/start-worker.ps1',import.meta.url));
export async function main(args,signal){
 if(process.platform!=='win32'||args.length!==2||args[0]!=='--config'||!path.isAbsolute(args[1]))throw Error('INVALID_SUPERVISOR_CONFIG');
 const config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(args[1])));const base=path.dirname(fileURLToPath(import.meta.url)),state=path.join(base,'.local-state',config.deviceId??'');
 if(!/^[a-f0-9-]{36}$/.test(config.deviceId??'')||path.resolve(args[1])!==path.join(state,'config.json'))throw Error('INVALID_SUPERVISOR_CONFIG');
 const log=createLifecycleLog(path.join(state,'logs'));
 const marker=path.join(state,'stop.request');try{await stat(marker);throw Error('STOP_MARKER_PRESENT');}catch(e){if(e.code!=='ENOENT')throw e;}
 const session=()=>new Promise(resolve=>{let escalation;const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-ConfigPath',args[1],'-NodePath',process.execPath,'-ParentProcessId',String(process.pid)],{windowsHide:true,env:identityEnvironment(),maxBuffer:16384},(error,stdout)=>{signal.removeEventListener('abort',abort);clearTimeout(escalation);try{const v=JSON.parse(stdout.trim());if(error||!['crashed','stopped','needs_input'].includes(v.status)||typeof v.kernelEmpty!=='boolean')throw Error();resolve(v);}catch{resolve({status:'crashed',kernelEmpty:false});}});
  const abort=()=>{writeFile(marker,'stop\n',{mode:0o600}).catch(()=>{});escalation=setTimeout(()=>child.kill(),10000);};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
 return supervise(config,signal,{session,log});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());main(process.argv.slice(2),controller.signal).then(r=>{process.stdout.write(JSON.stringify(r)+'\n');if(r.status==='paused')process.exitCode=2;}).catch(()=>{process.stderr.write('LOCAL_TEXT_SUPERVISOR_STOPPED\n');process.exitCode=1;});}
