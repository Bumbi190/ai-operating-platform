import 'server-only';
import type {ManualCredential} from '../provider';
import {ManualProviderError} from '../provider';
import {validCandidateFor} from './provider';
import type {AttemptSnapshot,ReconciliationCandidate} from './types';
// Meta's IGUser.get_media and IGMedia fields, verified against the official
// facebook-python-business-sdk. Reads only; never create media or publish.
const fields='id,owner,caption,media_type,timestamp,permalink,media_url';
const id=(v:unknown):v is string=>typeof v==='string'&&/^[0-9]{1,80}$/.test(v);
function safeUrl(value:unknown,image=false){
 if(typeof value!=='string'||value.length>8192)throw new ManualProviderError('invalid_response');
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw Error();
  if(image?!/^scontent[.a-z0-9-]*[.](?:cdninstagram[.]com|fbcdn[.]net)$/.test(u.hostname):!['www.instagram.com','instagram.com'].includes(u.hostname)||!/^\/p\/[A-Za-z0-9_-]{1,128}\/?$/.test(u.pathname)||!!u.search)throw Error();
  return u.href;
 }catch{throw new ManualProviderError('invalid_response');}
}
export function instagramCandidate(c:ManualCredential,value:unknown):ReconciliationCandidate{
 const v=value as any;
 if(c.channel!=='instagram'||!id(c.accountId)||!v||!id(v.id)||v.owner?.id!==c.accountId||v.media_type!=='IMAGE'||typeof v.caption!=='string'||v.caption.length>2200||typeof v.timestamp!=='string'||!Number.isFinite(Date.parse(v.timestamp)))throw new ManualProviderError('invalid_response');
 return {id:v.id,providerId:v.id,accountId:c.accountId,createdAt:new Date(v.timestamp).toISOString(),text:v.caption,permalink:safeUrl(v.permalink),photoId:v.id,imageUrl:safeUrl(v.media_url,true)};
}
async function get(c:ManualCredential,path:string):Promise<any>{
 if(c.channel!=='instagram'||!id(c.accountId)||!/^https:\/\/graph[.](?:facebook|instagram)[.]com\/v[0-9]{1,2}[.][0-9]+$/.test(c.apiBase)||!c.token||c.token.length>16384||/[\u0000-\u0020\u007f]/.test(c.token))throw new ManualProviderError('invalid_response');
 try{
  const r=await fetch(c.apiBase+'/'+path,{method:'GET',headers:{Authorization:'Bearer '+c.token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});
  const reader=r.body?.getReader();if(!reader)throw Error();let length=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();throw Error();}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!r.ok||!v||typeof v!=='object'||Array.isArray(v)||v.error)throw Error();return v;
 }catch{throw new ManualProviderError('provider_unavailable');}
}
export async function listInstagramCandidates(c:ManualCredential,s:AttemptSnapshot):Promise<ReconciliationCandidate[]>{
 const result=await get(c,c.accountId+'/media?'+new URLSearchParams({fields,limit:'50'}));
 if(!Array.isArray(result.data)||result.data.length>50||result.paging?.next)throw new ManualProviderError('invalid_response');
 const candidates:ReconciliationCandidate[]=[];
 for(const value of result.data){try{const item=instagramCandidate(c,value);if(validCandidateFor(item,s))candidates.push(item);}catch{/* Non-image or incomplete entries are never selectable. */}}
 return candidates;
}
export async function readInstagramCandidate(c:ManualCredential,providerId:string):Promise<ReconciliationCandidate>{
 if(!id(providerId))throw new ManualProviderError('invalid_response');
 const candidate=instagramCandidate(c,await get(c,providerId+'?'+new URLSearchParams({fields})));
 if(candidate.providerId!==providerId)throw new ManualProviderError('invalid_response');return candidate;
}
