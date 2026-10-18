import {createHash} from 'node:crypto'
import {canonicalTargetVersionHash} from '../../authorization/build'
import {evaluateRepoPath} from '../path-policy'
import type {CodeWorkValidation} from '../types'
import {validateReviewContext,validateLiveReviewContext,validateReviewBindingStructure,validateReviewAssignment} from './binding'
import type {ExpectedReviewContext,ReviewSnapshotV1,BuiltReviewArtifactV1,ReviewCheckV1,ReviewFileV1} from './types'
import {attempt,bytes,ensure,exact,freeze,hash,id,integer,jsonCopy,list,requireValid,text,unique} from './validation'
const ROOT=['schema','binding','assignment','candidateVersion','briefArtifactId','files','diffArtifactId','diffBytes','checks','artifacts']
const ARTIFACT=['id','kind','body']
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0
function build(input:unknown,context:ExpectedReviewContext,live:boolean):ReviewSnapshotV1 {
 const c=requireValid(live?validateLiveReviewContext(context):validateReviewContext(context)),x=jsonCopy(input)
 exact(x,ROOT);ensure(x.schema==='atlas.code_review_snapshot.v1','schema_invalid')
 const binding=requireValid(validateReviewBindingStructure(x.binding,c)),assignment=requireValid(validateReviewAssignment(x.assignment,c))
 integer(x.candidateVersion,1,Math.min(2,c.admission.limits.maxWorkerIterations,c.limits.maxReviewSessions))
 list(x.artifacts,64,1);unique(x.artifacts.map((a:any)=>a.id))
 const artifacts:BuiltReviewArtifactV1[]=x.artifacts.map((a:any)=>{
  exact(a,ARTIFACT);id(a.id);ensure(['brief','source_before','source_after','diff','stdout','stderr'].includes(a.kind),'artifact_kind_invalid');text(a.body,131072,true)
  return{id:a.id,kind:a.kind as BuiltReviewArtifactV1['kind'],body:a.body,sha256:createHash('sha256').update(a.body,'utf8').digest('hex'),byteLength:bytes(a.body)}
 })
 const used=new Set<string>()
 const artifact=(ref:unknown,kind:string)=>{
  id(ref);const a=artifacts.find(a=>a.id===ref);ensure(a&&a.kind===kind,'artifact_missing_or_kind_mismatch');used.add(ref);return a
 }
 text(artifact(x.briefArtifactId,'brief').body,65536)
 const diff=artifact(x.diffArtifactId,'diff');text(diff.body,Math.min(131072,c.admission.limits.maxDiffBytes))
 integer(x.diffBytes,1,c.admission.limits.maxDiffBytes);ensure(x.diffBytes===diff.byteLength,'diff_bytes_mismatch')
 list(x.files,c.admission.limits.maxChangedFiles,1)
 const files:ReviewFileV1[]=x.files.map((f:any)=>{
  exact(f,['path','beforeArtifactId','afterArtifactId']);text(f.path,4096)
  ensure(!f.path.includes(':')&&f.path.split('/').every((p:string)=>!p.endsWith('.')&&!p.endsWith(' ')&&!p.includes('~')),'path_alias')
  const path=requireValid(evaluateRepoPath({path:f.path,allowedScopes:c.admission.files.writeScopes,deniedScopes:c.admission.files.deniedScopes}))
  ensure(f.beforeArtifactId!==null||f.afterArtifactId!==null,'empty_file_pair')
  if(f.beforeArtifactId!==null)requireValid(evaluateRepoPath({path,allowedScopes:c.admission.files.readScopes,deniedScopes:c.admission.files.deniedScopes}))
  const before=f.beforeArtifactId===null?null:artifact(f.beforeArtifactId,'source_before')
  const after=f.afterArtifactId===null?null:artifact(f.afterArtifactId,'source_after')
  const permission=before===null?'create':after===null?'delete':'update'
  ensure(c.admission.files.permissions[permission],'operation_not_permitted')
  ensure(before===null||after===null||before.body!==after.body,'unchanged_file')
  return{path,beforeArtifactId:f.beforeArtifactId,afterArtifactId:f.afterArtifactId}
 })
 unique(files.map(f=>f.path.normalize('NFC').toLowerCase()))
 list(x.checks,c.requiredChecks.length,c.requiredChecks.length);unique(x.checks.map((k:any)=>k.commandId))
 const checks:ReviewCheckV1[]=x.checks.map((k:any)=>{
  exact(k,['commandId','registryHash','argvHash','exitCode','outcome','passedTestCount','durationMs','stdoutArtifactId','stderrArtifactId'])
  const expected=c.requiredChecks.find(v=>v.commandId===k.commandId);ensure(expected,'unknown_check')
  ensure(k.registryHash===expected.registryHash&&k.argvHash===expected.argvHash,'check_pin_mismatch')
  ensure(k.exitCode===0&&k.outcome==='passed','check_not_passed');integer(k.durationMs,0,c.admission.limits.maxCommandRuntimeSeconds*1000)
  if(expected.minPassedTests===null)ensure(k.passedTestCount===null,'test_count_invalid');else integer(k.passedTestCount,expected.minPassedTests)
  artifact(k.stdoutArtifactId,'stdout');artifact(k.stderrArtifactId,'stderr')
  return k as ReviewCheckV1
 })
 ensure(used.size===artifacts.length,'unreferenced_artifact')
 const packet={schema:'atlas.code_review_snapshot.v1' as const,binding,assignment,candidateVersion:x.candidateVersion as 1|2,briefArtifactId:x.briefArtifactId,files:files.sort((a,b)=>compare(a.path,b.path)),diffArtifactId:x.diffArtifactId,diffBytes:diff.byteLength,checks:checks.sort((a,b)=>compare(a.commandId,b.commandId)),artifacts:artifacts.sort((a,b)=>compare(a.id,b.id))}
 ensure(bytes(JSON.stringify(packet))<=c.limits.maxContextBytes,'context_too_large')
 return freeze({...packet,snapshotHash:canonicalTargetVersionHash({domain:'atlas.code_review_snapshot.v1',packet})})
}
export function buildReviewSnapshot(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewSnapshotV1>{return attempt(()=>build(input,context,true))}
function verify(input:unknown,context:ExpectedReviewContext,live:boolean):ReviewSnapshotV1 {
 const s=jsonCopy(input);exact(s,[...ROOT,'snapshotHash']);hash(s.snapshotHash);list(s.artifacts,64,1)
 const built=s.artifacts
 const artifacts=built.map((a:any)=>{exact(a,[...ARTIFACT,'sha256','byteLength']);hash(a.sha256);integer(a.byteLength);return{id:a.id,kind:a.kind,body:a.body}})
 const{snapshotHash:pin,...raw}=s
 const recomputed=build({...raw,artifacts},context,live)
 ensure(pin===recomputed.snapshotHash,'snapshot_hash_mismatch')
 for(const a of built){const expected=recomputed.artifacts.find(x=>x.id===a.id);ensure(expected&&a.sha256===expected.sha256&&a.byteLength===expected.byteLength,'artifact_hash_mismatch')}
 return recomputed
}
export function verifyReviewSnapshot(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewSnapshotV1>{return attempt(()=>verify(input,context,true))}
/** Non-authoritative structural replay path. Never authorizes a new action or bypasses a live gate. */
export function verifyReviewSnapshotStructure(input:unknown,context:ExpectedReviewContext):CodeWorkValidation<ReviewSnapshotV1>{return attempt(()=>verify(input,context,false))}
