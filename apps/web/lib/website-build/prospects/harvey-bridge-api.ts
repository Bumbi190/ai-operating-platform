import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {readWebsiteBuildBody,buildErrorResponse} from '../api'
import {WebsiteBuildError} from '../store'
import {studioPrincipal} from '../studio/store'
import {prospectsEnabled} from './api'
import {localCaptureAvailable} from './capture'
import {beginHarveyBridge,finishHarveyBridge,harveyBridgeConfigured,EdforsProjectId} from './harvey-bridge'
import {issueSearchReceipt} from './search-receipt'

const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'}
function validFields(obj:Record<string,unknown>,keys:string[]){
  if(Object.keys(obj).sort().join(',')!==keys.sort().join(','))throw new WebsiteBuildError('INVALID_BODY',400)
}
export async function POST(request:Request):Promise<Response>{
  // Local-only protocol: never writes to or proxies production Supabase.
  if(!prospectsEnabled()||!localCaptureAvailable()||!harveyBridgeConfigured())return Response.json({error:'Not found'},{status:404,headers})
  const access=await resolveProjectAccess()
  if(!access.ok){access.response.headers.set('cache-control','private, no-store');return access.response}
  try {
    const denied=assertSameOrigin(request)
    if(denied){denied.headers.set('cache-control','private, no-store');return denied}
    const body=await readWebsiteBuildBody(request)
    if(!body||typeof body!=='object'||Array.isArray(body))throw new WebsiteBuildError('INVALID_BODY',400)
    const b=body as Record<string,unknown>
    if(b.projectId!==EdforsProjectId)throw new WebsiteBuildError('NOT_FOUND',404)
    studioPrincipal(access,b.projectId)
    if(b.action==='start'){
      validFields(b,['action','projectId'])
      return Response.json(beginHarveyBridge(access.userId,b.projectId),{headers})
    }
    if(b.action==='consume'){
      validFields(b,['action','projectId','package'])
      const company=await finishHarveyBridge(b.package,{userId:access.userId,projectId:b.projectId})
      const secret=process.env.SUPABASE_SERVICE_ROLE_KEY??''
      const receipt=issueSearchReceipt(company,access,b.projectId,secret)
      return Response.json({candidates:[{company,receipt}],source:'harvey-signed-scb'},{headers})
    }
    throw new WebsiteBuildError('INVALID_BODY',400)
  }catch(error){return buildErrorResponse(error)}
}
