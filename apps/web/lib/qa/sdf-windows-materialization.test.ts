import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect} from 'vitest'
// Operator-only ESM validators are tested directly without launching setup.
import {validateLock,verifyDescriptor,validateRecipe,validateContextPaths} from '../../../code-broker/scripts/provision-windows-toolchain.mjs'
// Image-owned ESM runner is imported without invoking its fixed entrypoint.
import {validateVitestReport} from '../../../code-broker/toolchain/windows-fixture/fixture-runner.mjs'
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
