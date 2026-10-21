import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeUtf8} from './contracts.mjs';

function byteSymbols(){
 const visible=[...Array(94)].map((_,i)=>i+33).concat([...Array(12)].map((_,i)=>i+161),[...Array(82)].map((_,i)=>i+174));
 const chars=visible.map(x=>String.fromCodePoint(x));for(let i=0,j=0;i<256;i++)if(!visible.includes(i))chars.push(String.fromCodePoint(256+j++));return chars;
}
/** Operator-only: reads a fixed allowlisted model artifact, never a job-supplied path. */
export async function readGGUFByteCoverage(filePath,expectedSha256){
 const deny=()=>{throw Error('TOKEN_BUDGET_UNVERIFIED');};
 if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))deny();
 const f=await open(filePath,'r');let offset=0;
 try{
  const before=await f.stat();const maxMetadata=Math.min(before.size,268435456);
  const read=async n=>{if(!Number.isSafeInteger(n)||n<0||offset+n>maxMetadata)deny();const b=Buffer.alloc(n);const r=await f.read(b,0,n,offset);if(r.bytesRead!==n)deny();offset+=n;return b;};
  const skip=n=>{if(!Number.isSafeInteger(n)||n<0||offset+n>maxMetadata)deny();offset+=n;};
  const u32=async()=>(await read(4)).readUInt32LE();
  const u64=async()=>{const v=(await read(8)).readBigUInt64LE();if(v>BigInt(Number.MAX_SAFE_INTEGER))deny();return Number(v);};
  const string=async()=>{const n=await u64();if(n>1048576)deny();return decodeUtf8(await read(n));};
  const h=await read(24);if(h.subarray(0,4).toString('ascii')!=='GGUF'||![2,3].includes(h.readUInt32LE(4)))deny();
  const count=h.readBigUInt64LE(16);if(count>100000n)deny();
  const targets=new Set(byteSymbols()),found=new Set();let tokenizer=null,pre=null,tokensSeen=false;
  const widths={0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8};
  async function skipValue(type){
   if(Object.hasOwn(widths,type)){skip(widths[type]);return;}
   if(type===8){skip(await u64());return;}
   if(type===9){const element=await u32(),length=await u64();if(length>2000000||element===9)deny();if(Object.hasOwn(widths,element)){skip(widths[element]*length);return;}if(element!==8)deny();for(let j=0;j<length;j++)skip(await u64());return;}
   deny();
  }
  const seen=new Set();
  for(let i=0n;i<count;i++){
   const key=await string();if(seen.has(key))deny();seen.add(key);const type=await u32();
   if(key==='tokenizer.ggml.model'||key==='tokenizer.ggml.pre'){
    if(type!==8)deny();const value=await string();if(key.endsWith('.model'))tokenizer=value;else pre=value;
   }else if(key==='tokenizer.ggml.tokens'){
    if(type!==9||await u32()!==8)deny();const n=await u64();if(n>2000000)deny();for(let j=0;j<n;j++){const token=await string();if(targets.has(token))found.add(token);}tokensSeen=true;
   }else await skipValue(type);
  }
  if(tokenizer!=='gpt2'||!['qwen2','qwen35','qwen3'].includes(pre)||!tokensSeen||found.size!==256)deny();
  const hash=createHash('sha256');for await(const chunk of f.createReadStream({start:0,autoClose:false,highWaterMark:1048576}))hash.update(chunk);
  const actual=hash.digest('hex'),after=await f.stat();
  if(actual!==expectedSha256||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw Error('ARTIFACT_HASH_MISMATCH');
  return {tokenizer:'gpt2-byte-bpe',byteCoverageVerified:true,byteCoverageSha256:createHash('sha256').update(JSON.stringify({modelBlobSha256:actual,pre,symbols:[...found].sort()})).digest('hex'),modelBlobSha256:actual,pre,bosTokenUpperBound:32};
 }catch(e){if(['ARTIFACT_HASH_MISMATCH','TOKEN_BUDGET_UNVERIFIED'].includes(e.message))throw e;throw Error('TOKEN_BUDGET_UNVERIFIED');}finally{await f.close();}
}
