import {readFileSync,readdirSync} from 'node:fs'
import {resolve,dirname,sep} from 'node:path'
import {createSourceFile,forEachChild,isImportDeclaration,isExportDeclaration,isCallExpression,isStringLiteral,ScriptKind,ScriptTarget,SyntaxKind} from 'typescript'
import {describe,it,expect} from 'vitest'
const root=resolve(__dirname,'../../../..'),review=resolve(root,'apps/web/lib/atlas/code-work/review'),storage=resolve(review,'storage')
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):/\.[jt]sx?$/.test(e.name)?[resolve(dir,e.name)]:[])
function imports(source:string){const out:string[]=[],tree=createSourceFile('x.ts',source,ScriptTarget.Latest,true,ScriptKind.TS);function walk(n:any){if((isImportDeclaration(n)||isExportDeclaration(n))&&n.moduleSpecifier&&isStringLiteral(n.moduleSpecifier))out.push(n.moduleSpecifier.text);if(isCallExpression(n)&&n.arguments.length&&isStringLiteral(n.arguments[0])&&(n.expression.kind===SyntaxKind.ImportKeyword||n.expression.getText(tree)==='require'))out.push(n.arguments[0].text);forEachChild(n,walk)}walk(tree);return out}
describe('review SQL privileges remain closed',()=>{
 it('pins every new public RPC to an explicit client revoke and service-role-only grant',()=>{
  const paths=[
   'apps/web/supabase/migrations/20261018185809_atlas_code_review_storage.sql',
   'apps/web/supabase/migrations/20261019110000_atlas_code_work_execution_lease.sql',
  ]
  const sql=paths.map(p=>readFileSync(resolve(root,p),'utf8')).join('\n')
  const rpc=/public\.(atlas_code_(?:review_[a-z_]+|work_execution_lease))\s*\(/gi
  const created=[...sql.matchAll(/\bcreate\s+function\s+public\.(atlas_code_(?:review_[a-z_]+|work_execution_lease))\s*\(/gi)].map(m=>m[1])
  const fromStatements=(expression:RegExp)=>[...sql.matchAll(expression)].flatMap(m=>[...m[1].matchAll(rpc)].map(x=>x[1]))
  const revoked=fromStatements(/\brevoke\s+all\s+on\s+function\s+([^;]+)\s+from\s+public,anon,authenticated,service_role\s*;/gi)
  const granted=fromStatements(/\bgrant\s+execute\s+on\s+function\s+([^;]+)\s+to\s+service_role\s*;/gi)
  const required=[
   'atlas_code_review_apply','atlas_code_review_authenticate_role','atlas_code_review_initialize',
   'atlas_code_review_observe','atlas_code_review_read','atlas_code_review_read_for_role',
   'atlas_code_review_rotate_credential','atlas_code_work_execution_lease',
  ].sort()
  expect(created.sort()).toEqual(required)
  expect(revoked.sort()).toEqual(required)
  expect(granted.sort()).toEqual(required)
  expect(sql).not.toMatch(/\bgrant\s+(?:execute|usage|select|insert|update|delete|all)\s+[^;]+\s+to\s+(?:public|anon|authenticated)\s*;/i)
  expect(sql).toMatch(/revoke all on all functions in schema atlas_code_review_private from public,anon,authenticated,service_role;/i)
 })
})

describe('review persistence remains server internal',()=>{
 it('requires server-only at credential and privilege-bearing entry points',()=>{for(const f of ['credential','store','service','principal-read'])expect(imports(readFileSync(resolve(storage,f+'.ts'),'utf8'))).toContain('server-only')})
 it('has no operational route, UI, broker execution or external runtime consumer',()=>{
  const external=[...files(resolve(root,'apps/web/app')),...files(resolve(root,'apps/web/lib')),...files(resolve(root,'apps/code-broker/src'))].filter(p=>!p.startsWith(review+sep)&&!p.includes(sep+'qa'+sep))
  const consumers=external.filter(file=>{const source=readFileSync(file,'utf8');return source.includes('review')&&imports(source).some(spec=>{const p=spec.startsWith('@/')?resolve(root,'apps/web',spec.slice(2)):resolve(dirname(file),spec);return p===storage||p.startsWith(storage+sep)})})
  expect(consumers).toEqual([])
 })
 it('preparation only imports pure review contracts and hashing',()=>{
  const source=readFileSync(resolve(storage,'prepare.ts'),'utf8')
  expect(imports(source).every(s=>['../../../authorization/build','../../binding','../../types','../binding','../snapshot','../result','../messages','../types','../validation','./types'].includes(s))).toBe(true)
  expect(source).not.toMatch(/\b(?:fetch\s*\(|Date\.now\s*\(|Math\.random\s*\(|randomUUID\s*\(|process\.)/)
 })
 it('has no model, command execution or lifecycle authority and uses only narrow RPC storage',()=>{
  for(const file of files(storage)){const source=readFileSync(file,'utf8');expect(imports(source).some(s=>/child_process|code-broker|lifecycle|provider|worker-registry/.test(s))).toBe(false);expect(source).not.toMatch(/\b(?:spawn|execFile|fetch|transitionCodeWork|appendEvidence)\s*\(/)}
  const source=readFileSync(resolve(storage,'store.ts'),'utf8');expect(source).not.toMatch(/\.from\s*\(/)
 })
})
