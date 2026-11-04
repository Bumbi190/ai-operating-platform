import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const state=vi.hoisted(()=>({writes:[] as any[],modelCalls:0,owner:true}))
const factual='4 kopplade mejl från 2 kontaktposter. Avstämt 2026-10-18 21:45 Europe/Stockholm (UTC+02:00).'
vi.mock('@/lib/sales/inbox/report',async original=>{const actual=await original<typeof import('@/lib/sales/inbox/report')>();return {...actual,buildInboxReport:async(_db:unknown,_p:unknown,id:string|null)=>({text:id?'4 kopplade mejl från 2 kontaktposter. Avstämt 2026-10-18 21:45 Europe/Stockholm (UTC+02:00).':'Inkorgens uppgifter kunde inte verifieras.',evidence:[]})}})
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner',email:'owner@example.se'}}})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 let payload:any,op='select';const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,in:()=>q,gte:()=>q,lte:()=>q,is:()=>q,not:()=>q,insert:(p:any)=>{op='insert';payload=p;return q},update:(p:any)=>{op='update';payload=p;return q},maybeSingle:()=>Promise.resolve({data:state.owner?{id:'conversation'}:null,error:null}),then:(ok:any)=>Promise.resolve({data:[],error:null}).then(r=>{if(op==='insert')state.writes.push({table,payload});return ok(r)})};return q
},rpc:async()=>({data:null,error:null})})}))
vi.mock('@/lib/atlas/isolation',()=>({getAllowedProjectIds:async()=>['project'],assertProjectAllowed:()=>{},scopeProjectFilter:()=>{},scopeToProjects:()=>{}}))
function model(){state.modelCalls++;let handler=(text:string)=>{};return {on:(_event:string,h:(s:string)=>void)=>{handler=h},finalMessage:async()=>{handler('5 pilotbolag. UTC felmärkt.');return {stop_reason:'end_turn',content:[{type:'text',text:'5 pilotbolag. UTC felmärkt.'}]}}}}
vi.mock('@/lib/ai/anthropic',()=>({getAnthropic:()=>({messages:{stream:model}})}))
vi.mock('@/lib/atlas/openai-chat',()=>({openAIAtlasStream:async()=>model()}))
beforeEach(()=>{state.writes=[];state.modelCalls=0;state.owner=true;process.env.ANTHROPIC_API_KEY='test';process.env.OPENAI_API_KEY='test'})
import {POST} from '@/app/api/chat/route'
async function post(messages:any[],extra:Record<string,unknown>={}){
 const r=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({conversation_id:'conversation',messages,...extra})}))
 const body=await r.text();await new Promise(r=>setTimeout(r,20));return {status:r.status,body}
}
it('returns and persists the verified report without letting a model rewrite its numbers',async()=>{
 const r=await post([{role:'user',content:'Läs Handlarbörsens sparade inkorg. Vilka pilotföretag har svarat?'}])
 expect(r.status).toBe(200);expect(r.body).toContain(factual);expect(r.body).not.toContain('5 pilotbolag')
 expect(state.writes.filter(w=>w.table==='conversation_messages'&&w.payload.role==='assistant').map(w=>w.payload.content)).toEqual([factual])
 expect(state.modelCalls).toBe(0)
})
it('handles a correction when the client sends only user and assistant prose',async()=>{
 const r=await post([{role:'user',content:'Läs Handlarbörsens inkorg.'},{role:'assistant',content:'5 pilotbolag har svarat.'},{role:'user',content:'Kontrollera antalet mot pageSummary.linkedContactCount.'}],{mode:'content'})
 expect(r.body).toContain(factual);expect(r.body).not.toContain('5 pilotbolag');expect(state.modelCalls).toBe(0)
})
it('does not invent a verified report for a foreign conversation',async()=>{
 state.owner=false
 const r=await post([{role:'user',content:'Kontrollera pageSummary.linkedContactCount.'}])
 expect(r.body).toContain('kunde inte verifieras');expect(r.body).not.toContain(factual);expect(state.writes).toEqual([])
})
it('leaves ordinary writing on its existing model path',async()=>{
 const r=await post([{role:'user',content:'Skriv en kort födelsedagshälsning.'}],{mode:'content'})
 expect(r.body).toContain('5 pilotbolag');expect(r.body).not.toContain(factual);expect(state.modelCalls).toBe(1)
})
