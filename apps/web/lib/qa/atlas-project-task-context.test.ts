import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {PROJECT_CONTEXT_TOOL,resolveProjectTaskContext} from '@/lib/atlas/project-task-context'
import {isSocialPreparationIntent} from '@/lib/social-launch/preparation-intent'
import {isUnsupportedNavigationClaim} from '@/lib/atlas/honesty'
const owner='20000000-0000-4000-8000-000000000001'
const target='10000000-0000-4000-8000-000000000001'
const sibling='10000000-0000-4000-8000-000000000002'
const principal={userId:owner,allowedProjectIds:[target,sibling]}
const rows=[{id:target,owner_id:owner,name:'New dealer project',slug:'new-dealer'},{id:sibling,owner_id:owner,name:'Family',slug:'family'}]
function db(data:unknown=rows,error:unknown=null){
 const filters:unknown[]=[]
 const chain={select:vi.fn(()=>chain),eq:vi.fn((...a)=>{filters.push(a);return chain}),in:vi.fn((...a)=>{filters.push(a);return chain}),limit:vi.fn(async()=>({data,error}))}
 return {client:{from:vi.fn(()=>chain)} as any,filters,chain}
}
describe('dynamic explicit project context',()=>{
 it('resolves names, slugs and UUIDs without navigating or changing chats',async()=>{
  for(const project of ['New dealer project','new-dealer',target]){
   const f=db(),r=await resolveProjectTaskContext(f.client,principal,{project})
   expect(r).toMatchObject({project:{id:target,name:rows[0].name,slug:'new-dealer'},navigationPerformed:false})
   expect(f.filters).toContainEqual(['owner_id',owner]);expect(f.filters).toContainEqual(['id',[target,sibling]])
  }
 })
 it('does not choose among duplicate names or accept mismatched owner/allow-list rows',async()=>{
  expect(await resolveProjectTaskContext(db([rows[0],{...rows[1],name:rows[0].name}]).client,principal,{project:rows[0].name})).toMatchObject({code:'PROJECT_AMBIGUOUS'})
  for(const data of [[{...rows[0],owner_id:'another-owner'}],[{...rows[0],id:'foreign-id'}]]){
   expect(await resolveProjectTaskContext(db(data).client,principal,{project:rows[0].name})).toMatchObject({code:'PROJECT_UNAVAILABLE'})
  }
 })
 it('fails closed for missing targets, malformed input, provider errors and an empty scope',async()=>{
  expect(await resolveProjectTaskContext(db().client,principal,{project:'Missing'})).toMatchObject({code:'NOT_FOUND'})
  expect(await resolveProjectTaskContext(db([],{}).client,principal,{project:'Family'})).toMatchObject({code:'PROJECT_UNAVAILABLE'})
  const f=db()
  expect(await resolveProjectTaskContext(f.client,{...principal,allowedProjectIds:[]},{project:'Family'})).toMatchObject({code:'NOT_FOUND'})
  expect(f.client.from).not.toHaveBeenCalled()
  expect(await resolveProjectTaskContext(db().client,principal,{project:'Family',ownerId:owner})).toMatchObject({code:'INVALID_BODY'})
  expect(PROJECT_CONTEXT_TOOL.input_schema.additionalProperties).toBe(false)
 })
 it('cannot broaden the Studio project scope',async()=>{
  const f=db([rows[1]])
  expect(await resolveProjectTaskContext(f.client,{...principal,allowedProjectIds:[target]},{project:'Family'})).toMatchObject({code:'PROJECT_UNAVAILABLE'})
 })
})
describe('operational social routing',()=>{
 it.each([
  'Jag vill att vi planerar tre dagars publiceringar på LinkedIn för Handlarbörsen nästa vecka och genererar text och bild.',
  'Planera LinkedIn-inlägg nästa vecka och lägg dem för granskning.',
  'Skapa tre inlägg för Instagram och spara dem för granskning.',
  'Förbered Facebook-publiceringar och välj tider åt mig.',
  'Sätt workflowet så att det är inne för granskning till ikväll.',
  'Schedule three LinkedIn posts for review next week.',
 ])('keeps requested preparation on the tools path: %s',text=>expect(isSocialPreparationIntent(text)).toBe(true))
 it.each(['Skriv en LinkedIn-text om bilar.','Översätt den här bildtexten.','Hej Nova!'])('keeps text-only writing separate: %s',text=>expect(isSocialPreparationIntent(text)).toBe(false))
 it('registers real project resolution and excludes preparation even in content mode',()=>{
  const route=readFileSync(resolve(process.cwd(),'app/api/chat/route.ts'),'utf8')
  expect(route).toContain('PROJECT_CONTEXT_TOOL')
  expect(route).toContain("name === 'resolve_project_context'")
  expect(route).toMatch(/const fastPath\s*=\s*!socialPreparationIntent/)
  expect(route).toContain('resolveProjectTaskContext(db, {userId, allowedProjectIds}, input)')
 })
})
describe('navigation honesty distinguishes claims from conditions',()=>{
 it.each([
  'När du öppnar Handlarbörsen kan jag fortsätta.',
  'Om du vill kan jag öppna projektet.',
  'Jag har inte öppnat någon sida.',
  'Vill du att jag tar dig till projektet?',
  'Jag kan inte öppna sidan.',
  'If you open the project, I can continue.',
 ])('does not falsely correct an offer or negative: %s',text=>expect(isUnsupportedNavigationClaim(text)).toBe(false))
 it.each([
  'Jag tog dig till Handlarbörsen nu.',
  'Jag kan bekräfta att jag har öppnat Handlarbörsen.',
  'I can confirm I opened the project.',
  'Jag har inte bara öppnat projektet, jag har även läst det.',
  'Jag har öppnat projektet.',
  'I opened the project.',
  'Här är planen. Jag navigerade till sidan.',
  'Om du vill kan jag fortsätta. Jag öppnade projektet.',
 ])('still catches unbacked actual navigation: %s',text=>expect(isUnsupportedNavigationClaim(text)).toBe(true))
})
