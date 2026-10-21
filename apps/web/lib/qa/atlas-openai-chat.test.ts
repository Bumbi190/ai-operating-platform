import {beforeEach,it,expect,vi} from 'vitest'
const call=vi.hoisted(()=>vi.fn())
vi.mock('server-only',()=>({}))
vi.mock('@/lib/ai/openai-client',()=>({openAIChatCompletion:call}))
import {openAIAtlasStream} from '@/lib/atlas/openai-chat'
import {GLOBAL_ONLY} from '@/lib/governance/execution-stop'
const ctx={project:{projectId:'p'},execution:{context:'OPERATOR_INTERACTIVE' as const,scope:GLOBAL_ONLY},agent:'Atlas',operation:'Atlas Chat'}
const input={model:'gpt-5.4-mini',max_tokens:150,system:'System',tools:[{name:'get_current_time',description:'Time',input_schema:{type:'object' as const,properties:{}}}],tool_choice:{type:'any' as const},messages:[{role:'user' as const,content:'Tid?'}]}
function chunks(items:any[]){return {async *[Symbol.asyncIterator](){for(const x of items)yield {choices:[{index:0,...x}]}}}}
beforeEach(()=>vi.clearAllMocks())
it('streams text and reconstructs fragmented tool arguments before exposing a tool call',async()=>{
 call.mockResolvedValue(chunks([{delta:{content:'Kollar ',tool_calls:[{index:0,id:'call-1',function:{name:'get_current_time',arguments:'{"zone"'}}]}},{delta:{content:'nu',tool_calls:[{index:0,function:{arguments:':"UTC"}'}}]},finish_reason:'tool_calls'}]))
 const stream=await openAIAtlasStream(ctx,input)
 const text:string[]=[];stream.on('text',s=>text.push(s))
 const response=await stream.finalMessage()
 expect(text.join('')).toBe('Kollar nu')
 expect(response).toMatchObject({stop_reason:'tool_use',content:[{type:'text',text:'Kollar nu'},{type:'tool_use',id:'call-1',name:'get_current_time',input:{zone:'UTC'}}]})
 expect(call.mock.calls[0][1]).toMatchObject({tool_choice:'required',max_completion_tokens:150,reasoning_effort:'none',stream:true})
})
it('preserves assistant tool calls, tool results and image reference content across turns',async()=>{
 call.mockResolvedValue(chunks([{delta:{content:'Svar'},finish_reason:'stop'}]))
 const messages:any=[...input.messages,{role:'assistant',content:[{type:'text',text:'Kollar'},{type:'tool_use',id:'call-1',name:'get_current_time',input:{zone:'UTC'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'call-1',content:'{"ok":true}'},{type:'text',text:'Här är bilden'},{type:'image',source:{type:'base64',media_type:'image/png',data:'YWJj'}}]}]
 const stream=await openAIAtlasStream(ctx,{...input,messages})
 await stream.finalMessage()
 expect(call.mock.calls[0][1].messages).toEqual([{role:'system',content:'System'},{role:'user',content:'Tid?'},{role:'assistant',content:'Kollar',tool_calls:[{id:'call-1',type:'function',function:{name:'get_current_time',arguments:'{"zone":"UTC"}'}}]},{role:'tool',tool_call_id:'call-1',content:'{"ok":true}'},{role:'user',content:[{type:'text',text:'Här är bilden'},{type:'image_url',image_url:{url:'data:image/png;base64,YWJj'}}]}])
})
it.each(['length','content_filter'])('never exposes partial tool calls on %s termination',async reason=>{
 call.mockResolvedValue(chunks([{delta:{tool_calls:[{index:0,id:'call-1',function:{name:'get_current_time',arguments:'{'}}]},finish_reason:reason}]))
 const stream=await openAIAtlasStream(ctx,input)
 await expect(stream.finalMessage()).rejects.toThrow()
 expect(call).toHaveBeenCalledTimes(1)
})
it('rejects invalid tool JSON without a provider retry',async()=>{
 call.mockResolvedValue(chunks([{delta:{tool_calls:[{index:0,id:'call-1',function:{name:'get_current_time',arguments:'nope'}}]},finish_reason:'tool_calls'}]))
 await expect((await openAIAtlasStream(ctx,input)).finalMessage()).rejects.toThrow()
 expect(call).toHaveBeenCalledTimes(1)
})
