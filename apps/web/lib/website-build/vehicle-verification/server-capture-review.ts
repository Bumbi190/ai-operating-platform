import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createClient} from '@/lib/supabase/server'
import {checkPrivateVehicleCaptureImages} from './private-capture-bytes'
import {makeOwnerScopedCapturePorts,type OwnerCaptureAuthenticatedClient} from './owner-scoped-storage'

/**
 * Future server-only entrypoint, not mounted on any route.
 * No service key, no writes or uploads, no signed URLs.
 * Must only be activated after approved owner/listing schema + private bucket
 * and isolated live session/Storage RLS integration tests exist.
 */
export async function checkCaptureForHumanReview(input:unknown){
 try{
  const access=await resolveProjectAccess()
  if(!access.ok)return {status:'refused' as const,reason:'AUTH_REQUIRED'}
  const client=await createClient()
  const {data:{user},error}=await client.auth.getUser()
  if(error||!user||user.id!==access.userId)
   return {status:'refused' as const,reason:'SESSION_MISMATCH'}
  return await checkPrivateVehicleCaptureImages(
   input,{userId:access.userId,allowedProjectIds:access.allowedProjectIds},
   makeOwnerScopedCapturePorts(
    client as unknown as OwnerCaptureAuthenticatedClient,
    {userId:access.userId,allowedProjectIds:access.allowedProjectIds}
   )
  )
 }catch{
  return {status:'refused' as const,reason:'CAPTURE_REVIEW_UNAVAILABLE'}
 }
}
