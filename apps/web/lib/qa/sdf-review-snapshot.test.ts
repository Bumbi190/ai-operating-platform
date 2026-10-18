import {describe,it,expect} from 'vitest'
import {canonicalTargetVersionHash} from '@/lib/atlas/authorization/build'
import {buildReviewSnapshot,verifyReviewSnapshot} from '@/lib/atlas/code-work/review/snapshot'
import {makeReviewContext,makeReviewBinding,makeSnapshotInput,unwrap} from './fixtures/sdf-review-fixtures'
const clone=structuredClone
describe('frozen review packets',()=>{
 it('packet_hash_is_key_order_independent',()=>{const c=makeReviewContext(),a=makeSnapshotInput(c),b=Object.fromEntries(Object.entries(clone(a)).reverse());expect(unwrap(buildReviewSnapshot(a,c)).snapshotHash).toBe(unwrap(buildReviewSnapshot(b,c)).snapshotHash)})
 for(const change of [
  (x:any)=>x.candidateVersion=2,(x:any)=>x.artifacts.find((a:any)=>a.id==='after').body='newer',(x:any)=>x.artifacts.find((a:any)=>a.id==='stdout').body='new output',
  (x:any)=>x.artifacts.find((a:any)=>a.id==='before').body='another base',(x:any)=>x.checks[0].durationMs=101,(x:any)=>x.checks[0].passedTestCount=3,
 ])it('each_material_change_changes_pin '+change,()=>{const c=makeReviewContext(),a=makeSnapshotInput(c),original=unwrap(buildReviewSnapshot(a,c));change(a);const next=unwrap(buildReviewSnapshot(a,c));expect(next.snapshotHash).not.toBe(original.snapshotHash);expect(verifyReviewSnapshot({...next,snapshotHash:original.snapshotHash},c).ok).toBe(false)})
 for(const change of [
  (c:any)=>c.targetHeadSha='c'.repeat(40),(c:any)=>c.admission.repository.pinnedBaseSha='c'.repeat(40),
  (c:any)=>c.admission.governance.mission.hash='c'.repeat(64),(c:any)=>c.admission.governance.delegation.hash='c'.repeat(64),(c:any)=>c.admission.governance.workPackage.hash='c'.repeat(64),
  (c:any)=>c.limits.maxMessages=11,(c:any)=>c.budget.totalMicrousd=90000,(c:any)=>c.budget.reviewerAllocationMicrousd=31000,(c:any)=>c.deadlineMs-=1,
  (c:any)=>c.assignment.claim.fence=2,
 ])it('changed_context_invalidates_old_packet '+change,()=>{const c=makeReviewContext(),s=unwrap(buildReviewSnapshot(makeSnapshotInput(c),c));change(c);expect(verifyReviewSnapshot(s,c).ok).toBe(false)})
 for(const change of [
  (x:any)=>x.artifacts.pop(),(x:any)=>x.artifacts[0].kind='stdout',(x:any)=>x.artifacts.push({id:'smuggled',kind:'brief',body:'hidden'}),
  (x:any)=>x.files.push(clone(x.files[0])),(x:any)=>x.files[0].afterArtifactId=null,(x:any)=>x.diffBytes=1,
  (x:any)=>x.checks[0].outcome='skipped',(x:any)=>x.checks[0].outcome='failed',(x:any)=>x.checks[0].passedTestCount=0,(x:any)=>x.checks=[],
  (x:any)=>x.checks[0].registryHash='c'.repeat(64),(x:any)=>x.checks[0].argvHash='c'.repeat(64),(x:any)=>x.checks[0].exitCode=1,
  (x:any)=>x.artifacts[1].body='new',(x:any)=>x.artifacts[0].extra=true,(x:any)=>x.files=[],
 ])it('rejects incomplete or contradictory packet '+change,()=>{const c=makeReviewContext(),x=makeSnapshotInput(c);change(x);expect(buildReviewSnapshot(x,c).ok).toBe(false)})
 for(const path of ['../secret','apps\\web\\file.ts','apps/web/lib/atlas/code-work/a:stream','apps/web/lib/atlas/code-work/PROGRA~1','apps/web/lib/atlas/code-work/a.','apps/web/lib/atlas/code-work/a ','apps/web/lib/atlas/code-work/private/a.ts'])it('refuses alias or denied '+path,()=>{const c=makeReviewContext(),x=makeSnapshotInput(c);x.files[0].path=path;expect(buildReviewSnapshot(x,c).ok).toBe(false)})
 it.each([['Example.ts','example.ts'],['caf\u00e9.ts','cafe\u0301.ts']])('rejects case/unicode duplicate %s', (a,b)=>{const c=makeReviewContext(),x=makeSnapshotInput(c);x.files=[a,b].map(n=>({...x.files[0],path:'apps/web/lib/atlas/code-work/'+n}));expect(buildReviewSnapshot(x,c).ok).toBe(false)})
 it('rejects ninth unique file',()=>{const c=makeReviewContext(),x=makeSnapshotInput(c);x.files=Array.from({length:9},(_,i)=>({...x.files[0],path:'apps/web/lib/atlas/code-work/f'+i+'.ts'}));expect(buildReviewSnapshot(x,c).ok).toBe(false)})
 it('rejects diff over 131072 bytes before context truncation',()=>{const c=makeReviewContext(),x=makeSnapshotInput(c);x.artifacts.find(a=>a.id==='diff')!.body='x'.repeat(131073);x.diffBytes=131073;expect(buildReviewSnapshot(x,c).ok).toBe(false)})
 it('allows a typecheck without claiming a passed-test count',()=>{const c=makeReviewContext();c.requiredChecks=[{commandId:'sdf1.proof.typecheck',commandVersion:1,arguments:{},registryHash:c.requiredChecks[0].registryHash,argvHash:canonicalTargetVersionHash(['run','typecheck']),minPassedTests:null}];const x=makeSnapshotInput(c);x.checks[0].passedTestCount=null;expect(buildReviewSnapshot(x,c).ok).toBe(true)})
 it('enforces exact 65536/65537 UTF8 context bytes',()=>{
  const c=makeReviewContext(),x=makeSnapshotInput(c),s:any=clone(unwrap(buildReviewSnapshot(x,c)));delete s.snapshotHash
  const brief=s.artifacts.find((a:any)=>a.id==='brief');brief.body='å';brief.byteLength=2
  for(let n=0;n<4;n++){const delta=65536-new TextEncoder().encode(JSON.stringify(s)).length;brief.body+='x'.repeat(Math.max(0,delta));if(delta<0)brief.body=brief.body.slice(0,delta);brief.byteLength=new TextEncoder().encode(brief.body).length}
  expect(new TextEncoder().encode(JSON.stringify(s)).length).toBe(65536)
  x.artifacts.find(a=>a.id==='brief')!.body=brief.body
  expect(buildReviewSnapshot(x,c).ok).toBe(true)
  x.artifacts.find(a=>a.id==='brief')!.body+='x';expect(buildReviewSnapshot(x,c).ok).toBe(false)
 })
 it('does not lend mutable packet contents',()=>{const c=makeReviewContext(),x=makeSnapshotInput(c),s=unwrap(buildReviewSnapshot(x,c));x.artifacts[0].body='changed';expect(s.artifacts.find((a:any)=>a.id==='brief').body).toBe('Fix the specified bug.');expect(Object.isFrozen(s.artifacts)).toBe(true);expect(verifyReviewSnapshot(s,c).ok).toBe(true)})
 for(const change of [(x:any)=>x.artifacts[0].body=undefined,(x:any)=>delete x.artifacts[1],(x:any)=>x.checks[0].durationMs=NaN,(x:any)=>x.artifacts[0].body='\ud800',(x:any)=>x.artifacts[0].body='nul\0'])it('rejects non-JSON/nontext content '+change,()=>{const c=makeReviewContext(),x=makeSnapshotInput(c);change(x);expect(buildReviewSnapshot(x,c).ok).toBe(false)})
})

it.each([
 ['private','Private/a.ts'],['private','PRIVATE'],['PRIVATE','private/a.ts'],['prívate','PRI\u0301VATE/a.ts'],
])('rejects a single denied Windows case alias %s / %s',(denied,path)=>{
 const c=makeReviewContext();c.admission.files.deniedScopes=['apps/web/lib/atlas/code-work/'+denied]
 const input=makeSnapshotInput(c);input.files[0].path='apps/web/lib/atlas/code-work/'+path
 const result=buildReviewSnapshot(input,c)
 expect(result.ok).toBe(false)
 if(!result.ok)expect(result.violations[0].code).toBe('path_explicitly_denied')
})
