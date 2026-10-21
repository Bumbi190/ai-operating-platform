import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {contentFields} from '../../content/validate'
import {PublicationError} from '../types'
import {boundedPublicationBody} from '../api'
import {inspectReconciliation,completeReconciliation} from './service'
import type {CompleteReconciliation,ReconciliationScope} from './types'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export async function socialReconciliationApi(request:Request){
 try{
  const p=await resolveProjectAccess();if(!p.ok)return p.response
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers})
  const denied=assertSameOrigin(request);if(denied)return denied
  const operator=await resolvePlatformOperator();if(!operator.ok||operator.userId!==p.userId)return Response.json({code:'OPERATOR_REQUIRED'},{status:403,headers})
  const value=await boundedPublicationBody(request)
  try{contentFields(value,['operation','projectId','postId','publicationId','candidateId','expectedVersion','imageConfirmed'])}catch{throw new PublicationError('INVALID_BODY')}
  const {operation,...input}=value
  const db=createAdminClient()
  const result=operation==='inspect'?await inspectReconciliation(db,p,input as ReconciliationScope):operation==='complete'?await completeReconciliation(db,p,input as CompleteReconciliation):null
  if(result===null)throw new PublicationError('INVALID_BODY')
  return Response.json(result,{headers})
 }catch(error){const e=error instanceof PublicationError?error:new PublicationError('UNAVAILABLE');return Response.json({code:e.code},{status:e.status,headers})}
}
