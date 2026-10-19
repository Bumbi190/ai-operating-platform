import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {existsSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {describe,it,expect} from 'vitest'
import {reserveWindowsSourceAttempt} from '../../../code-broker/src/isolation/windows/source-attempts'
import {makeSourceManifest} from './fixtures/sdf-windows-source-fixtures'
const required=process.env.SDF_WINDOWS_MATERIALIZATION_REQUIRED==='1'
if(required&&process.platform!=='win32')throw Error('Materialization proof requires Windows')
const ROOT=resolve(__dirname,'../../../..'),WS=join(ROOT,'.superpowers/sdd/2026-10-19-windows-source-materialization')
const SMOKE=join(ROOT,'apps/code-broker/native/windows-workspace/smoke/bin/Release/net8.0-windows/WorkspaceSmoke.dll')
describe.runIf(required&&process.platform==='win32')('native owned materialization',()=>{
 it('reserves two independent attempts in existing fixed storage before any helper',()=>{
  const request={schema:'sdf.windows_workspace_request.v1',...makeSourceManifest().binding},ids=[randomUUID(),randomUUID()],files=ids.map(id=>join(ROOT,'apps/code-broker/.native/windows-workspace/attempts',id+'.reserved.json'))
  try{for(const id of ids)reserveWindowsSourceAttempt(request,id);for(let i=0;i<files.length;i++)expect(JSON.parse(readFileSync(files[i],'utf8'))).toEqual({...request,schema:'sdf.windows_materialization_reservation.v1',attemptId:ids[i]})}
  finally{for(const file of files)if(existsSync(file))unlinkSync(file)} // These test-only reservations are never dispatched.
 })
 for(const mode of ['materialization','materialization-spec','attempt-journal'] as const)it('proves '+mode+' refusal and recovery boundaries',async()=>{
  const {stdout,stderr}=await promisify(execFile)('C:\\Program Files\\dotnet\\dotnet.exe',[SMOKE,mode],{cwd:ROOT,shell:false,windowsHide:true,timeout:30000,maxBuffer:262144,env:{...process.env,SDF_WINDOWS_FIXTURE_ROOT:WS}});expect(stderr).toBe('');const r=JSON.parse(stdout);expect(r.passed).toBe(r.names.length);expect(r.passed).toBeGreaterThan(0)
 },35000)
})
import {runWindowsSourceFixture,cleanupWindowsSourceFixture} from '../../../code-broker/src/isolation/windows/source-fixture'
import {parseMaterializationReport} from '../../../code-broker/src/isolation/windows/source-contracts'

describe.runIf(required&&process.platform==='win32')('actual offline source fixture',()=>{
 const proofPath=join(WS,'real-source-fixture-proof.json'),cleanupPath=join(WS,'real-materialization-cleanup-proof.json')
 const request=()=>JSON.parse(readFileSync(join(ROOT,'docs/verification/2026-10-19-materialization-planning-evidence.json'),'utf8')).retainedWorkspace.request
 async function smoke(mode:string,input:unknown){
  const child=execFile('C:\\Program Files\\dotnet\\dotnet.exe',[SMOKE,mode],{cwd:ROOT,shell:false,windowsHide:true,timeout:180000,maxBuffer:262144,env:{...process.env,SDF_WINDOWS_FIXTURE_ROOT:WS}})
  child.stdin!.end(JSON.stringify(input))
  return await new Promise<any>((res,rej)=>{let out='',err='';child.stdout!.on('data',b=>out+=b);child.stderr!.on('data',b=>err+=b);child.on('error',rej);child.on('close',code=>code===0&&err===''?res(JSON.parse(out)):rej(Error('native '+mode+' '+code+' '+err+' '+out)))})
 }
 it('rejects malformed native stdin before any attempt or Docker mutation',async()=>{
  for(const value of ['{bad', ' '.repeat(4097), JSON.stringify({...request(),schema:'sdf.windows_materialization_request.v1',attemptId:randomUUID()}).replace('{','{\"fence\":2,'),{schema:'bad'},{...request(),schema:'sdf.windows_materialization_request.v1',attemptId:'../bad'},{...request(),schema:'sdf.windows_materialization_cleanup.v1',attemptId:randomUUID(),path:'C:/tmp'}]){
   const child=execFile('C:\\Program Files\\dotnet\\dotnet.exe',[join(ROOT,'apps/code-broker/.native/windows-workspace/OmniraBrokerWorkspace.dll'),'materialize-fixture'],{cwd:ROOT,shell:false,windowsHide:true,timeout:5000,maxBuffer:262144})
   child.stdin!.on('error',()=>{});child.stdin!.end(typeof value==='string'?value:JSON.stringify(value))
   const result=await new Promise<{code:number|null,out:string}>(res=>{let out='';child.stdout!.on('data',b=>out+=b);child.on('close',code=>res({code,out}))})
   expect(result.code).not.toBe(0);expect(result.out).toBe('')
  }
 })
 it('cleans a separate owned created container and volume without starting them',async()=>{
  const r=request()
  if(!existsSync(cleanupPath)){
   const intent=join(WS,'real-materialization-cleanup-intent.json'),prior=existsSync(intent)?JSON.parse(readFileSync(intent,'utf8')):null,attemptId=prior?.attemptId??randomUUID()
   if(prior&&(prior.phase!=='reserved-before-create'||existsSync(join(ROOT,'apps/code-broker/.native/windows-workspace/attempts',attemptId+'.started.json'))))throw Error('Cleanup proof already dispatched; reconcile, never replay')
   if(!prior)reserveWindowsSourceAttempt(r,attemptId);writeFileSync(intent,JSON.stringify({request:r,attemptId,phase:'first-create-dispatched'},null,2))
   const created=await smoke('create-materialization',{...r,schema:'sdf.windows_materialization_request.v1',attemptId})
   writeFileSync(join(WS,'real-materialization-created.json'),JSON.stringify(created,null,2))
   expect(created.state).toBe('created');expect(created.productionAuthority).toBe(false)
   const outcome=await cleanupWindowsSourceFixture(r,attemptId)
   writeFileSync(cleanupPath,JSON.stringify({request:r,attemptId,created,outcome},null,2))
  }
  const p=JSON.parse(readFileSync(cleanupPath,'utf8'));expect(p.outcome.status).toBe('observed');expect(p.outcome.report.status).toBe('cleaned');expect(p.outcome.report.fixture).toBeNull();expect(p.outcome.report.manifest).toBeNull()
  const again=await cleanupWindowsSourceFixture(r,p.attemptId);expect(again.status).toBe('observed');if(again.status==='observed'){expect(again.report.status).toBe('cleaned');expect(again.report.containerRemoved&&again.report.volumeRemoved).toBe(true)}
 },210000)
 it('executes the pinned Git snapshot once offline and rechecks retained proof and absence',async()=>{
  const r=request()
  if(!existsSync(proofPath)){
   const intent=join(WS,'real-source-fixture-intent.json')
   if(existsSync(intent))throw Error('Source fixture intent exists; reconcile before any further invocation')
   writeFileSync(intent,JSON.stringify({request:r,phase:'invoking-once',at:new Date().toISOString()},null,2))
   const outcome=await runWindowsSourceFixture(r)
   writeFileSync(proofPath,JSON.stringify({request:r,outcome,recordedAt:new Date().toISOString()},null,2))
  }
  const p=JSON.parse(readFileSync(proofPath,'utf8'));expect(p.outcome.status,JSON.stringify(p.outcome)).toBe('observed')
  if(p.outcome.status!=='observed')throw Error('No native report')
  const report=parseMaterializationReport(p.outcome.report);expect(report.status,JSON.stringify(report)).toBe('verified_for_fixture');expect(report.fixture!.totalTests).toBeGreaterThan(0);expect(report.fixture!.skippedTests).toBe(0);expect(report.containerRemoved&&report.volumeRemoved).toBe(true)
  const current=await smoke('check-real-source',{...r,schema:'sdf.windows_materialization_request.v1',attemptId:report.attemptId});expect(current.manifestSha256).toBe(report.manifestSha256)
  const cleanup=await cleanupWindowsSourceFixture(r,report.attemptId);expect(cleanup.status).toBe('observed');if(cleanup.status==='observed')expect(cleanup.report.status).toBe('cleaned')
 },250000)
})
