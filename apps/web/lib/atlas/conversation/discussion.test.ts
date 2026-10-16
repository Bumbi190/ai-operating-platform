import {describe,it,expect} from 'vitest'
import {AtlasConversationController} from './controller'
const C='50000000-0000-4000-8000-000000000001',P='10000000-0000-4000-8000-000000000001'
describe('visible Atlas discussion handoff',()=>{
 it('stages a visible discussion through the shared shell without sending or switching a conversation',()=>{
  let requests=0;const c=new AtlasConversationController(async()=>{requests++;return new Response()})
  c.activateConversation({id:C,saved:[],state:'ok',projectId:P})
  const before=c.snapshot(),received:string[]=[]
  ;(c as any).subscribeDiscussion?.((text:string)=>{received.push(text)})
  const accepted=(c as any).requestDiscussion?.('  Diskutera ett förslag för Handlarbörsen.  ')
  expect(accepted).toBe(true);expect(received).toEqual(['Diskutera ett förslag för Handlarbörsen.'])
  expect(c.snapshot()).toBe(before);expect(requests).toBe(0)
 })
 it('reports an unavailable handoff rather than pretending to have opened a chat',()=>{
  const c=new AtlasConversationController()
  expect((c as any).requestDiscussion?.('Ett förslag')).toBe(false)
 })
 it('rejects empty or unbounded text before delivering it to the shell',()=>{
  const c=new AtlasConversationController(),received:string[]=[]
  ;(c as any).subscribeDiscussion?.((text:string)=>received.push(text))
  expect((c as any).requestDiscussion?.(' ')).toBe(false)
  expect((c as any).requestDiscussion?.('x'.repeat(6001))).toBe(false)
  expect(received).toEqual([])
 })
 it('unsubscribes a shell without retaining its discussion receiver',()=>{
  const c=new AtlasConversationController(),off=(c as any).subscribeDiscussion?.(()=>{})
  off?.();expect((c as any).requestDiscussion?.('Ett förslag')).toBe(false)
 })
 it('allows the next voice turn while the acknowledged background build remains queued',async()=>{
  let calls=0;const c=new AtlasConversationController(async()=>{
   calls++;const frames=calls===1?[{event:'website_workspace',conversationId:C,session:{projectId:P,sessionId:'60000000-0000-4000-8000-000000000001',conversationId:C,status:'queued',stage:'Köad',stateVersion:1,agentId:P,activePreviewRevisionId:null,currentRunId:null,controlRequested:null,updatedAt:'2026-10-16',revisions:[],feedback:[]}},{event:'text',text:'Jobbet är köat.'},{event:'done'}]:[{event:'text',text:'Vi kan fortsätta prata.'},{event:'done'}]
   return new Response(frames.map(f=>'data: '+JSON.stringify(f)+'\n\n').join(''))
  })
  c.activateConversation({id:C,saved:[],state:'ok',projectId:P})
  expect(await c.sendTurn({conversationId:C,text:'Starta det godkända jobbet',inputSource:'voice'})).toEqual({ok:true})
  expect(c.snapshot().session?.status).toBe('queued');expect(c.snapshot().pending).toBe(false)
  expect(await c.sendTurn({conversationId:C,text:'Vad gör vi medan jobbet körs?',inputSource:'voice',visiblePlan:null,buildContext:null})).toEqual({ok:true})
  expect(calls).toBe(2);expect(c.snapshot().session?.status).toBe('queued')
 })
})
