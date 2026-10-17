import {open,rename,unlink} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {isUuid} from '../../packages/local-text-contract/index.mjs';
const max=18446744073709551615n;
export async function initializeCounter(file,keyId){
 if(!isUuid(keyId))throw Error('IDENTITY_STATE_UNAVAILABLE');let handle;
 try{handle=await open(file,'wx',0o600);await handle.writeFile(JSON.stringify({version:1,keyId,counter:'0'}));await handle.sync();}
 catch(e){throw Error(e.code==='EEXIST'?'IDENTITY_EXISTS':'IDENTITY_STATE_UNAVAILABLE');}finally{await handle?.close();}
}
export async function nextCounter(file,keyId){
 if(!isUuid(keyId))throw Error('IDENTITY_STATE_UNAVAILABLE');let lock,input,output,tmp;const lockPath=file+'.lock';
 try{
  try{lock=await open(lockPath,'wx',0o600);}catch(e){throw Error(e.code==='EEXIST'?'IDENTITY_BUSY':'IDENTITY_STATE_UNAVAILABLE');}
  await lock.writeFile(JSON.stringify({pid:process.pid,keyId,createdAt:new Date().toISOString()}));await lock.sync();
  input=await open(file,'r');const info=await input.stat();if(!info.isFile()||info.size<1||info.size>1024)throw Error('IDENTITY_STATE_UNAVAILABLE');
  const bytes=Buffer.alloc(info.size);let offset=0;while(offset<bytes.length){const r=await input.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)throw Error('IDENTITY_STATE_UNAVAILABLE');offset+=r.bytesRead;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!value||Object.keys(value).sort().join(',')!=='counter,keyId,version'||value.version!==1||value.keyId!==keyId||typeof value.counter!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value.counter))throw Error('IDENTITY_STATE_UNAVAILABLE');
  const current=BigInt(value.counter);if(current>=max)throw Error('COUNTER_EXHAUSTED');
  const counter=String(current+1n);tmp=file+'.'+randomUUID()+'.tmp';output=await open(tmp,'wx',0o600);
  await output.writeFile(JSON.stringify({version:1,keyId,counter}));await output.sync();await output.close();output=null;
  await input.close();input=null;await rename(tmp,file);tmp=null;return counter;
 }catch(e){if(['IDENTITY_BUSY','COUNTER_EXHAUSTED'].includes(e.message))throw e;throw Error('IDENTITY_STATE_UNAVAILABLE');}
 finally{await input?.close();await output?.close();if(tmp)await unlink(tmp).catch(()=>{});if(lock){await lock.close();await unlink(lockPath);}}
}
