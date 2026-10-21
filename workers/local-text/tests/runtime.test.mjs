import {test} from 'node:test';import assert from 'node:assert/strict';
const api=await import('../runtime.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('GPU residency requires exact digest, entire model, one slot and fixed context',()=>{
 assert.equal(typeof api.assertGpuResidency,'function');const digest='sha256:'+'a'.repeat(64),model={name:'qwen3.5:4b',digest,size:4096,size_vram:4096,context_length:4096};
 assert.doesNotThrow(()=>api.assertGpuResidency({models:[model]},model.name,digest));
 for(const changed of [{...model,size_vram:4000},{...model,size_vram:5000},{...model,context_length:8192},{...model,digest:'b'.repeat(64)}])assert.throws(()=>api.assertGpuResidency({models:[changed]},model.name,digest),/GPU_RESIDENCY_UNVERIFIED/);
 assert.throws(()=>api.assertGpuResidency({models:[model,model]},model.name,digest),/GPU_RESIDENCY_UNVERIFIED/);
});
