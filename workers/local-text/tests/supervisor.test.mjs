import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const api=await import('../supervisor.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('backoff_is_bounded and five crashes in ten minutes pause with one action',async()=>{
 assert.equal(typeof api.supervise,'function');const delays=[],events=[];let clock=0,calls=0;
 const result=await api.supervise({deviceId:'55555555-5555-4555-8555-555555555555'},new AbortController().signal,{now:()=>clock,session:async()=>{calls++;return {status:'crashed',kernelEmpty:true}},wait:async ms=>{delays.push(ms);clock+=ms},log:async e=>events.push(e)});
 assert.equal(calls,5);assert.deepEqual(delays,[1000,2000,4000,8000]);assert.equal(result.status,'paused');assert.equal(events.filter(e=>e.code==='CRASH_LIMIT').length,1);
 assert.deepEqual([0,1,2,3,4,5,20].map(api.restartDelay),[1000,2000,4000,8000,16000,30000,30000]);
});
test('uncertain_lock_survives_restart and no_foreign_process_cleanup',async()=>{
 assert.equal(typeof api.supervise,'function');let calls=0;const outcome=await api.supervise({deviceId:'55555555-5555-4555-8555-555555555555'},new AbortController().signal,{session:async()=>{calls++;return {status:'needs_input',kernelEmpty:true,reasonCode:'UNCERTAIN_HOLD'}},log:async()=>{}});assert.equal(calls,1);assert.equal(outcome.status,'paused');
 let tries=0;const unconfirmed=await api.supervise({},new AbortController().signal,{session:async()=>{tries++;return {status:'crashed',kernelEmpty:false,pid:123}},log:async()=>{}});assert.equal(tries,1);assert.equal(unconfirmed.status,'paused');
});
test('bounded rotating logs accept only lifecycle codes and never raw text/key/auth',async()=>{
 assert.equal(typeof api.createLifecycleLog,'function');const dir=await mkdtemp(path.join(os.tmpdir(),'local-text-log-'));
 try{const log=api.createLifecycleLog(dir,{maxBytes:1024,files:3});for(let i=0;i<90;i++)await log({code:'SESSION_EXIT',at:new Date().toISOString(),status:'crashed',source:'SECRET raw text',authorization:'Bearer sk-secret',privateKey:'secret'});const files=await readdir(dir);assert.ok(files.length<=3);for(const f of files){const bytes=await readFile(path.join(dir,f),'utf8');assert.ok(Buffer.byteLength(bytes)<=1024);assert.doesNotMatch(bytes,/SECRET|Bearer|sk-secret|privateKey|authorization/)}await assert.rejects(log({code:'secret raw'}));}finally{await rm(dir,{recursive:true,force:true})}
});

test('startup_preview_has_no_privilege_or_secrets and removal refuses foreign task', {skip:process.platform!=='win32'},async()=>{
 const {execFileSync}=await import('node:child_process');const scripts=path.resolve('workers/local-text/scripts');
 const source=`. '${scripts.replaceAll("'","''")}\\startup-plan.ps1'; $p=New-LocalTextStartupPlan -DeviceId '55555555-5555-4555-8555-555555555555' -ConfigPath 'C:\\Owned\\config.json' -NodePath 'C:\\Program Files\\nodejs\\node.exe' -SupervisorPath 'C:\\Owned\\supervisor.mjs' -UserSid ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value); $ok=Test-LocalTextStartupOwnership -Xml $p.xml -Plan $p; $bad=Test-LocalTextStartupOwnership -Xml ($p.xml.Replace('C:\\Owned\\supervisor.mjs','C:\\Other\\supervisor.mjs')) -Plan $p; @{plan=$p;owned=$ok;foreign=$bad}|ConvertTo-Json -Depth 8 -Compress`;
 const r=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',source],{encoding:'utf8'}));assert.equal(r.owned,true);assert.equal(r.foreign,false);assert.match(r.plan.xml,/LeastPrivilege/);assert.match(r.plan.xml,/InteractiveToken/);assert.match(r.plan.xml,/LogonTrigger/);assert.match(r.plan.xml,/IgnoreNew/);assert.doesNotMatch(r.plan.xml,/HighestAvailable|Password|Bearer|sk-|OPENAI_API_KEY|StartWhenAvailable>true/);assert.match(r.plan.rollback,/revoke/i);
});

test('kernel job closes only owned descendants; a foreign process remains alive', {skip:process.platform!=='win32'},async()=>{
 const {execFileSync}=await import('node:child_process');const script=path.resolve('workers/local-text/scripts/test-owned-job.ps1');const r=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script],{encoding:'utf8',timeout:20000}));assert.equal(r.assignedBeforeResume,true);assert.equal(r.kernelEmpty,true);assert.equal(r.ownedExited,true);assert.equal(r.foreignAlive,true);assert.equal(r.closeKilled,true);
});

test('actual startup Preview makes no task and uncertain local files are byte-preserved',{skip:process.platform!=='win32'},async()=>{
 const {execFileSync}=await import('node:child_process');const {randomUUID}=await import('node:crypto');const base=path.resolve('workers/local-text'),deviceId=randomUUID(),dir=path.join(base,'.local-state',deviceId),runtime=path.join(dir,'runtime');await (await import('node:fs/promises')).mkdir(runtime,{recursive:true});
 const configPath=path.join(dir,'config.json'),journalFile=path.join(dir,'attempt.dpapi.json'),lock=path.join(runtime,'job.lock');const before='UNCERTAIN synthetic tombstone';
 try{await writeFile(configPath,JSON.stringify({version:1,deviceId,runtimeDir:runtime,runtimeHash:'a'.repeat(64),journalFile,counterFile:path.join(dir,'counter.json')}));await writeFile(journalFile,before);await writeFile(lock,before);
 const run=(file,args=[])=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(base,'scripts',file),'-ConfigPath',configPath,'-NodePath',process.execPath,...args],{encoding:'utf8',timeout:10000}));
 const preview=run('install-startup.ps1',['-Preview']);assert.equal(preview.taskName,'Omnira-Atlas-LocalText-'+deviceId);assert.equal(preview.requiresLogin,true);assert.match(preview.arguments,/--config/);
 const held=run('start-worker.ps1',['-ParentProcessId',String(process.pid)]);assert.deepEqual(held,{status:'needs_input',kernelEmpty:true});assert.equal(await readFile(journalFile,'utf8'),before);assert.equal(await readFile(lock,'utf8'),before);
 const registered=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-ScheduledTask -TaskName '${preview.taskName}' -TaskPath '\\Omnira\\' -ErrorAction SilentlyContinue).Count`],{encoding:'utf8'});assert.equal(registered.trim(),'0');
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('graceful stop marker aborts the worker without clearing any recovery file',async()=>{
 const api=await import('../shutdown.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});assert.equal(typeof api.observeStopFile,'function');const dir=await mkdtemp(path.join(os.tmpdir(),'text-stop-'));const marker=path.join(dir,'stop.request'),journal=path.join(dir,'journal');await writeFile(journal,'uncertain');const c=new AbortController();let stop;
 try{stop=api.observeStopFile(marker,c,5);await writeFile(marker,'stop');await new Promise((resolve,reject)=>{const limit=setTimeout(()=>reject(Error('STOP_NOT_OBSERVED')),500);c.signal.addEventListener('abort',()=>{clearTimeout(limit);resolve()},{once:true})});assert.equal(await readFile(journal,'utf8'),'uncertain');}finally{stop?.();await rm(dir,{recursive:true,force:true})}
});
