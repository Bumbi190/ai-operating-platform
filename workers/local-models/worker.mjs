import {mkdir,open,unlink} from 'node:fs/promises';import path from 'node:path';
import {validateJob} from './contracts.mjs';import {candidate} from './candidates.mjs';import {createOllamaClient} from './ollama.mjs';
const safeCodes=new Set(['INVALID_JOB','INVALID_CANDIDATE','INVALID_RESULT','IDENTITY_CHANGED','LOCAL_BUSY','LOCAL_TIMEOUT','LOCAL_ABORTED','LOCAL_NETWORK','LOCAL_MODEL_UNAVAILABLE','NO_THINK_UNSUPPORTED','MODEL_FORMAT_UNSUPPORTED','INVALID_SERVER_VERSION','INVALID_MODEL_RESPONSE','INVALID_JSON','HTTP_STATUS','RESPONSE_TOO_LARGE','INCOMPLETE_RESPONSE','LOCAL_STATE_ERROR','INVALID_UTF8','TOKEN_BUDGET_UNVERIFIED','INPUT_TOO_LARGE']);
const leases=new WeakSet();
export async function withRuntimeLease(runtimeDir,fn){
  await mkdir(runtimeDir,{recursive:true});const lock=path.join(runtimeDir,'job.lock');let handle;
  try{handle=await open(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Error('LOCAL_BUSY');throw e;}
  const lease={runtimeDir,handle,uncertain:false};leases.add(lease);
  try{await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),state:'in_flight'}));return await fn(lease);}
  finally{leases.delete(lease);await handle.close();if(!lease.uncertain)await unlink(lock).catch(()=>{});}
}
export async function runJob(value,{candidateId,expectedSnapshot,runtimeDir,client=createOllamaClient(),signal,timeoutMs=90000,lease,onInferenceStart,requirePromptBudget=false,tokenizerEvidence}) {
  const start=performance.now();let job,dispatch=false;
  const base={version:1,jobId:typeof value?.jobId==='string'?value.jobId:null,taskType:value?.taskType??null,metadata:{provider:'ollama_local',candidateId,modelDigest:expectedSnapshot?.modelDigest??null,serverVersion:expectedSnapshot?.serverVersion??null,wallMs:0,billedApiSek:0,totalOperatingCostSek:null}};
  const finish=(status,rest)=>({...base,status,...rest,metadata:{...base.metadata,wallMs:performance.now()-start,...rest?.metadata}});
  try {
    job=validateJob(value);candidate(candidateId);
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>90000||!expectedSnapshot)throw Error('LOCAL_STATE_ERROR');
    if(!lease)return await withRuntimeLease(runtimeDir,l=>runJob(value,{candidateId,expectedSnapshot,runtimeDir,client,signal,timeoutMs:timeoutMs-(performance.now()-start),lease:l,onInferenceStart,requirePromptBudget,tokenizerEvidence}));
    if(!leases.has(lease)||lease.runtimeDir!==runtimeDir||lease.uncertain)throw Error('LOCAL_BUSY');
    const remaining=()=>{const n=timeoutMs-(performance.now()-start);if(n<=0)throw Error('LOCAL_TIMEOUT');return n;};
    const actual=await client.inspectCandidate(candidateId,{signal,timeoutMs:remaining()});
    if(actual.modelDigest!==expectedSnapshot.modelDigest||actual.serverVersion!==expectedSnapshot.serverVersion||actual.candidateId!==expectedSnapshot.candidateId)throw Error('IDENTITY_CHANGED');
    dispatch=true;let inFlight=true;const inference=(requirePromptBudget?client.inferBounded(job,actual,{signal,timeoutMs:remaining(),tokenizerEvidence}):client.infer(job,actual,{signal,timeoutMs:remaining()}));
    // The optional operator probe observes an inference already started; it cannot alter the job.
    const probe=Promise.resolve().then(()=>onInferenceStart?.({isInFlight:()=>inFlight,startedAt:new Date().toISOString()})).catch(()=>{});
    let output;try{output=await inference;}finally{inFlight=false;await probe;}
    const confirmed=await client.inspectCandidate(candidateId,{signal,timeoutMs:remaining()});
    if(confirmed.modelDigest!==actual.modelDigest||confirmed.serverVersion!==actual.serverVersion)throw Error('IDENTITY_CHANGED');
    return finish('succeeded',{result:output.result,metadata:{usage:output.usage}});
  } catch(e) {
    const uncertain=dispatch&&e.dispatched===true&&!e.complete&&!e.definite;
    if(uncertain&&lease){lease.uncertain=true;await lease.handle.truncate(0);await lease.handle.write(JSON.stringify({pid:process.pid,jobId:job.jobId,state:'uncertain',reasonCode:e.code??'LOCAL_NETWORK'}),0,'utf8').catch(()=>{});}
    const code=safeCodes.has(e.code??e.message)?(e.code??e.message):'LOCAL_STATE_ERROR';
    return finish(['INVALID_JOB','INVALID_CANDIDATE','LOCAL_BUSY','IDENTITY_CHANGED'].includes(code)?'rejected':'failed',{reasonCode:code});
  }
}
