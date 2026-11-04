import {SalesError} from '../types'
import {fields,salesId,text,normalizeSalesEmail} from '../validate'
import {DISCOVERY_CITIES,DISCOVERY_CATEGORIES,type DiscoveryQuery,type DiscoverInput,type DiscoveryReview,type DiscoveryPromotion} from './types'
export function discoveryText(v:unknown,max:number,min=1):string{const s=text(v,max,min);if(/[\u0000-\u001f\u007f-\u009f]/.test(s))throw new SalesError('INVALID_BODY');return s}
export function publicWebsite(v:unknown,httpsOnly=false):string|null{
 if(v===null||v===undefined||v==='')return null
 if(typeof v!=='string'||v.length>2048||/[\u0000-\u0020\u007f-\u009f]/.test(v))return null
 try{const u=new URL(v),h=u.hostname.toLowerCase()
  if(!(httpsOnly?u.protocol==='https:':['http:','https:'].includes(u.protocol))||u.username||u.password||u.port||u.hash)return null
  if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(h)||/\.(?:localhost|local|localdomain|internal|lan|home|arpa|corp|intranet|test|invalid|onion)$/.test(h))return null
  return u.href
 }catch{return null}
}
export function websiteKey(v:string|null):string|null{return v?new URL(v).hostname.toLowerCase().replace(/^www\./,''):null}
function positiveVersion(v:unknown):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>2147483647)throw new SalesError('INVALID_BODY');return v}
export function parseDiscoveryQuery(v:unknown):DiscoveryQuery{
 fields(v,['city','category','radiusKm','limit'])
 if(typeof v.city!=='string'||!Object.prototype.hasOwnProperty.call(DISCOVERY_CITIES,v.city)||typeof v.category!=='string'||!Object.prototype.hasOwnProperty.call(DISCOVERY_CATEGORIES,v.category)||typeof v.radiusKm!=='number'||!Number.isInteger(v.radiusKm)||v.radiusKm<1||v.radiusKm>25||typeof v.limit!=='number'||!Number.isInteger(v.limit)||v.limit<1||v.limit>25)throw new SalesError('INVALID_BODY')
 return {city:v.city as DiscoveryQuery['city'],category:v.category as DiscoveryQuery['category'],radiusKm:v.radiusKm,limit:v.limit}
}
export function parseDiscoverInput(v:unknown):DiscoverInput{fields(v,['projectId','idempotencyKey','query']);return {projectId:salesId(v.projectId),idempotencyKey:salesId(v.idempotencyKey),query:parseDiscoveryQuery(v.query)}}
export function parseDiscoveryReview(v:unknown):DiscoveryReview{
 fields(v,['projectId','candidateId','expectedVersion','decision','note']);if(!['rejected','excluded','suppressed'].includes(String(v.decision)))throw new SalesError('INVALID_BODY')
 return {projectId:salesId(v.projectId),candidateId:salesId(v.candidateId),expectedVersion:positiveVersion(v.expectedVersion),decision:v.decision as DiscoveryReview['decision'],note:discoveryText(v.note,500)}
}
export function parseDiscoveryPromotion(v:unknown):DiscoveryPromotion{
 fields(v,['projectId','candidateId','expectedVersion','companyName','branchName','email','websiteUrl','reviewNote','businessConfirmed','emailConfirmed','offerKind','pilotMonths'])
 if(v.businessConfirmed!==true||v.emailConfirmed!==true||!['pilot','general_service'].includes(String(v.offerKind)))throw new SalesError('INVALID_BODY')
 if(v.offerKind==='pilot'?![2,6,12].includes(v.pilotMonths as number):v.pilotMonths!==null)throw new SalesError('INVALID_BODY')
 const websiteUrl=publicWebsite(v.websiteUrl,true);if(v.websiteUrl!==null&&!websiteUrl)throw new SalesError('INVALID_BODY')
 return {projectId:salesId(v.projectId),candidateId:salesId(v.candidateId),expectedVersion:positiveVersion(v.expectedVersion),companyName:discoveryText(v.companyName,200),branchName:discoveryText(v.branchName,200,0),email:normalizeSalesEmail(discoveryText(v.email,254)),websiteUrl,reviewNote:discoveryText(v.reviewNote,500),businessConfirmed:true,emailConfirmed:true,offerKind:v.offerKind as DiscoveryPromotion['offerKind'],pilotMonths:v.pilotMonths as DiscoveryPromotion['pilotMonths']}
}
