// Local, attended pilot ONLY. This is supplementary owner allowance, NOT billing
// or native execution authority. A trusted executor must derive the true maximum
// from the exact provider request and still use Omnira's canonical spend boundary.
// No route, SDK, network call, refund, renewal, reset or top-up is exposed here.
import {openSync,closeSync,writeSync,fsyncSync,readFileSync,lstatSync,mkdirSync,unlinkSync} from 'node:fs'
import {resolve,isAbsolute,join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256=/^[0-9a-f]{64}$/
const MAX_MICROS=100_000_000_000,MAX_ENTRIES=10_000
const operations=new Set(['website.artifact.generate','website.feedback.interpret','website.reference.analyze','website.plan','website.image.generate'])
const fail=code=>{throw Error(code)}
const matches=(pattern,value)=>typeof value==='string'&&pattern.test(value)
const digest=value=>createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex')
function shape(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('INVALID_ALLOWANCE_INPUT')
}
function money(value){if(!Number.isSafeInteger(value)||value<=0||value>MAX_MICROS)fail('INVALID_ALLOWANCE_AMOUNT');return value}
function approved(value){
 shape(value,['version','budgetId','scope','currency','recurrence','projectId','conversationId','designSha256','sourceSha','limitMicros'])
 if(value.version!==1||value.scope!=='fictional-preview'||value.currency!=='USD'||value.recurrence!=='none'||typeof value.budgetId!=='string'||!/^[a-z0-9-]{1,100}$/.test(value.budgetId)||!matches(UUID,value.projectId)||!matches(UUID,value.conversationId)||!matches(SHA256,value.designSha256)||!matches(/^[0-9a-f]{40}$/,value.sourceSha))fail('INVALID_ALLOWANCE_BINDING')
 return {version:1,budgetId:value.budgetId,scope:value.scope,currency:'USD',recurrence:'none',projectId:value.projectId,conversationId:value.conversationId,designSha256:value.designSha256,sourceSha:value.sourceSha,limitMicros:money(value.limitMicros)}
}
function attempted(value){
 shape(value,['id','operation','model','payloadSha256','priceEvidenceSha256','ceilingMicros'])
 if(!matches(UUID,value.id)||!operations.has(value.operation)||typeof value.model!=='string'||!/^[a-zA-Z0-9._-]{1,120}$/.test(value.model)||!matches(SHA256,value.payloadSha256)||!matches(SHA256,value.priceEvidenceSha256))fail('INVALID_ALLOWANCE_ATTEMPT')
 return {id:value.id,operation:value.operation,model:value.model,payloadSha256:value.payloadSha256,priceEvidenceSha256:value.priceEvidenceSha256,ceilingMicros:money(value.ceilingMicros)}
}
function rootPath(directory){
 if(typeof directory!=='string'||!isAbsolute(directory)||directory.startsWith('\\\\')||directory.startsWith('//'))fail('LOCAL_ABSOLUTE_ALLOWANCE_PATH_REQUIRED')
 return resolve(directory)
}
function regular(path,maximum){
 try{const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.size>maximum)fail('ALLOWANCE_CORRUPT');return readFileSync(path,'utf8')}
 catch{fail('ALLOWANCE_CORRUPT')}
}
function writeAll(fd,text){const b=Buffer.from(text,'utf8');let offset=0;while(offset<b.length){const n=writeSync(fd,b,offset,b.length-offset);if(n<=0)fail('ALLOWANCE_WRITE_FAILED');offset+=n}fsyncSync(fd)}
function writeNew(path,text){const fd=openSync(path,'wx',0o600);try{writeAll(fd,text)}finally{closeSync(fd)}}
function locked(directory,fn){
 const root=rootPath(directory)
 const stat=lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink())fail('LOCAL_ALLOWANCE_DIRECTORY_REQUIRED')
 const lock=join(root,'writer.lock'),token=randomUUID();let fd
 try{fd=openSync(lock,'wx',0o600)}catch(e){if(e.code==='EEXIST')fail('ALLOWANCE_BUSY');throw e}
 let uncertain=false
 try{
  uncertain=true;writeAll(fd,token);closeSync(fd);fd=undefined;uncertain=false
  const append=(text,head)=>{
   uncertain=true
   const log=openSync(join(root,'admissions.jsonl'),'a')
   try{writeAll(log,text)}finally{closeSync(log)}
   const marker=openSync(join(root,'head.json'),'w')
   try{writeAll(marker,JSON.stringify(head)+'\n')}finally{closeSync(marker)}
   uncertain=false
  }
  return fn(root,append)
 }finally{
  if(fd!==undefined)closeSync(fd)
  // A crash or unproven write leaves a lock. No age-based recovery is permitted.
  if(!uncertain){if(regular(lock,128)!==token)fail('ALLOWANCE_LOCK_CHANGED');unlinkSync(lock)}
 }
}
function highWater(approvalHash,sequence,lastHash,total){
 const fields={approvalHash,sequence,lastHash,total};return {...fields,sha256:digest(fields)}
}
function state(root,expected){
 let stored,raw
 try{stored=approved(JSON.parse(regular(join(root,'approval.json'),16_384)));raw=regular(join(root,'admissions.jsonl'),16*1024**2)}catch{fail('ALLOWANCE_CORRUPT')}
 const approvalHash=digest(stored)
 if(approvalHash!==digest(expected))fail('ALLOWANCE_BINDING_MISMATCH')
 if(raw&&!raw.endsWith('\n'))fail('ALLOWANCE_CORRUPT')
 const lines=raw?raw.slice(0,-1).split('\n'):[]
 if(lines.length>MAX_ENTRIES)fail('ALLOWANCE_CORRUPT')
 let previousHash=approvalHash,total=0;const ids=new Set()
 for(const [i,line] of lines.entries()){
  try{
   const e=JSON.parse(line);shape(e,['sequence','approvalHash','previousHash','attempt','admittedAt','sha256'])
   const attempt=attempted(e.attempt),unsigned={sequence:e.sequence,approvalHash:e.approvalHash,previousHash:e.previousHash,attempt,admittedAt:e.admittedAt}
   if(e.sequence!==i+1||e.approvalHash!==approvalHash||e.previousHash!==previousHash||!matches(SHA256,e.sha256)||digest(unsigned)!==e.sha256||ids.has(attempt.id)||typeof e.admittedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(e.admittedAt)||!Number.isFinite(Date.parse(e.admittedAt)))fail('ALLOWANCE_CORRUPT')
   total+=attempt.ceilingMicros;if(!Number.isSafeInteger(total)||total>stored.limitMicros)fail('ALLOWANCE_CORRUPT')
   ids.add(attempt.id);previousHash=e.sha256
  }catch{fail('ALLOWANCE_CORRUPT')}
 }
 let marker
 try{marker=JSON.parse(regular(join(root,'head.json'),1024))}catch{fail('ALLOWANCE_CORRUPT')}
 if(JSON.stringify(marker)!==JSON.stringify(highWater(approvalHash,lines.length,previousHash,total)))fail('ALLOWANCE_CORRUPT')
 return {stored,approvalHash,previousHash,total,ids,entries:lines.length}
}
function summary(s){return {budgetId:s.stored.budgetId,projectId:s.stored.projectId,currency:'USD',recurrence:'none',limitMicros:s.stored.limitMicros,consumedCeilingMicros:s.total,remainingMicros:s.stored.limitMicros-s.total,attempts:s.entries,actualSpendKnown:false}}
/** Initialize once. Never call this automatically from an executor. */
export function createAllowance(directory,value){
 const a=approved(value),root=rootPath(directory)
 mkdirSync(root,{mode:0o700}) // EEXIST is intentional, including an incomplete prior setup.
 writeNew(join(root,'approval.json'),JSON.stringify(a)+'\n')
 writeNew(join(root,'admissions.jsonl'),'')
 writeNew(join(root,'head.json'),JSON.stringify(highWater(digest(a),0,digest(a),0))+'\n')
 return readAllowance(root,a)
}
export function readAllowance(directory,value){const a=approved(value);return locked(directory,root=>summary(state(root,a)))}
/** All admitted maxima remain consumed, even if no provider actually billed. */
export function consumeAllowance(directory,value,request){
 const a=approved(value),attempt=attempted(request)
 return locked(directory,(root,append)=>{
  const s=state(root,a)
  if(s.ids.has(attempt.id))fail('ATTEMPT_ALREADY_ADMITTED')
  if(attempt.ceilingMicros>a.limitMicros-s.total)fail('ALLOWANCE_EXCEEDED')
  if(s.entries>=MAX_ENTRIES)fail('ALLOWANCE_REVIEW_REQUIRED')
  const e={sequence:s.entries+1,approvalHash:s.approvalHash,previousHash:s.previousHash,attempt,admittedAt:new Date().toISOString()}
  const entry={...e,sha256:digest(e)};append(JSON.stringify(entry)+'\n',highWater(s.approvalHash,entry.sequence,entry.sha256,s.total+attempt.ceilingMicros))
  return {sequence:entry.sequence,sha256:entry.sha256,attemptId:attempt.id,ceilingMicros:attempt.ceilingMicros,remainingMicros:a.limitMicros-s.total-attempt.ceilingMicros}
 })
}
/** Trusted local composition point only. The callback MUST enforce native gates.
 * Never supply model/browser amounts, raw SDK callbacks or per-call directories. */
export async function withAllowance(directory,value,request,governedDispatch){
 if(typeof governedDispatch!=='function')fail('GOVERNED_EXECUTOR_REQUIRED')
 const receipt=consumeAllowance(directory,value,request)
 const result=await governedDispatch()
 return {receipt,result}
}
