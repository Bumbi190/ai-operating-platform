import 'server-only'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {SalesError} from '../types'
import {salesId,fields} from '../validate'
import {scoped,type SalesDb} from '../store'
import {salesEnabled} from '../feature'
import {salesHeaders,failure,readBody} from '../http'
import {discoverPublicBusinesses,discoverySourceConfigured} from './provider'
import {parseDiscoverInput,parseDiscoveryReview,parseDiscoveryPromotion} from './validate'
import {readDiscoveryReport,beginDiscoveryBatch,finishDiscoveryBatch,failDiscoveryBatch,reviewDiscoveryCandidate,promoteDiscoveryCandidate} from './store'

type Dependencies={access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean;discover:typeof discoverPublicBusinesses;sourceConfigured:()=>boolean}
export function createDiscoveryApi(deps:Dependencies){return async(request:Request):Promise<Response>=>{
 try{
  const principal=await deps.access();if(!principal.ok)return principal.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({code:'ORIGIN_REQUIRED'},{status:403,headers:salesHeaders})
  if(request.method==='GET'){
   const url=new URL(request.url)
   if([...url.searchParams.keys()].some(k=>!['projectId','batchId'].includes(k))||url.searchParams.getAll('projectId').length!==1||url.searchParams.getAll('batchId').length>1)throw new SalesError('INVALID_BODY')
   const projectId=salesId(url.searchParams.get('projectId')),batchId=url.searchParams.has('batchId')?salesId(url.searchParams.get('batchId')):null
   scoped(principal,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
   return Response.json({...await readDiscoveryReport(deps.db(),principal,projectId,batchId),sourceConfigured:deps.sourceConfigured()},{headers:salesHeaders})
  }
  const raw=await readBody(request)
  fields(raw,['operation','projectId','idempotencyKey','query','candidateId','expectedVersion','decision','note','companyName','branchName','email','websiteUrl','reviewNote','businessConfirmed','emailConfirmed','offerKind','pilotMonths'])
  const {operation,...value}=raw
  if(!['discover','review','promote'].includes(String(operation)))throw new SalesError('INVALID_BODY')
  const input=operation==='discover'?parseDiscoverInput(value):operation==='review'?parseDiscoveryReview(value):parseDiscoveryPromotion(value)
  scoped(principal,input.projectId);if(!deps.enabled(input.projectId))throw new SalesError('NOT_FOUND',404)
  const db=deps.db()
  if(operation==='discover'){
   const queryInput=parseDiscoverInput(input),batch=await beginDiscoveryBatch(db,principal,queryInput)
   if(batch.fetchRequired){
    // Failure in either phase closes a still-pending batch; completion is immutable here.
    let phase:'provider'|'store'='provider'
    try{
     const result=await deps.discover(queryInput.query)
     phase='store'
     await finishDiscoveryBatch(db,principal,input.projectId,batch.batchId,result)
    }catch(e){
     const code=phase==='store'?'DISCOVERY_STORE_UNAVAILABLE':e instanceof SalesError&&['DISCOVERY_RATE_LIMITED','DISCOVERY_PROVIDER_TIMEOUT','DISCOVERY_RESPONSE_TOO_LARGE','DISCOVERY_PROVIDER_UNAVAILABLE','DISCOVERY_SOURCE_NOT_CONFIGURED'].includes(e.code)?e.code:'DISCOVERY_PROVIDER_UNAVAILABLE'
     try{await failDiscoveryBatch(db,principal,input.projectId,batch.batchId,code)}catch{throw new SalesError('DISCOVERY_STORE_UNAVAILABLE',503)}
     throw new SalesError(code,code==='DISCOVERY_RATE_LIMITED'?429:code==='DISCOVERY_PROVIDER_TIMEOUT'?504:code==='DISCOVERY_RESPONSE_TOO_LARGE'?502:503)
    }
   }
   return Response.json({...await readDiscoveryReport(db,principal,input.projectId,batch.batchId),sourceConfigured:deps.sourceConfigured()},{headers:salesHeaders})
  }
  if(operation==='review')return Response.json(await reviewDiscoveryCandidate(db,principal,parseDiscoveryReview(input)),{headers:salesHeaders})
  const result=await promoteDiscoveryCandidate(db,principal,parseDiscoveryPromotion(input))
  return result.state==='blocked'?Response.json({code:'DISCOVERY_REVIEW_BLOCKED',reasons:result.reasons},{status:409,headers:salesHeaders}):Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const discoveryApi=createDiscoveryApi({access:resolveProjectAccess,db:createAdminClient,enabled:salesEnabled,discover:discoverPublicBusinesses,sourceConfigured:discoverySourceConfigured})
