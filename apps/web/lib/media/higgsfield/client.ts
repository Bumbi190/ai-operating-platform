import 'server-only'
import {Client,StreamableHTTPClientTransport,UnauthorizedError} from '@modelcontextprotocol/client'
import {createHiggsfieldFetch,HIGGSFIELD_MCP_URL} from './config'
import {HiggsfieldError} from './types'
import type {OAuthPayload} from './oauth'
export interface ReadOnlyMcpClient {
 listTools():Promise<{name:string;inputSchema:unknown}[]>
 callTool(name:string,args:Record<string,unknown>):Promise<unknown>
 close():Promise<void>
}
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)}
function schema(v:unknown,requiredKeys:string[]) {
 if(!object(v)||v.type!=='object')return false
 return v.required===undefined || Array.isArray(v.required)&&v.required.every(k=>typeof k==='string'&&requiredKeys.includes(k))
}
function prop(v:unknown,name:string):Record<string,unknown>|null {
 return object(v)&&object(v.properties)&&object(v.properties[name])?v.properties[name]:null
}
function data(result:unknown):Record<string,unknown> {
 if(!object(result)||result.isError===true)throw new HiggsfieldError('invalid_response')
 if(object(result.structuredContent))return result.structuredContent
 const c=result.content
 if(Array.isArray(c)&&c.length===1&&object(c[0])&&c[0].type==='text'&&typeof c[0].text==='string') {
  try {const d=JSON.parse(c[0].text);if(object(d))return d}catch{}
 }
 throw new HiggsfieldError('invalid_response')
}
function credits(v:unknown):number {
 if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw new HiggsfieldError('invalid_response')
 return v
}
export async function inspectReadOnlyClient(client:ReadOnlyMcpClient):Promise<{creditBalance:number;quoteCredits:number}> {
 const tools=await client.listTools()
 const find=(name:string)=>tools.filter(t=>t.name===name)
 const balances=find('balance'),models=find('models_get'),quotes=find('estimate_video_cost')
 const quote=quotes[0]?.inputSchema,params=prop(quote,'params')
 if(balances.length!==1||models.length!==1||quotes.length!==1||
 !schema(balances[0].inputSchema,[])||!schema(models[0].inputSchema,['model_id'])||prop(models[0].inputSchema,'model_id')?.type!=='string'||
 !schema(quote,['params'])||!schema(params,['model','duration','resolution','aspect_ratio','count'])||
 prop(params,'model')?.type!=='string'||prop(params,'duration')?.type!=='number'||prop(params,'aspect_ratio')?.type!=='string'||prop(params,'count')?.type!=='number'||
 !(prop(params,'resolution')?.type==='string'||params?.additionalProperties===true))
  throw new HiggsfieldError('unsupported_server_schema')
 const balance=data(await client.callTool('balance',{})),creditBalance=credits(balance.credits)
 const model=data(await client.callTool('models_get',{model_id:'grok_video_v15_lite'}))
 const range=model.duration_range
 const durationSupported=object(range)&&typeof range.min==='number'&&typeof range.max==='number'&&range.min<=4&&range.max>=4 || Array.isArray(model.durations)&&model.durations.includes(4)
 const resolution=Array.isArray(model.parameters)?model.parameters.find(p=>object(p)&&p.name==='resolution'):null
 if(model.id!=='grok_video_v15_lite'||!Array.isArray(model.aspect_ratios)||!model.aspect_ratios.includes('9:16')||!durationSupported||!object(resolution)||!Array.isArray(resolution.options)||!resolution.options.includes('720p'))throw new HiggsfieldError('unsupported_server_schema')
 // Fixed local arguments; no caller-controlled model, count, prompt, or media.
 const quoted=data(await client.callTool('estimate_video_cost',{params:{model:'grok_video_v15_lite',duration:4,resolution:'720p',aspect_ratio:'9:16',count:1}}))
 if(!object(quoted.cost))throw new HiggsfieldError('invalid_response')
 return {creditBalance,quoteCredits:credits(quoted.cost.credits_exact??quoted.cost.credits)}
}
export async function openHiggsfieldReadClient(payload:OAuthPayload,deadline=Date.now()+20000,delegate:typeof fetch=fetch):Promise<ReadOnlyMcpClient> {
 if(!payload.tokens?.access_token)throw new HiggsfieldError('reconnect_required')
 const remaining=()=>{const ms=deadline-Date.now();if(ms<=0)throw new HiggsfieldError('provider_unavailable');return ms}
 const controller=new AbortController()
 const options=()=>({signal:controller.signal,timeout:remaining(),maxTotalTimeout:remaining()})
 const client=new Client({name:'omnira-higgsfield-readonly',version:'1.0.0'},{capabilities:{}})
 const transport=new StreamableHTTPClientTransport(new URL(HIGGSFIELD_MCP_URL),{
  authProvider:{token:async()=>payload.tokens!.access_token},
  fetch:createHiggsfieldFetch(delegate,remaining()),
 })
 // A failed SSE reader does not settle SDK requests. Cancel requests and close
 // the transport at the same absolute deadline, including initialization.
 const timer=setTimeout(()=>{controller.abort();void client.close().catch(()=>{})},remaining())
 const close=async()=>{clearTimeout(timer);controller.abort();await client.close()}
 try {await client.connect(transport,options())} catch(e) {
  clearTimeout(timer);controller.abort()
  await client.close().catch(()=>{})
  if(e instanceof UnauthorizedError)throw new HiggsfieldError('reconnect_required')
  throw new HiggsfieldError('provider_unavailable')
 }
 return {
  async listTools(){
   const collected:{name:string;inputSchema:unknown}[]=[]
   let cursor:string|undefined
   for(let i=0;i<64;i++){
    const page=await client.listTools(cursor?{cursor}:undefined,options())
    collected.push(...page.tools)
    if(!page.nextCursor)return collected
    cursor=page.nextCursor
   }
   throw new HiggsfieldError('unsupported_server_schema')
  },
  async callTool(name,args){
   if(!['balance','models_get','estimate_video_cost'].includes(name))throw new HiggsfieldError('access_denied')
   try{return await client.callTool({name,arguments:args},options())}
   catch(e){if(e instanceof UnauthorizedError)throw new HiggsfieldError('reconnect_required');throw new HiggsfieldError('provider_unavailable')}
  },
  close
 }
}
