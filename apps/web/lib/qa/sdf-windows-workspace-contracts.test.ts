import {describe,it,expect} from 'vitest'
import {parseWindowsWorkspaceRequest,parseWindowsWorkspaceReport,parseWindowsSandboxProbeReport,WINDOWS_PROBE_PROTECTIONS} from '../../../code-broker/src/isolation/windows/workspace-contracts'
import {decodeWorkspaceHelperJson} from '../../../code-broker/src/isolation/windows/workspace-helper'
import {auditGitConfig} from '../../../code-broker/src/isolation/git-config-audit'
import {INSPECTED_PROTECTIONS} from '../../../code-broker/src/isolation/sandbox-probe'
import {makeWorkspaceRequest,makePreparedWorkspaceReport,makeSuccessfulProbeReport} from './fixtures/sdf-windows-workspace-fixtures'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
describe('closed Windows workspace request and native report',()=>{
 it('accepts the exact request and binds prepared evidence to its base',()=>{expect(parseWindowsWorkspaceRequest(makeWorkspaceRequest())).toEqual(makeWorkspaceRequest());expect(parseWindowsWorkspaceReport(makePreparedWorkspaceReport())).toEqual(makePreparedWorkspaceReport())})
 for(const [name,change] of [
  ['path',(v:any)=>v.cwd='C:/tmp'],['missing',(v:any)=>delete v.fence],['schema',(v:any)=>v.schema='other'],
  ['work id',(v:any)=>v.workId='../escape'],['nonv4 work id',(v:any)=>v.workId='11111111-1111-1111-8111-111111111111'],
  ['claim',(v:any)=>v.claimId='bad'],['upper SHA',(v:any)=>v.pinnedBaseSha='A'.repeat(40)],['short SHA',(v:any)=>v.pinnedBaseSha='a'],
  ['bad admission',(v:any)=>v.admissionHash='b'],['zero fence',(v:any)=>v.fence=0],['fraction fence',(v:any)=>v.fence=1.1],
  ['unsafe fence',(v:any)=>v.fence=Number.MAX_SAFE_INTEGER+1],['fence string',(v:any)=>v.fence='1'],['long repository',(v:any)=>v.repositoryId='a'.repeat(257)],
 ] as const)it('rejects request '+name,()=>{const value=makeWorkspaceRequest();change(value);expect(()=>parseWindowsWorkspaceRequest(value)).toThrow()})
 for(const [name,change] of [
  ['authority',(v:any)=>v.productionAuthority=true],['retention',(v:any)=>v.workspaceRetained=false],['path',(v:any)=>v.path='C:/private'],
  ['missing observed time',(v:any)=>delete v.observedAt],['bad time',(v:any)=>v.observedAt='2026-02-30T00:00:00.000Z'],
  ['head mismatch',(v:any)=>v.headSha='c'.repeat(40)],['observed base mismatch',(v:any)=>v.observedBaseSha='c'.repeat(40)],
  ['branch mismatch',(v:any)=>v.branchName='main'],['bad identity hash',(v:any)=>v.workspaceIdentityHash='a'],
  ['binding authority',(v:any)=>v.binding.productionAuthority=true],['unknown status',(v:any)=>v.status='ready'],
 ] as const)it('rejects prepared '+name,()=>{const value=makePreparedWorkspaceReport();change(value);expect(()=>parseWindowsWorkspaceReport(value)).toThrow()})
 it('preserves a closed refusal and a retained failure',()=>{
  for(const value of [{schema:'sdf.windows_workspace_report.v1',status:'refused',reason:'unsafe_path',workspaceRetained:false,productionAuthority:false},{schema:'sdf.windows_workspace_report.v1',status:'failed',reason:'verification_failed',workspaceRetained:true,productionAuthority:false}])expect(parseWindowsWorkspaceReport(value)).toEqual(value)
 })
 it('refuses stale evidence whose base did not actually differ',()=>{
  const value={schema:'sdf.windows_workspace_report.v1',status:'stale_base',pinnedBaseSha:'a'.repeat(40),observedBaseSha:'b'.repeat(40),workspaceRetained:false,productionAuthority:false}
  expect(parseWindowsWorkspaceReport(value)).toEqual(value);value.observedBaseSha=value.pinnedBaseSha;expect(()=>parseWindowsWorkspaceReport(value)).toThrow()
 })
 it('uses the same closed Git policy corpus as the real native smoke',()=>{
  const vectors=JSON.parse(readFileSync(resolve(__dirname,'fixtures/sdf-windows-git-policy-vectors.json'),'utf8'))
  for(const row of vectors)expect(auditGitConfig(row.config,'origin',{provider:'github',host:'github.com',owner:'bumbi190',name:'ai-operating-platform'}).ok,row.id).toBe(row.allowed)
 })
})
describe('closed sandbox probe evidence',()=>{
 it('keeps the predecessor inspection vocabulary exactly',()=>expect(WINDOWS_PROBE_PROTECTIONS).toEqual(INSPECTED_PROTECTIONS))
 it('accepts proven non-root execution only after removal',()=>expect(parseWindowsSandboxProbeReport(makeSuccessfulProbeReport())).toEqual(makeSuccessfulProbeReport()))
 for(const [name,change] of [
  ['not removed',(v:any)=>v.containerRemoved=false],['wrong uid',(v:any)=>v.uid=0],['wrong gid',(v:any)=>v.gid=0],
  ['incomplete inspect',(v:any)=>v.inspected.pop()],['duplicate inspect',(v:any)=>v.inspected[1]=v.inspected[0]],['unknown inspect',(v:any)=>v.inspected[0]='secret'],
  ['reason',(v:any)=>v.reason='probe_failed'],['authority',(v:any)=>v.productionAuthority=true],['extra token',(v:any)=>v.token='secret'],
  ['missing peer',(v:any)=>v.backendIdentityHash=null],['missing daemon',(v:any)=>v.daemonIdentityHash=null],['bad image',(v:any)=>v.imageId='latest'],
  ['bad container',(v:any)=>v.containerId='other'],['wrong attempt',(v:any)=>v.attemptId='bad'],['missing field',(v:any)=>delete v.reason],
 ] as const)it('rejects probe '+name,()=>{const value=makeSuccessfulProbeReport();change(value);expect(()=>parseWindowsSandboxProbeReport(value)).toThrow()})
 it('distinguishes cleanup success from proof of execution',()=>{
  const value={...makeSuccessfulProbeReport(),status:'cleaned',uid:null,gid:null,inspected:[]}
  expect(parseWindowsSandboxProbeReport(value)).toEqual(value);value.status='ok';expect(()=>parseWindowsSandboxProbeReport(value)).toThrow()
 })
 it('preserves sanitized blocked or failed outcomes without invented observations',()=>{
  const value={...makeSuccessfulProbeReport(),status:'blocked',reason:'host_unqualified',backendIdentityHash:null,daemonIdentityHash:null,imageId:null,containerId:null,uid:null,gid:null,inspected:[],containerRemoved:false}
  expect(parseWindowsSandboxProbeReport(value)).toEqual(value)
  expect(()=>parseWindowsSandboxProbeReport({...value,uid:10001})).toThrow()
 })
})
describe('bounded raw native JSON decoder',()=>{
 it('accepts exact JSON with escaped text',()=>expect(decodeWorkspaceHelperJson('{"text":"a\\"b","value":[true,null,1]}')).toEqual({text:'a"b',value:[true,null,1]}))
 for(const text of ['{"a":1,"a":2}','{"a":{"\\u0062":1,"b":2}}','not json','{"a":1} trailing','{"a":01}',' '.repeat(262145),'{"a":"'+('å'.repeat(131073))+'"}','['.repeat(18)+'0'+']'.repeat(18)])it('refuses ambiguous or out-of-bound JSON '+text.length,()=>expect(()=>decodeWorkspaceHelperJson(text)).toThrow())
})
