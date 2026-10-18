import {canonicalTargetVersionHash} from '../../authorization/build'
import type {CodeWorkValidation} from '../types'
import {validateReviewContext,validateLiveReviewContext} from './binding'
import {verifyReviewSnapshotStructure} from './snapshot'
import {verifyBoundReviewResult} from './result'
import type {AgentMessageBodyV1,AgentMessageContext,AgentMessageLedgerV1,AgentMessageV1,ReviewRole,ReviewAssignmentV1} from './types'
import {attempt,ensure,exact,freeze,hash,id,integer,iso,jsonCopy,list,requireValid,text,unique} from './validation'
const BODY=['schema','id','snapshotHash','kind','body','replyTo','artifactIds']
const META=['sequence','workId','projectId','from','to','assignmentHash','observedAt','messageHash']
function role(v:unknown):asserts v is ReviewRole{ensure(v==='atlas'||v==='worker'||v==='reviewer','role_invalid')}
function actor(assignment:ReviewAssignmentV1,r:ReviewRole){return r==='atlas'?assignment.coordinator:assignment[r]}
function bodyShape(v:any,maxBytes:number):void {
 exact(v,BODY);ensure(v.schema==='atlas.code_review_message.v1','schema_invalid');id(v.id);hash(v.snapshotHash)
 ensure(['question','answer','finding_reference','correction_request','blocker'].includes(v.kind),'message_kind_invalid');text(v.body,maxBytes)
 if(v.replyTo!==null)id(v.replyTo)
 list(v.artifactIds,64);unique(v.artifactIds);for(const ref of v.artifactIds)id(ref)
}
function messageHash(entry:Omit<AgentMessageV1,'messageHash'>):string{return canonicalTargetVersionHash({domain:'atlas.code_review_message.v1',entry})}
function historyShape(input:unknown,c:AgentMessageContext):AgentMessageLedgerV1 {
 const h=jsonCopy(input);exact(h,['workId','projectId','entries']);ensure(h.workId===c.expected.admission.workId&&h.projectId===c.expected.admission.projectId,'history_scope_mismatch')
 list(h.entries,c.expected.limits.maxMessages);unique(h.entries.map((v:any)=>v.id))
 for(const[i,entry]of h.entries.entries()){
  exact(entry,[...BODY,...META]);const{sequence,workId,projectId,from,to,assignmentHash,observedAt,messageHash:pin,...body}=entry
  bodyShape(body,c.expected.limits.maxMessageBodyBytes);integer(sequence,1);ensure(sequence===i+1,'message_sequence_invalid')
  ensure(workId===h.workId&&projectId===h.projectId,'history_scope_mismatch')
  for(const person of[from,to]){exact(person,['role','actorId','sessionId']);role(person.role);id(person.actorId);id(person.sessionId)}
  ensure(from.role!==to.role&&from.actorId!==to.actorId&&from.sessionId!==to.sessionId,'message_self_address')
  hash(assignmentHash);iso(observedAt);hash(pin)
  const{messageHash:_,...projection}=entry;ensure(pin===messageHash(projection),'message_hash_mismatch')
  if(body.replyTo!==null)ensure(h.entries.slice(0,i).some((prior:any)=>prior.id===body.replyTo&&prior.snapshotHash===body.snapshotHash),'message_reply_invalid')
 }
 return h as AgentMessageLedgerV1
}
/** Immutable contract reducer. Supplied history/context do not authenticate senders or provide durable delivery. */
export function appendReviewMessage(history:AgentMessageLedgerV1,input:unknown,context:AgentMessageContext):CodeWorkValidation<{outcome:'appended'|'replayed';ledger:AgentMessageLedgerV1}>{return attempt(()=>{
 const raw=jsonCopy(context);exact(raw,['expected','snapshot','senderRole','recipientRole','phase','firstAssessment','senderActorId','senderSessionId'])
 const expected=requireValid(validateReviewContext(raw.expected)),snapshot=requireValid(verifyReviewSnapshotStructure(raw.snapshot,expected))
 role(raw.senderRole);role(raw.recipientRole);ensure(['initial','discussion','closed'].includes(raw.phase),'message_phase_invalid')
 const c={...raw,expected,snapshot}as AgentMessageContext
 const from={role:c.senderRole,...actor(expected.assignment,c.senderRole)},to={role:c.recipientRole,...actor(expected.assignment,c.recipientRole)}
 ensure(c.senderActorId===from.actorId&&c.senderSessionId===from.sessionId,'message_sender_mismatch')
 ensure(from.role!==to.role,'message_self_address')
 const body=jsonCopy(input);bodyShape(body,expected.limits.maxMessageBodyBytes);ensure(body.snapshotHash===snapshot.snapshotHash,'message_snapshot_mismatch')
 const ledger=historyShape(history,c),assignmentHash=canonicalTargetVersionHash(expected.assignment)
 const derived={...body,workId:ledger.workId,projectId:ledger.projectId,from,to,assignmentHash}
 const existing=ledger.entries.find(v=>v.id===body.id)
 if(existing){
  const{sequence,observedAt,messageHash:_,...stored}=existing
  ensure(canonicalTargetVersionHash(stored)===canonicalTargetVersionHash(derived),'message_id_conflict')
  return freeze({outcome:'replayed' as const,ledger})
 }
 requireValid(validateLiveReviewContext(expected));ensure(c.phase!=='closed','message_closed')
 ensure(ledger.entries.length<expected.limits.maxMessages,'message_limit_exceeded')
 if(c.phase==='discussion'){
  ensure(c.firstAssessment!==null,'first_assessment_required')
  const assessment=requireValid(verifyBoundReviewResult(c.firstAssessment,snapshot,expected));ensure(assessment.phase==='preliminary','assessment_not_open')
 }else{
  ensure(c.firstAssessment===null,'message_phase_invalid')
  ensure(!(c.senderRole==='worker'&&c.recipientRole==='reviewer'),'worker_context_embargo')
 }
 for(const ref of body.artifactIds)ensure(snapshot.artifacts.some(a=>a.id===ref),'message_artifact_missing')
 const prior=body.replyTo===null?null:ledger.entries.find(v=>v.id===body.replyTo&&v.snapshotHash===snapshot.snapshotHash)
 if(body.replyTo!==null)ensure(prior,'message_reply_invalid')
 if(body.kind==='answer')ensure(prior&&prior.kind==='question'&&prior.to.actorId===from.actorId&&prior.to.sessionId===from.sessionId&&prior.from.actorId===to.actorId&&prior.from.sessionId===to.sessionId,'message_answer_invalid')
 if(body.kind==='finding_reference'||body.kind==='correction_request')ensure(c.senderRole==='reviewer'&&(c.recipientRole==='atlas'||c.recipientRole==='worker'),'message_role_forbidden')
 const entry={...derived,sequence:ledger.entries.length+1,observedAt:new Date(expected.nowMs).toISOString()}as Omit<AgentMessageV1,'messageHash'>
 return freeze({outcome:'appended' as const,ledger:{workId:ledger.workId,projectId:ledger.projectId,entries:[...ledger.entries,{...entry,messageHash:messageHash(entry)}]}})
})}
