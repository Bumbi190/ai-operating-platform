/**
 * Read-only Preview dashboard for The Prompt daily editorial planning.
 * Reuses the existing verified operator/project grant, no model, billing, or
 * publishing actions. Not a cron or general-purpose API.
 */
import { ownedPromptProject } from '@/lib/ai/bedrock-pilot/saved-review-data'
import { planTodaysPromptArticles } from '@/lib/article/daily/inventory'
import { buildEditorialHandoff } from '@/lib/article/daily/agent-blueprint'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20
const PILOT_BRANCH='feat/omnira-bedrock-pilot-20261116'

function json(status:number, payload:Record<string,unknown>):Response {
  return Response.json(payload,{status,headers:{'Cache-Control':'private, no-store'}})
}

export async function POST(req:Request):Promise<Response> {
  if(process.env.VERCEL_ENV!=='preview' ||
     process.env.VERCEL_GIT_COMMIT_REF!==PILOT_BRANCH){
    return json(404,{ok:false,reason:'not_isolated_preview'})
  }
  let origin:string
  try{origin=new URL(req.url).origin}catch{
    return json(403,{ok:false,reason:'origin_denied'})
  }
  if(req.headers.get('origin')!==origin ||
     req.headers.get('sec-fetch-site')!=='same-origin'){
    return json(403,{ok:false,reason:'origin_denied'})
  }
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')){
    return json(415,{ok:false,reason:'json_required'})
  }
  let raw:string
  try{raw=await req.text()}catch{return json(400,{ok:false,reason:'invalid_body'})}
  if(Buffer.byteLength(raw,'utf8')>128)return json(413,{ok:false,reason:'body_too_large'})
  if(raw.trim()!=='{}')return json(400,{ok:false,reason:'invalid_body'})

  // The helper resolves verified operator session + project ownership BEFORE
  // any service-role read. No caller-defined project ID can be supplied.
  const owned=await ownedPromptProject()
  if(!owned.ok)return json(403,{ok:false,reason:'operator_or_project_denied'})
  const result=await planTodaysPromptArticles(new Date().toISOString())
  if(!result.ok)return json(503,{ok:false,reason:result.reason})
  // Both checks must agree on the EXACT same project, fail closed on drift.
  if(result.plan.projectId!==owned.projectId){
    return json(409,{ok:false,reason:'project_scope_mismatch'})
  }
  const handoff=buildEditorialHandoff(result.plan)
  return json(200,{
    ok:true,projectName:owned.projectName,
    generatedAt:result.plan.generatedAt,
    counts:result.plan.counts,
    candidates:result.plan.candidates,
    roles:handoff.roles.map(r=>({role:r.role,purpose:r.purpose,
      state:r.status,canInvokeModel:false,canPublish:false})),
    publicationDecision:'NO_GO',
    reason:handoff.reason,
    modelInvoked:false,spent:false,published:false,
  })
}
