export const TASK_TYPES = Object.freeze(['classify','extract','summarize']);
export class ContractError extends Error { constructor(code) { super(code); this.code=code; } }
export const codepoints = s => [...s].length;
const object = v => v !== null && typeof v==='object' && !Array.isArray(v) && Object.getPrototypeOf(v)===Object.prototype;
const keys = (v, wanted) => object(v) && Object.keys(v).length===wanted.length && wanted.every(k=>Object.hasOwn(v,k));
const text = (v,max) => typeof v==='string' && v.trim().length>0 && codepoints(v)<=max;
export function validateJob(v) {
  const fail=()=>{throw new ContractError('INVALID_JOB');};
  if(!object(v)||!TASK_TYPES.includes(v.taskType)||v.version!==1||!text(v.text,3000)||typeof v.jobId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.jobId)) fail();
  const ks=['version','jobId','taskType','text'];
  if(v.taskType==='classify') {
    ks.push('labels');
    if(!Array.isArray(v.labels)||v.labels.length<2||v.labels.length>8||v.labels.some(x=>!text(x,64)||x!==x.trim())||new Set(v.labels).size!==v.labels.length) fail();
  }
  if(!keys(v,ks)) fail();
  return structuredClone(v);
}
export function validateResult(type,v,labels) {
  let ok=false;
  if(type==='classify') ok=keys(v,['label'])&&Array.isArray(labels)&&labels.includes(v.label);
  if(type==='extract') ok=keys(v,['company','city','registrationNumber'])&&Object.values(v).every(x=>x===null||text(x,300));
  if(type==='summarize') ok=keys(v,['bullets'])&&Array.isArray(v.bullets)&&v.bullets.length>=1&&v.bullets.length<=3&&v.bullets.every(x=>text(x,300));
  if(!ok) throw new ContractError('INVALID_RESULT');
  return structuredClone(v);
}
export function resultSchema(job) {
  const base={type:'object',additionalProperties:false};
  if(job.taskType==='classify') return {...base,required:['label'],properties:{label:{type:'string',enum:job.labels}}};
  if(job.taskType==='extract') return {...base,required:['company','city','registrationNumber'],properties:Object.fromEntries(['company','city','registrationNumber'].map(k=>[k,{type:['string','null'],maxLength:300}]))};
  return {...base,required:['bullets'],properties:{bullets:{type:'array',minItems:1,maxItems:3,items:{type:'string',minLength:1,maxLength:300}}}};
}

export function decodeUtf8(bytes) { try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { throw new ContractError('INVALID_UTF8'); } }
