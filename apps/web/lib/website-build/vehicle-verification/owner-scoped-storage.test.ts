import {createHash} from 'node:crypto'
import {describe,expect,it,vi} from 'vitest'
import {CAPTURE_KINDS} from './capture-intake'
import {checkPrivateVehicleCaptureBytes,VEHICLE_CAPTURE_PRIVATE_BUCKET} from './private-capture-bytes'
import {makeOwnerScopedCapturePorts} from './owner-scoped-storage'

const project='11111111-1111-4111-8111-111111111111'
const listing='22222222-2222-4222-8222-222222222222'
const capture='33333333-3333-4333-8333-333333333333'
const user='44444444-4444-4444-8444-444444444444'
const access={userId:user,allowedProjectIds:[project]}
const iso='2026-11-02T08:00:00Z'
function fixture(){
 const files=new Map<string,Blob>()
 const images=CAPTURE_KINDS.map((kind,i)=>{
  const bytes=new Uint8Array(20_000+i);bytes.fill(i+2);bytes.set([137,80,78,71,13,10,26,10],0)
  const sha256=createHash('sha256').update(bytes).digest('hex')
  const storageRef='vehicle-captures/'+project+'/'+listing+'/'+capture+'/'+kind+'/'+sha256+'.png'
  files.set(storageRef,new Blob([bytes],{type:'image/png'}))
  return {kind,sha256,storageRef,format:'png',bytes:bytes.length,
   width:1200,height:900,capturedAt:iso,origin:'original_vehicle_photo',synthetic:false}
 })
 return {files,intake:{projectId:project,listingId:listing,captureId:capture,
  vehicle:{make:'Example',model:'Sedan',modelYear:2025,trim:'GT',exteriorColor:'White',wheels:'19 inch'},
  sourceLabel:'Dealer camera',sourceType:'dealer_photography',
  rights:{permission:'authorized_for_vehicle_listing',attestedBy:'Seller',attestedAt:iso},images}}
}
function client(files:Map<string,Blob>,row:{id:string}|null={id:listing},error:unknown=null){
 const calls:{filters:[string,string][]}={filters:[]}
 const filter={
  eq:(col:string,value:string)=>{calls.filters.push([col,value]);return filter},
  maybeSingle:vi.fn(async()=>({data:row,error}))
 }
 const download=vi.fn(async(path:string)=>({data:files.get(path)??null,error:null}))
 const from=vi.fn((table:string)=>table==='website_vehicle_capture_listings'?{select:()=>filter}:null)
 const storageFrom=vi.fn((bucket:string)=>bucket===VEHICLE_CAPTURE_PRIVATE_BUCKET?{download}:null)
 return {client:{from,storage:{from:storageFrom}},calls,download,from,storageFrom,filter}
}
describe('session owner scoped storage adapter (not yet connected to production)',()=>{
 it('reads exactly six immutable scoped originals via private authenticated download',async()=>{
  const {files,intake}=fixture(),c=client(files)
  const ports=makeOwnerScopedCapturePorts(c.client as any,access)
  const result=await checkPrivateVehicleCaptureBytes(intake,access,ports)
  expect(result.status).toBe('bytes_checked_for_human_review')
  expect(c.download).toHaveBeenCalledTimes(6)
  expect(c.storageFrom).toHaveBeenCalledWith(VEHICLE_CAPTURE_PRIVATE_BUCKET)
  expect(c.calls.filters).toEqual([
   ['id',listing],['project_id',project],['owner_id',user],['state','evidence_only']
  ])
 })
 it('does not touch DB or storage on a denied project',async()=>{
  const f=fixture(),c=client(f.files)
  const denial={userId:user,allowedProjectIds:[]}
  const result=await checkPrivateVehicleCaptureBytes(f.intake,denial,makeOwnerScopedCapturePorts(c.client as any,denial))
  expect(result).toEqual({status:'refused',reason:'PROJECT_ACCESS_DENIED'})
  expect(c.from).not.toHaveBeenCalled()
  expect(c.download).not.toHaveBeenCalled()
 })
 it('denies nonexistent or mismatched listing before storage',async()=>{
  const f=fixture(),c=client(f.files,{id:'other'})
  const result=await checkPrivateVehicleCaptureBytes(f.intake,access,makeOwnerScopedCapturePorts(c.client as any,access))
  expect(result).toEqual({status:'refused',reason:'LISTING_ACCESS_DENIED'})
  expect(c.storageFrom).not.toHaveBeenCalled()
 })
 it('rejects any unexpected bucket/path and stale listing scope',async()=>{
  const f=fixture(),c=client(f.files)
  const ports=makeOwnerScopedCapturePorts(c.client as any,access)
  expect(await ports.readPrivateOriginal(VEHICLE_CAPTURE_PRIVATE_BUCKET,f.intake.images[0].storageRef,15_000_000)).toBeNull()
  expect(await ports.listingBelongsToProject(project,listing)).toBe(true)
  expect(await ports.readPrivateOriginal(VEHICLE_CAPTURE_PRIVATE_BUCKET,
   'vehicle-captures/'+project+'/11111111-1111-4111-8111-111111111111/'+capture+'/'+f.intake.images[0].kind+'/'+f.intake.images[0].sha256+'.png',15_000_000)).toBeNull()
  expect(await ports.readPrivateOriginal(VEHICLE_CAPTURE_PRIVATE_BUCKET,'../secrets',15_000_000)).toBeNull()
  expect(await ports.readPrivateOriginal(VEHICLE_CAPTURE_PRIVATE_BUCKET,f.intake.images[0].storageRef,15_000_001)).toBeNull()
  expect(c.download).not.toHaveBeenCalled()
 })
 it('rejects an oversized object before allocation of its array buffer',async()=>{
  const f=fixture(),c=client(f.files)
  const ports=makeOwnerScopedCapturePorts(c.client as any,access)
  await ports.listingBelongsToProject(project,listing)
  const path=f.intake.images[0].storageRef
  f.files.set(path,new Blob([new Uint8Array(15_000_001)]))
  expect(await ports.readPrivateOriginal(VEHICLE_CAPTURE_PRIVATE_BUCKET,path,15_000_000)).toBeNull()
 })
 it('converts listing and Storage provider errors into refusals',async()=>{
  const f=fixture(),c=client(f.files,null,{code:'DATA_UNAVAILABLE'})
  const result=await checkPrivateVehicleCaptureBytes(f.intake,access,makeOwnerScopedCapturePorts(c.client as any,access))
  expect(result).toEqual({status:'refused',reason:'LISTING_SCOPE_UNAVAILABLE'})
  const d=client(f.files),ports=makeOwnerScopedCapturePorts(d.client as any,access)
  d.download.mockRejectedValueOnce(Error('storage offline'))
  expect(await checkPrivateVehicleCaptureBytes(f.intake,access,ports)).toEqual({
   status:'refused',reason:'PRIVATE_STORAGE_UNAVAILABLE'
  })
 })
})
