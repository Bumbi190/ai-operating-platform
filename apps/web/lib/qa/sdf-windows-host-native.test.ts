import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import { readWindowsHostQualification, parseWindowsHostQualification } from '../../../code-broker/src/isolation/windows/host-qualification'
const required=process.env.SDF_WINDOWS_HOST_REQUIRED==='1'
if(required&&process.platform!=='win32')throw Error('Windows host proof requires Windows')
const ROOT=resolve(__dirname,'../../../..'),DOTNET='C:\\Program Files\\dotnet\\dotnet.exe'
const HELPER=resolve(ROOT,'apps/code-broker/.native/windows-host/OmniraBrokerHost.dll')
const SMOKE=resolve(ROOT,'apps/code-broker/native/windows-host/smoke/bin/Release/net8.0-windows/Smoke.dll')
const exec=promisify(execFile)
describe.runIf(required&&process.platform==='win32')('real Windows host qualification',()=>{
 let report:ReturnType<typeof parseWindowsHostQualification>
 beforeAll(async()=>{
  if(!existsSync(HELPER)||!existsSync(SMOKE))throw Error('Build Windows host helper and smoke prerequisite first')
  const {stdout}=await exec(DOTNET,[HELPER,'qualify'],{shell:false,windowsHide:true,timeout:15000,maxBuffer:262144,cwd:ROOT})
  report=parseWindowsHostQualification(JSON.parse(stdout))
 },20000)
 for(const id of ['git','docker','backend','dotnet','checkout','worktree_parent'])it('proves fixed '+id+' native path/ACL/hash',()=>{
  expect(report.targetChecks.find(t=>t.id===id)).toMatchObject({ok:true,reasons:[],identityHash:expect.stringMatching(/^[0-9a-f]{64}$/)})
 })
 it('proves the connected Docker peer and read-only metadata',()=>{
  expect(report.status).toBe('qualified_for_health_probe')
  expect(report.docker).toMatchObject({osType:'linux',provider:'docker_desktop_wsl2',kernelFamily:'microsoft_wsl2'})
  expect(report.reasons).toEqual([])
 })
 it('runs the real TypeScript facade without granting execution',async()=>{
  const result=await readWindowsHostQualification();expect(result.status).toBe('observed')
  if(result.status==='observed')expect(result.report.status).toBe('qualified_for_health_probe')
 })
 it('refuses all malformed native commands with generic errors',async()=>{
  for(const args of [[],['qualify','extra'],['exec'],['qualify','--pipe','other']]) {
   try{await exec(DOTNET,[HELPER,...args],{shell:false,windowsHide:true,timeout:15000,maxBuffer:262144});throw Error('unexpected success')}
   catch(e:any){expect(e.code).toBe(1);expect(e.stdout).toBe('');expect(e.stderr.trim()).toBe('broker_host_qualification_failed')}
  }
 })
 it('proves native ACL/junction/pipe fixtures and bounded protocol failures',async()=>{
  const {stdout}=await exec(DOTNET,[SMOKE],{shell:false,windowsHide:true,timeout:20000,maxBuffer:262144,cwd:ROOT})
  const fixture=JSON.parse(stdout);expect(fixture.passed).toBe(52)
  for(const name of ['native_space_path_accepted','native_junction_refused','native_unsafe_acl_refused','fixture_removed','native_wrong_pipe_server_refused','native_wrong_peer_receives_zero_http','docker_deadline_exercised','docker_changed_image_refused','real_docker_verified_peer'])expect(fixture.names).toContain(name)
 },25000)
})
