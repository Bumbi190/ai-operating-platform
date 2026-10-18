import {canonicalTargetVersionHash} from '../../authorization/build'
import type {CodeWorkValidation} from '../types'
import {validateReviewContext,validateReviewAssignment} from './binding'
import {verifyReviewSnapshot,verifyReviewSnapshotStructure} from './snapshot'
import type {ExpectedReviewContext,ReviewSnapshotV1,ReviewModelResultV1,BoundReviewResultV1} from './types'
import {attempt,bytes,ensure,exact,freeze,hash,id,integer,jsonCopy,list,requireValid,text,unique} from './validation'
const KEYS=['schema','snapshotHash','phase','decision','findings','gaps','pendingQuestionIds']
function parse(input:unknown,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext,live:boolean):ReviewModelResultV1 {
 const c=requireValid(validateReviewContext(context)),s=requireValid(live?verifyReviewSnapshot(snapshot,c):verifyReviewSnapshotStructure(snapshot,c)),m=jsonCopy(input,c.limits.maxResultBytes)
 exact(m,KEYS);ensure(m.schema==='atlas.code_review_result.v1','schema_invalid');hash(m.snapshotHash);ensure(m.snapshotHash===s.snapshotHash,'review_snapshot_mismatch')
 ensure(['preliminary','final'].includes(m.phase),'review_phase_invalid');ensure(['passed','changes_requested','inconclusive'].includes(m.decision),'review_decision_invalid')
 list(m.findings,32);list(m.gaps,32);list(m.pendingQuestionIds,32);unique(m.findings.map((f:any)=>f.id));unique(m.pendingQuestionIds)
 for(const f of m.findings){
  exact(f,['id','severity','artifactId','path','line','trigger','impact','evidence','suggestedCorrection']);id(f.id);id(f.artifactId);ensure(['critical','important','minor'].includes(f.severity),'severity_invalid')
  const artifact=s.artifacts.find(a=>a.id===f.artifactId);ensure(artifact,'finding_artifact_missing')
  if(f.path===null){ensure(f.line===null&&!['source_before','source_after'].includes(artifact.kind),'finding_location_invalid')}
  else {
   const file=s.files.find(v=>v.path===f.path);ensure(file,'finding_path_invalid')
   ensure(f.artifactId===file.beforeArtifactId||f.artifactId===file.afterArtifactId||f.artifactId===s.diffArtifactId,'finding_artifact_path_mismatch')
   if(f.line!==null)integer(f.line,1)
  }
  for(const key of['trigger','impact','evidence','suggestedCorrection'])text(f[key])
 }
 for(const gap of m.gaps)text(gap)
 for(const question of m.pendingQuestionIds)id(question)
 if(m.phase==='final'&&m.decision==='passed')ensure(m.gaps.length===0&&m.pendingQuestionIds.length===0&&m.findings.every((f:any)=>f.severity==='minor'),'passed_with_blocker')
 ensure(bytes(JSON.stringify(m))<=c.limits.maxResultBytes,'result_too_large')
 return freeze(m as ReviewModelResultV1)
}
function bind(result:ReviewModelResultV1,assignment:ExpectedReviewContext['assignment']):BoundReviewResultV1{
 return freeze({...result,assignment,resultHash:canonicalTargetVersionHash({domain:'atlas.bound_code_review_result.v1',result,assignment})})
}
export function parseReviewModelResult(input:unknown,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext):CodeWorkValidation<ReviewModelResultV1>{return attempt(()=>parse(input,snapshot,context,true))}
export function bindReviewResult(result:ReviewModelResultV1,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext):CodeWorkValidation<BoundReviewResultV1>{return attempt(()=>{
 const c=requireValid(validateReviewContext(context));return bind(parse(result,snapshot,c,true),c.assignment)
})}
function verify(input:unknown,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext,live:boolean):BoundReviewResultV1 {
 const c=requireValid(validateReviewContext(context)),raw=jsonCopy(input);exact(raw,[...KEYS,'assignment','resultHash']);hash(raw.resultHash)
 const assignment=requireValid(validateReviewAssignment(raw.assignment,c));const{assignment:_,resultHash:pin,...model}=raw
 const result=parse(model,snapshot,c,live),bound=bind(result,assignment);ensure(bound.resultHash===pin,'review_result_hash_mismatch');return bound
}
export function verifyBoundReviewResult(input:unknown,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext):CodeWorkValidation<BoundReviewResultV1>{return attempt(()=>verify(input,snapshot,context,true))}
/** Structural contract only, for inert replay. Live eligibility always uses verifyBoundReviewResult. */
export function verifyBoundReviewResultStructure(input:unknown,snapshot:ReviewSnapshotV1,context:ExpectedReviewContext):CodeWorkValidation<BoundReviewResultV1>{return attempt(()=>verify(input,snapshot,context,false))}
