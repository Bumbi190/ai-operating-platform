import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const mod=await import('./accept.mjs').catch(()=>({}));
for(const args of [[],['run','--candidate','remote:cloud'],['run','--candidate','qwen3:8b','--url','http://x'],['assess','--report','x']])test('acceptance rejects invalid command '+args.join(' '),async()=>{
  assert.equal(typeof mod.parseArgs,'function');assert.throws(()=>mod.parseArgs(args),/INVALID_COMMAND/);
});
test('CLI invalid command returns exit 2 without needing a runtime',()=>{
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('./accept.mjs',import.meta.url)),'unknown'],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).reasonCode,'INVALID_COMMAND');
});
test('module import has no inference or stdout side effect',()=>{
  const r=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('./accept.mjs',import.meta.url).href)})`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'');
});
test('GPU sample timing is independent of a slower ownership lookup',async()=>{
  let active=true;const snapshot={candidateId:'qwen3:8b',modelDigest:'a'.repeat(64)};
  const execProbe=async(file,args)=>{if(file==='powershell.exe'){await new Promise(r=>setTimeout(r,50));active=false;return{stdout:JSON.stringify({ProcessId:55,ParentProcessId:44,ExecutablePath:'/owned/runner.exe'})};}return{stdout:file==='nvidia-smi'?'RTX 3060, 6000 MiB, 90 %':'qwen3:8b 100% GPU'};};
  const evidence=await mod.collectGpuEvidence(snapshot,{ps:async()=>({models:[{name:snapshot.candidateId,digest:snapshot.modelDigest,size:100,size_vram:100}]})},{exe:'/owned/ollama.exe',journal:{processId:44}},{isInFlight:()=>active,startedAt:new Date().toISOString()},execProbe);
  assert.equal(evidence.duringInference,true);assert.equal(evidence.fullyOnGpu,true);assert.equal(evidence.ownedRunner.processId,55);
});
