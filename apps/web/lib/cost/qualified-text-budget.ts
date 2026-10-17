import 'server-only'
import {canonicalJson,sha256,isSha256,isUuid} from '@omnira/local-text-contract'
export const BOUNDED_TEXT_MODEL='gpt-5.4-mini-2026-03-17'
export type TextEnvelopeEvidence={model:string;kind:'utf8_byte_bpe_chat_v1';byteCoverageVerified:boolean;fixedRoleEnvelopeVerified:boolean;roleOverheadTokens:number;evidenceHash:string}
export type QualifiedTextInputBudget=Readonly<{kind:'QUALIFIED_PLAIN_TEXT_INPUT'}>
export type VerifiedInputCeiling=Readonly<{kind:'VERIFIED_INPUT_CEILING'}>
const grants=new WeakMap<object,{model:string;runId:string;claimId:string;messagesHash:string;inputUpperBound:number}>()
const ceilings=new WeakMap<object,number>()
function invalid():never{throw Error('UNVERIFIED_TEXT_INPUT_BUDGET')}
/** Called only after server role qualification/admission. Evidence is never
 * accepted from a job/tool/model. Private grants cannot survive JSON copying. */
export function createQualifiedTextBudget(input:{model:string;runId:string;claimId:string;systemPrompt:string;userMessage:string;evidence:TextEnvelopeEvidence}):QualifiedTextInputBudget{
 const e=input.evidence
 if(input.model!==BOUNDED_TEXT_MODEL||!isUuid(input.runId)||!isUuid(input.claimId)||typeof input.systemPrompt!=='string'||typeof input.userMessage!=='string'||!e||e.model!==input.model||e.kind!=='utf8_byte_bpe_chat_v1'||e.byteCoverageVerified!==true||e.fixedRoleEnvelopeVerified!==true||!isSha256(e.evidenceHash)||!Number.isInteger(e.roleOverheadTokens)||e.roleOverheadTokens<1024||e.roleOverheadTokens>4096)invalid()
 const messages=[{role:'system',content:input.systemPrompt},{role:'user',content:input.userMessage}],messagesHash=sha256(canonicalJson(messages))
 const inputUpperBound=Buffer.byteLength(input.systemPrompt,'utf8')+Buffer.byteLength(input.userMessage,'utf8')+e.roleOverheadTokens
 if(inputUpperBound>8192)invalid()
 const grant=Object.freeze({kind:'QUALIFIED_PLAIN_TEXT_INPUT' as const});grants.set(grant,{model:input.model,runId:input.runId,claimId:input.claimId,messagesHash,inputUpperBound});return grant
}
export function verifyQualifiedTextBudget(params:Record<string,unknown>,grant:QualifiedTextInputBudget,owner:{runId:string;claimId:string;operation:string}):VerifiedInputCeiling{
 const g=grants.get(grant),allowed=['model','messages','max_tokens','max_completion_tokens','temperature','reasoning_effort','stream','n']
 if(!g||!owner||g.model!==params.model||g.runId!==owner.runId||g.claimId!==owner.claimId||!['local_text.review','local_text.task'].includes(owner.operation)||Reflect.ownKeys(params).some(k=>typeof k!=='string'||!allowed.includes(k))||!(params.stream===undefined||params.stream===false)||!(params.reasoning_effort===undefined||params.reasoning_effort==='none')||(params.max_tokens!==undefined&&params.max_completion_tokens!==undefined)||!(params.n===undefined||params.n===1)||!Array.isArray(params.messages)||params.messages.length!==2)invalid()
 for(let i=0;i<2;i++){const m=params.messages[i];if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join(',')!=='content,role'||m.role!==(i===0?'system':'user')||typeof m.content!=='string')invalid()}
 const cap=params.max_completion_tokens??params.max_tokens
 if(!Number.isInteger(cap)||Number(cap)<1||Number(cap)>(owner.operation==='local_text.task'?512:1536)||sha256(canonicalJson(params.messages))!==g.messagesHash)invalid()
 const verified=Object.freeze({kind:'VERIFIED_INPUT_CEILING' as const});ceilings.set(verified,g.inputUpperBound);return verified
}
export function readVerifiedInputCeiling(input:VerifiedInputCeiling):number{const bound=ceilings.get(input);if(typeof bound!=='number'||!Number.isSafeInteger(bound)||bound<1||bound>8192)return invalid();return bound}
