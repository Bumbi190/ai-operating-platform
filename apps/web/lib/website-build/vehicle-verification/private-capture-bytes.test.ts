import {createHash} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {CAPTURE_KINDS} from './capture-intake'
import {VEHICLE_CAPTURE_PRIVATE_BUCKET,checkPrivateVehicleCaptureBytes} from './private-capture-bytes'
const projectId='11111111-1111-4111-8111-111111111111'
const listingId='22222222-2222-4222-8222-222222222222'
const captureId='33333333-3333-4333-8333-333333333333'
const access={userId:'55555555-5555-4555-8555-555555555555',allowedProjectIds:[projectId]}

function fixtures(){
 const objects=new Map<string,Uint8Array>()
 const images=CAPTURE_KINDS.map((kind,index)=>{
  const bytes=new Uint8Array(20_000+index)
  bytes.fill(index+10)
  bytes.set([137,80,78,71,13,10,26,10],0)
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const storageRef='vehicle-captures/'+projectId+'/'+listingId+'/'+captureId+'/'+kind+'/'+sha256+'.png'
  objects.set(storageRef,bytes)
  return {
   kind,sha256,storageRef,format:'png',origin:'original_vehicle_photo',
   synthetic:false,bytes:bytes.length,width:1920,height:1080,capturedAt:'2026-11-02T06:00:00Z'
  }
 })
 return {
  objects,intake:{
   projectId,listingId,captureId,
   sourceType:'dealer_photography',sourceLabel:'Original seller photos',
   rights:{permission:'authorized_for_vehicle_listing',attestedBy:'Seller',attestedAt:'2026-11-02T06:00:00Z'},
   vehicle:{make:'Example',model:'Touring',modelYear:2025,trim:'GT',exteriorColor:'Blue',wheels:'19 inch'},
   images
  }
 }
}
function ports(objects:Map<string,Uint8Array>){
 return {
  listingBelongsToProject:vi.fn(async()=>true),
  readPrivateOriginal:vi.fn(async(_bucket:string,path:string,_max:number)=>objects.get(path)??null)
 }
}
describe('trusted private original capture bytes (pre-production only)',()=>{
 it('rehashes all six original files and returns proof for human review, not publication',async()=>{
  const {intake,objects}=fixtures(),io=ports(objects)
  const result=await checkPrivateVehicleCaptureBytes(intake,access,io)
  expect(result).toMatchObject({status:'bytes_checked_for_human_review',projectId,listingId,captureId})
  if(result.status!=='bytes_checked_for_human_review')throw Error(result.reason)
  expect(result.checked).toHaveLength(6)
  expect(io.readPrivateOriginal).toHaveBeenCalledTimes(6)
  expect(io.readPrivateOriginal).toHaveBeenCalledWith(VEHICLE_CAPTURE_PRIVATE_BUCKET,
   intake.images[0].storageRef,15_000_000)
  expect(io.listingBelongsToProject).toHaveBeenCalledWith(projectId,listingId)
  expect(result).not.toHaveProperty('publishable')
  expect(result).not.toHaveProperty('real_vehicle_verified')
 })
 it('rejects a cross-project read before contacting the storage provider',async()=>{
  const {intake,objects}=fixtures(),io=ports(objects)
  expect(await checkPrivateVehicleCaptureBytes(intake,{...access,allowedProjectIds:[]},io))
   .toEqual({status:'refused',reason:'PROJECT_ACCESS_DENIED'})
  expect(io.listingBelongsToProject).not.toHaveBeenCalled()
  expect(io.readPrivateOriginal).not.toHaveBeenCalled()
 })
 it('rejects a listing not belonging to the allowed project without reading objects',async()=>{
  const {intake,objects}=fixtures(),io=ports(objects)
  io.listingBelongsToProject.mockResolvedValueOnce(false)
  expect(await checkPrivateVehicleCaptureBytes(intake,access,io))
   .toEqual({status:'refused',reason:'LISTING_ACCESS_DENIED'})
  expect(io.readPrivateOriginal).not.toHaveBeenCalled()
 })
 it('refuses forged storage keys even when the caller owns the project',async()=>{
  const {intake,objects}=fixtures(),io=ports(objects)
  const tampered={...intake,images:intake.images.map((p,i)=>
   i===0?{...p,storageRef:'vehicle-captures/foreign/secret.png'}:p)}
  expect(await checkPrivateVehicleCaptureBytes(tampered,access,io))
   .toEqual({status:'refused',reason:'PHOTO_SCOPE_OR_CONTENT_PATH_MISMATCH'})
  expect(io.readPrivateOriginal).not.toHaveBeenCalled()
 })
 it('fails when actual bytes differ from the attested SHA, even if format looks valid',async()=>{
  const {intake,objects}=fixtures(),io=ports(objects)
  const first=intake.images[0].storageRef,changed=Uint8Array.from(objects.get(first)!)
  changed[200]=1
  objects.set(first,changed)
  expect(await checkPrivateVehicleCaptureBytes(intake,access,io))
   .toEqual({status:'refused',reason:'PHOTO_CONTENT_HASH_MISMATCH'})
 })
 it('rejects missing objects, fake magic bytes, and inconsistent actual lengths',async()=>{
  const a=fixtures(),b=fixtures(),c=fixtures()
  a.objects.delete(a.intake.images[0].storageRef)
  expect(await checkPrivateVehicleCaptureBytes(a.intake,access,ports(a.objects)))
   .toEqual({status:'refused',reason:'PHOTO_BYTES_OR_FORMAT_MISMATCH'})
  const path=b.intake.images[0].storageRef
  const bad=Uint8Array.from(b.objects.get(path)!)
  bad.fill(0,0,8);b.objects.set(path,bad)
  expect(await checkPrivateVehicleCaptureBytes(b.intake,access,ports(b.objects)))
   .toEqual({status:'refused',reason:'PHOTO_BYTES_OR_FORMAT_MISMATCH'})
  const short=c.intake.images[0].storageRef
  c.objects.set(short,c.objects.get(short)!.slice(0,19000))
  expect(await checkPrivateVehicleCaptureBytes(c.intake,access,ports(c.objects)))
   .toEqual({status:'refused',reason:'PHOTO_BYTES_OR_FORMAT_MISMATCH'})
 })
 it('fails closed on a private storage exception and missing ownership service',async()=>{
  const {intake,objects}=fixtures(),io=ports(objects)
  io.readPrivateOriginal.mockRejectedValueOnce(Error('storage offline'))
  expect(await checkPrivateVehicleCaptureBytes(intake,access,io))
   .toEqual({status:'refused',reason:'PRIVATE_STORAGE_UNAVAILABLE'})
  io.listingBelongsToProject.mockRejectedValueOnce(Error('authorization unavailable'))
  expect(await checkPrivateVehicleCaptureBytes(intake,access,io))
   .toEqual({status:'refused',reason:'LISTING_SCOPE_UNAVAILABLE'})
 })
 it('rejects synthetic or incomplete metadata before reading any bytes',async()=>{
  const {intake,objects}=fixtures(),io=ports(objects)
  const tampered={...intake,images:intake.images.map((p,i)=>i===1?{...p,synthetic:true}:p)}
  expect((await checkPrivateVehicleCaptureBytes(tampered,access,io)).status).toBe('refused')
  expect(io.readPrivateOriginal).not.toHaveBeenCalled()
 })
})
