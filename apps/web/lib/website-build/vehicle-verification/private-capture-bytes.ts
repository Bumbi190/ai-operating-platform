import {createHash} from 'node:crypto'
import {evaluateVehicleCaptureIntake,type CaptureKind} from './capture-intake'
import {inspectVehiclePhotoPixels} from './image-inspection'

/**
 * Pre-production, dependency-injected boundary. No actual Supabase bucket,
 * upload endpoint, signed URL, client secret, or production database is used.
 * The calling server MUST derive principal/owned projects from authenticated
 * server access and implement listingOwnership from its trusted database.
 */
export const VEHICLE_CAPTURE_PRIVATE_BUCKET='vehicle-originals-private' as const
const MAX_BYTES=15_000_000
const TYPES=['png','jpg','webp'] as const
type Format=typeof TYPES[number]
type Photo={
 kind:CaptureKind;sha256:string;storageRef:string;format:Format;
 bytes:number;width:number;height:number
}
export type CaptureAccessBinding={
 userId:string
 allowedProjectIds:readonly string[]
}
export type CaptureBytesPorts={
 listingBelongsToProject:(projectId:string,listingId:string)=>Promise<boolean>
 readPrivateOriginal:(bucket:typeof VEHICLE_CAPTURE_PRIVATE_BUCKET,path:string,maxBytes:number)=>Promise<Uint8Array|null>
}
type Proof={kind:CaptureKind;sha256:string;bytes:number}
type Result=
 | {status:'bytes_checked_for_human_review';projectId:string;listingId:string;captureId:string;checked:ReadonlyArray<Proof>}
 | {status:'pixels_checked_for_human_review';projectId:string;listingId:string;captureId:string;checked:ReadonlyArray<Proof>}
 | {status:'refused';reason:string}
const refused=(reason:string):Result=>({status:'refused',reason})

function record(value:unknown):Record<string,unknown>|null{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null
}
function hasSignature(data:Uint8Array,type:Format):boolean{
 if(type==='png')return data.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>data[i]===n)
 if(type==='jpg')return data.length>=4&&data[0]===255&&data[1]===216&&data[data.length-2]===255&&data[data.length-1]===217
 return data.length>=12&&
  [82,73,70,70].every((n,i)=>data[i]===n)&&
  [87,69,66,80].every((n,i)=>data[i+8]===n)
}

/**
 * Bytes, access scope and listing ownership are verified independently.
 * Image dimensions/content, seller rights, real-world photo authenticity and
 * reviewer credentials still need trusted inspection; status is NOT approval.
 */
export async function checkPrivateVehicleCaptureBytes(
 intake:unknown,access:CaptureAccessBinding,ports:CaptureBytesPorts
):Promise<Result>{
 return checkCapture(intake,access,ports,false)
}

/** New release gate: original bytes AND complete image pixels must be valid. */
export async function checkPrivateVehicleCaptureImages(
 intake:unknown,access:CaptureAccessBinding,ports:CaptureBytesPorts
):Promise<Result>{
 return checkCapture(intake,access,ports,true)
}

async function checkCapture(
 intake:unknown,access:CaptureAccessBinding,ports:CaptureBytesPorts,
 inspectPixels:boolean
):Promise<Result>{
 const checked=evaluateVehicleCaptureIntake(intake)
 if(checked.status!=='ready_for_human_review')return refused(checked.reason)
 if(!access||typeof access.userId!=='string'||!access.userId.trim()||
    !Array.isArray(access.allowedProjectIds)||
    !access.allowedProjectIds.includes(checked.projectId))
  return refused('PROJECT_ACCESS_DENIED')

 // Authorization MUST complete before any private object read.
 let belongs=false
 try{belongs=await ports.listingBelongsToProject(checked.projectId,checked.listingId)}
 catch{return refused('LISTING_SCOPE_UNAVAILABLE')}
 if(belongs!==true)return refused('LISTING_ACCESS_DENIED')

 const raw=record(intake)!
 const images=raw.images as Photo[]
 const proofs:Proof[]=[]
 for(const photo of images){
  let bytes:Uint8Array|null
  try{
   bytes=await ports.readPrivateOriginal(VEHICLE_CAPTURE_PRIVATE_BUCKET,photo.storageRef,MAX_BYTES)
  }catch{return refused('PRIVATE_STORAGE_UNAVAILABLE')}
  if(!(bytes instanceof Uint8Array)||bytes.byteLength!==photo.bytes||
     bytes.byteLength>MAX_BYTES||!hasSignature(bytes,photo.format))
   return refused('PHOTO_BYTES_OR_FORMAT_MISMATCH')
  const actual=createHash('sha256').update(bytes).digest('hex')
  if(actual!==photo.sha256)return refused('PHOTO_CONTENT_HASH_MISMATCH')
  if(inspectPixels){
   const pixels=await inspectVehiclePhotoPixels(bytes,photo)
   if(pixels.status==='refused')return refused(pixels.reason)
  }
  proofs.push({kind:photo.kind,sha256:actual,bytes:bytes.byteLength})
 }
 const evidence={projectId:checked.projectId,listingId:checked.listingId,
  captureId:checked.captureId,checked:proofs}
 if(inspectPixels)return {status:'pixels_checked_for_human_review',...evidence}
 return {status:'bytes_checked_for_human_review',...evidence}
}
