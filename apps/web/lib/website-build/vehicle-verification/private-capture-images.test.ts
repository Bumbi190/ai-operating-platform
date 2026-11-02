import {createHash,randomBytes} from 'node:crypto'
import sharp from 'sharp'
import {describe,it,expect,vi} from 'vitest'
import {CAPTURE_KINDS} from './capture-intake'
import {checkPrivateVehicleCaptureImages} from './private-capture-bytes'

const projectId='11111111-1111-4111-8111-111111111111'
const listingId='22222222-2222-4222-8222-222222222222'
const captureId='33333333-3333-4333-8333-333333333333'
const access={userId:'55555555-5555-4555-8555-555555555555',allowedProjectIds:[projectId]}
async function makeFixture(){
 const storage=new Map<string,Uint8Array>()
 const images=[]
 for(const kind of CAPTURE_KINDS){
  const pixels=randomBytes(640*512*3)
  const bytes=await sharp(pixels,{raw:{width:640,height:512,channels:3}}).png({compressionLevel:1}).toBuffer()
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const storageRef='vehicle-captures/'+projectId+'/'+listingId+'/'+captureId+'/'+kind+'/'+sha256+'.png'
  storage.set(storageRef,bytes)
  images.push({kind,origin:'original_vehicle_photo',synthetic:false,format:'png',
   sha256,storageRef,bytes:bytes.byteLength,width:640,height:512,
   capturedAt:'2026-11-02T08:50:00Z'})
 }
 const intake={projectId,listingId,captureId,images,sourceLabel:'Synthetic fixture',
  sourceType:'dealer_photography',
  rights:{permission:'authorized_for_vehicle_listing',attestedBy:'Synthetic fixture',attestedAt:'2026-11-02T08:50:00Z'},
  vehicle:{make:'Example',model:'Touring',modelYear:2025,trim:'Demo',exteriorColor:'White',wheels:'19-inch'}}
 const ports={
  listingBelongsToProject:vi.fn(async()=>true),
  readPrivateOriginal:vi.fn(async(_bucket:string,path:string)=>storage.get(path)??null)
 }
 return {intake,storage,ports}
}

describe('all-six original photos: hash + actual pixel verification',()=>{
 it('returns pixel proof only when all six authentic synthetically generated PNG images decode',async()=>{
  const {intake,ports}=await makeFixture()
  const result=await checkPrivateVehicleCaptureImages(intake,access,ports)
  expect(result).toMatchObject({status:'pixels_checked_for_human_review',projectId,listingId,captureId})
  if(result.status==='refused')throw Error(result.reason)
  expect(result.checked).toHaveLength(6)
  expect(ports.readPrivateOriginal).toHaveBeenCalledTimes(6)
  expect(result).not.toHaveProperty('publishable')
 })
 it('rejects a self-consistently hashed but corrupt fake PNG with correct declared dimensions',async()=>{
  const {intake,storage,ports}=await makeFixture()
  const target=intake.images[0]
  const bytes=Uint8Array.from(storage.get(target.storageRef)!)
  bytes.fill(0xff,3000,3600)
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const storageRef=target.storageRef.replace(target.sha256,sha256)
  intake.images[0]={...target,sha256,storageRef}
  storage.delete(target.storageRef)
  storage.set(storageRef,bytes)
  const result=await checkPrivateVehicleCaptureImages(intake,access,ports)
  expect(result.status).toBe('refused')
  expect(result).toMatchObject({reason:'PHOTO_DECODE_FAILED'})
 })
 it('rejects an actual photo with a forged but hash-consistent dimension claim',async()=>{
  const {intake,storage,ports}=await makeFixture()
  intake.images[2]={...intake.images[2],width:512,height:640}
  const result=await checkPrivateVehicleCaptureImages(intake,access,ports)
  expect(result).toEqual({status:'refused',reason:'PHOTO_DIMENSIONS_MISMATCH'})
  expect(ports.readPrivateOriginal).toHaveBeenCalledTimes(3)
 })
 it('does not read image bytes when listing ownership is unavailable',async()=>{
  const {intake,ports}=await makeFixture()
  ports.listingBelongsToProject.mockResolvedValue(false)
  const result=await checkPrivateVehicleCaptureImages(intake,access,ports)
  expect(result).toEqual({status:'refused',reason:'LISTING_ACCESS_DENIED'})
  expect(ports.readPrivateOriginal).not.toHaveBeenCalled()
 })
})
