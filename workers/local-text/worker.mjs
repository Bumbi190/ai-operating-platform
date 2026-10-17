import {setTimeout as delay} from 'node:timers/promises';
import {parseClaim,hashTask,validateTaskResult,canonicalJson,sha256} from '../../packages/local-text-contract/index.mjs';
import {withRuntimeLease} from '../local-models/worker.mjs';import {createJournal} from './journal.mjs';
const codes=new Set(['TOKEN_BUDGET_UNVERIFIED','INPUT_TOO_LARGE','IDENTITY_CHANGED','INVALID_MODEL_RESPONSE','LOCAL_MODEL_UNAVAILABLE','LOCAL_STATE_ERROR']);
const acknowledged=r=>r?.kind==='applied'||r?.kind==='duplicate';
const every=(ms,fn)=>{let pending=false;const timer=setInterval(async()=>{if(pending)return;pending=true;try{await fn();}finally{pending=false;}},ms);return ()=>clearInterval(timer);};
const journalFor=deps=>deps.journal??createJournal(deps.journalFile);
const nowFor=deps=>deps.now?.()??new Date();
const expiryFor=(claim,now)=>new Date(Math.min(Date.parse(claim.expiresAt)-300000,now.getTime()+86400000)).toISOString();
const uncertain=claim=>({kind:'dispatch_unknown',jobId:claim.jobId,attemptId:claim.attemptId,inputHash:claim.inputHash});
async function send(deps,operation,payload,signal){try{return await deps.client.request(operation,payload,{signal});}catch{return {kind:'unknown',reconcileId:payload.claim?.attemptId??'unavailable'};}}
async function hold(lease,claim){lease.uncertain=true;await lease.handle.truncate(0);await lease.handle.write(JSON.stringify({pid:process.pid,jobId:claim.jobId,attemptId:claim.attemptId,inputHash:claim.inputHash,state:'uncertain'}),0,'utf8');await lease.handle.sync();}
/** One physical attempt. Metadata may be resent; generation is never retried. */
export async function executeClaim(input,deps,signal){
 let claim;try{claim=parseClaim(input);if(hashTask(claim.task)!==claim.inputHash)throw Error();}catch{return {kind:'known_failed',reasonCode:'LOCAL_STATE_ERROR'};}
 if(signal?.aborted)return {kind:'cancelled',jobId:claim.jobId};
 const journal=journalFor(deps),now=nowFor(deps);
 if(Date.parse(claim.leaseUntil)<=now.getTime()||Date.parse(claim.expiresAt)-300000<=now.getTime())return {kind:'known_failed',reasonCode:'LOCAL_STATE_ERROR'};
 try{
  return await withRuntimeLease(deps.runtimeDir,async lease=>{
   if(await journal.read())return {kind:'known_failed',reasonCode:'LOCAL_BUSY'};
   const controller=new AbortController(),combined=AbortSignal.any([...(signal?[signal]:[]),controller.signal]);let dispatched=false,physicalComplete=false,stopRenew=()=>{},renewInFlight=Promise.resolve();
   const deadline=setTimeout(()=>controller.abort(),Math.min(90000,Date.parse(claim.expiresAt)-300000-now.getTime()));
   const record={version:1,claim,expiresAt:expiryFor(claim,now),phase:'claimed'};
   async function failKnown(reasonCode){const payload={claim,outcome:'known_failed',reasonCode};await journal.write({...record,phase:'known_failed',payload});const ack=await send(deps,'fail',payload);if(acknowledged(ack)){await journal.clear();return {kind:'known_failed',jobId:claim.jobId,reasonCode};}return uncertain(claim);}
   try{
    await journal.write(record,{exclusive:true});
    const prepared=await deps.runtime.prepare({claim,lease,signal:combined});if(prepared?.modelDigest!==claim.modelDigest)throw Error('IDENTITY_CHANGED');
    const heartbeat=await send(deps,'heartbeat',{health:await deps.runtime.health({lease,signal:combined}),activeAttemptId:claim.attemptId},combined);
    if(!acknowledged(heartbeat)||heartbeat.value?.jobAction!=='continue'||combined.aborted)return await failKnown('LOCAL_STATE_ERROR');
    await deps.runtime.assertIdentity({claim,prepared,lease,signal:combined});
    await journal.write({...record,phase:'start_intent'});
    const start=await send(deps,'started',{claim},combined);
    if(!acknowledged(start)){
     if(start?.kind==='refused')return await failKnown('LOCAL_STATE_ERROR');
     await journal.write({...record,phase:'start_unknown'});return uncertain(claim);
    }
    if(start.value?.id!==claim.jobId||start.value?.state!=='running'){await journal.write({...record,phase:'start_unknown'});return uncertain(claim);}
    if(combined.aborted)return await failKnown('LOCAL_STATE_ERROR');
    const renew=()=>{renewInFlight=(async()=>{try{const ack=await send(deps,'heartbeat',{health:await deps.runtime.health({lease,signal:combined}),activeAttemptId:claim.attemptId},combined);if(!acknowledged(ack)||ack.value?.jobAction!=='continue')controller.abort();}catch{controller.abort();}})();return renewInFlight;};
    stopRenew=(deps.every??every)(15000,renew);
    await journal.write({...record,phase:'inference_started'});dispatched=true;
    const output=await deps.runtime.infer({claim,prepared,lease,signal:combined,timeoutMs:Math.max(1,90000-(nowFor(deps).getTime()-now.getTime()))});
    stopRenew();await renewInFlight;
    if(lease.uncertain||output?.metadata?.dispatchCertainty==='unknown')throw Error('DISPATCH_UNKNOWN');
    // A complete response (including a complete schema rejection) proves request termination.
    physicalComplete=output?.status==='succeeded'||output?.metadata?.dispatchCertainty==='completed'||output?.metadata?.dispatchCertainty==='not_started';
    if(!physicalComplete)throw Error('DISPATCH_UNKNOWN');
    if(output.status!=='succeeded')return await failKnown(codes.has(output.reasonCode)?output.reasonCode:'LOCAL_STATE_ERROR');
    const result=validateTaskResult(claim.task,output.result);
    await deps.runtime.assertIdentity({claim,prepared,lease,signal:combined});
    const payload={claim,result,resultHash:sha256(canonicalJson(result)),usage:output.metadata?.usage??{}};
    await journal.write({...record,phase:'completion',payload});
    const ack=await send(deps,'complete',payload);
    if(acknowledged(ack)&&ack.value?.id===claim.jobId&&ack.value?.state==='reviewing'){await journal.clear();return {kind:'completed',jobId:claim.jobId,attemptId:claim.attemptId,inputHash:claim.inputHash,resultHash:payload.resultHash};}
    return uncertain(claim);
   }catch(error){
    if((dispatched&&!physicalComplete)||lease.uncertain){await hold(lease,claim);await journal.write({...record,phase:'physical_unknown'});await send(deps,'fail',{claim,outcome:'dispatch_unknown'});return uncertain(claim);}
    return await failKnown(codes.has(error.message)?error.message:'LOCAL_STATE_ERROR');
   }finally{stopRenew();clearTimeout(deadline);controller.abort();await renewInFlight;}
  });
 }catch(error){return {kind:'known_failed',jobId:claim.jobId,reasonCode:error.message==='LOCAL_BUSY'?'LOCAL_BUSY':'LOCAL_STATE_ERROR'};}
}
/** A saved terminal payload is the only automatic replay. No inference or lock clearing. */
export async function reconcilePending(deps,signal){
 const journal=journalFor(deps);let saved;try{saved=await journal.read();}catch{return {kind:'dispatch_unknown',reasonCode:'LOCAL_STATE_ERROR'};}
 if(!saved)return {kind:'idle'};
 if(!saved.claim||hashTask(saved.claim.task)!==saved.claim.inputHash)return {kind:'dispatch_unknown',reasonCode:'LOCAL_STATE_ERROR'};
 if(Date.parse(saved.expiresAt)<=nowFor(deps).getTime()){
  await journal.write({version:1,phase:'expired_hold',jobId:saved.claim.jobId,attemptId:saved.claim.attemptId,inputHash:saved.claim.inputHash});return uncertain(saved.claim);
 }
 if(!['completion','known_failed'].includes(saved.phase))return uncertain(saved.claim);
 const operation=saved.phase==='completion'?'complete':'fail',ack=await send(deps,operation,saved.payload,signal);
 if(!acknowledged(ack)||ack.value?.id!==saved.claim.jobId||(operation==='complete'&&ack.value?.state!=='reviewing'))return uncertain(saved.claim);
 await journal.clear();return {kind:operation==='complete'?'completed':'known_failed',jobId:saved.claim.jobId,attemptId:saved.claim.attemptId};
}
export async function runWorker(config,deps,signal){
 if(!config||config.deviceId!==deps.deviceId||config.origin!==deps.origin)throw Error('INVALID_WORKER_CONFIG');
 await deps.runtime.initialize?.(signal);let lastIdleHeartbeat=-Infinity;
 while(!signal.aborted){
  const recovery=await reconcilePending(deps,signal);
  if(recovery.kind==='dispatch_unknown'){if(config.once)return;await delay(15000,undefined,{signal}).catch(()=>{});continue;}
  let healthy=lastIdleHeartbeat>-Infinity;
  if(nowFor(deps).getTime()-lastIdleHeartbeat>=15000){const heartbeat=await send(deps,'heartbeat',{health:await deps.runtime.health({signal}),activeAttemptId:null},signal);healthy=acknowledged(heartbeat)&&heartbeat.value?.jobAction==='continue';lastIdleHeartbeat=healthy?nowFor(deps).getTime():-Infinity;}
  if(healthy){
   const response=await send(deps,'claim',{},signal);
   if(acknowledged(response)&&response.value!==null){const claim=parseClaim(response.value);if(claim.deviceId!==config.deviceId)throw Error('INVALID_CLAIM');const outcome=await executeClaim(claim,deps,signal);deps.onOutcome?.({kind:outcome.kind,reasonCode:outcome.reasonCode??null,jobId:claim.jobId,attemptId:claim.attemptId});}
  }
  if(config.once)return;await delay(3000,undefined,{signal}).catch(()=>{});
 }
}

