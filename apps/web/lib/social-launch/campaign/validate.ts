import {resolveStockholmSchedule} from '../scheduling/time'
import {CampaignError,type CampaignInput} from './types'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export function campaignObject(value:unknown,keys:readonly string[]):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))throw new CampaignError('INVALID_BODY')
}
export function campaignId(value:unknown):asserts value is string{if(typeof value!=='string'||!uuid.test(value))throw new CampaignError('INVALID_BODY')}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new CampaignError('INVALID_BODY');return value}
export function parseCampaignInput(value:unknown,now=new Date().toISOString(),replay=false):CampaignInput{
 campaignObject(value,['projectId','campaignId','planRevisionId','profileRevisionId','idempotencyKey','items'])
 for(const key of ['projectId','campaignId','planRevisionId','profileRevisionId'])campaignId(value[key])
 if(typeof value.idempotencyKey!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(value.idempotencyKey)||!Array.isArray(value.items)||value.items.length<1||value.items.length>3)throw new CampaignError('INVALID_BODY')
 const at=Date.parse(now);if(!Number.isFinite(at))throw new CampaignError('INVALID_BODY')
 const slots=new Set<string>(),copies=new Set<string>()
 const items=value.items.map(raw=>{
  campaignObject(raw,['title','text','imagePrompt','localMinute'])
  let scheduledAt:string
  try{scheduledAt=resolveStockholmSchedule(raw.localMinute as string)}catch{throw new CampaignError('INVALID_BODY')}
  const date=Date.parse(scheduledAt)
  if((!replay&&(date<=at||date>at+366*86400000))||slots.has(scheduledAt))throw new CampaignError('INVALID_BODY')
  const copy=text(raw.text,5000).trim().toLowerCase();if(copies.has(copy))throw new CampaignError('INVALID_BODY');copies.add(copy)
  slots.add(scheduledAt)
  return {title:text(raw.title,150),text:text(raw.text,5000),imagePrompt:text(raw.imagePrompt,2000),localMinute:raw.localMinute as string,scheduledAt}
 })
 return {...value,items} as CampaignInput
}
