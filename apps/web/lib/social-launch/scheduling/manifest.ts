import {createHash} from 'node:crypto'
import {ScheduleError,type ScheduleManifest,type ScheduleItem} from './types'
import {resolveStockholmSchedule,monthlyReleaseSlot,stockholmWeek} from './time'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,sha=/^[a-f0-9]{64}$/
function fields(v:unknown,keys:string[]):asserts v is Record<string,any>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))throw new ScheduleError('INVALID_BODY')
}
function canonical(v:any):string{
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']'
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
 return JSON.stringify(v)
}
export function manifestHash(manifest:ScheduleManifest){return createHash('sha256').update(canonical(manifest)).digest('hex')}
export function validateManifest(input:unknown,now:string):ScheduleManifest{
 fields(input,['projectId','items'])
 const stamp=Date.parse(now)
 if(!Number.isFinite(stamp)||!uuid.test(input.projectId)||!Array.isArray(input.items)||input.items.length<1||input.items.length>6)throw new ScheduleError('INVALID_BODY')
 const seenPosts=new Set<string>(),occasions=new Map<string,{time:string;kind:string;condition:string;channels:Set<string>}>(),weeks=new Map<string,Set<string>>(),months=new Set<string>()
 for(const item of input.items){
  fields(item,['postId','revisionId','sha256','decisionId','planRevisionId','bindingId','accountId','channel','asset','localMinute','scheduledAt','expiresAt','occasionId','kind','releaseCondition'])
  if(['postId','revisionId','decisionId','planRevisionId','bindingId','occasionId'].some(k=>typeof item[k]!=='string'||!uuid.test(item[k]))||!sha.test(item.sha256)||typeof item.accountId!=='string'||!/^[0-9]{1,80}$/.test(item.accountId)||!['facebook','instagram'].includes(item.channel)||!['ordinary','month_release'].includes(item.kind))throw new ScheduleError('INVALID_BODY')
  fields(item.asset,['id','sha256']);if(!uuid.test(item.asset.id)||!sha.test(item.asset.sha256))throw new ScheduleError('INVALID_BODY')
  const scheduled=resolveStockholmSchedule(item.localMinute),at=Date.parse(scheduled)
  if(item.scheduledAt!==scheduled||at<=stamp||at>stamp+366*86400000||item.expiresAt!==new Date(at+600000).toISOString()||seenPosts.has(item.postId))throw new ScheduleError('INVALID_BODY')
  seenPosts.add(item.postId)
  if(item.kind==='month_release'){
   fields(item.releaseCondition,['releaseMonth','catalogSha256'])
   const slot=monthlyReleaseSlot(item.releaseCondition.releaseMonth),key=item.releaseCondition.releaseMonth+':'+item.channel
   if(slot.scheduledAt!==scheduled||!sha.test(item.releaseCondition.catalogSha256)||months.has(key))throw new ScheduleError('INVALID_BODY')
   months.add(key)
  }else if(item.releaseCondition!==null)throw new ScheduleError('INVALID_BODY')
  const prior=occasions.get(item.occasionId),condition=canonical(item.releaseCondition)
  if(prior&&(prior.time!==scheduled||prior.kind!==item.kind||prior.condition!==condition||prior.channels.has(item.channel)))throw new ScheduleError('INVALID_BODY')
  const occasion=prior??{time:scheduled,kind:item.kind,condition,channels:new Set<string>()}
  occasion.channels.add(item.channel);occasions.set(item.occasionId,occasion)
  const week=stockholmWeek(item.localMinute),set=weeks.get(week)??new Set<string>();set.add(item.occasionId);weeks.set(week,set)
  if(occasion.channels.size>2||set.size>3)throw new ScheduleError('INVALID_BODY')
 }
 // JSON round-trip returns a detached snapshot; no caller-owned nested references.
 return JSON.parse(JSON.stringify(input)) as ScheduleManifest
}
