/**
 * A separate operator-triggered Preview read, DISABLED unless an extra
 * IAM GetInferenceProfile permission and explicit branch flag are approved.
 * No model invocation, agreements, spending, database writes or publishing.
 */
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {CATALOG_READ_ROLE,getCatalogReadCredentials} from '@/lib/ai/model-control/catalog-oidc'
import {validSystemProfileId,readBedrockProfileDetail} from '@/lib/ai/model-control/profile-detail-service'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=25
const BRANCH='feat/omnira-bedrock-pilot-20261116'

function response(status:number,body:Record<string,unknown>):Response {
  return Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
}
function refuse(status:number,reason:string):Response {
  return response(status,{
    status:'blocked',reason,canDispatch:false,modelCallsMade:false,
    accountEntitlementVerified:false,destinationRegionsApproved:false,
    priceVerified:false,
  })
}
export async function POST(request:Request):Promise<Response> {
  if (process.env.VERCEL_ENV !== 'preview'
    || process.env.VERCEL_GIT_COMMIT_REF !== BRANCH) {
    return refuse(404,'not_isolated_preview')
  }
  let origin:string
  try {origin=new URL(request.url).origin} catch{return refuse(403,'origin_denied')}
  if (request.headers.get('origin')!==origin
    || request.headers.get('sec-fetch-site')!=='same-origin') {
    return refuse(403,'origin_denied')
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return refuse(415,'json_required')
  }
  const length=Number(request.headers.get('content-length')??0)
  if (!Number.isFinite(length)||length>256) return refuse(413,'request_too_large')
  let payload:unknown
  try{
    const body=await request.text()
    if (Buffer.byteLength(body,'utf8')>256) return refuse(413,'request_too_large')
    payload=JSON.parse(body)
  }catch{return refuse(400,'invalid_request')}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)
    ||Object.keys(payload).length!==1
    ||!validSystemProfileId((payload as {profileId?:unknown}).profileId)) {
    return refuse(400,'invalid_profile_id')
  }
  const profileId=(payload as {profileId:string}).profileId
  try{
    const operator=await resolvePlatformOperator()
    if(!operator.ok)return refuse(403,'platform_operator_required')
  }catch{return refuse(403,'platform_operator_required')}
  // Separate from both catalog discovery and availability review.
  // Existing role currently lacks GetInferenceProfile: never attempt it
  // until explicitly approved and configured in this isolated Preview branch.
  if(process.env.OMNIRA_BEDROCK_PROFILE_DETAIL_ENABLED!=='true') {
    return refuse(200,'profile_detail_disabled')
  }
  if(process.env.AWS_BEDROCK_CATALOG_ROLE_ARN!==CATALOG_READ_ROLE) {
    return refuse(200,'catalog_read_role_not_configured')
  }
  const token=request.headers.get('x-vercel-oidc-token')
  if(!token)return refuse(200,'vercel_oidc_token_missing')
  try{
    const credentials=await getCatalogReadCredentials({
      configuredRoleArn:process.env.AWS_BEDROCK_CATALOG_ROLE_ARN,
      oidcToken:token,
    })
    const detail=await readBedrockProfileDetail(credentials,profileId)
    return response(200,detail)
  }catch(error){
    const name=error instanceof Error?error.message:''
    const safe:Record<string,string>={
      PROFILE_READ_IAM_DENIED:'profile_iam_read_permission_missing',
      PROFILE_NOT_UNIQUELY_LISTED:'profile_not_listed_exactly',
      PROFILE_NOT_ACTIVE_SYSTEM_DEFINED:'profile_not_active_system_defined',
      PROFILE_DETAIL_IDENTITY_OR_STATUS_MISMATCH:'profile_identity_mismatch',
      PROFILE_DETAIL_MODEL_LIST_EMPTY:'profile_models_missing',
    }
    return refuse(200,safe[name]??'profile_read_unavailable')
  }
}
