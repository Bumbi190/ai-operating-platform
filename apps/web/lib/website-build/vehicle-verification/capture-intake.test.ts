import {describe,expect,it} from 'vitest'
import {CAPTURE_KINDS,evaluateVehicleCaptureIntake} from './capture-intake'

const projectId='11111111-1111-4111-8111-111111111111'
const listingId='22222222-2222-4222-8222-222222222222'
const captureId='33333333-3333-4333-8333-333333333333'
const iso='2026-11-01T17:30:00Z'
function fixture(){
 return {
  projectId,listingId,captureId,
  sourceLabel:'Authorized seller camera',
  sourceType:'dealer_photography',
  vehicle:{
   make:'Example Motors',model:'Touring',modelYear:2025,
   trim:'GT-Line',exteriorColor:'Deep Blue',wheels:'19 inch 5 spoke'
  },
  rights:{permission:'authorized_for_vehicle_listing',attestedBy:'Dealer reviewer',attestedAt:iso},
  images:CAPTURE_KINDS.map((kind,i)=>{
   const sha256=(i+1).toString(16).repeat(64)
   return {
    kind,origin:'original_vehicle_photo',synthetic:false,
    sha256,format:'webp',bytes:250_000,width:1920,height:1080,capturedAt:iso,
    storageRef:'vehicle-captures/'+projectId+'/'+listingId+'/'+captureId+'/'+kind+'/'+sha256+'.webp'
   }
  })
 }
}
const refused=(value:unknown,reason?:string)=>{
 const result=evaluateVehicleCaptureIntake(value)
 expect(result.status).toBe('refused')
 if(reason)expect(result).toMatchObject({status:'refused',reason})
}
describe('specific listing capture intake (not visual approval)',()=>{
 it('accepts six scoped original-photo records ONLY as human-review input',()=>{
  const result=evaluateVehicleCaptureIntake(fixture())
  expect(result).toMatchObject({
   status:'ready_for_human_review',projectId,listingId,captureId,
   imageKinds:[...CAPTURE_KINDS]
  })
  expect(result).not.toHaveProperty('status','Verified')
  expect(result).not.toHaveProperty('publishable',true)
 })
 it('refuses missing stock scope or invalid listing UUID',()=>{
  refused({...fixture(),listingId:'other-listing'},'INVALID_STOCK_SCOPE')
  refused({...fixture(),projectId:'https://other-account'},'INVALID_STOCK_SCOPE')
 })
 it('requires exact visible configuration, not just VIN or model',()=>{
  refused({...fixture(),vehicle:{make:'Example Motors',model:'Touring',modelYear:2025}},'INCOMPLETE_CONFIGURATION')
  refused({...fixture(),vehicle:{...fixture().vehicle,wheels:''}},'INCOMPLETE_CONFIGURATION')
  refused({...fixture(),vehicle:{...fixture().vehicle,modelYear:'2025'}},'INCOMPLETE_CONFIGURATION')
 })
 it('blocks unsupported provenance, unlicensed or unstamped photos',()=>{
  refused({...fixture(),sourceType:'ai_inferred'},'UNKNOWN_PHOTO_PROVENANCE')
  refused({...fixture(),rights:{...fixture().rights,permission:'unknown'}},'PHOTO_RIGHTS_NOT_ATTESTED')
  refused({...fixture(),rights:{...fixture().rights,attestedAt:'yesterday'}},'PHOTO_RIGHTS_NOT_ATTESTED')
 })
 it('requires all four vehicle angles plus wheel and trim proof',()=>{
  refused({...fixture(),images:fixture().images.slice(0,5)},'INCOMPLETE_CAPTURE_COVERAGE')
  const changed=fixture();changed.images[5]={...changed.images[5],kind:'front_three_quarter'}
  refused(changed,'DUPLICATE_OR_UNKNOWN_ANGLE')
 })
 it('refuses synthetic and uncertain-origin images even with convincing metadata',()=>{
  const edited=fixture();edited.images[0]={...edited.images[0],synthetic:true}
  refused(edited,'SYNTHETIC_OR_UNKNOWN_PHOTO')
  const noOrigin=fixture();noOrigin.images[0]={...noOrigin.images[0],origin:'ai_generated'}
  refused(noOrigin,'SYNTHETIC_OR_UNKNOWN_PHOTO')
 })
 it('rejects reused bytes and unscoped/remote image references',()=>{
  const copied=fixture();copied.images[1]={...copied.images[1],sha256:copied.images[0].sha256}
  refused(copied,'INVALID_OR_REUSED_PHOTO_HASH')
  const wrong=fixture();wrong.images[0]={...wrong.images[0],storageRef:'vehicle-captures/some-other-user/file.webp'}
  refused(wrong,'PHOTO_SCOPE_OR_CONTENT_PATH_MISMATCH')
  const remote=fixture();remote.images[0]={...remote.images[0],storageRef:'https://remote.example/private.webp'}
  refused(remote,'PHOTO_SCOPE_OR_CONTENT_PATH_MISMATCH')
 })
 it('refuses impossible sizes, unsupported formats and capture timestamps',()=>{
  const small=fixture();small.images[0]={...small.images[0],bytes:100}
  refused(small,'INVALID_PHOTO_METADATA')
  const badDate=fixture();badDate.images[0]={...badDate.images[0],capturedAt:'2026-02-31T17:30:00Z'}
  refused(badDate,'INVALID_PHOTO_METADATA')
  const badFormat=fixture();badFormat.images[0]={...badFormat.images[0],format:'svg'}
  refused(badFormat,'UNSUPPORTED_PHOTO_FORMAT')
 })
})
