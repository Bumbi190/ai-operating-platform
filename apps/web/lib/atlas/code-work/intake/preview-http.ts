/**
 * Authenticated, operator-only, read-only code-work instruction preview.
 * Observes the trusted Omnira GitHub main ref, but has NO verified mapping
 * to an owned Omnira project. No proposal, approval or work is created.
 */
import 'server-only'
import {NextResponse} from 'next/server'
import {assertSameOrigin,readJsonBody} from '@/lib/atlas/executive/http'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {parseCodeWorkInstruction} from './instruction'
import {prepareCodeWorkIntakePreview} from './preview'
import {observeTrustedOmniraMain} from './git-base'

export const CODE_WORK_INTAKE_NO_EXECUTION=true as const
type Access=typeof resolvePlatformOperator
interface Dependencies{operator?:Access;gitBase?:typeof observeTrustedOmniraMain}
const noStore={'Cache-Control':'private, no-store'}
const respond=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:noStore})
const error=(reason:string,status:number)=>respond({error:reason,executionEnabled:false},status)

/**
 * Parsing is allowed only after authentication. The output is not an admission
 * or an authorization token. Git SHA comes from a fixed, verified GitHub ref;
 * the missing owned-project mapping keeps the route unapprovable.
 */
export async function handleCodeWorkIntakeDraft(request:Request,deps:Dependencies={}):Promise<NextResponse>{
 const origin=assertSameOrigin(request)
 if(origin){origin.headers.set('Cache-Control','private, no-store');return origin}
 const access=await(deps.operator??resolvePlatformOperator)()
 if(!access.ok)return error(access.reason==='unauthenticated'?'Unauthorized':'Not found',
  access.reason==='unauthenticated'?401:404)
 const body=await readJsonBody(request)
 if(body instanceof NextResponse){body.headers.set('Cache-Control','private, no-store');return body}
 if(Object.keys(body).length!==2||!Object.prototype.hasOwnProperty.call(body,'instruction')||
    !Object.prototype.hasOwnProperty.call(body,'inputSource')||
    typeof body.instruction!=='string'||body.instruction.length>4096||
    (body.inputSource!=='text'&&body.inputSource!=='voice')){
  return error('invalid_request',400)
 }
 const parsed=parseCodeWorkInstruction(body.instruction,body.inputSource)
 if(parsed.status==='invalid')return error(parsed.reason,400)
 if(parsed.status==='not_code_work_intent')return respond({status:'not_code_work_intent',executionEnabled:false})
 if(parsed.status==='needs_details')return respond({
   status:'needs_details',missing:parsed.missing,example:parsed.example,executionEnabled:false,
 })
 const draft={objective:parsed.request.objective,kind:parsed.request.kind,writePaths:parsed.request.writePaths}
 // Only the server's fixed GitHub allowlisted ref is trusted. No GitHub token or
 // model calls are required. Network failure never creates a fake SHA or preview.
 const observed=await(deps.gitBase??observeTrustedOmniraMain)()
 if(!observed.ok)return respond({
  status:'binding_required',reason:'trusted_git_base_unavailable',
  draft,executionEnabled:false,approvalAvailable:false,
  nextStep:'GitHub-basen kunde inte verifieras. Försök igen senare.',
 })
 try{
  // No real code-model qualification has been established. The router must
  // propose Standard for ordinary work and require an explicit owner choice.
  const preview=prepareCodeWorkIntakePreview(parsed.request,{
   repositoryId:observed.repositoryId,pinnedBaseSha:observed.pinnedBaseSha,localQualified:null,
  })
  return respond({
   status:'project_binding_required',
   reason:'owned_project_repository_mapping_unconfigured',
   draft,verifiedGit:{repositoryId:observed.repositoryId,
    baseRef:observed.baseRef,pinnedBaseSha:observed.pinnedBaseSha},
   proposed:{risk:preview.risk,sensitivePaths:preview.sensitivePaths,
    authorProfile:preview.authorProfile,authorModel:preview.authorModel,
    reviewerProfile:preview.reviewerProfile,authorCapSek:preview.authorCapSek,
    reviewerCapSek:preview.reviewerCapSek,totalCapSek:preview.totalCapSek,
    requiresOwnerChoice:preview.requiresOwnerChoice,
    requiresIndependentReview:true,previewFingerprint:preview.previewFingerprint,
   },
   projectBindingVerified:false,executionEnabled:false,approvalAvailable:false,
   nextStep:'Git-basen är verifierad, men Omnira-repot saknar godkänd koppling till ett ägt Atlas-projekt. Inget jobb kan godkännas eller startas.',
  })
 }catch{return error('scope_or_binding_rejected',400)}
}