export async function main(argv,signal){
 if(process.platform!=='win32')throw Error('WINDOWS_WORKER_REQUIRED');
 const once=argv[0]==='--once',args=once?argv.slice(1):argv;if(args.length!==2||args[0]!=='--config')throw Error('INVALID_ARGUMENTS');
 const {open}=await import('node:fs/promises');const path=await import('node:path');if(!path.isAbsolute(args[1]))throw Error('INVALID_WORKER_CONFIG');
 const f=await open(args[1],'r');let config;try{const s=await f.stat();if(!s.isFile()||s.size<1||s.size>262144)throw Error();config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await f.readFile()));}finally{await f.close();}
 if(config.version!==1||!path.isAbsolute(config.counterFile)||!path.isAbsolute(config.journalFile))throw Error('INVALID_WORKER_CONFIG');
 const {createRuntime}=await import('./runtime.mjs'),{createWorkerClient}=await import('./client.mjs');
 const runtime=createRuntime(config);let signing={};if(config.testIdentityName!==undefined){if(!once||config.testIdentityName!=='Omnira-Atlas-LocalText-test-'+config.keyId)throw Error('INVALID_TEST_IDENTITY');const {signEnvelope}=await import('./identity.mjs');signing={sign:(u,b)=>signEnvelope(u,b,config.testIdentityName)};}const client=createWorkerClient(config,signing);
 await runWorker({...config,once},{...config,runtime,client,onOutcome:o=>process.stdout.write(JSON.stringify(o)+'\n')},signal);
}
const entry=process.argv[1];if(entry&&(await import('node:path')).resolve(entry)===(await import('node:url')).fileURLToPath(import.meta.url)){
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
 main(process.argv.slice(2),controller.signal).then(()=>{process.stdout.write(JSON.stringify({status:'stopped',version:1})+'\n');}).catch(error=>{const code=['IDENTITY_CHANGED','LOCAL_MODEL_UNAVAILABLE','TOKEN_BUDGET_UNVERIFIED','INVALID_RUNTIME_CONFIG','INVALID_WORKER_CONFIG','LOCAL_BUSY'].includes(error.message)?error.message:'LOCAL_TEXT_WORKER_STOPPED';process.stderr.write(code+'\n');process.exitCode=1;});
}
