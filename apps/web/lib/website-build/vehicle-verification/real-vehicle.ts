import {
 assertVehicle3DAssetManifest,
 type Vehicle3DAssetManifest,
 type Vehicle3DReferenceKind
} from '../assets/vehicle-3d'

const REQUIRED:Vehicle3DReferenceKind[]=[
 'front_three_quarter','side','rear_three_quarter','opposite_side_front'
]
const REAL_SOURCES=new Set(['licensed_cad_oem','photogrammetry','verified_vendor_model'])
const MATCH_FIELDS=['shape','color','trim','wheels'] as const
const VEHICLE_FIELDS=['make','model','modelYear','trim','exteriorColor','wheels'] as const
type Result=
 | {status:'Verified';assetId:string;glbSha256:string;checkedKinds:Vehicle3DReferenceKind[]}
 | {status:'Refused';reason:string}
const refused=(reason:string):Result=>({status:'Refused',reason})
function object(value:unknown):Record<string,unknown>|null{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)
  ?value as Record<string,unknown>:null
}
function isFourViews(values:unknown):values is Vehicle3DReferenceKind[]{
 return Array.isArray(values)&&values.length===REQUIRED.length&&
  REQUIRED.every(kind=>values.filter(item=>item===kind).length===1)
}
function validVehicleIdentity(value:unknown,expected:NonNullable<Vehicle3DAssetManifest['vehicle']>):boolean{
 const vehicle=object(value)
 return !!vehicle&&VEHICLE_FIELDS.every(field=>vehicle[field]===expected[field])
}

/**
 * A fail-closed evidence *preflight*, not an independent visual comparison or
 * authorization. The real-image comparisons and reviewer authority MUST be
 * established by a trusted server-side human-review workflow before using this
 * result to publish or label an asset. Never trust client-supplied 'matches'.
 */
export function evaluateRealVehicleEvidence(
 manifestInput:unknown,evidenceInput:unknown,reviewInput:unknown
):Result{
 let manifest:Vehicle3DAssetManifest
 try{
  assertVehicle3DAssetManifest(manifestInput)
  manifest=manifestInput
 }catch{return refused('INVALID_OR_UNAPPROVED_MANIFEST')}
 if(manifest.truthClass!=='real_vehicle_verified'||!REAL_SOURCES.has(manifest.source.type))
  return refused('UNVERIFIED_SOURCE')
 if(!manifest.vehicle||!manifest.evidence)return refused('MISSING_VEHICLE_IDENTITY')
 const evidence=object(evidenceInput)
 if(!evidence||evidence.assetId!==manifest.id||evidence.glbSha256!==manifest.glb.sha256)
  return refused('ASSET_BINDING_MISMATCH')
 if(!Array.isArray(evidence.referenceViews)||evidence.referenceViews.length!==4)
  return refused('MISSING_REFERENCE_VIEW')
 if(!Array.isArray(evidence.comparisons)||evidence.comparisons.length!==4)
  return refused('MISSING_RENDER_COMPARISON')
 for(const kind of REQUIRED){
  const declared=manifest.evidence.referenceViews.filter(v=>v.kind===kind)
  const references=evidence.referenceViews.filter(item=>object(item)?.kind===kind)
  const comparisons=evidence.comparisons.filter(item=>object(item)?.kind===kind)
  if(declared.length!==1||references.length!==1||comparisons.length!==1)
   return refused('MISSING_OR_DUPLICATE_VIEW')
  const reference=object(references[0])!
  const comparison=object(comparisons[0])!
  if(reference.ref!==declared[0].ref||
     !validVehicleIdentity(reference.vehicle,manifest.vehicle))
   return refused('VEHICLE_CONFIGURATION_MISMATCH')
  if(comparison.referenceRef!==reference.ref||
     typeof comparison.renderRef!=='string'||
     !/^renders\/[a-zA-Z0-9_-]+\.(?:png|webp|jpe?g)$/.test(comparison.renderRef))
   return refused('RENDER_PROVENANCE_MISMATCH')
  const matches=object(comparison.matches)
  if(!matches||!MATCH_FIELDS.every(field=>matches[field]===true))
   return refused('VISUAL_COMPARISON_FAILED')
 }
 const review=object(reviewInput)
 if(!review||review.decision!=='approved'||review.reviewerId!==manifest.evidence.reviewer.id||
    review.assetId!==manifest.id||review.glbSha256!==manifest.glb.sha256||
    review.approvedAt!==manifest.evidence.reviewer.approvedAt||
    !isFourViews(review.checkedViews))
  return refused('UNBOUND_OR_MISSING_HUMAN_REVIEW')
 return {status:'Verified',assetId:manifest.id,
  glbSha256:manifest.glb.sha256,checkedKinds:[...REQUIRED]}
}
