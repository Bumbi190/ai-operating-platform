import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import {openAIChatCompletion,type OpenAIGovernanceContext} from '@/lib/ai/openai-client'
import {openAITextOptions} from '@/lib/ai/atlas-model-policy'

type Params=Pick<Anthropic.MessageStreamParams,'model'|'max_tokens'|'system'|'messages'|'tools'|'tool_choice'>
type Result=Pick<Anthropic.Message,'content'|'stop_reason'>

/** Preserve the existing Atlas conversation/tool contract while only translating the wire format. */
function messagesForOpenAI(input:Params):OpenAI.Chat.ChatCompletionMessageParam[] {
 const output:OpenAI.Chat.ChatCompletionMessageParam[]=[]
 if(input.system){
  const system=typeof input.system==='string'?input.system:input.system.map(block=>{
   if(block.type!=='text')throw Error('UNSUPPORTED_ATLAS_SYSTEM_CONTENT')
   return block.text
  }).join('\n')
  output.push({role:'system',content:system})
 }
 for(const message of input.messages){
  if(typeof message.content==='string'){output.push({role:message.role,content:message.content});continue}
  if(message.role==='assistant'){
   const text:string[]=[],calls:OpenAI.Chat.ChatCompletionMessageToolCall[]=[]
   for(const block of message.content){
    if(block.type==='text')text.push(block.text)
    else if(block.type==='tool_use')calls.push({id:block.id,type:'function',function:{name:block.name,arguments:JSON.stringify(block.input)}})
    else throw Error('UNSUPPORTED_ATLAS_ASSISTANT_CONTENT')
   }
   output.push({role:'assistant',content:text.join('')||null,...(calls.length?{tool_calls:calls}:{})})
  }else{
   let content:OpenAI.Chat.ChatCompletionContentPart[]=[]
   const flush=()=>{if(content.length){output.push({role:'user',content});content=[]}}
   for(const block of message.content){
    if(block.type==='tool_result'){
     flush()
     const result=typeof block.content==='string'?block.content:(block.content??[]).map(item=>{
      if(item.type!=='text')throw Error('UNSUPPORTED_ATLAS_TOOL_RESULT')
      return item.text
     }).join('\n')
     output.push({role:'tool',tool_call_id:block.tool_use_id,content:result})
    }else if(block.type==='text')content.push({type:'text',text:block.text})
    else if(block.type==='image'&&block.source.type==='base64')content.push({type:'image_url',image_url:{url:'data:'+block.source.media_type+';base64,'+block.source.data}})
    else throw Error('UNSUPPORTED_ATLAS_USER_CONTENT')
   }
   flush()
  }
 }
 return output
}

export async function openAIAtlasStream(ctx:OpenAIGovernanceContext,input:Params,signal?:AbortSignal) {
 const tools=(input.tools??[]).map(tool=>{
  if('type' in tool && tool.type && tool.type!=='custom')throw Error('UNSUPPORTED_ATLAS_TOOL')
  return {type:'function' as const,function:{name:tool.name,description:tool.description,parameters:tool.input_schema}}
 })
 const choice=input.tool_choice
 const toolChoice=choice?.type==='tool'?{type:'function' as const,function:{name:choice.name}}:choice?.type==='any'?'required' as const:'auto' as const
 const stream=await openAIChatCompletion(ctx,{
  model:input.model,...openAITextOptions(input.model,input.max_tokens,0.7),
  messages:messagesForOpenAI(input),stream:true,stream_options:{include_usage:true},
  ...(tools.length?{tools,tool_choice:toolChoice,parallel_tool_calls:false}:{}),
 } as OpenAI.Chat.ChatCompletionCreateParams,{signal})
 let onText:(text:string)=>void=()=>{}
 let final:Promise<Result>|undefined
 const consume=async():Promise<Result>=>{
  let text='',finish:string|null=null
  const calls=new Map<number,{id:string;name:string;arguments:string}>()
  for await(const chunk of stream){
   const choice=chunk.choices?.[0]
   if(!choice)continue
   if(choice.finish_reason)finish=choice.finish_reason
   const delta=choice.delta
   if(delta?.content){text+=delta.content;onText(delta.content)}
   for(const part of delta?.tool_calls??[]){
    if(!Number.isSafeInteger(part.index)||part.index<0||part.index>=128)throw Error('INVALID_ATLAS_TOOL_CALL')
    const call=calls.get(part.index)??{id:'',name:'',arguments:''}
    call.id+=part.id??'';call.name+=part.function?.name??'';call.arguments+=part.function?.arguments??''
    calls.set(part.index,call)
   }
  }
  // Never execute partial JSON or filtered/truncated tools, and never retry here.
  if(finish!=='stop'&&finish!=='tool_calls')throw Error('Atlas svar avslutades innan det var komplett ('+(finish??'okänd orsak')+').')
  const content:Anthropic.ContentBlock[]=[]
  if(text)content.push({type:'text',text,citations:null})
  if(calls.size&&finish!=='tool_calls'||!calls.size&&finish==='tool_calls')throw Error('INVALID_ATLAS_TOOL_TERMINATION')
  const ids=new Set<string>()
  for(const [,call] of [...calls.entries()].sort(([a],[b])=>a-b)){
   if(!call.id||ids.has(call.id)||!tools.some(tool=>tool.function.name===call.name))throw Error('INVALID_ATLAS_TOOL_CALL')
   ids.add(call.id)
   const value=JSON.parse(call.arguments)
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_ATLAS_TOOL_ARGUMENTS')
   content.push({type:'tool_use',id:call.id,name:call.name,input:value})
  }
  return {content,stop_reason:finish==='tool_calls'?'tool_use':'end_turn'}
 }
 return {
  on(_event:'text',handler:(text:string)=>void){onText=handler;return this},
  finalMessage(){return final??=consume()},
 }
}
