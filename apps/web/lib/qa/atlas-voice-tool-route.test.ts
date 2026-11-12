import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
const recording=vi.hoisted(()=>({
 calls:[] as any[],writes:[] as any[],mode:'text' as 'text'|'complete'|'truncated'|'after-save-truncated',
 calendarTool:vi.fn(),
}))
const USER='10000000-0000-4000-8000-000000000001'
const CONVERSATION='10000000-0000-4000-8000-000000000002'
const EVENT='10000000-0000-4000-8000-000000000003'
const eventInput={
 eventId:EVENT,idempotencyKey:'10000000-0000-4000-8000-000000000004',
 draft:{kind:'private',title:'Femårskalas',description:'',location:'Hemma',projectId:null,taskId:null,
  time:{kind:'timed',startUtc:'2026-12-13T12:00:00.000Z',endUtc:null,timeZone:'Europe/Stockholm'},workStatus:null},
}
const birthdayRequest='Hej Nova, lägg till att den 13 december klockan 13:00 ska min brorsdotter ha ett kalas hemma. Hon fyller fem.'
function builder(table:string):any{
 let single=false
 const b:any=new Proxy({}, {get(_target,key){
  if(key==='then')return (resolve:any)=>Promise.resolve({data:single?(table==='conversations'?{id:CONVERSATION,user_id:USER}:null):[],error:null}).then(resolve)
  if(key==='single'||key==='maybeSingle')return ()=>{single=true;return b}
  if(['insert','update','upsert','delete'].includes(String(key)))return (value:any)=>{recording.writes.push({table,key,value});return b}
  return ()=>b
 }})
 return b
}
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({
 auth:{getUser:async()=>({data:{user:{id:USER,email:'owner@example.com'}}})},from:builder,
})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:builder,rpc:async()=>({data:null,error:null})})}))
vi.mock('@/lib/calendar/atlas-tools',async original=>({
 ...await original<typeof import('@/lib/calendar/atlas-tools')>(),handleCalendarTool:recording.calendarTool,
}))
vi.mock('@/lib/ai/openai-client',()=>({openAIChatCompletion:async(_ctx:unknown,params:any)=>{
 recording.calls.push(params)
 const round=recording.calls.length
 return {async *[Symbol.asyncIterator](){
  if(round>2&&recording.mode==='after-save-truncated'){
   yield {choices:[{index:0,delta:{content:'Avbrutet svar'},finish_reason:'length'}]}
  }else if(recording.mode==='text'||round>2){
   yield {choices:[{index:0,delta:{content:'Svar på frågan.'},finish_reason:'stop'}]}
  }else if(round===1){
   yield {choices:[{index:0,delta:{tool_calls:[{index:0,id:'time-call',function:{name:'get_current_time',arguments:'{"timezone":"Europe/Stockholm"}'}}]},finish_reason:'tool_calls'}]}
  }else{
   const truncated=recording.mode==='truncated'||params.max_completion_tokens<4096
   const args=JSON.stringify(eventInput)
   yield {choices:[{index:0,delta:{tool_calls:[{index:0,id:'calendar-call',function:{name:'create_calendar_event',arguments:truncated?args.slice(0,190):args}}]},finish_reason:truncated?'length':'tool_calls'}]}
   yield {choices:[],usage:{prompt_tokens:18743,completion_tokens:truncated?150:250}}
  }
 }}
}}))
async function run(text:string,extra:Record<string,unknown>={}){
 const {POST}=await import('@/app/api/chat/route')
 const response=await POST(new Request('http://localhost/api/chat',{
  method:'POST',headers:{'content-type':'application/json',origin:'http://localhost',host:'localhost'},
  body:JSON.stringify({messages:[{role:'user',content:text}],voice:true,...extra}),
 }) as any)
 const raw=await response.text()
 const events=raw.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)))
 return {response,events}
}
beforeEach(()=>{
 vi.resetModules();recording.calls=[];recording.writes=[];recording.mode='text'
 recording.calendarTool.mockReset().mockResolvedValue({ok:true,event:{id:EVENT,version:1},mutationId:'10000000-0000-4000-8000-000000000005',calendarHref:'/calendar?week=2026-12-07'})
 vi.stubEnv('ATLAS_MODEL_PROFILE','openai_economy');vi.stubEnv('OPENAI_API_KEY','test-openai')
 vi.spyOn(console,'error').mockImplementation(()=>{})
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})

