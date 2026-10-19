import {execFileSync} from 'node:child_process'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import * as ts from 'typescript'
import {describe,it,expect} from 'vitest'
import {leaseFixture} from './fixtures/sdf-execution-lease-fixtures'
import {projectExecutionLease} from '@/lib/atlas/code-broker/execution-lease/projection'
import {parseExecutionLease} from '../../../code-broker/src/protocol/execution-lease-contracts'
const ROOT=resolve(__dirname,'../../../..'),GIT='C:/Program Files/Git/cmd/git.exe',BASE='2dd4ec081054626b3388242af3c1f677e2718e8e'
const text=(path:string)=>readFileSync(join(ROOT,path),'utf8')
const sourceFiles=()=>[...new Set(execFileSync(GIT,['ls-files','-co','--exclude-standard','--','apps/code-broker/src','apps/web'],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).split(/\r?\n/).filter(p=>/\.tsx?$/.test(p)))]
describe('execution lease has no execution or operational consumer',()=>{
 it('confines client/guard and server imports to this increment and QA',()=>{
  const consumers:string[]=[]
  for(const path of sourceFiles()){
   const source=text(path);if(!source.includes('execution-lease'))continue
   const visit=(n:ts.Node)=>{
    let spec:string|undefined
    if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))spec=n.moduleSpecifier.text
    if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0]))spec=n.arguments[0].text
    if(spec&&/(?:^|\/)execution-lease-(?:client|guard|contracts)(?:\.js)?$/.test(spec)){
     consumers.push(path);expect(path.startsWith('apps/web/lib/qa/')||path==='apps/code-broker/src/runtime/execution-lease-guard.ts'||path==='apps/code-broker/src/protocol/execution-lease-client.ts',path).toBe(true)
    }
    if(spec&&spec.includes('/execution-lease/'))expect(path.startsWith('apps/web/lib/qa/')||path.startsWith('apps/web/lib/atlas/code-broker/execution-lease/')||path==='apps/web/app/api/atlas/code-work/broker/execution-lease/route.ts',path).toBe(true)
    ts.forEachChild(n,visit)
   }
   visit(ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true))
  }
  expect(consumers).toContain('apps/code-broker/src/runtime/execution-lease-guard.ts')
 })
 it('contains no process, filesystem, model or publication dependency in new product modules',()=>{
  const paths=['apps/code-broker/src/runtime/execution-lease-guard.ts',...['execution-lease-client.ts','execution-lease-contracts.ts','bounded-json.ts'].map(p=>'apps/code-broker/src/protocol/'+p),...readdirSync(join(ROOT,'apps/web/lib/atlas/code-broker/execution-lease')).filter(p=>p.endsWith('.ts')).map(p=>'apps/web/lib/atlas/code-broker/execution-lease/'+p)]
  for(const path of paths){const source=text(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);const visit=(n:ts.Node)=>{if(ts.isImportDeclaration(n)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))expect(n.moduleSpecifier.text,path).not.toMatch(/child_process|(?:^|:)fs$|windows\/(?:workspace|source-fixture)|anthropic|openai|patch-protocol|review\/storage|model-access/);if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression))expect(n.expression.text,path).not.toMatch(/^(spawn|exec|execFile|fork|writeFile|writeFileSync|runWindowsSourceFixture|createPlatformBrokerSigner)$/);ts.forEachChild(n,visit)};visit(ast)}
 })
 it('preserves the native five-mode/CLI/command/frozen-image proof boundary byte-for-byte',()=>{
  const paths=['apps/code-broker/src/cli.ts','apps/code-broker/native','apps/code-broker/toolchain','apps/code-broker/src/isolation/windows','apps/web/lib/atlas/code-work/command-registry.ts','docs/verification/2026-10-19-source-fixture-success.json']
  expect(execFileSync(GIT,['diff','--no-ext-diff','--no-textconv',BASE,'--',...paths],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024})).toBe('')
 })
 it('keeps the route a fixed single-argument POST handler with no injected enablement',()=>{
  const source=text('apps/web/app/api/atlas/code-work/broker/execution-lease/route.ts'),ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true),calls:ts.CallExpression[]=[]
  const visit=(n:ts.Node)=>{if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='handleExecutionLeaseRequest')calls.push(n);ts.forEachChild(n,visit)};visit(ast)
  expect(calls).toHaveLength(1);expect(calls[0].arguments).toHaveLength(1);expect(source).not.toMatch(/process\.env|enabled|createAdminClient|export.*(?:GET|PUT|PATCH|DELETE)/)
 })
 it('keeps server/client metadata schemas aligned on independent negative vectors',()=>{
  expect(projectExecutionLease(leaseFixture())).not.toBeNull();expect(parseExecutionLease(leaseFixture())).toEqual(leaseFixture())
  for(const change of [(v:any)=>v.extra=true,(v:any)=>v.binding.extra='scope',(v:any)=>v.authorityPins.extra=true,(v:any)=>v.binding.repositoryId='foreign',(v:any)=>v.binding.fence=0,(v:any)=>v.state='cancelled',(v:any)=>v.stateVersion=0,(v:any)=>v.productionAuthority=true,(v:any)=>v.authorityPins.missionVersion=0,(v:any)=>v.serverNowMs=Infinity,(v:any)=>v.leaseUntilMs=v.serverNowMs+90001,(v:any)=>v.authorizationExpiresAtMs=v.serverNowMs,(v:any)=>delete v.projectId]){const v=leaseFixture();change(v);expect(projectExecutionLease(v)).toBeNull();expect(()=>parseExecutionLease(v)).toThrow()}
 })
})
