import 'server-only'
import type {ManualCredential} from '../provider'
import {ManualProviderError} from '../provider'
import type {AttemptSnapshot,ReconciliationCandidate} from './types'
// Meta's generated Page.get_published_posts and PagePost fields/attachments contract:
// facebook/facebook-python-business-sdk, verified 2026-10-18 against the owned
// Family photo post with its existing Page credential. GET only; fields below.
// The first 50 published posts are locally window-filtered; no paging URL is followed.
const fields='id,from,message,created_time,permalink_url,attachments{type,target,media}'
const id=(v:unknown)=>typeof v==='string'&&/^[0-9]{1,80}$/.test(v)
function safeUrl(v:unknown,photo=false):string{
 if(typeof v!=='string'||v.length>8192)throw new ManualProviderError('invalid_response')
 try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||(!photo?u.hostname!=='www.facebook.com':!/^scontent[.a-z0-9-]*[.]fbcdn[.]net$/.test(u.hostname)))throw Error();return u.href}catch{throw new ManualProviderError('invalid_response')}
}
export function facebookCandidate(c:ManualCredential,value:unknown):ReconciliationCandidate{
 const v=value as any,a=v?.attachments?.data
 if(c.channel!=='facebook'||!id(c.accountId)||!v||typeof v.id!=='string'||!new RegExp('^'+c.accountId+'_[0-9]{1,80}$').test(v.id)||v.from?.id!==c.accountId||typeof v.message!=='string'||v.message.length>63206||typeof v.created_time!=='string'||!Number.isFinite(Date.parse(v.created_time))||!Array.isArray(a)||a.length!==1||a[0]?.type!=='photo'||!id(a[0]?.target?.id))throw new ManualProviderError('invalid_response')
 return {id:v.id,providerId:v.id,accountId:c.accountId,createdAt:new Date(v.created_time).toISOString(),text:v.message,permalink:safeUrl(v.permalink_url),photoId:a[0].target.id,imageUrl:safeUrl(a[0].media?.image?.src,true)}
}
export function validCandidateFor(c:ReconciliationCandidate,s:AttemptSnapshot){
 const requested=Date.parse(s.publication.requestedAt),created=Date.parse(c.createdAt)
 return c.accountId===s.publication.accountId&&c.text===s.revision.draft.text&&Number.isFinite(requested)&&created>=requested-60000&&created<=requested+300000
}
async function get(c:ManualCredential,path:string):Promise<any>{
 if(c.channel!=='facebook'||!id(c.accountId)||!/^https:\/\/graph[.]facebook[.]com\/v[0-9]{1,2}[.][0-9]+$/.test(c.apiBase)||!c.token||c.token.length>16384||/[\u0000-\u0020\u007f]/.test(c.token))throw new ManualProviderError('invalid_response')
 try{
  const r=await fetch(c.apiBase+'/'+path,{method:'GET',headers:{Authorization:'Bearer '+c.token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)})
  const reader=r.body?.getReader();if(!reader)throw Error()
  let length=0;const chunks:Uint8Array[]=[]
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();throw Error()}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(length);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.length}
  const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  if(!r.ok||!v||typeof v!=='object'||v.error)throw Error()
  return v
 }catch{throw new ManualProviderError('provider_unavailable')}
}
export async function listFacebookCandidates(c:ManualCredential,s:AttemptSnapshot):Promise<ReconciliationCandidate[]>{
 const result=await get(c,c.accountId+'/published_posts?'+new URLSearchParams({fields,limit:'50'}))
 if(!Array.isArray(result.data)||result.data.length>50)throw new ManualProviderError('invalid_response')
 const candidates:ReconciliationCandidate[]=[]
 for(const value of result.data){try{const item=facebookCandidate(c,value);if(validCandidateFor(item,s))candidates.push(item)}catch{/* Unrelated text/video posts are not selectable. */}}
 return candidates
}
export async function readFacebookCandidate(c:ManualCredential,providerId:string):Promise<ReconciliationCandidate>{
 if(!new RegExp('^'+c.accountId+'_[0-9]{1,80}$').test(providerId))throw new ManualProviderError('invalid_response')
 return facebookCandidate(c,await get(c,providerId+'?'+new URLSearchParams({fields})))
}
