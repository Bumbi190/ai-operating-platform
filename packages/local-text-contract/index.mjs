import { createHash } from 'node:crypto';

export const CONTRACT_VERSION = 1;
export const JOB_STATES = Object.freeze(['queued','claimed','running','reviewing','escalation_pending','needs_input','succeeded','failed','cancelled','reconciling']);
export const WORKER_OPERATIONS = Object.freeze(['enroll','heartbeat','claim','started','complete','fail','reconcile']);
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern=/^[a-f0-9]{64}$/;
export const isUuid=value=>typeof value==='string' && uuidPattern.test(value);
export const isSha256=value=>typeof value==='string' && hashPattern.test(value);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const scalar=s=>!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&scalar(v)&&[...v].length<=max;
const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function fail(code){throw new Error(code);}
export function parseTask(v){
 const kind=v?.kind;
 if(!exact(v,kind==='classify'?['kind','text','labels']:['kind','text'])||!['classify','extract','summarize'].includes(kind)||!text(v.text,3000))fail('INVALID_TASK');
 if(kind==='classify'&&(!Array.isArray(v.labels)||v.labels.length<2||v.labels.length>8||v.labels.some(x=>!text(x,64)||x!==x.trim())||new Set(v.labels).size!==v.labels.length))fail('INVALID_TASK');
 return structuredClone(v);
}
export function parseRequest(v){
 if(!exact(v,['projectId','conversationId','idempotencyKey','task'])||![v.projectId,v.conversationId,v.idempotencyKey].every(isUuid))fail('INVALID_REQUEST');
 return {...v,task:parseTask(v.task)};
}
export function canonicalJson(v){
 if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(typeof v==='string'&&scalar(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']';
 if(plain(v)&&Reflect.ownKeys(v).every(x=>typeof x==='string'))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}';
 return fail('INVALID_CANONICAL_VALUE');
}
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const hashTask=task=>sha256(canonicalJson({contractVersion:CONTRACT_VERSION,schemaVersion:1,task:parseTask(task)}));
export function validateTaskResult(task,value){
 const t=parseTask(task);let ok=false;
 if(t.kind==='classify')ok=exact(value,['label'])&&t.labels.includes(value.label);
 if(t.kind==='extract')ok=exact(value,['company','city','registrationNumber'])&&Object.values(value).every(x=>x===null||text(x,300));
 if(t.kind==='summarize')ok=exact(value,['bullets'])&&Array.isArray(value.bullets)&&value.bullets.length>=1&&value.bullets.length<=3&&value.bullets.every(x=>text(x,300));
 if(!ok)fail('INVALID_RESULT');return structuredClone(value);
}
export function parseClaim(v){
 if(!exact(v,['jobId','attemptId','deviceId','claimId','fence','inputHash','selectionId','modelDigest','leaseUntil','expiresAt','task'])||![v.jobId,v.attemptId,v.deviceId,v.claimId,v.selectionId].every(isUuid)||!Number.isSafeInteger(v.fence)||v.fence<1||!isSha256(v.inputHash)||typeof v.modelDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(v.modelDigest)||!iso(v.leaseUntil)||!iso(v.expiresAt))fail('INVALID_CLAIM');
 return {...v,task:parseTask(v.task)};
}
export function parseWorkerEnvelope(v){
 if(!exact(v,['version','deviceId','buildHash','keyId','counter','nonce','issuedAt','expiresAt','method','path','bodySha256','signature'])||v.version!==1||![v.deviceId,v.keyId,v.nonce].every(isUuid)||![v.buildHash,v.bodySha256].every(isSha256)||typeof v.counter!=='string'||!/[1-9][0-9]{0,19}/.test(v.counter)||!/^([1-9][0-9]{0,19})$/.test(v.counter)||BigInt(v.counter)>18446744073709551615n||!iso(v.issuedAt)||!iso(v.expiresAt)||Date.parse(v.expiresAt)<=Date.parse(v.issuedAt)||Date.parse(v.expiresAt)-Date.parse(v.issuedAt)>60000||v.method!=='POST'||typeof v.path!=='string'||!WORKER_OPERATIONS.some(x=>v.path==='/api/local-text/worker/'+x)||typeof v.signature!=='string'||!/^[-_a-zA-Z0-9]{86}$/.test(v.signature)||Buffer.from(v.signature,'base64url').length!==64||Buffer.from(v.signature,'base64url').toString('base64url')!==v.signature)fail('INVALID_ENVELOPE');
 return structuredClone(v);
}
export function toPilotJob(task,jobId){const {kind,...rest}=parseTask(task);if(!isUuid(jobId))fail('INVALID_JOB_ID');return {version:1,jobId,taskType:kind,...rest};}
