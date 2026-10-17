import {mkdir,open,unlink} from 'node:fs/promises';import path from 'node:path';
import {validateJob} from './contracts.mjs';import {candidate} from './candidates.mjs';import {createOllamaClient} from './ollama.mjs';
const safeCodes=new Set(['INVALID_JOB','INVALID_CANDIDATE','INVALID_RESULT','IDENTITY_CHANGED','LOCAL_BUSY','LOCAL_TIMEOUT','LOCAL_ABORTED','LOCAL_NETWORK','LOCAL_MODEL_UNAVAILABLE','NO_THINK_UNSUPPORTED','MODEL_FORMAT_UNSUPPORTED','INVALID_SERVER_VERSION','INVALID_MODEL_RESPONSE','INVALID_JSON','HTTP_STATUS','RESPONSE_TOO_LARGE','INCOMPLETE_RESPONSE','LOCAL_STATE_ERROR']);
export async function runJob(value,{candidateId,expectedSnapshot,runtimeDir,client=createOllamaClient(),signal,timeoutMs=90000}) {
  const start=performance.now();let job,handle,dispatch=false,uncertain=false;
  const lock=path.join(runtimeDir,'job.lock');
  const base={version:1,jobId:typeof value?.jobId==='string'?value.jobId:null,taskType:value?.taskType??null,metadata:{provider:'ollama_local',candidateId,modelDigest:expectedSnapshot?.modelDigest??null,serverVersion:expectedSnapshot?.serverVersion??null,wallMs:0,billedApiSek:0,totalOperatingCostSek:null}};
  const finish=(status,rest)=>({...base,status,...rest,metadata:{...base.metadata,wallMs:performance.now()-start,...rest?.metadata}});
  try {
    job=validateJob(value);candidate(candidateId);
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>90000||!expectedSnapshot)throw Error('LOCAL_STATE_ERROR');
    await mkdir(runtimeDir,{recursive:true});try{handle=await open(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Error('LOCAL_BUSY');throw e;}
    const state={pid:process.pid,jobId:job.jobId,startedAt:new Date().toISOString(),state:'in_flight'};
    await handle.writeFile(JSON.stringify(state));
    const remaining=()=>{const n=timeoutMs-(performance.now()-start);if(n<=0)throw Error('LOCAL_TIMEOUT');return n;};
    const actual=await client.inspectCandidate(candidateId,{signal,timeoutMs:remaining()});
    if(actual.modelDigest!==expectedSnapshot.modelDigest||actual.serverVersion!==expectedSnapshot.serverVersion||actual.candidateId!==expectedSnapshot.candidateId)throw Error('IDENTITY_CHANGED');
    dispatch=true;const output=await client.infer(job,actual,{signal,timeoutMs:remaining()});
    return finish('succeeded',{result:output.result,metadata:{usage:output.usage}});
  } catch(e) {
    uncertain=dispatch&&e.dispatched===true&&!e.complete&&!e.definite;
    if(uncertain&&handle){await handle.truncate(0);await handle.write(JSON.stringify({pid:process.pid,jobId:job.jobId,state:'uncertain',reasonCode:e.code??'LOCAL_NETWORK'}),0,'utf8').catch(()=>{});}
    const code=safeCodes.has(e.code??e.message)?(e.code??e.message):'LOCAL_STATE_ERROR';
    return finish(['INVALID_JOB','INVALID_CANDIDATE','LOCAL_BUSY','IDENTITY_CHANGED'].includes(code)?'rejected':'failed',{reasonCode:code});
  } finally {if(handle){await handle.close();if(!uncertain)await unlink(lock).catch(()=>{});}}
}
