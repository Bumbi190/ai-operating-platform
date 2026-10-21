import https from 'node:https';import {randomUUID} from 'node:crypto';
import {canonicalJson,sha256,isUuid,isSha256,WORKER_OPERATIONS,parseWorkerEnvelope} from '../../packages/local-text-contract/index.mjs';
import {nextCounter} from './identity-state.mjs';import {signEnvelope} from './identity.mjs';
/** No redirects, cookies, SDK retries, proxy credentials or task-selected origins. */
export function postHttps(url,{body,headers,signal,timeoutMs=3000}){
 const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password||body.length>65536||timeoutMs<=0||timeoutMs>3000)throw Error('INVALID_CONTROL_REQUEST');
 return new Promise((resolve,reject)=>{
  let request,settled=false;const timer=setTimeout(()=>finish(Error('CONTROL_TIMEOUT')),timeoutMs);
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){request?.destroy();reject(error);}else resolve(value);};
  const abort=()=>finish(Error('CONTROL_ABORTED'));if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  request=https.request(target,{method:'POST',agent:false,headers:{...headers,'content-type':'application/json','content-length':body.length}},response=>{
   let total=0;const chunks=[];
   response.on('data',chunk=>{total+=chunk.length;if(total>131072){response.destroy();finish(Error('CONTROL_REPLY_TOO_LARGE'));}else chunks.push(chunk);});
   response.on('error',()=>finish(Error('CONTROL_NETWORK')));response.on('aborted',()=>finish(Error('CONTROL_INCOMPLETE')));
   response.on('end',()=>{if(response.statusCode!==200&&response.statusCode!==503)return finish(Error('CONTROL_HTTP_STATUS'));try{if(!/^application\/json(?:\s*;|$)/i.test(response.headers['content-type']??''))throw Error();finish(null,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}catch{finish(Error('CONTROL_INVALID_REPLY'));}});
  });request.on('error',()=>finish(Error('CONTROL_NETWORK')));request.end(body);
 });
}
export function createWorkerClient(input,{nextCounter:counter=nextCounter,sign=signEnvelope,transport=postHttps,now=()=>new Date()}={}){
 const config=structuredClone(input);let origin;
 try{origin=new URL(config.origin);if(origin.protocol!=='https:'||origin.origin!==config.origin||origin.username||origin.password||![config.deviceId,config.keyId].every(isUuid)||!isSha256(config.buildHash)||typeof config.counterFile!=='string'||!config.counterFile)throw Error();}catch{throw Error('INVALID_WORKER_CONFIG');}
 let tail=Promise.resolve();
 async function perform(operation,payload,{signal}={}){
  if(!WORKER_OPERATIONS.includes(operation))throw Error('INVALID_OPERATION');
  const body=Buffer.from(canonicalJson(payload));if(body.length>65536)throw Error('CONTROL_BODY_TOO_LARGE');
  const requestId=randomUUID(),unknown={kind:'unknown',reconcileId:requestId};
  try{
   if(signal?.aborted)return unknown;
   // Counter is durably reserved before signing/writing any request bytes. Never rolled back.
   const sequence=await counter(config.counterFile,config.keyId),issued=now();
   const unsigned={version:1,origin:config.origin,deviceId:config.deviceId,keyId:config.keyId,buildHash:config.buildHash,counter:sequence,nonce:requestId,issuedAt:issued.toISOString(),expiresAt:new Date(issued.getTime()+45000).toISOString(),method:'POST',path:'/api/local-text/worker/'+operation,bodySha256:sha256(body)};
   const envelope=parseWorkerEnvelope(await sign(unsigned,body));
   if(canonicalJson(Object.fromEntries(Object.entries(envelope).filter(([k])=>k!=='signature')))!==canonicalJson(unsigned))throw Error('SIGNATURE_BINDING_CHANGED');
   const response=await transport(config.origin+unsigned.path,{body,signal,timeoutMs:3000,headers:{'x-omnira-local-text':Buffer.from(canonicalJson(envelope)).toString('base64url')}});
   if(!response||response.version!==1||response.requestId!==requestId||response.operation!==operation||!response.result)throw Error();
   const result=response.result;
   if(result.kind==='applied'||result.kind==='duplicate'){if(!Object.hasOwn(result,'value'))throw Error();return result;}
   if(result.kind==='refused'&&typeof result.reason==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(result.reason))return {kind:'refused',reason:result.reason};
   return unknown;
  }catch{return unknown;}
 }
 return Object.freeze({request(operation,payload,options){const request=tail.then(()=>perform(operation,payload,options));tail=request.catch(()=>{});return request;}});
}
