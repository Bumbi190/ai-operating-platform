/**
 * Authenticated, operator-only, read-only code-work instruction preview.
 * No trusted Git base resolver exists yet. Never accepts caller-supplied
 * repository, model qualification, approval or spend; cannot create work.
 */
import 'server-only'
import {NextResponse} from 'next/server'
import {assertSameOrigin,readJsonBody} from '@/lib/atlas/executive/http'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {parseCodeWorkInstruction} from './instruction'

export const CODE_WORK_INTAKE_NO_EXECUTION=true as const
type Access=typeof resolvePlatformOperator
interface Dependencies{operator?:Access}
const noStore={'Cache-Control':'private, no-store'}
const respond=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:noStore})
const error=(reason:string,status:number)=>respond({error:reason,executionEnabled:false},status)

/**
 * Parsing is allowed only after authentication. The output is not an admission
 * or a preview fingerprint. Exact repository and Git SHA bindings are absent
 * by design and must be obtained from trusted server state in a later phase.
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
 return respond({
  status:'binding_required',
  reason:'trusted_repository_base_unavailable',
  draft:{objective:parsed.request.objective,kind:parsed.request.kind,writePaths:parsed.request.writePaths},
  executionEnabled:false,approvalAvailable:false,
  nextStep:'Servern måste verifiera projekt, repository och exakt Git-bas innan risk- och modellförslaget kan godkännas.',
 })
}
