import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({user:{id:'local-test-user',email:'owner@example.com'} as {id:string;email:string}|null,call:vi.fn(),anthropic:vi.fn(),approve:vi.fn()}))
vi.mock('@/lib/ai/openai-client',()=>({openAIChatCompletion:state.call}))
vi.mock('@/lib/ai/anthropic',()=>({getAnthropic:state.anthropic}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})}})}))
vi.mock('@/lib/website-build/planning/operator-command',async original=>{
 const actual=await original<typeof import('../website-build/planning/operator-command')>()
 return {...actual,executeVisiblePlanApproval:state.approve}
})
function builder(table:string):any {
 const b:any={then:(ok:any)=>Promise.resolve({data:table==='conversations'?{id:'22222222-2222-4222-8222-222222222222'}:[],error:null}).then(ok)}
 for(const name of ['select','eq','neq','gte','lte','lt','gt','in','is','not','order','limit','range','single','maybeSingle','insert','update','upsert','delete','filter','or','contains'])b[name]=()=>b
 return b
}
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>builder(table),rpc:async()=>({data:null,error:null})})}))
async function* reply(text='Hej André.'){
 yield {choices:[{index:0,delta:{content:text},finish_reason:'stop'}]}
 yield {choices:[],usage:{prompt_tokens:100,completion_tokens:10}}
}
async function post(content:string,extra:Record<string,unknown>={}){
 const {POST}=await import('@/app/api/chat/route')
 const res=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','origin':'http://localhost'},body:JSON.stringify({messages:[{role:'user',content}],...extra})}))
 return {status:res.status,body:await res.text()}
}
beforeEach(()=>{
 vi.resetModules()
 vi.stubEnv('ATLAS_CHAT_PROVIDER','openai');vi.stubEnv('OPENAI_API_KEY','test-openai-placeholder');vi.stubEnv('ANTHROPIC_API_KEY','')
 state.user={id:'local-test-user',email:'owner@example.com'}
 state.approve.mockReset().mockResolvedValue(null)
 state.call.mockReset().mockImplementation(async()=>reply())
 state.anthropic.mockReset().mockImplementation(()=>{throw new Error('Anthropic must not be reached in the OpenAI pilot')})
})
afterEach(()=>vi.unstubAllEnvs())
describe('real POST /api/chat with the OpenAI pilot flag',()=>{
 it('authenticates before any provider request',async()=>{
  state.user=null
  expect((await post('Hej')).status).toBe(401)
  expect(state.call).not.toHaveBeenCalled()
  expect(state.anthropic).not.toHaveBeenCalled()
 })
 it('works without an Anthropic key and emits the existing SSE text/done contract',async()=>{
  const result=await post('Hej')
  expect(result.status).toBe(200)
  const events=result.body.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)))
  expect(events).toContainEqual({event:'text',text:'Hej André.'})
  expect(events).toContainEqual({event:'done'})
  expect(events.some(event=>event.event==='error')).toBe(false)
  expect(state.call).toHaveBeenCalledTimes(1)
  expect(state.anthropic).not.toHaveBeenCalled()
 })
 it('preserves the default Anthropic path and never requires an OpenAI key there',async()=>{
  vi.stubEnv('ATLAS_CHAT_PROVIDER','');vi.stubEnv('ANTHROPIC_API_KEY','test-anthropic-placeholder');vi.stubEnv('OPENAI_API_KEY','')
  const opened=vi.fn(async()=>({on:()=>{},finalMessage:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'Hej.'}]})}))
  state.anthropic.mockReturnValue({messages:{stream:opened}})
  const result=await post('Hej')
  expect(result.status).toBe(200)
  expect(result.body).toContain('"event":"done"')
  expect(opened).toHaveBeenCalledTimes(1)
  expect(opened.mock.calls[0]).toHaveLength(1)
  expect(state.call).not.toHaveBeenCalled()
 })
 it('returns a controlled missing-key error without falling back',async()=>{
  vi.stubEnv('OPENAI_API_KEY','')
  const result=await post('Hej')
  expect(result.status).toBe(503)
  expect(JSON.parse(result.body).code).toBe('ATLAS_PROVIDER_NOT_CONFIGURED')
  expect(state.call).not.toHaveBeenCalled()
  expect(state.anthropic).not.toHaveBeenCalled()
 })
 it('reports insufficient quota through SSE without exposing raw provider details',async()=>{
  state.call.mockRejectedValueOnce(Object.assign(new Error('untrusted raw provider detail'),{status:429,code:'insufficient_quota'}))
  const result=await post('Hej')
  expect(result.body).toContain('ATLAS_OPENAI_INSUFFICIENT_CREDITS')
  expect(result.body).not.toContain('untrusted raw provider detail')
  expect(state.anthropic).not.toHaveBeenCalled()
 })
 it('rejects native website-plan approval before it can start any build',async()=>{
  const result=await post('Jag godkänner planen och vill starta bygget',{
   conversation_id:'22222222-2222-4222-8222-222222222222',websitePlanRef:{
    projectId:'33333333-3333-4333-8333-333333333333',planId:'44444444-4444-4444-8444-444444444444',
    revisionId:'55555555-5555-4555-8555-555555555555',sha256:'a'.repeat(64)}})
  expect(state.approve).not.toHaveBeenCalled()
  expect(result.status).toBe(403)
  expect(JSON.parse(result.body).code).toBe('ATLAS_PILOT_READ_ONLY')
  expect(state.call).not.toHaveBeenCalled()
 })
 it('offers only read/navigation tools on the full context path',async()=>{
  await post('Hur har mina projekt gått idag?')
  expect(state.call).toHaveBeenCalledTimes(1)
  const tools=state.call.mock.calls[0][1].tools.map((tool:any)=>tool.function.name)
  expect(tools).toContain('navigate')
  expect(tools).toContain('get_records')
  for(const name of ['ask_manager','trigger_workflow','delegate','start_website_build','run_media_step'])expect(tools).not.toContain(name)
  expect(state.anthropic).not.toHaveBeenCalled()
 })
})
