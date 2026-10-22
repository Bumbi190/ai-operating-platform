import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({execFile:vi.fn(),missing:false,linked:false,pin:'7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37'}))
vi.mock('node:child_process',()=>({execFile:mock.execFile}))
vi.mock('node:fs',async original=>({...await original<any>(),
  lstatSync:()=>{if(mock.missing)throw Error('private path');return{isFile:()=>true,isSymbolicLink:()=>mock.linked,size:100}},
  realpathSync:(p:string)=>p,readFileSync:()=>Buffer.from('runtime fixture'),
}))
vi.mock('node:crypto',()=>({createHash:()=>({update(){return this},digest:()=>mock.pin})}))
import { parseWindowsHostQualification,readWindowsHostQualification,HOST_REASONS } from '../../../code-broker/src/isolation/windows/host-qualification'
const root=resolve(__dirname,'../../../..')
const pin='7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37'
const good=()=>({
 schema:'sdf.windows_host_qualification.v1',profileId:'andre_desktop_windows_v1',status:'qualified_for_health_probe',
 observedAt:'2026-10-18T18:00:00.000Z',
 targetChecks:['git','docker','backend','dotnet','checkout','worktree_parent'].map(id=>({id,ok:true,identityHash:'a'.repeat(64),reasons:[]})),
 docker:{backendIdentityHash:'b'.repeat(64),daemonIdentityHash:'c'.repeat(64),osType:'linux',provider:'docker_desktop_wsl2',kernelFamily:'microsoft_wsl2'},reasons:[],
})
const platform=Object.getOwnPropertyDescriptor(process,'platform')!
let output:any
beforeEach(()=>{
 Object.defineProperty(process,'platform',{value:'win32'});output=good();mock.pin=pin;mock.missing=false;mock.linked=false;mock.execFile.mockReset()
 mock.execFile.mockImplementation((_f,_a,_o,cb)=>cb(null,JSON.stringify(output),''))
})
afterEach(()=>Object.defineProperty(process,'platform',platform))
describe('closed Windows host qualification',()=>{
 it('accepts the closed positive report',()=>expect(parseWindowsHostQualification(good())).toEqual(good()))
 it('preserves an observed blocked report',async()=>{
  output.status='blocked';output.docker=null;output.reasons=['hash_changed'];output.targetChecks[0]={id:'git',ok:false,identityHash:null,reasons:['hash_changed']}
  expect(await readWindowsHostQualification()).toEqual({status:'observed',report:output})
 })
 for(const [name,change] of [
  ['extra field',(v:any)=>v.secret='path'],['missing field',(v:any)=>delete v.observedAt],
  ['unknown profile',(v:any)=>v.profileId='other'],['unknown schema',(v:any)=>v.schema='other'],
  ['unknown status',(v:any)=>v.status='ready_for_code_work'],['unknown id',(v:any)=>v.targetChecks[0].id='other'],
  ['duplicate id',(v:any)=>v.targetChecks[1].id='git'],['missing target',(v:any)=>v.targetChecks.pop()],
  ['extra target field',(v:any)=>v.targetChecks[0].path='C:/private'],
  ['bad hash',(v:any)=>v.targetChecks[0].identityHash='a'],['null success identity',(v:any)=>v.targetChecks[0].identityHash=null],
  ['invalid timestamp',(v:any)=>v.observedAt='2026-02-30T18:00:00.000Z'],
  ['unknown reason',(v:any)=>v.reasons=['secret error']],['duplicate reason',(v:any)=>v.reasons=['hash_changed','hash_changed']],
  ['success with reason',(v:any)=>v.reasons=['hash_changed']],['success without Docker',(v:any)=>v.docker=null],
  ['success with failed target',(v:any)=>{v.targetChecks[0].ok=false;v.targetChecks[0].reasons=['hash_changed']}],
  ['failed check without reason',(v:any)=>{v.status='blocked';v.docker=null;v.reasons=['hash_changed'];v.targetChecks[0].ok=false}],
  ['unaggregated target reason',(v:any)=>{v.status='blocked';v.docker=null;v.reasons=['pipe_unavailable'];v.targetChecks[0].ok=false;v.targetChecks[0].reasons=['hash_changed']}],
  ['false blocked status',(v:any)=>{v.status='blocked';v.reasons=['peer_changed']}],
  ['blocked without reason',(v:any)=>{v.status='blocked';v.docker=null}],
  ['wrong provider',(v:any)=>v.docker.provider='remote'],['wrong kernel',(v:any)=>v.docker.kernelFamily='other'],
  ['nonlinux',(v:any)=>v.docker.osType='windows'],['extra Docker field',(v:any)=>v.docker.raw='secret'],
 ] as const)it('rejects '+name,()=>{const v=good();change(v);expect(()=>parseWindowsHostQualification(v)).toThrow('invalid host qualification')})
 it('uses only fixed runtime, helper, verb and process bounds',async()=>{
  expect((await readWindowsHostQualification()).status).toBe('observed')
  const [file,args,opts]=mock.execFile.mock.calls[0]
  expect(file).toBe('C:\\Program Files\\dotnet\\dotnet.exe')
  expect(args[0].replaceAll('\\','/')).toMatch(/apps\/code-broker\/.native\/windows-host\/OmniraBrokerHost.dll$/)
  expect(args.slice(1)).toEqual(['qualify']);expect(opts).toMatchObject({shell:false,windowsHide:true,timeout:15000,maxBuffer:262144})
 })
 it('refuses unsupported platform without a process',async()=>{
  Object.defineProperty(process,'platform',{value:'linux'})
  expect(await readWindowsHostQualification()).toEqual({status:'unavailable',reason:'unsupported_platform'});expect(mock.execFile).not.toHaveBeenCalled()
 })
 for(const cause of ['missing','linked','pin'] as const)it('refuses bootstrap '+cause,async()=>{
  if(cause==='missing')mock.missing=true;if(cause==='linked')mock.linked=true;if(cause==='pin')mock.pin='d'.repeat(64)
  expect(await readWindowsHostQualification()).toEqual({status:'unavailable',reason:'helper_unavailable'});expect(mock.execFile).not.toHaveBeenCalled()
 })
 for(const [name,error,reason]of [
  ['timeout',{killed:true,signal:'SIGTERM'},'deadline_exceeded'],
  ['overflow',{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'},'response_too_large'],
  ['process failure',{code:1,message:'secret path'},'helper_failed'],
 ] as const)it('exercises '+name+' rejection',async()=>{
  mock.execFile.mockImplementation((_f,_a,_o,cb)=>cb(error,'','secret path'))
  expect(await readWindowsHostQualification()).toEqual({status:'unavailable',reason})
 })
 it('refuses oversized stdout even if a helper callback succeeds',async()=>{
  mock.execFile.mockImplementation((_f,_a,_o,cb)=>cb(null,' '.repeat(262145),''))
  expect(await readWindowsHostQualification()).toEqual({status:'unavailable',reason:'response_too_large'})
 })
 it('refuses malformed JSON without fabricated observations',async()=>{
  mock.execFile.mockImplementation((_f,_a,_o,cb)=>cb(null,'not json',''))
  expect(await readWindowsHostQualification()).toEqual({status:'unavailable',reason:'invalid_report'})
 })
 it('keeps native vocabulary/profile and command surface aligned',async()=>{
  const fs=await vi.importActual<typeof import('node:fs')>('node:fs')
  const profile=fs.readFileSync(resolve(root,'apps/code-broker/native/windows-host/HostProfile.cs'),'utf8')
  const reasonSection=profile.slice(profile.indexOf('IReadOnlyList<string> Reasons'))
  expect([...reasonSection.matchAll(/"([a-z_]+)"/g)].map(m=>m[1]).sort()).toEqual([...HOST_REASONS].sort())
  expect(profile).toContain('andre_desktop_windows_v1')
  const cli=fs.readFileSync(resolve(root,'apps/code-broker/src/cli.ts'),'utf8')
  expect(cli).not.toContain('qualify')
  const program=fs.readFileSync(resolve(root,'apps/code-broker/native/windows-host/Program.cs'),'utf8')
  expect(program).toContain('args.Length!=1||args[0]!="qualify"')
  for(const name of ['NativeFileEvidence.cs','NativePipeEvidence.cs','DockerObservation.cs','HostQualification.cs','Program.cs']){
   const source=fs.readFileSync(resolve(root,'apps/code-broker/native/windows-host',name),'utf8')
   expect(source).not.toMatch(/Process\.Start|File\.Write|Directory\.Create|SetAccessControl|CreateProcess|POST|DELETE|\.Pull|GetEnvironmentVariable/)
  }
 })
})
