/**
 * Pure planning-only intake. Never grants authority, calls a model or writes to Git.
 * Actual execution must independently pass SDF-1B admission and SDF-1C containment.
 */
import {canonicalTargetVersionHash} from '@/lib/atlas/authorization/build'
import {normalizeRepoRelativePath} from '../path-policy'
import {lookupTrustedRepository} from '../repository-registry'
import {AUTHOR_PROFILES,REVIEWER_PROFILES,proposeProfiles,type CodeWorkRequestShape,type LocalQualification} from '../model-routing/model-router'

export const INTAKE_SCHEMA='atlas.code_work_intake_preview.v1' as const
type Kind=CodeWorkRequestShape['kind']
export interface IntakeInput{objective:string;kind:Kind;writePaths:string[]}
export interface IntakeContext{repositoryId:string;pinnedBaseSha:string;localQualified:LocalQualification|null}
export interface IntakePreview{
 schema:typeof INTAKE_SCHEMA;state:'awaiting_human_approval';noAuthorityGranted:true;executionEnabled:false
 repositoryId:string;pinnedBaseSha:string;objective:string;kind:Kind
 writePaths:string[];sensitivePaths:string[];risk:'low'|'medium'|'high'
 authorProfile:'small'|'standard'|'complex';authorModel:string|null
 reviewerProfile:string;reviewerFamily:string
 authorCapSek:number;reviewerCapSek:number;totalCapSek:number
 requiresOwnerChoice:boolean;requiresIndependentReview:true;requiresExactHumanApproval:true
 reasons:string[];previewFingerprint:string
}
const SHA=/^[a-f0-9]{40}$/
const DIGEST=/^sha256:[a-f0-9]{64}$/
const KINDS=new Set(['ui_fix','bugfix','feature','refactor'])
const isKind=(v:unknown):v is Kind=>typeof v==='string'&&KINDS.has(v)
const LOCAL_MODELS=new Set(['qwen2.5-coder:7b','qwen2.5-coder:14b'])
const FILE_EXTENSION=/\.(?:ts|tsx|js|jsx|css|scss|json|md|mdx|sql|mjs|cjs|yaml|yml)$/
const PRESENTATION_EXTENSION=/\.(?:ts|tsx|js|jsx|css|scss)$/
const PROTECTED=/(?:^|[-_.])(auth|authorization|security|secret|credential|identity|permission|policy|admin|approval|review|broker|budget|billing|payment|token|session|registry|guard|model|config|release|deploy|pipeline|middleware|worker|migration|rls|executor|execution|runtime|shell|command|risk)(?:$|[-_.])/i
const PROTECTED_HINT=/auth|approv|review|secret|credent|secur|admin|budget|billing|payment|token|permission|publish|deploy|release|policy|registry|broker|guard|model|worker|session|config|access|workflow|trading/i
function presentationOnly(path:string):boolean{
 const p=path.toLowerCase()
 return (p.startsWith('apps/web/components/')||p.startsWith('apps/web/lib/ui/'))&&
   PRESENTATION_EXTENSION.test(p)&&/^[\x20-\x7e]+$/.test(p)&&
   !p.split('/').some(part=>PROTECTED.test(part)||PROTECTED_HINT.test(part))
}
const isRecord=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const exact=(r:Record<string,unknown>,keys:string[])=>Object.keys(r).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(r,k))

/**
 * The requester cannot set securitySensitive, costs, repository pins or model IDs.
 * The server must supply ctx from trusted repositories and qualified local models.
 * This preview is NOT an admission or an owner approval receipt.
 */
export function prepareCodeWorkIntakePreview(input:unknown,ctx:IntakeContext):IntakePreview{
 if(!isRecord(input)||!exact(input,['objective','kind','writePaths']))throw Error('invalid_intake_request')
 const {objective,kind,writePaths}=input
 if(typeof objective!=='string'||objective.length<1||objective.length>1500||
    objective.trim()!==objective||objective.includes('\0'))throw Error('invalid_intake_objective')
 if(!isKind(kind)||!Array.isArray(writePaths)||
    writePaths.length<1||writePaths.length>8)throw Error('invalid_intake_scope')
 if(!ctx||!lookupTrustedRepository(ctx.repositoryId)||!SHA.test(ctx.pinnedBaseSha))throw Error('untrusted_intake_context')
 if(ctx.localQualified!==null&&(!ctx.localQualified||
    !LOCAL_MODELS.has(ctx.localQualified.modelId)||!DIGEST.test(ctx.localQualified.digest))){
   throw Error('unqualified_local_model')
 }
 const normalized:string[]=[]
 for(const raw of writePaths){
  const r=normalizeRepoRelativePath(raw,'writePaths')
  if(!r.ok)throw Error('invalid_intake_path:'+r.violations[0]?.code)
  if(!r.value.includes('/')||!FILE_EXTENSION.test(r.value)||/[?*\[\]{}]/.test(r.value)){
   throw Error('intake_requires_exact_files')
  }
  normalized.push(r.value)
 }
 // Refuse case-insensitive aliases: the intended Windows worktree cannot disambiguate them.
 if(new Set(normalized.map(p=>p.toLowerCase())).size!==normalized.length)throw Error('duplicate_intake_paths')
 normalized.sort()
 const sensitivePaths=normalized.filter(p=>!presentationOnly(p))
 const selected=proposeProfiles({kind,filesInScope:normalized.length,
   securitySensitive:sensitivePaths.length>0},{localQualified:ctx.localQualified})
 const author=AUTHOR_PROFILES[selected.author]
 const reviewer=REVIEWER_PROFILES.find(p=>p.id===selected.reviewer)
 if(!reviewer)throw Error('unregistered_reviewer')
 const binding={
  schema:INTAKE_SCHEMA,repositoryId:ctx.repositoryId,pinnedBaseSha:ctx.pinnedBaseSha,
  objective,kind,writePaths:normalized,sensitivePaths,
  authorProfile:selected.author,authorModel:selected.authorModel,
  reviewerProfile:reviewer.id,reviewerModel:reviewer.modelId,
  localDigest:selected.author==='small'?ctx.localQualified?.digest:null,
  authorCapSek:author.capSek,reviewerCapSek:reviewer.capSek,
  requiresExactHumanApproval:true,executionEnabled:false,
 }
 return {
  schema:INTAKE_SCHEMA,state:'awaiting_human_approval',noAuthorityGranted:true,executionEnabled:false,
  repositoryId:ctx.repositoryId,pinnedBaseSha:ctx.pinnedBaseSha,
  objective,kind,writePaths:normalized,sensitivePaths,risk:selected.risk,
  authorProfile:selected.author,authorModel:selected.authorModel,
  reviewerProfile:reviewer.id,reviewerFamily:reviewer.family,
  authorCapSek:author.capSek,reviewerCapSek:reviewer.capSek,
  totalCapSek:author.capSek+reviewer.capSek,
  requiresOwnerChoice:selected.requiresOwnerChoice,
  requiresIndependentReview:true,requiresExactHumanApproval:true,
  reasons:selected.reasons,previewFingerprint:canonicalTargetVersionHash(binding),
 }
}
