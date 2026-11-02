/**
 * Private source-photo intake contract for a specific dealer stock vehicle.
 *
 * Important: metadata, hashes, seller permission and 'original' claims below
 * are SELF-REPORTED. This is a structural intake gate only. Nothing returned
 * from this module is a real-vehicle verification, visual match or permission
 * to publish an asset.
 */
export const CAPTURE_KINDS=[
 'front_three_quarter','side','rear_three_quarter',
 'opposite_side_front','wheel_detail','trim_identifier'
] as const
export type CaptureKind=typeof CAPTURE_KINDS[number]

type Accepted={
 status:'ready_for_human_review'
 projectId:string
 listingId:string
 captureId:string
 imageKinds:CaptureKind[]
 imageSha256:string[]
}
type Refused={status:'refused';reason:string}
export type CaptureIntakeResult=Accepted|Refused

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA=/^[a-f0-9]{64}$/
const REQUIRED_IDENTITY=['make','model','modelYear','trim','exteriorColor','wheels'] as const
const MAX_PHOTO_BYTES=15_000_000

function record(value:unknown):Record<string,unknown>|null{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)
  ?value as Record<string,unknown>:null
}
function validText(value:unknown,max=120):value is string{
 return typeof value==='string'&&value.length<=max&&value.trim().length>0&&
  !/[\u0000-\u001f\u007f]/.test(value)
}
function isIsoDate(value:unknown):value is string{
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&
  !Number.isNaN(Date.parse(value))&&new Date(value).toISOString().startsWith(value.slice(0,19))
}
function fail(reason:string):Refused{return {status:'refused',reason}}

/**
 * One original, authorized set of photos per listing/capture. A reviewer must
 * separately inspect the actual bytes, camera angles and all car details.
 * GLB creation is a later, independently authorized process.
 */
export function evaluateVehicleCaptureIntake(input:unknown):CaptureIntakeResult{
 const item=record(input)
 if(!item||!UUID.test(String(item.projectId??''))||
   !UUID.test(String(item.listingId??''))||!UUID.test(String(item.captureId??'')))
  return fail('INVALID_STOCK_SCOPE')
 const projectId=item.projectId as string,listingId=item.listingId as string,captureId=item.captureId as string

 const vehicle=record(item.vehicle)
 if(!vehicle||REQUIRED_IDENTITY.some(key=>key==='modelYear'
   ?!Number.isInteger(vehicle.modelYear)||Number(vehicle.modelYear)<1980||Number(vehicle.modelYear)>2200
   :!validText(vehicle[key])))return fail('INCOMPLETE_CONFIGURATION')
 if(!validText(item.sourceLabel,120)||item.sourceType!=='dealer_photography')
  return fail('UNKNOWN_PHOTO_PROVENANCE')

 const rights=record(item.rights)
 if(!rights||rights.permission!=='authorized_for_vehicle_listing'||
  !validText(rights.attestedBy,120)||!isIsoDate(rights.attestedAt))
  return fail('PHOTO_RIGHTS_NOT_ATTESTED')

 const images=item.images
 if(!Array.isArray(images)||images.length!==CAPTURE_KINDS.length)
  return fail('INCOMPLETE_CAPTURE_COVERAGE')
 const seenKinds=new Set<string>(),seenSha=new Set<string>()
 const photoHashes:string[]=[]
 for(const raw of images){
  const photo=record(raw)
  if(!photo)return fail('INVALID_CAPTURE_PHOTO')
  if(!CAPTURE_KINDS.includes(photo.kind as CaptureKind)||seenKinds.has(photo.kind as string))
   return fail('DUPLICATE_OR_UNKNOWN_ANGLE')
  seenKinds.add(photo.kind as string)
  if(photo.origin!=='original_vehicle_photo'||photo.synthetic!==false)
   return fail('SYNTHETIC_OR_UNKNOWN_PHOTO')
  if(typeof photo.sha256!=='string'||!SHA.test(photo.sha256)||
    seenSha.has(photo.sha256))return fail('INVALID_OR_REUSED_PHOTO_HASH')
  seenSha.add(photo.sha256)
  const format=photo.format
  if(format!=='jpg'&&format!=='webp'&&format!=='png')
   return fail('UNSUPPORTED_PHOTO_FORMAT')
  // Content-addressed private storage path is validated syntactically here;
  // storage service must later re-hash the actual bytes independently.
  const expected='vehicle-captures/'+projectId+'/'+listingId+'/'+captureId+'/'+
   String(photo.kind)+'/'+photo.sha256+'.'+format
  if(photo.storageRef!==expected)return fail('PHOTO_SCOPE_OR_CONTENT_PATH_MISMATCH')
  if(!Number.isInteger(photo.bytes)||Number(photo.bytes)<20_000||
     Number(photo.bytes)>MAX_PHOTO_BYTES||
     !Number.isInteger(photo.width)||Number(photo.width)<480||Number(photo.width)>8192||
     !Number.isInteger(photo.height)||Number(photo.height)<480||Number(photo.height)>8192||
     !isIsoDate(photo.capturedAt))
   return fail('INVALID_PHOTO_METADATA')
  photoHashes.push(photo.sha256)
 }
 if(CAPTURE_KINDS.some(kind=>!seenKinds.has(kind)))return fail('MISSING_REQUIRED_ANGLE')
 return {
  status:'ready_for_human_review',projectId,listingId,captureId,
  imageKinds:[...CAPTURE_KINDS],imageSha256:photoHashes
 }
}
