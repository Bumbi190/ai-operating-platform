import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import * as ts from 'typescript'
import {describe,it,expect} from 'vitest'
const ROOT=resolve(__dirname,'../../../..'),GIT='C:/Program Files/Git/cmd/git.exe',PLAN_BASE='cf441838c8772b281710ec191b394079c8fced3e'
const text=(path:string)=>readFileSync(join(ROOT,path),'utf8')
const sourceFiles=()=>[...new Set(execFileSync(GIT,['ls-files','-co','--exclude-standard','--','apps/code-broker/src','apps/web'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).split(/\r?\n/).filter(p=>/\.tsx?$/.test(p)))]
function specifiers(path:string){
 const found:string[]=[]
 const visit=(n:ts.Node)=>{
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))found.push(n.moduleSpecifier.text)
  if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))found.push(n.arguments[0].text)
  ts.forEachChild(n,visit)
 }
 visit(ts.createSourceFile(path,text(path),ts.ScriptTarget.Latest,true));return found
}
const BRIDGE='apps/code-broker/src/runtime/native-stop-bridge.ts',CONTROLLED='apps/code-broker/src/isolation/windows/controlled-helper.ts'
describe('cooperative native stop stays an internal, non-publishing boundary',()=>{
 it('has no operational consumer of the bridge or the controlled launcher',()=>{
  const bridgeUsers:string[]=[],launcherUsers:string[]=[]
  for(const path of sourceFiles())for(const spec of specifiers(path)){
   if(/(?:^|\/)native-stop-bridge(?:\.js)?$/.test(spec)){bridgeUsers.push(path);expect(path.startsWith('apps/web/lib/qa/'),path).toBe(true)}
   if(/(?:^|\/)controlled-helper(?:\.js)?$/.test(spec)){launcherUsers.push(path);expect(path===BRIDGE||path.startsWith('apps/web/lib/qa/'),path).toBe(true)}
  }
  expect(launcherUsers).toContain(BRIDGE)
 })
 it('imports no model, patch, review, publication, network or CLI module and reads no environment',()=>{
  for(const path of [BRIDGE,CONTROLLED]){
   for(const spec of specifiers(path))expect(spec,path).not.toMatch(/anthropic|openai|patch-protocol|review|model-access|publication|operational-client|http-client|execution-lease-client|cli/)
   expect(text(path),path).not.toMatch(/process\.env|fetch\(|createAdminClient|\.rpc\(|\/api\/|execFile\(|exec\(|shell:\s*true/)
  }
 })
 it('exposes no publication, readiness or authority field in the bridge result type',()=>{
  const source=text(BRIDGE),start=source.indexOf('export type GuardedMaterialization='),end=source.indexOf('export interface BridgeDeps')
  expect(start).toBeGreaterThan(-1);const type=source.slice(start,end)
  expect(type).not.toMatch(/publish|ready|merge|deploy|authority|fixture|token/i)
 })
 it('keeps the CLI free of native stop, materialization and lease execution entry points',()=>{
  expect(text('apps/code-broker/src/cli.ts')).not.toMatch(/native-stop|controlled-helper|materializ|execution-lease/)
 })
 it('removes the one-shot materialization path from both the invoker and the facade',()=>{
  const helper=text('apps/code-broker/src/isolation/windows/workspace-helper.ts'),facade=text('apps/code-broker/src/isolation/windows/source-fixture.ts')
  expect(helper).toContain("export type HelperMode='prepare'|'probe'|'cleanup-probe'|'cleanup-materialization'")
  expect(helper).toContain("if(!['prepare','probe','cleanup-probe','cleanup-materialization'].includes(mode))")
  expect(facade).not.toMatch(/'materialize-fixture'|nextAttempt|reserveWindowsSourceAttempt|deps\.reserve/);expect(facade).toContain("deps.invoke('cleanup-materialization'")
 })
 it('routes native materialize-fixture only through the control channel and keeps five modes',()=>{
  const program=text('apps/code-broker/native/windows-workspace/Program.cs')
  expect(program).toContain('args[0] is not ("prepare" or "probe" or "cleanup-probe" or "materialize-fixture" or "cleanup-materialization")')
  expect(program).toContain('var channel=new NativeControlChannel(Console.OpenStandardInput(),Console.OpenStandardOutput());')
  expect(program.match(/RunAsync\(/g)).toHaveLength(2) // materialization (controlled) and probe
  expect(program).toContain('.RunAsync(parsed.Request,parsed.Attempt,channel,deadline.Token)')
  const fixture=text('apps/code-broker/native/windows-workspace/WindowsMaterializationFixture.cs')
  expect(fixture).toContain('internal async Task<MaterializationReport> RunAsync(WorkspaceRequest request,Guid attempt,IStopCheckpoint control,CancellationToken cancellation)')
  for(const phase of ['before_resources','before_volume_create','before_container_create','before_upload','before_start','before_report'])expect(fixture).toContain('await control.CheckpointAsync("'+phase+'",work.Token);')
  // Cleanup must never be linked to the stop token.
  expect(fixture).toContain('using var cleanup=new CancellationTokenSource(left);')
  for(const path of execFileSync(GIT,['ls-files','--','apps/code-broker/native/windows-workspace'],{cwd:ROOT,encoding:'utf8'}).split(/\r?\n/).filter(p=>p.endsWith('.cs')&&!p.includes('/smoke/')))expect(text(path),path).not.toContain('ContinueAll')
 })
 it('pins exactly the approved all-users Docker targets and leaves policy, trusted SIDs and other targets unchanged',()=>{
  // Approved by André 2026-10-19 20:45 (docs/superpowers/plans/2026-10-19-docker-desktop-all-users-migration.md, Gate 3).
  const profile=text('apps/code-broker/native/windows-host/HostProfile.cs')
  expect(profile).toContain('new TargetDefinition("docker","C:/Program Files/Docker/Docker/resources/bin/docker.exe",false,"6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896"),')
  expect(profile).toContain('new TargetDefinition("backend","C:/Program Files/Docker/Docker/resources/com.docker.backend.exe",false,"37deeeae5bf632014b22fc6487cb9a531072f8d32d062acf6982a914fa6e8585"),')
  expect(profile).not.toMatch(/AppData/i)
  const before=execFileSync(GIT,['show',PLAN_BASE+':apps/code-broker/native/windows-host/HostProfile.cs'],{cwd:ROOT,encoding:'utf8'}).replaceAll('\r\n','\n').split('\n')
  const after=profile.replaceAll('\r\n','\n').split('\n')
  expect(after.length).toBe(before.length)
  const changed=after.map((l,i)=>l===before[i]?null:i).filter(i=>i!==null)
  expect(changed.map(i=>after[i!].trim().slice(0,32))).toEqual(['new TargetDefinition("docker","C','new TargetDefinition("backend","'])
  expect(execFileSync(GIT,['diff','--no-ext-diff',PLAN_BASE,'--','apps/code-broker/native/windows-host/HostPolicy.cs','apps/code-broker/native/windows-host/NativeFileEvidence.cs','apps/code-broker/native/windows-host/NativePipeEvidence.cs','apps/code-broker/native/windows-host/DockerObservation.cs','apps/code-broker/native/windows-host/HostQualification.cs'],{cwd:ROOT,encoding:'utf8'})).toBe('')
 })
 it('leaves the predecessor proof, frozen runner and command registry unchanged since the plan base',()=>{
  expect(execFileSync(GIT,['diff','--no-ext-diff','--no-textconv',PLAN_BASE,'--','apps/code-broker/toolchain','apps/web/lib/atlas/code-work/command-registry.ts','docs/verification/2026-10-19-source-fixture-success.json','apps/code-broker/src/cli.ts'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024})).toBe('')
  // Existing SQL remains byte-identical; later phases may introduce new migrations,
  // which are independently checked by the canonical migration and schema guards.
  expect(execFileSync(GIT,['diff','--name-only','--no-ext-diff','--diff-filter=DMRTUXB',PLAN_BASE,'--','apps/web/supabase/migrations'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024})).toBe('')
 })
})
