import {CAPTURE_KINDS,type CaptureKind} from './capture-intake'
import type {Vehicle3DReferenceKind} from '../assets/vehicle-3d'

export const REVIEW_VIEWS=[
 'front_three_quarter','side','rear_three_quarter','opposite_side_front'
] as const satisfies readonly Vehicle3DReferenceKind[]

export const REVIEW_FEATURES=['body','paint','wheels','trim','lights'] as const
export type ReviewFeature=typeof REVIEW_FEATURES[number]
export type ReviewFinding='matches'|'differs'|'uncertain'

type ReviewState=
 | {status:'refused';reason:string}
 | {status:'revision_required';differences:readonly string[];uncertain:readonly string[]}
 | {status:'additional_evidence_required';uncertain:readonly string[]}
 | {status:'human_review_required';comparisonCount:4;remainingAuthority:readonly string[]}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA=/^[a-f0-9]{64}$/
const ALLOWED=new Set<ReviewFinding>(['matches','differs','uncertain'])
const remainingAuthority=[
 'authenticated_reviewer_identity',
 'original_photo_rights_and_provenance',
 'server_verified_photo_and_render_bytes',
 'immutable_glb_and_review_revision',
 'trusted_server_attestation',
 'separate_owner_publication_approval'
] as const
function object(value:unknown):Record<string,unknown>|null{
 return value!==null&&typeof value==='object'&&!Array.isArray(value)
  ?value as Record<string,unknown>:null
}
function refused(reason:string):ReviewState{return {status:'refused',reason}}

/**
 * Client-supplied inspection draft, never authoritative. All matches simply
 * mean there are no SELF-REPORTED differences. Reviewer identity, source
 * rights, visual truth, original image bytes, signed attestation and release
 * are separate trusted server decisions. Never return 'verified' or 'approved'.
 */
export function assessVehicleReviewDraft(input:unknown):ReviewState{
 const item=object(input)
 if(!item||
  !['projectId','listingId','captureId'].every(k=>UUID.test(String(item[k]??'')))||
  typeof item.assetId!=='string'||!/^vehicle3d:[a-z0-9][a-z0-9-]{2,80}$/.test(item.assetId)||
  !SHA.test(String(item.glbSha256??'')))return refused('INVALID_SCOPE_OR_MODEL')
 const photos=item.originalPhotos
 if(!Array.isArray(photos)||photos.length!==CAPTURE_KINDS.length)
  return refused('SIX_SOURCE_PHOTOS_REQUIRED')
 const photoHash=new Map<string,string>(),usedHash=new Set<string>()
 for(const raw of photos){
  const p=object(raw)
  if(!p||!CAPTURE_KINDS.includes(p.kind as CaptureKind)||
    !SHA.test(String(p.sha256??''))||photoHash.has(p.kind as string)||
    usedHash.has(p.sha256 as string))
   return refused('INVALID_OR_DUPLICATE_SOURCE')
  photoHash.set(p.kind as string,p.sha256 as string)
  usedHash.add(p.sha256 as string)
 }
 if(CAPTURE_KINDS.some(k=>!photoHash.has(k)))return refused('MISSING_SOURCE_VIEW')
 const rows=item.comparisons
 if(!Array.isArray(rows)||rows.length!==REVIEW_VIEWS.length)
  return refused('FOUR_COMPARISONS_REQUIRED')
 const kinds=new Set<string>(),differences:string[]=[],uncertain:string[]=[]
 for(const raw of rows){
  const row=object(raw),findings=object(row?.findings)
  const kind=row?.kind
  if(!row||!REVIEW_VIEWS.includes(kind as Vehicle3DReferenceKind)||
     kinds.has(kind as string)||row.originalSha256!==photoHash.get(kind as string)||
     !SHA.test(String(row.renderSha256??''))||!findings)
   return refused('COMPARISON_BINDING_FAILED')
  kinds.add(kind as string)
  if(typeof row.note!=='string'||row.note.length>4000||
     /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(row.note))
   return refused('INVALID_REVIEW_NOTES')
  if(Object.keys(findings).length!==REVIEW_FEATURES.length||
     REVIEW_FEATURES.some(f=>!ALLOWED.has(findings[f] as ReviewFinding)))
   return refused('INCOMPLETE_FEATURE_CHECKLIST')
  for(const f of REVIEW_FEATURES){
   if(findings[f]==='differs')differences.push(String(kind)+':'+f)
   if(findings[f]==='uncertain')uncertain.push(String(kind)+':'+f)
  }
 }
 if(REVIEW_VIEWS.some(k=>!kinds.has(k)))return refused('MISSING_COMPARISON_VIEW')
 if(typeof item.reviewerNote!=='string'||item.reviewerNote.length>4000)
  return refused('INVALID_REVIEW_NOTES')
 if(differences.length)return {status:'revision_required',differences,uncertain}
 if(uncertain.length)return {status:'additional_evidence_required',uncertain}
 return {status:'human_review_required',comparisonCount:4,remainingAuthority:[...remainingAuthority]}
}
