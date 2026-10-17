import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,ollamaFixture,SNAPSHOT,temp} from './test-utils.mjs';import {createLoopbackTransport} from './transport.mjs';import {createOllamaClient} from './ollama.mjs';
const m=await import('./evaluate.mjs').catch(()=>({}));
test('fixtures contain 25 distinct Swedish cases and critical missing-field checks',async()=>{
  assert.equal(typeof m.loadFixtures,'function');const fs=await m.loadFixtures();assert.equal(fs.length,25);assert.equal(new Set(fs.map(f=>f.caseId)).size,25);
  for(const [type,n] of [['classify',10],['extract',10],['summarize',5]])assert.equal(fs.filter(f=>f.job.taskType===type).length,n);
  assert.ok(fs.filter(f=>f.criticalMissing?.length).length>=3);assert.ok(fs.every(f=>f.job.text.includes(' ')&&f.expected));
});
test('records real fixture responses, all cases and honest pending semantic review',async t=>{
  const fs=await m.loadFixtures();const port=await fixture(t,ollamaFixture(b=>{const src=JSON.parse(b.messages[1].content).sourceText;return fs.find(f=>f.job.text===src).expected;}));
  const report=await m.runEvaluation({candidateId:'qwen3:8b',snapshot:SNAPSHOT,runtimeDir:await temp(t),client:createOllamaClient(createLoopbackTransport(port)),gpuProbe:async()=>({fullyOnGpu:true,modelDigest:SNAPSHOT.modelDigest,ollamaPs:'100% GPU',nvidiaSmi:'GPU sample'})});
  assert.equal(report.cases.length,25);assert.equal(report.metrics.classify.correct,10);assert.equal(report.metrics.extract.correct,10);assert.equal(report.metrics.summarize.semanticStatus,'pending_review');
  assert.equal(report.overhead.length,4);assert.equal(report.metrics.classify.warmSampleCount,10);
  const changed=structuredClone(report);changed.cases[0].outcome.result.label='fel';assert.notEqual(m.hashReport(changed),m.hashReport(report));
});
test('scores wrong classifications and invented missing values without forgiving schema-valid lies',async()=>{
  const fs=await m.loadFixtures();const report={cases:fs.map(f=>({caseId:f.caseId,taskType:f.job.taskType,outcome:{status:'succeeded',result:structuredClone(f.expected),metadata:{wallMs:10}}}))};
  report.cases[0].outcome.result.label='fel';const missing=fs.find(f=>f.criticalMissing?.includes('company'));report.cases.find(c=>c.caseId===missing.caseId).outcome.result.company='Påhittat AB';
  const metrics=m.scoreEvaluation(report,fs);assert.equal(metrics.classify.correct,9);assert.equal(metrics.extract.inventedMissingFields,1);
});
test('p90 is nearest-rank of warm samples, never cold overhead',()=>{
  assert.equal(m.percentile90([1,2,3,4,5,6,7,8,9,100]),9);assert.equal(m.percentile90([]),null);
});
