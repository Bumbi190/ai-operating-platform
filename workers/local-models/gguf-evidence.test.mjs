import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
const api=await import('./gguf-evidence.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;},u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const str=s=>Buffer.concat([u64(Buffer.byteLength(s)),Buffer.from(s)]);
function chars(){const a=[...Array(94)].map((_,i)=>i+33).concat([...Array(12)].map((_,i)=>i+161),[...Array(82)].map((_,i)=>i+174));const out=a.map(i=>String.fromCodePoint(i));for(let i=0,j=0;i<256;i++)if(!a.includes(i))out.push(String.fromCodePoint(256+j++));return out;}
function fixture(tokens=chars(),tokenizer='gpt2'){return Buffer.concat([Buffer.from('GGUF'),u32(3),u64(0),u64(3),str('tokenizer.ggml.model'),u32(8),str(tokenizer),str('tokenizer.ggml.pre'),u32(8),str('qwen2'),str('tokenizer.ggml.tokens'),u32(9),u32(8),u64(tokens.length),...tokens.map(str)]);}
async function withFile(bytes,fn){const dir=await mkdtemp(path.join(os.tmpdir(),'omnira-gguf-'));const p=path.join(dir,'model.gguf');await writeFile(p,bytes);try{return await fn(p,createHash('sha256').update(bytes).digest('hex'));}finally{await rm(dir,{recursive:true,force:true});}}
test('verifies actual GPT2 byte coverage and entire artifact hash',async()=>{
 assert.equal(typeof api.readGGUFByteCoverage,'function','missing artifact proof reader');
 await withFile(fixture(),async(p,hash)=>{const e=await api.readGGUFByteCoverage(p,hash);assert.equal(e.byteCoverageVerified,true);assert.equal(e.modelBlobSha256,hash);assert.match(e.byteCoverageSha256,/^[a-f0-9]{64}$/);assert.equal(e.tokenizer,'gpt2-byte-bpe');});
});
test('denies missing bytes, unknown tokenizer and changed artifact',async()=>{
 for(const bytes of [fixture(chars().slice(1)),fixture(chars(),'unknown')])await withFile(bytes,async(p,h)=>{await assert.rejects(api.readGGUFByteCoverage(p,h),/TOKEN_BUDGET_UNVERIFIED/);});
 await withFile(fixture(),async(p)=>{await assert.rejects(api.readGGUFByteCoverage(p,'0'.repeat(64)),/ARTIFACT_HASH_MISMATCH/);});
});
test('denies malformed lengths and truncated GGUF metadata',async()=>{
 await withFile(fixture().subarray(0,50),async(p,h)=>{await assert.rejects(api.readGGUFByteCoverage(p,h),/TOKEN_BUDGET_UNVERIFIED/);});
});
