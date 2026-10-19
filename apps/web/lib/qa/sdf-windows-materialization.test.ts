import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect} from 'vitest'
// Operator-only ESM validators are tested directly without launching setup.
import {validateLock,verifyDescriptor,validateRecipe,validateContextPaths} from '../../../code-broker/scripts/provision-windows-toolchain.mjs'
// Image-owned ESM runner is imported without invoking its fixed entrypoint.
import {validateVitestReport,failureDiagnostic} from '../../../code-broker/toolchain/windows-fixture/fixture-runner.mjs'
// Image-owned inventory validator has no host runtime consumer.
import {validateInventoryRecords} from '../../../code-broker/toolchain/windows-fixture/dependency-inventory.mjs'
// Operator-only reconciliation guard has no runtime caller.
import {authorizeUnstartedBuildResume} from '../../../code-broker/scripts/resume-windows-toolchain-build.mjs'
function lock(){return {lockfileVersion:3,packages:{'':{name:'fixture'},'node_modules/pkg':{version:'1.0.0',resolved:'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz',integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')},'node_modules/web':{resolved:'apps/web',link:true},'node_modules/contract':{resolved:'packages/local-text-contract',link:true}}}}
function report(){return {success:true,numTotalTestSuites:1,numPassedTestSuites:1,numFailedTestSuites:0,numPendingTestSuites:0,numTotalTests:1,numPassedTests:1,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:[{status:'passed',assertionResults:[{status:'passed'}]}]}}
describe('fixed Linux dependency recipe and runner',()=>{
 it('permits only reconciled argument rejection, never a lost or dispatched build',()=>{
 const commands=Array.from({length:11},()=>({kind:'docker',code:0}));commands[10].code=125
 const state={status:'blocked',reason:'fixed setup command failed docker exit 125',commands}
 const log='DEPRECATED: The legacy builder is deprecated\nunknown flag: --progress'
 expect(authorizeUnstartedBuildResume(state,log,false)).toEqual({pull:false,build:true})
 for(const changed of [{...state,status:'ready'},{...state,reason:'deadline'},{...state,commands:commands.slice(1)},{...state,commands:[...commands.slice(0,10),{kind:'docker',code:1}]}])expect(()=>authorizeUnstartedBuildResume(changed,log,false)).toThrow()
 expect(()=>authorizeUnstartedBuildResume(state,log,true)).toThrow();expect(()=>authorizeUnstartedBuildResume(state,'connection lost',false)).toThrow()
})
 it('accepts public integrity-pinned packages and the two known workspace links',()=>expect(()=>validateLock(lock())).not.toThrow())
 for(const url of ['git+https://github.com/x/y','https://evil.invalid/a','http://registry.npmjs.org/a','file:../x','https://token@registry.npmjs.org/pkg','https://registry.npmjs.org/a?token=x'])it('refuses dependency location '+url,()=>{const l=lock();l.packages['node_modules/pkg'].resolved=url;expect(()=>validateLock(l)).toThrow()})
 it('refuses missing integrity',()=>{const l=lock();l.packages['node_modules/pkg'].integrity='';expect(()=>validateLock(l)).toThrow()})
 it('refuses an unknown workspace link',()=>{const l=lock();l.packages['node_modules/web'].resolved='../../outside';expect(()=>validateLock(l)).toThrow()})
 it('checks descriptor bytes before they can enter a build context',()=>{expect(()=>verifyDescriptor('package.json',Buffer.from('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).not.toThrow();expect(()=>verifyDescriptor('package.json',Buffer.from('abd'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toThrow();expect(()=>verifyDescriptor('.npmrc',Buffer.from('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toThrow()})
 it('requires the generated exact context and refuses dotfiles or extra source',()=>{const p=['package.json','package-lock.json','apps/web/package.json','packages/local-text-contract/package.json','Dockerfile','fixture-runner.mjs','vitest-fixture.config.mjs','dependency-inventory.mjs'];expect(()=>validateContextPaths(p)).not.toThrow();for(const extra of ['.npmrc','.env','node_modules/x','src/index.ts'])expect(()=>validateContextPaths([...p,extra])).toThrow();expect(()=>validateContextPaths(p.slice(1))).toThrow()})
 it('requires the fixed recipe and disabled lifecycle scripts',()=>{const text=readFileSync(resolve(__dirname,'../../../code-broker/toolchain/windows-fixture/Dockerfile'),'utf8');expect(()=>validateRecipe(text)).not.toThrow();expect(()=>validateRecipe(text.replaceAll('--ignore-scripts',''))).toThrow();expect(()=>validateRecipe(text.replace('COPY package.json package-lock.json','COPY . .'))).toThrow();expect(()=>validateRecipe(text.replace(/sha256:[a-f0-9]{64}/,'latest'))).toThrow()})
 it('accepts describe groups within the one selected file',()=>{const r=report();r.numTotalTestSuites=3;r.numPassedTestSuites=3;expect(validateVitestReport(JSON.stringify(r)).totalTests).toBe(1)})
 it('accepts a complete actual one-suite success',()=>expect(validateVitestReport(JSON.stringify(report()))).toEqual({totalTests:1,passedTests:1,failedTests:0,skippedTests:0}))
 for(const mutate of [(r:any)=>r.numTotalTests=0,(r:any)=>r.numPassedTests=0,(r:any)=>r.numPendingTests=1,(r:any)=>r.numTodoTests=1,(r:any)=>r.success=false,(r:any)=>r.testResults[0].assertionResults[0].status='skipped',(r:any)=>r.numFailedTestSuites=1])it('rejects incomplete/skipped/inconsistent result '+mutate.toString(),()=>{const r=report();mutate(r);expect(()=>validateVitestReport(JSON.stringify(r))).toThrow()})
 it('refuses writable dependencies, wrong owners and inventory drift',()=>{
 const base={path:'node_modules/a.js',type:'file',mode:292,uid:0,gid:0,size:1,sha256:'a'.repeat(64)}
 const pin=validateInventoryRecords([base]);expect(pin).toMatch(/^[a-f0-9]{64}$/)
 for(const bad of [{...base,mode:438},{...base,uid:10001},{...base,type:'device'},{...base,path:'../a'},{...base,sha256:'bad'}])expect(()=>validateInventoryRecords([bad])).toThrow()
 expect(validateInventoryRecords([{...base,sha256:'b'.repeat(64)}])).not.toBe(pin)
})
 it('rejects duplicate JSON fields and oversized reports',()=>{expect(()=>validateVitestReport('{"success":true,"success":false}')).toThrow();expect(()=>validateVitestReport(' '.repeat(262145))).toThrow()})
})

import {parseMaterializationReport} from '../../../code-broker/src/isolation/windows/source-contracts'
import {createSourceFixtureRunner} from '../../../code-broker/src/isolation/windows/source-fixture'
import {makeMaterializationReport,makeMaterializationCleanup,makeSourceManifest} from './fixtures/sdf-windows-source-fixtures'
const request=()=>({schema:'sdf.windows_workspace_request.v1',...makeSourceManifest().binding})
const ATTEMPT='33333333-3333-4333-8333-333333333333'
describe('strict materialization evidence',()=>{
 it('accepts verified and cleanup reports with different meanings',()=>{expect(parseMaterializationReport(makeMaterializationReport()).status).toBe('verified_for_fixture');expect(parseMaterializationReport(makeMaterializationCleanup()).fixture).toBeNull()})
 for(const mutate of [
 (r:any)=>r.volumeRemoved=false,(r:any)=>r.containerRemoved=false,(r:any)=>r.productionAuthority=true,(r:any)=>r.extra=true,(r:any)=>r.binding.schema='x',
 (r:any)=>r.manifestSha256='a'.repeat(64),(r:any)=>r.manifest.binding.fence++,(r:any)=>r.fixture.totalTests=0,(r:any)=>r.fixture.skippedTests=1,(r:any)=>r.fixture.passedTests=0,
 (r:any)=>r.fixture.exitCode=1,(r:any)=>r.fixture.beforeAfterSourceEqual=false,(r:any)=>r.fixture.nodeVersion='22.0.0',(r:any)=>r.fixture.sourceManifestSha256='a'.repeat(64),
 (r:any)=>r.fixture.redactedStdout='x'.repeat(65537),(r:any)=>r.fixture.extra=1,(r:any)=>r.daemonIdentityHash=null,(r:any)=>r.imageId='node:latest',(r:any)=>r.observedAt='2026-02-30T08:00:00.000Z'
 ])it('rejects malformed/inconsistent evidence '+mutate.toString(),()=>{const r=makeMaterializationReport();mutate(r);expect(()=>parseMaterializationReport(r)).toThrow()})
 it('cannot promote cleanup to execution proof',()=>{const r=makeMaterializationCleanup();r.status='verified_for_fixture';expect(()=>parseMaterializationReport(r)).toThrow()})
})
describe('source-owned fixture facade',()=>{
 function setup(options:{platform?:NodeJS.Platform;reserveFailure?:boolean;response?:any}={}){
  const events:any[]=[]
  const runner=createSourceFixtureRunner({platform:options.platform??'win32',nextAttempt:()=>ATTEMPT,reserve:(r:any,a:string)=>{events.push(['reserve',r,a]);if(options.reserveFailure)throw Error('private')},invoke:async(mode:string,payload:unknown)=>{events.push(['invoke',mode,payload]);return options.response??{status:'decoded',value:makeMaterializationReport()}}})
  return {runner,events}
 }
 it('durably reserves the attempt before invoking a fixed mode',async()=>{const f=setup();expect((await f.runner.run(request())).status).toBe('observed');expect(f.events.map(e=>e[0])).toEqual(['reserve','invoke']);expect(f.events[1][1]).toBe('materialize-fixture');expect(f.events[1][2]).toEqual({...request(),schema:'sdf.windows_materialization_request.v1',attemptId:ATTEMPT})})
 it('makes no launch on unsupported platform or invalid binding',async()=>{const f=setup({platform:'linux'});expect(await f.runner.run(request())).toEqual({status:'unavailable',reason:'unsupported_platform',attemptId:null});expect(f.events).toEqual([]);const g=setup();expect((await g.runner.run({...request(),root:'private'})).status).toBe('unavailable');expect(g.events).toEqual([])})
 it('does not launch after failed reservation',async()=>{const f=setup({reserveFailure:true});expect(await f.runner.run(request())).toEqual({status:'unavailable',reason:'helper_failed',attemptId:ATTEMPT});expect(f.events).toHaveLength(1)})
 it('keeps a lost reply attempt without automatic replay',async()=>{const f=setup({response:{status:'unavailable',reason:'deadline_exceeded'}});expect(await f.runner.run(request())).toEqual({status:'unavailable',reason:'deadline_exceeded',attemptId:ATTEMPT});expect(f.events.filter(e=>e[0]==='invoke')).toHaveLength(1)})
 it('rejects another binding or attempt',async()=>{for(const mutate of [(r:any)=>r.attemptId='44444444-4444-4444-8444-444444444444',(r:any)=>r.binding.fence++]){const r=makeMaterializationReport();mutate(r);const f=setup({response:{status:'decoded',value:r}});expect((await f.runner.run(request())).status).toBe('unavailable')}})
 it('never substitutes cleanup and execution outcomes',async()=>{const f=setup({response:{status:'decoded',value:makeMaterializationCleanup()}});expect((await f.runner.run(request())).status).toBe('unavailable');const g=setup();expect((await g.runner.cleanup(request(),ATTEMPT)).status).toBe('unavailable')})
 it('cleanup reuses the identifier without reserving or creating a new attempt',async()=>{const f=setup({response:{status:'decoded',value:makeMaterializationCleanup()}});expect((await f.runner.cleanup(request(),ATTEMPT)).status).toBe('observed');expect(f.events).toEqual([['invoke','cleanup-materialization',{...request(),schema:'sdf.windows_materialization_cleanup.v1',attemptId:ATTEMPT}]])})
})

describe('bounded fixed-runner failure evidence',()=>{
 it('identifies the failed fixed phase without publishing an exception or source',()=>{
  const raw='password="'+('p'.repeat(24))+'" sk-proj-'+('x'.repeat(24))+' AKIAABCDEFGHIJKLMNOP'
  const r=failureDiagnostic('fixture-result',Buffer.from(raw),Buffer.from('child failed'))
  expect(r.schema).toBe('sdf.node_fixture_failure.v1');expect(r.stage).toBe('fixture-result');expect(r.code).toBe('fixed_fixture_failed');expect(r.stdoutSha256).toMatch(/^[a-f0-9]{64}$/);expect(r.redactedStdout).not.toContain('p'.repeat(24));expect(r.redactedStdout).not.toContain('x'.repeat(24));expect(r.redactedStdout).not.toContain('AKIAABCDEFGHIJKLMNOP');expect(r.redactedStderr).toBe('child failed')
 })
 it('bounds diagnostics and rejects invented phase identifiers',()=>{
  const r=failureDiagnostic('dependency-before',Buffer.alloc(131072,120),Buffer.alloc(131072,121))
  expect(Buffer.byteLength(r.redactedStdout)+Buffer.byteLength(r.redactedStderr)).toBeLessThanOrEqual(65536)
  expect(()=>failureDiagnostic('caller-command',Buffer.alloc(0),Buffer.alloc(0))).toThrow()
 })
})

import {recoveryRecipe,authorizeRecoveryBuild} from '../../../code-broker/scripts/recover-windows-fixture.mjs'
describe('bounded offline recovery setup',()=>{
 it('uses only the frozen local parent and reviewed fixture files with no install or RUN',()=>{
  const r=recoveryRecipe();expect(r).toContain('FROM localhost/omnira-sdf-frozen:3c16f0769a58c732a92dc1e7badcf327c86a24eec4bcd559801ba6b9783a3c54');expect(r).not.toMatch(/RUN|https:|npm|ADD|COPY \. \./);expect(r).toContain('COPY --chmod=0444 fixture-runner.mjs vitest-fixture.config.mjs /opt/omnira/')
 })
 it('cannot replay a build or authorize a correction without a diagnostic failure',()=>{
  expect(authorizeRecoveryBuild('diagnostic',false,null)).toBe(1);expect(()=>authorizeRecoveryBuild('diagnostic',true,null)).toThrow();expect(()=>authorizeRecoveryBuild('other',false,null)).toThrow()
  expect(()=>authorizeRecoveryBuild('corrective',false,null)).toThrow()
  expect(()=>authorizeRecoveryBuild('corrective',false,{status:'failed',reason:'fixture_failed',containerRemoved:true,volumeRemoved:true,diagnosticStage:'fixture-result',rootCause:'fixed evidence'})).toThrow()
  expect(()=>authorizeRecoveryBuild('corrective',true,{status:'failed'})).toThrow();expect(()=>authorizeRecoveryBuild('corrective',false,{status:'failed',reason:'cleanup_retained'})).toThrow()
 })
})

describe('frozen root metadata correction',()=>{
 it('repairs only the observed top-level mode and restores the nonroot image user',()=>{
  const recipe=recoveryRecipe('corrective')
  expect(recipe).toContain('USER 0:0\nRUN [\"/bin/chmod\",\"0555\",\"/opt/omnira/deps\"]\nUSER 10001:10001')
  expect(recipe.split('\n').filter((l:string)=>l.startsWith('RUN '))).toEqual(['RUN ["/bin/chmod","0555","/opt/omnira/deps"]'])
  expect(recipe).toContain('dependency-inventory.mjs')
 })
})
describe('evidence-bound corrective build',()=>{
 it('refuses to repair a different root or any changed dependency bytes',()=>{
  const row={status:'failed',reason:'fixture_failed',containerRemoved:true,volumeRemoved:true,diagnosticStage:'dependency-before',rootCause:'final-copy-root-mode',archiveVerification:{expectedEntries:86893,actualEntries:86893,receiptSha256:'0aeb2cd8a20c5b57c5e2a57283860e0b7d21e07831c90c3ec4b6b923a95d1ed3',deltas:[{path:'.',expected:{type:'directory',mode:365,uid:0,gid:0},actual:{type:'directory',mode:493,uid:0,gid:0}}],extra:[]}}
  expect(authorizeRecoveryBuild('corrective',false,row)).toBe(2)
  expect(()=>authorizeRecoveryBuild('corrective',false,{...row,archiveVerification:{...row.archiveVerification,deltas:[{...row.archiveVerification.deltas[0],path:'node_modules/file.js'}]}})).toThrow()
 })
})