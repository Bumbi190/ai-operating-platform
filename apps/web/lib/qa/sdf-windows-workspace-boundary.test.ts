import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import * as ts from 'typescript'
import {describe,it,expect} from 'vitest'
const ROOT=resolve(__dirname,'../../../..'),BASE='91925590e160e0a258c2867e50b0e92480f3a603'
const text=(path:string)=>readFileSync(join(ROOT,path),'utf8')
const changedFiles=()=>execFileSync('git',['ls-files','-co','--exclude-standard','--','apps/code-broker/src','apps/web'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).split(/\r?\n/).filter(p=>/\.tsx?$/.test(p))
describe('Windows infrastructure remains internally bounded',()=>{
 it('has no operational caller of the new facade/contracts/transport',()=>{
  const consumers:string[]=[]
  for(const path of changedFiles()){
   const source=ts.createSourceFile(path,text(path),ts.ScriptTarget.Latest,true)
   const visit=(node:ts.Node)=>{
    let spec:string|undefined
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))spec=node.moduleSpecifier.text
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))spec=node.arguments[0].text
    if(spec&&/(?:\/|^)workspace(?:-contracts|-helper)?(?:\.js)?$/.test(spec)&&spec.includes('windows')||spec&&/^\.\/workspace(?:-contracts|-helper)?\.js$/.test(spec)){
     consumers.push(path);expect(path.startsWith('apps/web/lib/qa/')||/^apps\/code-broker\/src\/isolation\/windows\/(workspace|source-)/.test(path)||path==='apps/code-broker/src/isolation/windows/controlled-helper.ts'||path==='apps/code-broker/src/runtime/native-stop-bridge.ts',path).toBe(true)
    }
    ts.forEachChild(node,visit)
   };visit(source)
  }
  expect(consumers).toEqual(expect.arrayContaining(['apps/code-broker/src/isolation/windows/workspace.ts','apps/code-broker/src/isolation/windows/workspace-helper.ts']))
 })
 it('keeps transport selection source-owned and never activates job or provider APIs',()=>{
  for(const file of ['workspace.ts','workspace-contracts.ts','workspace-helper.ts']){
   const source=text('apps/code-broker/src/isolation/windows/'+file)
   expect(source).not.toMatch(/['"]use client['"]|process\.env|createAdminClient|\.rpc\(|\/api\/|anthropic|openai|fetch\(/)
  }
  expect(text('apps/code-broker/src/cli.ts')).not.toMatch(/workspace|sandbox|qualify/)
 })
 it('retains observation-only host modes and the five closed new native modes',()=>{
  const host=text('apps/code-broker/native/windows-host/Program.cs'),program=text('apps/code-broker/native/windows-workspace/Program.cs')
  expect(host).toContain('args.Length!=1||args[0]!="qualify"')
  expect(program).toContain('args[0] is not ("prepare" or "probe" or "cleanup-probe" or "materialize-fixture" or "cleanup-materialization")')
  for(const file of ['DockerProbeSession.cs','WindowsSandboxProbe.cs','ProbeSpecification.cs'])expect(text('apps/code-broker/native/windows-workspace/'+file)).not.toMatch(/Process\.Start|GetEnvironmentVariable|\/images\/create|\/exec|\/archive|\/volumes|docker\.sock|\.Pull\(|\.Build\(/)
 })
 it('leaves existing POSIX execution guards and immutable sandbox specification byte-identical',()=>{
  for(const file of ['docker-host.ts','fs-containment.ts','git-commands.ts','git-grammar.ts','process-runner.ts','registry.ts','repository-proof.ts','sandbox-probe.ts','sandbox-spec.ts','substrate.ts','toolchain.ts']){
   const path='apps/code-broker/src/isolation/'+file
   const before=execFileSync('git',['show',BASE+':'+path],{cwd:ROOT,encoding:'utf8'}).replaceAll('\r\n','\n')
   expect(text(path).replaceAll('\r\n','\n'),file).toBe(before)
  }
 })
})
