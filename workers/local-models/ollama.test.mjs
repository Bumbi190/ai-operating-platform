import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,ollamaFixture,JOB,SNAPSHOT} from './test-utils.mjs';
const mod=await import('./ollama.mjs').catch(()=>({}));const tr=await import('./transport.mjs').catch(()=>({}));
test('inspects candidate and sends fixed bounded parameters with caller data as data',async t=>{
  let sent;const port=await fixture(t,ollamaFixture(b=>{sent=b;return {label:'bil'};}));
  assert.equal(typeof mod.createOllamaClient,'function');const c=mod.createOllamaClient(tr.createLoopbackTransport(port));
  assert.deepEqual(await c.inspectCandidate('qwen3:8b'),SNAPSHOT);
  const out=await c.infer(JOB,SNAPSHOT);assert.deepEqual(out.result,{label:'bil'});
  assert.equal(sent.think,false);assert.equal(sent.stream,false);assert.equal(sent.options.num_ctx,4096);assert.equal(sent.options.num_predict,384);assert.equal(sent.keep_alive,'2m');assert.equal(sent.tools,undefined);
});
for(const [name,mutate] of [['no thinking',(p,v)=>{if(p==='/api/show')v.capabilities=['completion'];}],['wrong quantization',(p,v)=>{if(p==='/api/show')v.details.quantization_level='F16';}],['remote model',(p,v)=>{if(p==='/api/tags')v.models[0].remote_host='https://ollama.com';}]]) {
  test('rejects '+name+' before inference',async t=>{const port=await fixture(t,ollamaFixture(undefined,mutate));await assert.rejects(()=>mod.createOllamaClient(tr.createLoopbackTransport(port)).inspectCandidate('qwen3:8b'));});
}
test('rejects truncation and tool requests even if content JSON is valid',async t=>{
  for(const mutate of [(p,v)=>{if(p==='/api/chat')v.done_reason='length';},(p,v)=>{if(p==='/api/chat')v.message.tool_calls=[{function:{name:'shell'}}];}]) {
    const port=await fixture(t,ollamaFixture(undefined,mutate));await assert.rejects(()=>mod.createOllamaClient(tr.createLoopbackTransport(port)).infer(JOB,SNAPSHOT),/INVALID_MODEL_RESPONSE/);
  }
});
