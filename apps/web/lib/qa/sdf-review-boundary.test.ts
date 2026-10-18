import {readFileSync,readdirSync} from 'node:fs'
import {resolve,dirname,sep} from 'node:path'
import {describe,it,expect} from 'vitest'
import {createSourceFile,forEachChild,isImportDeclaration,isExportDeclaration,isCallExpression,isStringLiteral,ScriptKind,ScriptTarget,SyntaxKind} from 'typescript'
import {CODE_WORK_RECEIPT_CLASSES} from '@/lib/atlas/code-work/types'
import {CODE_WORK_NON_TERMINAL_STATES,CODE_WORK_TERMINAL_STATES} from '@/lib/atlas/code-work/lifecycle'
const ROOT=resolve(__dirname,'../../../..'),REVIEW=resolve(ROOT,'apps/web/lib/atlas/code-work/review')
function sources(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(resolve(dir,e.name)):/\.[cm]?[jt]sx?$/.test(e.name)?[resolve(dir,e.name)]:[])}
function imports(source:string):string[]{const found:string[]=[];const tree=createSourceFile('source.ts',source,ScriptTarget.Latest,true,ScriptKind.TS);function visit(node:any):void{if((isImportDeclaration(node)||isExportDeclaration(node))&&node.moduleSpecifier&&isStringLiteral(node.moduleSpecifier))found.push(node.moduleSpecifier.text);if(isCallExpression(node)&&node.arguments.length&&isStringLiteral(node.arguments[0])&&(node.expression.kind===SyntaxKind.ImportKeyword||node.expression.getText(tree)==='require'))found.push(node.arguments[0].text);forEachChild(node,visit)}visit(tree);return found}
describe('review contracts have no operational authority',()=>{
 it('has no importer outside the review modules and QA',()=>{
  const files=[...sources(resolve(ROOT,'apps/web/lib')),...sources(resolve(ROOT,'apps/web/app')),...sources(resolve(ROOT,'apps/code-broker/src'))].filter(p=>!p.startsWith(REVIEW+sep)&&!p.includes(sep+'qa'+sep))
  const importers=files.filter(file=>{const source=readFileSync(file,'utf8');return source.includes('review')&&imports(source).some(spec=>{const p=spec.startsWith('@/')?resolve(ROOT,'apps/web',spec.slice(2)):resolve(dirname(file),spec);return p===REVIEW||p.startsWith(REVIEW+sep)})})
  expect(importers).toEqual([])
 })
 it('permits only pure contract/hash imports and no ambient runtime access',()=>{
  const allowed=new Set(['node:crypto','../../authorization/build','../binding','../command-registry','../policy','../path-policy','../types','./types','./validation','./binding','./snapshot','./result'])
  for(const file of sources(REVIEW)){const source=readFileSync(file,'utf8');for(const spec of imports(source))expect(allowed.has(spec),file+':'+spec).toBe(true)
   expect(source).not.toMatch(/\b(?:fetch\s*\(|Date\.now\s*\(|Math\.random\s*\(|randomUUID\s*\(|process\.|setTimeout\s*\(|setInterval\s*\()/)
  }
 })
 it('does not extend the existing operational receipt or lifecycle vocabularies',()=>{
  expect(CODE_WORK_RECEIPT_CLASSES).toEqual(['repository_proof','base_proof','worktree_identity','authority_pins','worker_identity','patch_operation','file_scope','command','test_result','policy_denial','cancellation_fencing','final_git_status','final_diff','terminal'])
  expect(CODE_WORK_NON_TERMINAL_STATES).toEqual(['proposed','authorized','claimed','preparing','working','testing'])
  expect(CODE_WORK_TERMINAL_STATES).toEqual(['ready_for_human_review','tests_failed','scope_violation','stale_base','worker_failed','cancelled','timeout','policy_denied'])
  expect(readFileSync(resolve(ROOT,'apps/code-broker/src/cli.ts'),'utf8')).not.toMatch(/review\//)
 })
})
