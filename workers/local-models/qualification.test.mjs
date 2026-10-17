import test from 'node:test';import assert from 'node:assert/strict';
import {loadFixtures,getIdentity,sha256,scoreEvaluation} from './evaluate.mjs';import {SNAPSHOT} from './test-utils.mjs';
const m=await import('./qualification.mjs').catch(()=>({}));
async function good(){const fixtures=await loadFixtures();const identity=await getIdentity(SNAPSHOT);const report={version:1,scope:'local_evaluation_only',identity,gpu:{fullyOnGpu:true,duringInference:true,ownedRunner:{processId:123},modelDigest:SNAPSHOT.modelDigest,ollamaPs:'100% GPU',nvidiaSmi:'sample'},cases:fixtures.map(f=>({caseId:f.caseId,taskType:f.job.taskType,outcome:{status:'succeeded',result:structuredClone(f.expected),metadata:{wallMs:10}}}))};report.metrics=scoreEvaluation(report,fixtures);const reportBytes=Buffer.from(JSON.stringify(report));const reportSha256=sha256(reportBytes);const review={version:1,reportSha256,reviewerAgentId:'separate-reviewer',reviewerModelId:'session_model_unspecified',reviewerRunId:'review-run',decisions:Object.fromEntries(['classify','extract','summarize'].map(type=>[type,{status:'approved',reason:'Checked against source.',cases:fixtures.filter(f=>f.job.taskType===type).map(f=>({caseId:f.caseId,factual:true,reason:'Matches source.'}))}]))};const provenance={source:'collaboration',runStatus:'completed',reviewerAgentId:'separate-reviewer',reviewerRunId:'review-run',implementationAgentId:'implementer',reviewerModelId:'session_model_unspecified',reportSha256};return{report,reportBytes,review,provenance,currentIdentity:identity};}
test('requires genuine separate review of the exact evidence',async()=>{
  const g=await good();assert.equal(typeof m.qualifyCandidate,'function');assert.deepEqual(m.qualifyCandidate(g).approvedTasks,['classify','extract','summarize']);
  assert.deepEqual(m.qualifyCandidate({...g,review:null}).approvedTasks,[]);
  assert.deepEqual(m.qualifyCandidate({...g,review:{...g.review,reviewerAgentId:'implementer'}}).approvedTasks,[]);
  const changed=structuredClone(g.report);changed.cases[0].outcome.result.label='bad';assert.deepEqual(m.qualifyCandidate({...g,report:changed}).approvedTasks,[]);
});
for(const key of ['modelDigest','serverVersion','promptHash','adapterHash','suiteHash','configHash'])test('invalidates approval after '+key+' changes',async()=>{const g=await good();assert.deepEqual(m.qualifyCandidate({...g,currentIdentity:{...g.currentIdentity,[key]:'changed'}}).approvedTasks,[]);});
test('agent cannot approve failed deterministic quality or invented missing fields',async()=>{
  const g=await good();g.report.cases[0].outcome.result.label='bad';g.report.cases[1].outcome.result.label='bad';g.report.cases.find(c=>c.caseId==='e04').outcome.result.company='Invented';
  g.report.metrics.classify.correct=10;g.reportBytes=Buffer.from(JSON.stringify(g.report));g.review.reportSha256=sha256(g.reportBytes);g.provenance.reportSha256=g.review.reportSha256;
  const q=m.qualifyCandidate(g);assert.deepEqual(q.approvedTasks,['summarize']);
});
test('classification can qualify while summary remains denied',async()=>{
  const g=await good();g.review.decisions.summarize.status='rejected';const q=m.qualifyCandidate(g);assert.deepEqual(q.approvedTasks,['classify','extract']);assert.equal(q.scope,'local_evaluation_only');
  assert.equal(m.chooseLocalRoute({workKind:'text',taskType:'summarize',qualifications:[q],currentIdentity:g.currentIdentity}).status,'escalation_required');
  assert.equal(m.chooseLocalRoute({workKind:'text',taskType:'classify',qualifications:[q],currentIdentity:g.currentIdentity}).candidateId,'qwen3:8b');
});
for(const kind of ['cpu','slow','missingReview','wrongDigest','unknownCase','hallucinatedSummary'])test('rejects '+kind+' despite approval label',async()=>{
  const g=await good();if(kind==='cpu')g.report.gpu.fullyOnGpu=false;if(kind==='wrongDigest')g.report.gpu.modelDigest='wrong';if(kind==='slow')g.report.cases.forEach(c=>c.outcome.metadata.wallMs=20001);if(kind==='missingReview')g.review.decisions.summarize.cases.pop();if(kind==='unknownCase')g.review.decisions.summarize.cases[0].caseId='unknown';if(kind==='hallucinatedSummary')g.review.decisions.summarize.cases[0].factual=false;
  g.reportBytes=Buffer.from(JSON.stringify(g.report));g.review.reportSha256=sha256(g.reportBytes);g.provenance.reportSha256=g.review.reportSha256;assert.ok(!m.qualifyCandidate(g).approvedTasks.includes('summarize'));
});
test('escalation is a recommendation with zero dispatch and invalid input is rejected',()=>{
  assert.deepEqual(m.chooseLocalRoute({workKind:'code',qualifications:[],currentIdentity:{}}),{status:'escalation_required',reasonCode:'CODE_WORK_REQUIRES_WORKER',target:'codex_worker',dispatched:false});
  assert.equal(m.chooseLocalRoute({workKind:'text',taskType:'extract',qualifications:[],currentIdentity:{}}).target,'openai_model');
  assert.equal(m.chooseLocalRoute({workKind:'shell',qualifications:[],currentIdentity:{}}).status,'rejected');
});
for(const key of ['implementationAgentId','reviewerModelId'])test('missing provenance identity '+key+' denies qualification',async()=>{const g=await good();if(key==='implementationAgentId')delete g.provenance[key];else delete g.review[key];assert.deepEqual(m.qualifyCandidate(g).approvedTasks,[]);});
test('review model identity must match operator provenance',async()=>{const g=await good();g.provenance.reviewerModelId='another-model';assert.deepEqual(m.qualifyCandidate(g).approvedTasks,[]);});
test('GPU residency without owned in-flight observations cannot qualify',async()=>{const g=await good();g.report.gpu.duringInference=false;g.reportBytes=Buffer.from(JSON.stringify(g.report));g.review.reportSha256=sha256(g.reportBytes);g.provenance.reportSha256=g.review.reportSha256;assert.deepEqual(m.qualifyCandidate(g).approvedTasks,[]);});
test('changed distribution invalidates evidence',async()=>{const g=await good();g.currentIdentity={...g.currentIdentity,distribution:{archiveSha256:'changed'}};assert.deepEqual(m.qualifyCandidate(g).approvedTasks,[]);});
