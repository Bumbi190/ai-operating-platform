import {readFileSync} from 'node:fs';import {isDeepStrictEqual} from 'node:util';
import {CANDIDATES} from './candidates.mjs';import {TASK_TYPES,validateResult} from './contracts.mjs';import {sha256,scoreEvaluation} from './evaluate.mjs';
const fixtureBytes=readFileSync(new URL('./fixtures/sv-v1.json',import.meta.url));const fixtures=JSON.parse(fixtureBytes);
function matchingCases(list,type){const wanted=fixtures.filter(f=>f.job.taskType===type).map(f=>f.caseId);return Array.isArray(list)&&list.length===wanted.length&&new Set(list.map(c=>c.caseId)).size===wanted.length&&list.every(c=>wanted.includes(c.caseId)&&typeof c.factual==='boolean'&&typeof c.reason==='string'&&c.reason.trim());}
/** Offline evidence assessment only. Neither these files nor reviewer text grant production authority. */
export function qualifyCandidate({report,reportBytes,review,provenance,currentIdentity}) {
  const qualification={scope:'local_evaluation_only',identity:report?.identity??{},approvedTasks:[],deniedTasks:[],metrics:null};
  let globalReason=null;
  try{
    if(report?.version!==1||report.scope!=='local_evaluation_only'||!CANDIDATES.includes(report.identity?.candidateId)||!isDeepStrictEqual(report.identity,currentIdentity)||report.identity.suiteHash!==sha256(fixtureBytes))throw Error('STALE_IDENTITY');
    if(!isDeepStrictEqual(JSON.parse(Buffer.from(reportBytes).toString('utf8')),report))throw Error('EVIDENCE_MISMATCH');
    const hash=sha256(reportBytes);
    if(!review||review.version!==1||review.reportSha256!==hash||!provenance||provenance.source!=='collaboration'||provenance.runStatus!=='completed'||provenance.reportSha256!==hash||review.reviewerAgentId!==provenance.reviewerAgentId||review.reviewerRunId!==provenance.reviewerRunId||!review.reviewerAgentId||!review.reviewerRunId||review.reviewerAgentId===provenance.implementationAgentId||review.reviewerModelId===report.identity.candidateId)throw Error('INDEPENDENT_REVIEW_REQUIRED');
    if(report.gpu?.fullyOnGpu!==true||report.gpu.modelDigest!==report.identity.modelDigest||!report.gpu.ollamaPs?.includes('100% GPU')||!report.gpu.nvidiaSmi)throw Error('GPU_NOT_VERIFIED');
    if(!Array.isArray(report.cases)||report.cases.length!==25||new Set(report.cases.map(c=>c.caseId)).size!==25||report.cases.some(c=>!fixtures.some(f=>f.caseId===c.caseId&&f.job.taskType===c.taskType)))throw Error('INCOMPLETE_EVIDENCE');
    qualification.metrics=scoreEvaluation(report,fixtures);
  }catch(e){globalReason=['STALE_IDENTITY','EVIDENCE_MISMATCH','INDEPENDENT_REVIEW_REQUIRED','GPU_NOT_VERIFIED','INCOMPLETE_EVIDENCE'].includes(e.message)?e.message:'INVALID_EVIDENCE';}
  for(const type of TASK_TYPES){const reasons=[];if(globalReason)reasons.push(globalReason);else{
    const fs=fixtures.filter(f=>f.job.taskType===type);const cs=fs.map(f=>report.cases.find(c=>c.caseId===f.caseId));const metrics=qualification.metrics[type];
    if(cs.some((c,i)=>{try{validateResult(type,c.outcome.result,fs[i].job.labels);return c.outcome.status!=='succeeded'||!Number.isFinite(c.outcome.metadata?.wallMs)||c.outcome.metadata.wallMs<0;}catch{return true;}}))reasons.push('INVALID_CASE_RESULT');
    if(metrics.warmSampleCount!==fs.length||metrics.warmP90Ms===null||metrics.warmP90Ms>20000)reasons.push('LATENCY_FAILED');
    if(type==='classify'&&metrics.correct<9)reasons.push('QUALITY_FAILED');
    if(type==='extract'&&(metrics.correct<9||metrics.inventedMissingFields!==0))reasons.push('QUALITY_FAILED');
    const decision=review.decisions?.[type];if(decision?.status!=='approved'||!decision.reason?.trim()||!matchingCases(decision.cases,type))reasons.push('TASK_REVIEW_REQUIRED');
    else if(type==='summarize'&&decision.cases.some(c=>!c.factual))reasons.push('FACTUAL_REVIEW_FAILED');
    else if(type==='extract'&&fs.filter(f=>f.criticalMissing?.length).some(f=>!decision.cases.find(c=>c.caseId===f.caseId)?.factual))reasons.push('FACTUAL_REVIEW_FAILED');
  }if(reasons.length)qualification.deniedTasks.push({taskType:type,reasons});else qualification.approvedTasks.push(type);}
  return qualification;
}
export function chooseLocalRoute({workKind,taskType,qualifications=[],currentIdentity}) {
  if(workKind==='code')return{status:'escalation_required',reasonCode:'CODE_WORK_REQUIRES_WORKER',target:'codex_worker',dispatched:false};
  if(workKind!=='text'||!TASK_TYPES.includes(taskType)||!Array.isArray(qualifications))return{status:'rejected',reasonCode:'INVALID_ROUTING_INPUT',dispatched:false};
  const eligible=qualifications.filter(q=>q.scope==='local_evaluation_only'&&q.approvedTasks?.includes(taskType)&&CANDIDATES.includes(q.identity?.candidateId)&&isDeepStrictEqual(q.identity,currentIdentity?.candidateId?currentIdentity:currentIdentity?.[q.identity.candidateId])&&Number.isFinite(q.metrics?.[taskType]?.warmP90Ms));
  eligible.sort((a,b)=>a.metrics[taskType].warmP90Ms-b.metrics[taskType].warmP90Ms||CANDIDATES.indexOf(a.identity.candidateId)-CANDIDATES.indexOf(b.identity.candidateId));
  return eligible.length?{status:'local_candidate',candidateId:eligible[0].identity.candidateId,taskType}:{status:'escalation_required',reasonCode:'NO_QUALIFIED_LOCAL_CANDIDATE',target:'openai_model',dispatched:false};
}
