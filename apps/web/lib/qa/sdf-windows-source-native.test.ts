import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {resolve,join} from 'node:path'
import {describe,it,expect} from 'vitest'
const required=process.env.SDF_WINDOWS_SOURCE_REQUIRED==='1'
if(required&&process.platform!=='win32')throw Error('Source proof requires Windows')
const ROOT=resolve(__dirname,'../../../..'),WS=join(ROOT,'.superpowers/sdd/2026-10-19-windows-source-materialization')
const SMOKE=join(ROOT,'apps/code-broker/native/windows-workspace/smoke/bin/Release/net8.0-windows/WorkspaceSmoke.dll')
describe.runIf(required&&process.platform==='win32')('native immutable source proof',()=>{
 it('proves raw Git bytes, refusal boundaries, retained registrations and deterministic USTAR',async()=>{
  const {stdout,stderr}=await promisify(execFile)('C:\\Program Files\\dotnet\\dotnet.exe',[SMOKE,'source'],{cwd:ROOT,windowsHide:true,shell:false,timeout:120000,maxBuffer:262144,env:{...process.env,SDF_WINDOWS_FIXTURE_ROOT:WS}})
  expect(stderr).toBe('');const r=JSON.parse(stdout);expect(r.passed).toBe(r.names.length)
  for(const name of ['exact_selected_files','wrong_blob_hash','real_git_snapshot22','retained_target_blocks_replace','retained_registration_blocks_replace','dirty_source_refused','untracked_source_refused','replace_refs_do_not_substitute','legacy_graft_refused','missing_source_does_not_prepare','deterministic_archive','total_limit'])expect(r.names).toContain(name)
 },125000)
 for(const mode of ['source-secret-literals','output-secret-literals','diagnostic-secret-literals'])it('protects quoted credentials at '+mode,async()=>{
  const {stdout,stderr}=await promisify(execFile)('C:\\Program Files\\dotnet\\dotnet.exe',[SMOKE,mode],{cwd:ROOT,windowsHide:true,shell:false,timeout:30000,maxBuffer:262144,env:{...process.env,SDF_WINDOWS_FIXTURE_ROOT:WS}})
  expect(stderr).toBe('');const r=JSON.parse(stdout);expect(r.passed).toBeGreaterThanOrEqual(7)
 },35000)
})