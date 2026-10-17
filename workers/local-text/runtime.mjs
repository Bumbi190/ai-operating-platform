import {execFile} from 'node:child_process';import {fileURLToPath} from 'node:url';import {stat} from 'node:fs/promises';import path from 'node:path';
import {computeAdapterHash,computeConfigurationHash} from './artifacts.mjs';
import {isSha256,toPilotJob} from '../../packages/local-text-contract/index.mjs';import {identityEnvironment} from './identity.mjs';
import {createOllamaClient} from '../local-models/ollama.mjs';import {readGGUFByteCoverage} from '../local-models/gguf-evidence.mjs';import {withRuntimeLease,runJob} from '../local-models/worker.mjs';
const normalize=d=>typeof d==='string'&&d.startsWith('sha256:')?d:'sha256:'+d;
export function assertGpuResidency(ps,candidateId,digest){
 const m=ps?.models?.[0];if(!Array.isArray(ps?.models)||ps.models.length!==1||m.name!==candidateId||normalize(m.digest)!==digest||!Number.isSafeInteger(m.size)||m.size<=0||m.size_vram!==m.size||m.context_length!==4096)throw Error('GPU_RESIDENCY_UNVERIFIED');return m;
}
const helper=fileURLToPath(new URL('./scripts/inspect-runtime.ps1',import.meta.url));
function inspectWindows(root,hash,signal,timeoutMs=3000){
 if(process.platform!=='win32')throw Error('WINDOWS_RUNTIME_REQUIRED');
 return new Promise((resolve,reject)=>{const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-RuntimeRoot',root,'-ExpectedRuntimeHash',hash],{signal,windowsHide:true,env:identityEnvironment(),timeout:timeoutMs,maxBuffer:16384},(error,stdout)=>{if(error)return reject(Error('LOCAL_MODEL_UNAVAILABLE'));try{resolve(JSON.parse(stdout));}catch{reject(Error('LOCAL_MODEL_UNAVAILABLE'));}});child.stdin.on('error',()=>{});child.stdin.end();});
}
/** Operator-only paths and pins. No model pull, filesystem discovery or task configuration. */
export function createRuntime(config,{client=createOllamaClient(),inspectOwned=inspectWindows,verifyGguf=readGGUFByteCoverage}={}){
 const c=structuredClone(config),profiles=c.profiles;if(!path.isAbsolute(c.runtimeDir)||!isSha256(c.runtimeHash)||!isSha256(c.adapterHash)||!isSha256(c.configurationHash)||!Array.isArray(profiles)||profiles.length<1||profiles.length>3||new Set(profiles.map(p=>p.candidateId)).size!==profiles.length||new Set(profiles.map(p=>p.modelDigest)).size!==profiles.length||typeof c.driverVersion!=='string')throw Error('INVALID_RUNTIME_CONFIG');
 for(const p of profiles)if(!['qwen3:8b','qwen3.5:4b','qwen3.5:9b'].includes(p.candidateId)||!/^sha256:[a-f0-9]{64}$/.test(p.modelDigest)||p.serverVersion!=='0.40.5'||!isSha256(p.modelBlobSha256)||!path.isAbsolute(p.ggufFile)||!p.tokenizerEvidence)throw Error('INVALID_RUNTIME_CONFIG');
 const verified=new Map();let initialized=false;
 async function ownership(signal,timeoutMs=3000){if(await computeAdapterHash()!==c.adapterHash||computeConfigurationHash(c)!==c.configurationHash)throw Error('IDENTITY_CHANGED');const o=await inspectOwned(c.runtimeDir,c.runtimeHash,signal,timeoutMs);if(o?.owned!==true||o.runtimeHash!==c.runtimeHash||o.serverVersion!=='0.40.5'||o.gpuAvailable!==true||(c.driverVersion&&o.driverVersion!==c.driverVersion))throw Error('IDENTITY_CHANGED');return o;}
 async function unchanged(p){const prior=verified.get(p.candidateId),current=await stat(p.ggufFile);if(!prior||current.size!==prior.size||current.mtimeMs!==prior.mtimeMs||current.ino!==prior.ino)throw Error('IDENTITY_CHANGED');}
 async function snapshot(p,signal){await unchanged(p);const actual=await client.inspectCandidate(p.candidateId,{signal});if(normalize(actual.modelDigest)!==p.modelDigest||actual.serverVersion!==p.serverVersion)throw Error('IDENTITY_CHANGED');return actual;}
 async function assertIdentity({claim,prepared,signal}){const p=profiles.find(p=>p.modelDigest===claim.modelDigest);if(!p||prepared?.candidateId!==p.candidateId)throw Error('IDENTITY_CHANGED');await ownership(signal);await snapshot(p,signal);assertGpuResidency(await client.ps({signal}),p.candidateId,p.modelDigest);const owner=await ownership(signal);if(!Array.isArray(owner.ownedGpuPids)||owner.ownedGpuPids.length<1)throw Error('GPU_RESIDENCY_UNVERIFIED');}
 return {
  async initialize(signal){await withRuntimeLease(c.runtimeDir,async()=>{await ownership(signal,10000);for(const p of profiles){const evidence=await verifyGguf(p.ggufFile,p.modelBlobSha256);if(evidence.byteCoverageSha256!==p.tokenizerEvidence.byteCoverageSha256||evidence.modelBlobSha256!==p.modelBlobSha256||p.tokenizerEvidence.modelDigest!==p.modelDigest||p.tokenizerEvidence.serverVersion!==p.serverVersion)throw Error('TOKEN_BUDGET_UNVERIFIED');const info=await stat(p.ggufFile);verified.set(p.candidateId,{size:info.size,mtimeMs:info.mtimeMs,ino:info.ino});await snapshot(p,signal);}initialized=true;});},
  async prepare({claim,lease,signal}){
   if(!initialized||lease?.uncertain)throw Error('LOCAL_STATE_ERROR');const p=profiles.find(p=>p.modelDigest===claim.modelDigest);if(!p)throw Error('IDENTITY_CHANGED');await ownership(signal);const actual=await snapshot(p,signal);
   const ps=await client.ps({signal});if(!Array.isArray(ps.models)||ps.models.length>1||ps.models.some(m=>!profiles.some(p=>p.candidateId===m.name)))throw Error('LOCAL_STATE_ERROR');
   try{for(const loaded of ps.models)if(loaded.name!==p.candidateId)await client.unload(loaded.name);await client.preloadBounded(p.candidateId,{signal,timeoutMs:30000});}catch(e){if(e.dispatched!==false&&!e.complete&&!e.definite)lease.uncertain=true;throw e;}
   const prepared={...actual,modelDigest:p.modelDigest};await assertIdentity({claim,prepared,signal});return prepared;
  },
  assertIdentity,
  async infer({claim,prepared,lease,signal,timeoutMs}){const p=profiles.find(p=>p.candidateId===prepared.candidateId);return runJob(toPilotJob(claim.task,claim.jobId),{candidateId:p.candidateId,expectedSnapshot:{...prepared,modelDigest:prepared.modelDigest.startsWith('sha256:')?prepared.modelDigest.slice(7):prepared.modelDigest},runtimeDir:c.runtimeDir,client:{...client,inspectCandidate:async(...args)=>{const s=await client.inspectCandidate(...args);return {...s,modelDigest:normalize(s.modelDigest).slice(7)};}},signal,lease,timeoutMs,requirePromptBudget:true,tokenizerEvidence:p.tokenizerEvidence});},
  async health({lease,signal}={}){
   const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(3000)]);let ready=false;
   try{await ownership(bounded);if(!initialized||lease?.uncertain)throw Error();for(const p of profiles)await snapshot(p,bounded);ready=true;}catch{}
   return {state:ready?'ready':'blocked',lifecycleLock:lease?.uncertain?'uncertain':'clear',gpuAvailable:ready,runtimeVersion:'0.40.5',runtimeHash:c.runtimeHash,adapterHash:c.adapterHash,configurationHash:c.configurationHash,models:ready?profiles.map(p=>({candidateId:p.candidateId,modelDigest:p.modelDigest})):[]};
  }
 };
}
