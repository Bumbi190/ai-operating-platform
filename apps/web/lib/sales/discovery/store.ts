import 'server-only'
import type {SalesPrincipal} from '../types'
import {SalesError} from '../types'
import {salesId} from '../validate'
import {salesRpc,scoped,type SalesDb} from '../store'
import {discoveryBaselineReasons} from './exclusions'
import {parseDiscoverInput,parseDiscoveryReview,parseDiscoveryPromotion} from './validate'
import type {DiscoverInput,StoredDiscoveryReport,DiscoveryCandidate,DiscoveryReview,DiscoveryPromotion,DiscoveryPromotionResult,PublicBusiness} from './types'
function call<T>(db:SalesDb,p:SalesPrincipal,projectId:string,name:string,input:unknown){scoped(p,projectId);return salesRpc<T>(db,name,{p_principal:p,p_input:input})}
export function readDiscoveryReport(db:SalesDb,p:SalesPrincipal,projectId:string,batchId:string|null=null):Promise<StoredDiscoveryReport>{return call(db,p,projectId,'sales_discovery_read',{projectId:salesId(projectId),batchId:batchId===null?null:salesId(batchId)})}
export async function beginDiscoveryBatch(db:SalesDb,p:SalesPrincipal,value:DiscoverInput):Promise<{batchId:string;fetchRequired:boolean}>{
 const input=parseDiscoverInput(value),result=await call<{batchId?:string;fetchRequired:boolean;rateLimited?:boolean}>(db,p,input.projectId,'sales_discovery_begin',input)
 if(result.rateLimited)throw new SalesError('DISCOVERY_RATE_LIMITED',429)
 if(!result.batchId)throw new SalesError('UNAVAILABLE',503)
 return {batchId:salesId(result.batchId),fetchRequired:result.fetchRequired===true}
}
export function finishDiscoveryBatch(db:SalesDb,p:SalesPrincipal,projectId:string,batchId:string,result:{candidates:PublicBusiness[];retrievedAt:string}){return call(db,p,projectId,'sales_discovery_finish',{projectId,batchId,retrievedAt:result.retrievedAt,candidates:result.candidates.map(candidate=>({...candidate,exclusions:discoveryBaselineReasons(projectId,candidate)}))})}
export function failDiscoveryBatch(db:SalesDb,p:SalesPrincipal,projectId:string,batchId:string,errorCode:string){return call(db,p,projectId,'sales_discovery_fail',{projectId,batchId,errorCode})}
export function reviewDiscoveryCandidate(db:SalesDb,p:SalesPrincipal,value:DiscoveryReview){const input=parseDiscoveryReview(value);return call<DiscoveryCandidate>(db,p,input.projectId,'sales_discovery_review',input)}
export async function promoteDiscoveryCandidate(db:SalesDb,p:SalesPrincipal,value:DiscoveryPromotion):Promise<DiscoveryPromotionResult>{
 const input=parseDiscoveryPromotion(value),candidate=await call<DiscoveryCandidate>(db,p,input.projectId,'sales_discovery_candidate',{projectId:input.projectId,candidateId:input.candidateId})
 const baselineReasons=[...new Set([...discoveryBaselineReasons(input.projectId,candidate),...discoveryBaselineReasons(input.projectId,{name:input.companyName,websiteUrl:input.websiteUrl})])].sort()
 return call(db,p,input.projectId,'sales_discovery_promote',{...input,baselineReasons})
}
