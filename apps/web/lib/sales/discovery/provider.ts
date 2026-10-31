import 'server-only'
import {SalesError} from '../types'
import {normalizeSalesEmail} from '../validate'
import {DISCOVERY_CITIES,DISCOVERY_CATEGORIES,type DiscoveryQuery,type PublicBusiness} from './types'
import {parseDiscoveryQuery,publicWebsite,websiteKey} from './validate'

export const OVERPASS_ENDPOINT='https://overpass-api.de/api/interpreter'
// Fixed honest identity required by the public operator; never spoof or rotate it.
export const OVERPASS_USER_AGENT='Omnira-Harvey-B2B/1.0 (+https://github.com/Bumbi190/ai-operating-platform)'
export const MAX_PROVIDER_BYTES=262144
// Public Overpass may queue up to 15s before its bounded 10s query runs.
export const PROVIDER_TIMEOUT_MS=27000
export function discoveryEndpoint(env:Readonly<Record<string,string|undefined>>=process.env):string{
 const configured=env.ATLAS_SALES_DISCOVERY_OVERPASS_URL,production=env.NODE_ENV==='production'||env.VERCEL==='1'
 if(configured===undefined){if(production)throw new SalesError('DISCOVERY_SOURCE_NOT_CONFIGURED',503);return OVERPASS_ENDPOINT}
 const endpoint=publicWebsite(configured,true)
 if(!endpoint)throw new SalesError('DISCOVERY_SOURCE_NOT_CONFIGURED',503)
 const host=new URL(endpoint).hostname
 // The community instance is a local manual proof source, not this commercial app's production backend.
 if(production&&(host==='overpass-api.de'||host.endsWith('.overpass-api.de')||host.endsWith('.openstreetmap.de')))throw new SalesError('DISCOVERY_SOURCE_NOT_CONFIGURED',503)
 return endpoint
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)

export function buildOverpassQuery(value:DiscoveryQuery):string{
 const q=parseDiscoveryQuery(value),city=DISCOVERY_CITIES[q.city],category=DISCOVERY_CATEGORIES[q.category]
 return `[out:json][timeout:10][maxsize:16777216];nwr["${category.key}"="${category.value}"]["name"](around:${q.radiusKm*1000},${city.lat},${city.lon});out tags center ${q.limit};`
}
function safeEmail(value:unknown):string|null{
 if(typeof value!=='string'||value.length>254)return null
 try{return normalizeSalesEmail(value)}catch{return null}
}
export function parseOverpassResponse(value:unknown,valueQuery:DiscoveryQuery):PublicBusiness[]{
 const query=parseDiscoveryQuery(valueQuery)
 if(!object(value)||value.remark!==undefined||!Array.isArray(value.elements))throw new SalesError('DISCOVERY_PROVIDER_UNAVAILABLE',503)
 if(value.elements.length>query.limit)throw new SalesError('DISCOVERY_RESPONSE_TOO_LARGE',502)
 const rows:PublicBusiness[]=[],sources=new Set<string>(),domains=new Set<string>(),emails=new Set<string>(),category=DISCOVERY_CATEGORIES[query.category]
 for(const raw of value.elements){
  if(!object(raw)||!['node','way','relation'].includes(String(raw.type))||typeof raw.id!=='number'||!Number.isSafeInteger(raw.id)||raw.id<1||!object(raw.tags))continue
  const tags=raw.tags,name=tags.name
  if(tags[category.key]!==category.value||typeof name!=='string'||name.trim().length<2||name.length>200||/[\u0000-\u001f\u007f-\u009f]/.test(name))continue
  const sourceId=`${raw.type}/${raw.id}`,websiteUrl=publicWebsite(tags['contact:website']??tags.website),email=safeEmail(tags['contact:email']??tags.email),domain=websiteKey(websiteUrl)
  if(sources.has(sourceId)||(domain&&domains.has(domain))||(email&&emails.has(email)))continue
  sources.add(sourceId);if(domain)domains.add(domain);if(email)emails.add(email)
  rows.push({sourceId,sourceUrl:`https://www.openstreetmap.org/${sourceId}`,name:name.trim(),websiteUrl,email})
 }
 return rows
}
async function boundedJson(response:Response):Promise<unknown>{
 const declared=response.headers.get('content-length')
 if(declared&&Number(declared)>MAX_PROVIDER_BYTES){await response.body?.cancel();throw new SalesError('DISCOVERY_RESPONSE_TOO_LARGE',502)}
 const reader=response.body?.getReader();if(!reader)throw new SalesError('DISCOVERY_PROVIDER_UNAVAILABLE',503)
 let count=0;const chunks:Uint8Array[]=[]
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>MAX_PROVIDER_BYTES){await reader.cancel();throw new SalesError('DISCOVERY_RESPONSE_TOO_LARGE',502)}chunks.push(value)}
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new SalesError('DISCOVERY_PROVIDER_UNAVAILABLE',503)}
}
export async function discoverPublicBusinesses(value:DiscoveryQuery,fetcher:typeof fetch=fetch):Promise<{candidates:PublicBusiness[];retrievedAt:string}>{
 const query=parseDiscoveryQuery(value),endpoint=discoveryEndpoint(),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new SalesError('DISCOVERY_PROVIDER_TIMEOUT',504))},PROVIDER_TIMEOUT_MS)})
 try{
  return await Promise.race([(async()=>{
   const response=await fetcher(endpoint,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':OVERPASS_USER_AGENT},body:new URLSearchParams({data:buildOverpassQuery(query)}).toString()})
   if(response.status===429){await response.body?.cancel();throw new SalesError('DISCOVERY_RATE_LIMITED',429)}
   if(!response.ok){await response.body?.cancel();throw new SalesError('DISCOVERY_PROVIDER_UNAVAILABLE',503)}
   return {candidates:parseOverpassResponse(await boundedJson(response),query),retrievedAt:new Date().toISOString()}
  })(),timeout])
 }catch(e){if(e instanceof SalesError)throw e;throw new SalesError(controller.signal.aborted?'DISCOVERY_PROVIDER_TIMEOUT':'DISCOVERY_PROVIDER_UNAVAILABLE',controller.signal.aborted?504:503)}
 finally{if(timer)clearTimeout(timer);controller.abort()}
}