describe('voice tool output budget and terminal error',()=>{
 it('reports a truncated 150-token calendar followup and never dispatches partial arguments or retries',async()=>{
  recording.mode='truncated'
  const {response,events}=await run(birthdayRequest,{conversation_id:CONVERSATION})
  expect(response.status).toBe(200)
  expect(events).toContainEqual(expect.objectContaining({event:'tool_result',tool:'get_current_time'}))
  expect(events.filter(event=>event.event==='error')).toEqual([expect.objectContaining({
   code:'ATLAS_RESPONSE_LENGTH_LIMIT',
   message:'Svaret blev för långt och avbröts. Tidigare åtgärder kan redan vara sparade. Kontrollera resultatet innan du försöker igen.',
  })])
  expect(events.some(event=>event.event==='tool_start'&&event.tool==='create_calendar_event')).toBe(false)
  expect(events.some(event=>event.event==='calendar_changed')).toBe(false)
  expect(recording.calendarTool).not.toHaveBeenCalled()
  expect(recording.calls).toHaveLength(2)
  expect(recording.calls[1].messages).toEqual(expect.arrayContaining([
   expect.objectContaining({role:'assistant',tool_calls:[{id:'time-call',type:'function',function:{name:'get_current_time',arguments:'{"timezone":"Europe/Stockholm"}'}}]}),
   expect.objectContaining({role:'tool',tool_call_id:'time-call'}),
  ]))
  const log=vi.mocked(console.error).mock.calls.find(args=>String(args[0]).includes('ATLAS_RESPONSE_LENGTH_LIMIT'))
  expect(log?.[1]).toMatchObject({provider:'openai'})
  expect(JSON.stringify(log)).not.toContain(birthdayRequest)
 })
 it('allows a complete calendar payload after the time lookup without requiring a calendar keyword',async()=>{
  recording.mode='complete'
  const {events}=await run(birthdayRequest,{conversation_id:CONVERSATION})
  expect(recording.calls).toHaveLength(3)
  expect(recording.calls.slice(0,2).map(call=>call.max_completion_tokens)).toEqual([4096,4096])
  expect(recording.calls[0].messages[0].content).toContain('HÖGST 2 meningar')
  expect(recording.calendarTool).toHaveBeenCalledTimes(1)
  expect(recording.calendarTool.mock.calls[0].slice(0,2)).toEqual(['create_calendar_event',eventInput])
  expect(events.some(event=>event.event==='error')).toBe(false)
  expect(events.some(event=>event.event==='done')).toBe(true)
 })
 it('retains a successful calendar receipt before a later length error and never replays the write',async()=>{
  recording.mode='after-save-truncated'
  const {events}=await run(birthdayRequest,{conversation_id:CONVERSATION})
  expect(recording.calendarTool).toHaveBeenCalledTimes(1)
  expect(recording.calls).toHaveLength(3)
  const saved=events.findIndex(event=>event.event==='calendar_changed'&&event.eventId===EVENT)
  const failed=events.findIndex(event=>event.event==='error'&&event.code==='ATLAS_RESPONSE_LENGTH_LIMIT')
  expect(saved).toBeGreaterThan(-1)
  expect(failed).toBeGreaterThan(saved)
  expect(events[failed].message).toContain('Tidigare \u00e5tg\u00e4rder kan redan vara sparade.')
  expect(events.some(event=>event.event==='done')).toBe(false)
 })
 it.each([
  ['Hej',{},150,false],
  ['Förklara en motor.',{mode:'content'},150,false],
  ['Beskriv den här sidan.',{mode:'nova_readonly'},150,false],
  ['Beskriv den här sidan.',{mode:'nova_readonly',voice:false},900,false],
  ['Förklara en motor.',{mode:'content',voice:false},1200,false],
  ['Vilken tid är det i Tokyo?',{},4096,true],
 ])('keeps bounded output for %s with %j',async(text,extra,budget,hasTools)=>{
  await run(text,extra)
  expect(recording.calls).toHaveLength(1)
  expect(recording.calls[0].max_completion_tokens).toBe(budget)
  expect(Boolean(recording.calls[0].tools?.length)).toBe(hasTools)
 })
})
