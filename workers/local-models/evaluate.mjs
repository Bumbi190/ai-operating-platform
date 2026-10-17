import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';import path from 'node:path';import {isDeepStrictEqual} from 'node:util';
import {candidate,OPTIONS} from './candidates.mjs';import {PROMPTS,createOllamaClient} from './ollama.mjs';import {runJob} from './worker.mjs';
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export const hashReport=report=>sha256(JSON.stringify(report));
export async function loadFixtures(){return JSON.parse(await readFile(new URL('./fixtures/sv-v1.json',import.meta.url),'utf8'));}
export function percentile90(values){if(!values.length)return null;return [...values].sort((a,b)=>a-b)[Math.ceil(values.length*.9)-1];}
export async function getIdentity(snapshot) {
  const files=['contracts.mjs','candidates.mjs','transport.mjs','ollama.mjs','worker.mjs','evaluate.mjs','qualification.mjs'];
  const buffers=[];for(const f of files)buffers.push(f,await readFile(new URL(f,import.meta.url)).catch(()=>Buffer.from('absent')));
  return {...snapshot,suiteHash:sha256(await readFile(new URL('./fixtures/sv-v1.json',import.meta.url))),promptHash:sha256(JSON.stringify(PROMPTS)),adapterHash:sha256(Buffer.concat(buffers.map(v=>Buffer.from(v)))),configHash:sha256(JSON.stringify({OPTIONS,stream:false,think:false,keep_alive:'2m',inputLimit:3000,deadlineMs:90000,responseBytes:131072}))};
}
export function scoreEvaluation(report,fixtures) {
  const out={};for(const type of ['classify','extract','summarize']) {
    const fs=fixtures.filter(f=>f.job.taskType===type);const cs=fs.map(f=>report.cases.find(c=>c.caseId===f.caseId));
    const durations=cs.filter(c=>c?.outcome.status==='succeeded').map(c=>c.outcome.metadata.wallMs);
    const sorted=[...durations].sort((a,b)=>a-b);
    out[type]={total:fs.length,completed:cs.filter(c=>c?.outcome.status==='succeeded').length,correct:0,inventedMissingFields:0,warmSampleCount:durations.length,warmMedianMs:sorted.length?sorted[Math.floor(sorted.length/2)]:null,warmP90Ms:percentile90(durations)};
    fs.forEach((f,i)=>{const r=cs[i]?.outcome;if(r?.status!=='succeeded')return;if(type!=='summarize'&&isDeepStrictEqual(r.result,f.expected))out[type].correct++;for(const k of f.criticalMissing??[])if(r.result?.[k]!==null)out[type].inventedMissingFields++;});
    if(type==='summarize')out[type].semanticStatus='pending_review';
  }return out;
}
export async function runEvaluation({candidateId,snapshot,runtimeDir,client=createOllamaClient(),gpuProbe,signal,onProgress=()=>{}}) {
  candidate(candidateId);const fixtures=await loadFixtures();const identity=await getIdentity(snapshot);
  const report={version:1,scope:'local_evaluation_only',runId:randomUUID(),createdAt:new Date().toISOString(),identity,cases:[],overhead:[],gpu:null,metrics:null};
  let stopped=false;
  const run=async(f,kind)=>{
    const outcome=await runJob({version:1,jobId:randomUUID(),...f.job},{candidateId,expectedSnapshot:snapshot,runtimeDir,client,signal});
    onProgress({candidateId,caseId:f.caseId,kind,status:outcome.status,wallMs:outcome.metadata.wallMs,reasonCode:outcome.reasonCode});
    if(['LOCAL_TIMEOUT','LOCAL_ABORTED','INCOMPLETE_RESPONSE','RESPONSE_TOO_LARGE','LOCAL_BUSY'].includes(outcome.reasonCode))stopped=true;
    return outcome;
  };
  // Cold result and per-task warmups are explicitly excluded from quality/latency samples.
  report.overhead.push({kind:'cold_start',outcome:await run(fixtures[0],'cold_start')});
  if(!stopped)report.gpu=await gpuProbe?.(snapshot).catch(e=>({fullyOnGpu:false,error:'GPU_PROBE_FAILED'}))??{fullyOnGpu:false,error:'GPU_PROBE_MISSING'};
  for(const type of ['classify','extract','summarize']) {
    const fs=fixtures.filter(f=>f.job.taskType===type);
    if(!stopped)report.overhead.push({kind:'warmup_'+type,outcome:await run(fs[0],'warmup')});
    for(const f of fs)report.cases.push({caseId:f.caseId,taskType:type,outcome:stopped?{status:'failed',reasonCode:'SERIES_STOPPED',metadata:{wallMs:null}}:await run(f,'quality')});
  }
  report.metrics=scoreEvaluation(report,fixtures);return report;
}
export async function writeEvidence(report,runtimeDir) {
  await mkdir(runtimeDir,{recursive:true});const bytes=JSON.stringify(report,null,2)+'\n';const reportPath=path.join(runtimeDir,report.runId+'.json');
  await writeFile(reportPath,bytes,{flag:'wx'});return {reportPath,reportSha256:sha256(bytes)};
}
