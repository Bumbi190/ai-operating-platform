import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import * as ts from 'typescript'
import {describe,it,expect} from 'vitest'
const ROOT=resolve(__dirname,'../../../..')
const text=(p:string)=>readFileSync(join(ROOT,p),'utf8')
describe('source fixture has no operational consumer',()=>{
 it('confines static imports, exports, require and literal dynamic imports to isolation and QA',()=>{
  const consumers:string[]=[]
  const files=execFileSync('git',['ls-files','-co','--exclude-standard','--','apps/code-broker/src','apps/web'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).split(/\r?\n/).filter(p=>/\.tsx?$/.test(p))
  for(const path of files){
   const visit=(n:ts.Node)=>{
    let spec:string|undefined
    if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))spec=n.moduleSpecifier.text
    if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))spec=n.arguments[0].text
    if(spec&&/(?:^|\/)source-(?:fixture|attempts|contracts)(?:\.js)?$/.test(spec)){consumers.push(path);expect(path.startsWith('apps/web/lib/qa/')||/^apps\/code-broker\/src\/isolation\/windows\/(source-|workspace)/.test(path),path).toBe(true)}
    ts.forEachChild(n,visit)
   };visit(ts.createSourceFile(path,text(path),ts.ScriptTarget.Latest,true))
  }
  expect(consumers).toContain('apps/code-broker/src/isolation/windows/source-fixture.ts')
 })
 it('keeps exactly five native modes and fixed helper deadlines',()=>{
  const program=text('apps/code-broker/native/windows-workspace/Program.cs'),helper=text('apps/code-broker/src/isolation/windows/workspace-helper.ts')
  expect(program).toContain('"prepare" or "probe" or "cleanup-probe" or "materialize-fixture" or "cleanup-materialization"')
  expect(helper).toContain('185000');expect(helper).toContain('35000')
  for(const f of ['source-fixture.ts','source-contracts.ts','source-attempts.ts'])expect(text('apps/code-broker/src/isolation/windows/'+f)).not.toMatch(/['"]use client['"]|process\.env|createAdminClient|\.rpc\(|\/api\/|anthropic|openai|fetch\(/)
  expect(text('apps/code-broker/src/cli.ts')).not.toMatch(/source-fixture|materialize-fixture|cleanup-materialization/)
 })
})