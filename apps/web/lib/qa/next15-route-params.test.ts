import {beforeEach,describe,expect,it,vi} from 'vitest'
import * as React from 'react'
const boundary=vi.hoisted(()=>({user:null as null|{id:string},events:[] as string[],requestedSlug:undefined as string|undefined,paramsReads:0,bodyReads:0}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({
 auth:{getUser:async()=>{boundary.events.push('auth');return {data:{user:boundary.user},error:null}}},
 from(table:string){
  if(!boundary.user)throw Error('DATABASE_BEFORE_AUTH')
  if(table==='projects'){
   let slug:unknown
   const q={select(){return q},eq(key:string,value:unknown){if(key==='slug')slug=value;return q},async single(){
    boundary.events.push('project:'+String(slug))
    return {data:slug==='owned'?{id:'project-owned'}:null,error:null}
   }}
   return q
  }
  if(table==='agents'){
   let project:unknown
   const q={select(){return q},eq(key:string,value:unknown){if(key==='project_id')project=value;return q},async order(){
    boundary.events.push('agents:'+String(project))
    if(project!=='project-owned')throw Error('FOREIGN_AGENT_QUERY')
    return {data:[{id:'agent-owned',project_id:'project-owned'}],error:null}
   }}
   return q
  }
  throw Error('UNEXPECTED_DATABASE_TABLE')
 }
})}))
vi.mock('@/lib/project/get-project',()=>({getProjectBySlug:async(slug:string)=>{
 boundary.requestedSlug=slug
 return slug==='owned'?{id:'project-owned',slug:'owned',name:'Owned project',color:'#123456'}:null
}}))
vi.mock('next/navigation',()=>({notFound:()=>{throw Error('NOT_FOUND')}}))
vi.mock('@/lib/project/context',()=>({ProjectProvider:({children}:{children:React.ReactNode})=>children}))
import {GET,POST} from '@/app/api/projects/[slug]/agents/route'
import ProjectLayout from '@/app/(platform)/projects/[slug]/layout'
const asContext=(params:unknown)=>({params}) as unknown as Parameters<typeof GET>[1]
function unopenedParams(){
 return {then(){boundary.paramsReads++;throw Error('PARAMETERS_READ_BEFORE_AUTH')}}
}
beforeEach(()=>{boundary.user=null;boundary.events=[];boundary.requestedSlug=undefined;boundary.paramsReads=0;boundary.bodyReads=0;vi.stubGlobal('React',React)})

describe('Next15 route params preserve the project authorization boundary',()=>{
 it('returns only owned project agents when Next supplies promised params',async()=>{
  boundary.user={id:'owner'}
  const response=await GET(new Request('http://compat.test/api/projects/owned/agents'),asContext(Promise.resolve({slug:'owned'})))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([{id:'agent-owned',project_id:'project-owned'}])
  expect(boundary.events).toEqual(['auth','project:owned','agents:project-owned'])
 })
 it('keeps a foreign project indistinguishable from a missing project',async()=>{
  boundary.user={id:'owner'}
  const response=await GET(new Request('http://compat.test/api/projects/foreign/agents'),asContext(Promise.resolve({slug:'foreign'})))
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({error:'Inte hittad'})
  expect(boundary.events).toEqual(['auth','project:foreign'])
 })
 it('denies an unauthenticated GET without resolving params or reading the database',async()=>{
  const response=await GET(new Request('http://compat.test/api/projects/owned/agents'),asContext(unopenedParams()))
  expect(response.status).toBe(401)
  expect(boundary.paramsReads).toBe(0)
  expect(boundary.events).toEqual(['auth'])
 })
 it('denies an unauthenticated write without resolving params or consuming a body',async()=>{
  const request=new Request('http://compat.test/api/projects/owned/agents',{method:'POST',body:'{}'})
  request.json=async()=>{boundary.bodyReads++;throw Error('BODY_BEFORE_AUTH')}
  const response=await POST(request,asContext(unopenedParams()) as Parameters<typeof POST>[1])
  expect(response.status).toBe(401)
  expect(boundary.paramsReads).toBe(0)
  expect(boundary.bodyReads).toBe(0)
  expect(boundary.events).toEqual(['auth'])
 })
 it('resolves layout params before selecting the provider project',async()=>{
  const output=await ProjectLayout({children:'child',params:Promise.resolve({slug:'owned'})} as unknown as Parameters<typeof ProjectLayout>[0])
  expect(boundary.requestedSlug).toBe('owned')
  expect(output.props.value).toEqual({projectId:'project-owned',projectSlug:'owned',projectName:'Owned project',projectColor:'#123456'})
 })
 it('does not render a provider for an unknown promised slug',async()=>{
  await expect(ProjectLayout({children:'child',params:Promise.resolve({slug:'missing'})} as unknown as Parameters<typeof ProjectLayout>[0])).rejects.toThrow('NOT_FOUND')
  expect(boundary.requestedSlug).toBe('missing')
 })
})
