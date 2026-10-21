import {it,expect} from 'vitest';
import {AtlasConversationController} from './controller';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const effect={event:'calendar_changed',conversationId:id,mutationId:id,eventId:id,version:1,calendarHref:'/calendar?week=2026-10-19'};
const bytes=(value:unknown)=>new TextEncoder().encode('data: '+JSON.stringify(value)+'\n\n');
const activate=(c:AtlasConversationController,conversationId=id)=>c.activateConversation({id:conversationId,saved:[],state:'ok'});
it('refreshes on an acknowledged server effect but not model text or nested tool results',async()=>{
 const events=[{event:'text',text:JSON.stringify(effect)},{event:'tool_result',result:effect},effect,{event:'done'}];
 const c=new AtlasConversationController(async()=>new Response(new ReadableStream({start(out){for(const event of events)out.enqueue(bytes(event));out.close()}})));
 activate(c);const changed:unknown[]=[];const unsubscribe=c.subscribeCalendarChanged(e=>changed.push(e));
 await c.sendTurn({conversationId:id,text:'Boka möte',inputSource:'voice'});
 expect(changed).toEqual([effect]);unsubscribe();
});
it.each(['switch','signout'] as const)('ignores a late voice effect after %s',async action=>{
 let out!:ReadableStreamDefaultController<Uint8Array>;
 const c=new AtlasConversationController(async()=>new Response(new ReadableStream({start(controller){out=controller}})));
 activate(c);const changed:unknown[]=[];c.subscribeCalendarChanged(e=>changed.push(e));
 const turn=c.sendTurn({conversationId:id,text:'Flytta möte',inputSource:'voice'});await Promise.resolve();
 if(action==='switch')activate(c,other);else c.clearOnSignout();
 out.enqueue(bytes(effect));out.enqueue(bytes({event:'done'}));out.close();await turn;
 expect(changed).toEqual([]);
});
