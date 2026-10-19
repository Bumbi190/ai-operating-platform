import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createWorkspaceInvoker} from '../../../code-broker/src/isolation/windows/workspace-helper'
import {makeWorkspaceRequest,makePreparedWorkspaceReport,makeSuccessfulProbeReport,ATTEMPT} from './fixtures/sdf-windows-workspace-fixtures'
const transport=vi.hoisted(()=>({invoke:vi.fn()}))
vi.mock('../../../code-broker/src/isolation/windows/workspace-helper',async original=>({...await original<any>(),invokeWorkspaceHelper:transport.invoke}))
vi.mock('node:crypto',async original=>({...await original<any>(),randomUUID:()=> '33333333-3333-4333-8333-333333333333'}))
import {prepareWindowsWorktree,runWindowsSandboxHealthProbe,cleanupWindowsSandboxHealthProbe} from '../../../code-broker/src/isolation/windows/workspace'
beforeEach(()=>{transport.invoke.mockReset()})
afterEach(()=>vi.restoreAllMocks())
describe('public closed workspace facade',()=>{
 it('refuses malformed request before any process',async()=>{expect((await prepareWindowsWorktree({...makeWorkspaceRequest(),path:'private'})).status).toBe('unavailable');expect(transport.invoke).not.toHaveBeenCalled()})
 it('binds a prepared reply to the exact request',async()=>{
  transport.invoke.mockResolvedValue({status:'decoded',value:makePreparedWorkspaceReport()})
  expect((await prepareWindowsWorktree(makeWorkspaceRequest())).status).toBe('observed')
  const wrong=makePreparedWorkspaceReport();wrong.binding.claimId='44444444-4444-4444-8444-444444444444';transport.invoke.mockResolvedValue({status:'decoded',value:wrong})
  expect(await prepareWindowsWorktree(makeWorkspaceRequest())).toEqual({status:'unavailable',reason:'invalid_report'})
 })
 it('retains an uncertain attempt without automatically retrying',async()=>{
  transport.invoke.mockResolvedValue({status:'unavailable',reason:'deadline_exceeded'})
  expect(await runWindowsSandboxHealthProbe()).toEqual({status:'unavailable',reason:'deadline_exceeded',attemptId:ATTEMPT})
  expect(transport.invoke).toHaveBeenCalledTimes(1)
  transport.invoke.mockResolvedValue({status:'decoded',value:{...makeSuccessfulProbeReport(),status:'cleaned',uid:null,gid:null,inspected:[]}})
  expect((await cleanupWindowsSandboxHealthProbe(ATTEMPT)).status).toBe('observed')
  expect(transport.invoke.mock.calls[1]).toEqual(['cleanup-probe',{schema:'sdf.windows_probe_request.v1',attemptId:ATTEMPT}])
 })
 it('rejects successful reply from another attempt',async()=>{
  transport.invoke.mockResolvedValue({status:'decoded',value:{...makeSuccessfulProbeReport(),attemptId:'44444444-4444-4444-8444-444444444444'}})
  expect((await runWindowsSandboxHealthProbe()).status).toBe('unavailable')
 })
 it('cannot substitute cleanup for a run or a run for cleanup',async()=>{
  transport.invoke.mockResolvedValue({status:'decoded',value:{...makeSuccessfulProbeReport(),status:'cleaned',uid:null,gid:null,inspected:[]}})
  expect((await runWindowsSandboxHealthProbe()).status).toBe('unavailable')
  transport.invoke.mockResolvedValue({status:'decoded',value:makeSuccessfulProbeReport()})
  expect((await cleanupWindowsSandboxHealthProbe(ATTEMPT)).status).toBe('unavailable')
 })
 it('does not pass an invalid identifier to cleanup',async()=>{expect(await cleanupWindowsSandboxHealthProbe('../other')).toEqual({status:'unavailable',reason:'input_invalid',attemptId:null});expect(transport.invoke).not.toHaveBeenCalled()})
 it('preserves a native blocked outcome without reporting success',async()=>{
  const value={...makeSuccessfulProbeReport(),status:'blocked',reason:'host_unqualified',backendIdentityHash:null,daemonIdentityHash:null,imageId:null,containerId:null,uid:null,gid:null,inspected:[],containerRemoved:false}
  transport.invoke.mockResolvedValue({status:'decoded',value});expect(await runWindowsSandboxHealthProbe()).toEqual({status:'observed',report:value});expect(transport.invoke).toHaveBeenCalledTimes(1)
 })
})
describe('internal bounded native transport',()=>{
 function setup(options:{platform?:NodeJS.Platform;bootstrapError?:boolean;error?:any;stdout?:string;stderr?:string}={}){
  const seen:any[]=[]
  const launch=((file:any,args:any,opts:any,callback:any)=>{
   const input={on(){return input},end(body:string){seen.push({file,args,opts,body});queueMicrotask(()=>callback(options.error??null,options.stdout??JSON.stringify(makePreparedWorkspaceReport()),options.stderr??''))}}
   return{stdin:input}
  }) as any
  return{seen,invoke:createWorkspaceInvoker({platform:options.platform??'win32',checkBootstrap:()=>{if(options.bootstrapError)throw Error('private path')},launch})}
 }
 it('uses fixed helper/runtime, stdin and a fresh secret-free environment',async()=>{
  process.env.OMNIRA_FIXTURE_SECRET='private';try{
   const f=setup();expect((await f.invoke('prepare',makeWorkspaceRequest())).status).toBe('decoded')
   const row=f.seen[0];expect(row.file).toBe('C:\\Program Files\\dotnet\\dotnet.exe');expect(row.args[0].replaceAll('\\','/')).toMatch(/\/.native\/windows-workspace\/OmniraBrokerWorkspace.dll$/);expect(row.args.slice(1)).toEqual(['prepare'])
   expect(JSON.parse(row.body)).toEqual(makeWorkspaceRequest());expect(row.opts).toMatchObject({shell:false,windowsHide:true,timeout:125000,maxBuffer:262144})
   expect(row.opts.env.OMNIRA_FIXTURE_SECRET).toBeUndefined();expect(row.opts.env.NODE_OPTIONS).toBeUndefined();expect(row.opts.env.DOCKER_HOST).toBeUndefined();expect(row.opts.env.HOME).toBeUndefined()
  }finally{delete process.env.OMNIRA_FIXTURE_SECRET}
 })
 it('uses separate probe and cleanup deadlines',async()=>{
  const f=setup();await f.invoke('probe',{schema:'sdf.windows_probe_request.v1',attemptId:ATTEMPT});await f.invoke('cleanup-probe',{schema:'sdf.windows_probe_request.v1',attemptId:ATTEMPT});expect(f.seen.map(v=>v.opts.timeout)).toEqual([35000,20000])
 })
 it('does not launch on unsupported platform or invalid bootstrap',async()=>{
  for(const options of [{platform:'linux' as const},{bootstrapError:true}]){const f=setup(options);expect((await f.invoke('prepare',makeWorkspaceRequest())).status).toBe('unavailable');expect(f.seen).toEqual([])}
 })
 for(const[error,reason]of [[{killed:true},'deadline_exceeded'],[{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'},'response_too_large'],[{code:1,message:'private path'},'helper_failed']]as const)it('sanitizes process '+reason,async()=>{
  const f=setup({error});expect(await f.invoke('prepare',makeWorkspaceRequest())).toEqual({status:'unavailable',reason})
 })
 for(const options of [{stdout:'not json'},{stdout:'{"a":1,"a":2}'},{stdout:' '.repeat(262145)},{stderr:'private path'}])it('refuses malformed, ambiguous, oversized or noisy native output',async()=>{
  expect((await setup(options).invoke('prepare',makeWorkspaceRequest())).status).toBe('unavailable')
 })
})
