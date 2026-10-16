import type {SocialContentInput} from './types'
import {SocialContentError} from './types'
import {SOCIAL_LAUNCH_CHANNELS} from '../catalog'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export function contentId(value:unknown):asserts value is string{if(typeof value!=='string'||!uuid.test(value))throw new SocialContentError('INVALID_BODY')}
export function contentFields(input:unknown,keys:string[]):asserts input is Record<string,unknown>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw new SocialContentError('INVALID_BODY')}
export function parseSocialContent(input:unknown,checkFuture=true):SocialContentInput{
 contentFields(input,['channel','format','title','text','linkUrl','mediaIds','mediaBrief','scheduledAt'])
 const c=SOCIAL_LAUNCH_CHANNELS.find(c=>c.id===input.channel)
 if(!c||!c.formats.includes(input.format as never))throw new SocialContentError('INVALID_BODY')
 for(const [key,min,max] of [['title',1,150],['text',1,5000],['mediaBrief',0,1000]] as const){const v=input[key];if(typeof v!=='string'||v.trim().length<min||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw new SocialContentError('INVALID_BODY')}
 if(input.linkUrl!==null){
  if(typeof input.linkUrl!=='string'||input.linkUrl.length>2048)throw new SocialContentError('INVALID_BODY')
  try{const u=new URL(input.linkUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error()}catch{throw new SocialContentError('INVALID_BODY')}
 }
 if(input.format==='link'&&!input.linkUrl)throw new SocialContentError('INVALID_BODY')
 if(!Array.isArray(input.mediaIds)||input.mediaIds.length>10||new Set(input.mediaIds).size!==input.mediaIds.length)throw new SocialContentError('INVALID_BODY')
 input.mediaIds.forEach(contentId)
 if(input.scheduledAt!==null){
  if(typeof input.scheduledAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.scheduledAt))throw new SocialContentError('INVALID_BODY')
  const time=Date.parse(input.scheduledAt)
  if(!Number.isFinite(time)||new Date(time).toISOString()!==input.scheduledAt||(checkFuture&&(time<=Date.now()||time>Date.now()+366*86400000)))throw new SocialContentError('INVALID_BODY')
 }
 return input as unknown as SocialContentInput
}
/** Reject DST gaps and duplicate local times instead of guessing an offset. */
export function stockholmToUtc(local:string):string{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw Error('INVALID_TIME')
 const naive=Date.parse(local+':00Z'),matches:string[]=[]
 if(!Number.isFinite(naive))throw Error('INVALID_TIME')
 const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
 for(const offset of [60,120]){const date=new Date(naive-offset*60000),shown=formatter.format(date).replace(' ','T');if(shown===local)matches.push(date.toISOString())}
 if(matches.length!==1)throw Error('INVALID_TIME')
 return matches[0]
}
export function stockholmLocal(utc:string):string{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(utc)).replace(' ','T')}
