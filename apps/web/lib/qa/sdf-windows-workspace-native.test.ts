import {execFile,execFileSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {promisify} from 'node:util'
import {beforeAll,describe,it,expect} from 'vitest'
import {prepareWindowsWorktree} from '../../../code-broker/src/isolation/windows/workspace'
import {parseWindowsWorkspaceReport,parseWindowsWorkspaceRequest} from '../../../code-broker/src/isolation/windows/workspace-contracts'
const required=process.env.SDF_WINDOWS_WORKSPACE_REQUIRED==='1'
if(required&&process.platform!=='win32')throw Error('Windows workspace proof requires Windows')
const ROOT=resolve(__dirname,'../../../..'),WS=join(ROOT,'.superpowers/sdd/2026-10-18-windows-workspace-sandbox')
const DOTNET='C:\\Program Files\\dotnet\\dotnet.exe',GIT='C:\\Program Files\\Git\\cmd\\git.exe'
const SMOKE=join(ROOT,'apps/code-broker/native/windows-workspace/smoke/bin/Release/net8.0-windows/WorkspaceSmoke.dll')
const HELPER=join(ROOT,'apps/code-broker/.native/windows-workspace/OmniraBrokerWorkspace.dll')
const MAIN='C:/Users/Andre/Projects/Omnira/Code/ai-operating-platform',PARENT='C:/Users/Andre/Projects/Omnira/.worktrees'
const exec=promisify(execFile),recordFile=join(WS,'real-workspace-proof.json')
const home=join(WS,'qa-read-home')
function git(cwd:string,...args:string[]){
 return execFileSync(GIT,['--no-pager','--no-optional-locks','-c','core.fsmonitor=false','-c','core.hooksPath=NUL','-c','credential.helper=','-c','protocol.allow=never',...args],{
  cwd,encoding:'utf8',timeout:30000,env:{NODE_ENV:'production',SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Program Files\\Git\\cmd;C:\\Windows\\System32',HOME:home,USERPROFILE:home,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'NUL',GIT_TERMINAL_PROMPT:'0',GIT_NO_LAZY_FETCH:'1'},
 })
}
describe.runIf(required&&process.platform==='win32')('real protected Windows workspace',()=>{
 let proof:any
 beforeAll(()=>{mkdirSync(WS,{recursive:true});mkdirSync(home,{recursive:true})})
 it('keeps exactly one real locked proof worktree and rechecks its pinned identity',async()=>{
  mkdirSync(WS,{recursive:true});mkdirSync(home,{recursive:true})
  if(!existsSync(HELPER)||!existsSync(SMOKE))throw Error('Build workspace helper/smoke prerequisites first')
  if(existsSync(recordFile)){proof=JSON.parse(readFileSync(recordFile,'utf8'));parseWindowsWorkspaceRequest(proof.request);parseWindowsWorkspaceReport(proof.report);return}
  const requestFile=join(WS,'real-workspace-request.json')
  if(existsSync(requestFile))throw Error('Uncertain real workspace request retained; reconcile before any second creation')
  const before={head:git(MAIN,'rev-parse','HEAD').trim(),status:git(MAIN,'status','--porcelain=v1','-z')}
  const request={schema:'sdf.windows_workspace_request.v1',workId:randomUUID(),repositoryId:'github.com/bumbi190/ai-operating-platform',pinnedBaseSha:git(MAIN,'rev-parse','refs/remotes/origin/main').trim(),admissionHash:createHash('sha256').update('owned-windows-infrastructure-proof').digest('hex'),claimId:randomUUID(),fence:1}
  writeFileSync(requestFile,JSON.stringify(request,null,2))
  const outcome=await prepareWindowsWorktree(request)
  if(outcome.status!=='observed'||outcome.report.status!=='prepared')throw Error('Real fixed-profile prepare did not verify: '+JSON.stringify(outcome))
  proof={request,report:outcome.report,before,after:{head:git(MAIN,'rev-parse','HEAD').trim(),status:git(MAIN,'status','--porcelain=v1','-z')},createdAt:new Date().toISOString(),syntheticBinding:true,productionAuthority:false}
  writeFileSync(recordFile,JSON.stringify(proof,null,2))

  const path=join(PARENT,proof.request.workId)
  expect(git(path,'rev-parse','HEAD').trim()).toBe(proof.request.pinnedBaseSha)
  expect(git(path,'symbolic-ref','--quiet','HEAD').trim()).toBe('refs/heads/sdf1/'+proof.request.workId)
  expect(git(path,'status','--porcelain=v1','-z')).toBe('')
  const list=git(MAIN,'worktree','list','--porcelain','-z')
  const block=list.split('\0\0').find(b=>b.includes('branch refs/heads/sdf1/'+proof.request.workId))!
  expect(block).toContain('locked omnira-sdf explicit-cleanup-only')
  expect(proof.before).toEqual(proof.after);expect(proof.report.productionAuthority).toBe(false)
 },150000)
 for(const[mode,names]of [
  ['path-process',['retained_directory_blocks_rename','held_config_blocks_write','held_directory_blocks_reparse_write','timeout_kills_descendant','overflow_kills_descendant','cancellation_closes_handles','released_fixture_removed']],
  ['worktree',['real_synthetic_worktree_prepared','same_workid_one_winner','post_add_failure_retained','base_drift_after_preflight_never_prepared','global_hook_credential_sentinels_untouched']],
 ]as const)it('runs required native '+mode+' regressions',async()=>{
  const{stdout}=await exec(DOTNET,[SMOKE,mode],{cwd:ROOT,shell:false,windowsHide:true,timeout:60000,maxBuffer:262144})
  const result=JSON.parse(stdout);expect(result.passed).toBe(result.names.length);for(const name of names)expect(result.names).toContain(name)
 },65000)
 it('closing an owned helper process kills its actual native Job Object descendants',async()=>{
  const file=join(WS,'pid-proof-'+randomUUID()+'.json')
  const child=execFile(DOTNET,[SMOKE,'child','job-parent',file],{cwd:ROOT,shell:false,windowsHide:true,timeout:20000,maxBuffer:262144},()=>{})
  try{
   const deadline=Date.now()+10000
   while(!existsSync(file)){if(Date.now()>deadline)throw Error('owned child PID evidence not produced');await new Promise(r=>setTimeout(r,30))}
   const closed=new Promise<void>(r=>child.once('close',()=>r()));child.kill();await closed
   const{stdout}=await exec(DOTNET,[SMOKE,'verify-pids',file],{cwd:ROOT,shell:false,windowsHide:true,timeout:5000,maxBuffer:262144})
   expect(JSON.parse(stdout).alive).toEqual([])
  }finally{if(!child.killed)child.kill();if(existsSync(file))unlinkSync(file)}
 },20000)
})
