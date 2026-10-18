import {test} from 'node:test';import assert from 'node:assert/strict';
import {createOllamaClient} from './ollama.mjs';
const api=await import('./token-budget.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const hash='a'.repeat(64), snapshot={candidateId:'qwen3:8b',modelDigest:'sha256:'+hash,serverVersion:'test-runtime'};
const task={kind:'summarize',text:'Åsa säger ”nej”.'};
const evidence={version:1,modelDigest:snapshot.modelDigest,serverVersion:snapshot.serverVersion,tokenizer:'gpt2-byte-bpe',byteCoverageVerified:true,byteCoverageSha256:hash,bosTokenUpperBound:2,rawGenerationVerified:true,rawGenerationEvidenceSha256:hash};
test('escaped_multibyte_template_budget counts bytes and full schema with reserve',()=>{
 assert.equal(typeof api.provePromptBudget,'function','missing full-context proof');
 const prompt='å\\n"'.repeat(10),schema='{"type":"object"}';
 const p=api.provePromptBudget({task,renderedPrompt:prompt,schemaJson:schema,tokenizerEvidence:evidence});
 assert.equal(p.status,'verified');assert.equal(p.promptUpperBound,Buffer.byteLength(prompt)+Buffer.byteLength(schema)+2);assert.equal(p.reserve,384);assert.equal(p.context,4096);assert.ok(p.promptUpperBound+p.reserve<=4096);
});
test('exact boundary accepted and one byte above refused',()=>{
 const input={task,renderedPrompt:'x'.repeat(3710),schemaJson:'',tokenizerEvidence:evidence};
 assert.equal(api.provePromptBudget(input).status,'verified');
 assert.deepEqual(api.provePromptBudget({...input,renderedPrompt:input.renderedPrompt+'x'}),{status:'refused',reason:'INPUT_TOO_LARGE'});
 assert.equal(api.provePromptBudget({...input,renderedPrompt:'😀'.repeat(3000)}).reason,'INPUT_TOO_LARGE');
});
test('unknown_tokenizer_denies_generation',async()=>{
 const calls=[];const client=createOllamaClient(async v=>{calls.push(v);return {};});
 assert.equal(typeof client.inferBounded,'function','missing bounded inference');
 await assert.rejects(client.inferBounded({version:1,jobId:'15842f1d-5b7b-49df-9bdf-dd65a0bd5926',taskType:'summarize',text:'Hej'},snapshot,{tokenizerEvidence:null}),e=>e.code==='TOKEN_BUDGET_UNVERIFIED');assert.equal(calls.length,0);
});
test('oversized_prompt_never_posts_generation and drift invalidates proof',async()=>{
 const calls=[];const client=createOllamaClient(async v=>{calls.push(v);return {};});
 const job={version:1,jobId:'15842f1d-5b7b-49df-9bdf-dd65a0bd5926',taskType:'summarize',text:'😀'.repeat(3000)};
 await assert.rejects(client.inferBounded(job,snapshot,{tokenizerEvidence:evidence}),e=>e.code==='INPUT_TOO_LARGE');
 await assert.rejects(client.inferBounded({...job,text:'Hej'},snapshot,{tokenizerEvidence:{...evidence,modelDigest:'sha256:'+'b'.repeat(64)}}),e=>e.code==='TOKEN_BUDGET_UNVERIFIED');assert.equal(calls.length,0);
});
test('bounded inference sends exact proved raw prompt with no runtime template',async()=>{
 let sent;const client=createOllamaClient(async v=>{sent=v;return {model:'qwen3:8b',done:true,done_reason:'stop',response:'{"bullets":["Hej"]}',eval_count:12,prompt_eval_count:60};});
 const job={version:1,jobId:'15842f1d-5b7b-49df-9bdf-dd65a0bd5926',taskType:'summarize',text:'Hej'};
 const r=await client.inferBounded(job,snapshot,{tokenizerEvidence:evidence});assert.deepEqual(r.result,{bullets:['Hej']});assert.equal(sent.path,'/api/generate');assert.equal(sent.body.raw,true);assert.equal(sent.body.truncate,false);assert.equal(sent.body.shift,false);assert.equal(sent.body.options.num_ctx,4096);assert.equal(sent.body.options.num_predict,384);assert.ok(Buffer.byteLength(sent.body.prompt)+Buffer.byteLength(JSON.stringify(sent.body.format))+2+384<=4096);
});
