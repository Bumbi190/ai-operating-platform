/**
 * Pre-deployment, owner-session Supabase adapter for vehicle capture verification.
 * No endpoints use it until a separately reviewed storage schema is installed.
 * Never pass a service-role client here: use the authenticated request's
 * publishable-key Supabase client with Storage RLS.
 */
import {VEHICLE_CAPTURE_PRIVATE_BUCKET,type CaptureAccessBinding,type CaptureBytesPorts} from './private-capture-bytes'

type ListingResult={data:{id:string}|null;error:unknown}
type ListingFilter={
 eq:(column:string,value:string)=>ListingFilter
 maybeSingle:()=>Promise<ListingResult>
}
export type OwnerCaptureAuthenticatedClient={
 from:(table:'website_vehicle_capture_listings')=>{select:(cols:string)=>ListingFilter}
 storage:{from:(bucket:typeof VEHICLE_CAPTURE_PRIVATE_BUCKET)=>{
  download:(path:string)=>Promise<{data:Blob|null;error:unknown}>
 }}
}
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const SHA='[0-9a-f]{64}'
const KIND='(?:front_three_quarter|side|rear_three_quarter|opposite_side_front|wheel_detail|trim_identifier)'
const PATH=new RegExp('^vehicle-captures/('+UUID+')/('+UUID+')/('+UUID+')/'+KIND+'/'+SHA+'\\.(?:png|jpg|webp)$','i')
const HARD_LIMIT=15_000_000

/** One instance per authenticated request; no cross-user cached scope. */
export function makeOwnerScopedCapturePorts(
 client:OwnerCaptureAuthenticatedClient, access:CaptureAccessBinding
):CaptureBytesPorts {
 // Set ONLY after independent DB ownership checks. Do not accept arbitrary
 // file paths even if they are hash-shaped.
 let authorized:{projectId:string;listingId:string}|null=null
 return {
  async listingBelongsToProject(projectId,listingId){
   authorized=null
   if(!access.userId||!access.allowedProjectIds.includes(projectId))return false
   const {data,error}=await client.from('website_vehicle_capture_listings')
    .select('id')
    .eq('id',listingId)
    .eq('project_id',projectId)
    .eq('owner_id',access.userId)
    .eq('state','evidence_only')
    .maybeSingle()
   if(error)throw Error('LISTING_SCOPE_UNAVAILABLE')
   if(data?.id!==listingId)return false
   authorized={projectId,listingId}
   return true
  },
  async readPrivateOriginal(bucket,path,maxBytes){
   if(bucket!==VEHICLE_CAPTURE_PRIVATE_BUCKET||
      !Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>HARD_LIMIT)
    return null
   const match=PATH.exec(path)
   if(!authorized||!match||
      match[1]!==authorized.projectId||match[2]!==authorized.listingId)
    return null
   const {data,error}=await client.storage.from(VEHICLE_CAPTURE_PRIVATE_BUCKET).download(path)
   if(error)throw Error('PRIVATE_STORAGE_UNAVAILABLE')
   if(!(data instanceof Blob)||data.size<1||data.size>maxBytes)return null
   return new Uint8Array(await data.arrayBuffer())
  }
 }
}
