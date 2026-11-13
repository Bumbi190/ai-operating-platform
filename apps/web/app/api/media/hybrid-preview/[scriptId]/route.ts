/**
 * GET /api/media/hybrid-preview/[scriptId]?video_asset_id=<asset-uuid>&...
 *
 * PRIVATE PREVIEW INPUT ONLY, never video generation, external render, social
 * scheduling or publication. Returns time-bounded signed media URLs only after
 * both platform-operator and canonical project ownership authorization.
 *
 * The normal legacy render/start route remains untouched.
 */
import {NextResponse} from 'next/server'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {resolveProjectAccess,assertProjectAllowed} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {jsonStringArray} from '@/lib/supabase/json'
import {buildVideoInputProps} from '@/lib/media/video-props'
import {readProjectOwnedReelVideoInputs} from '@/lib/media/project-video-slots-server'
import {
  parseHybridPreviewSelection,
  validatePreviewScriptId,
  isTrustedPreviewSourceUrl,
  HybridPreviewRefusal,
} from '@/lib/media/hybrid-preview-request'
import {VideoSlotRefusal} from '@/lib/media/project-video-slots'

export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=30

// Pilot scope: this review endpoint may never sign assets from another brand.
const THE_PROMPT_PILOT_PROJECT_ID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'

function reply(payload:unknown,status=200){
  return NextResponse.json(payload,{
    status,
    headers:{
      'Cache-Control':'private, no-store, max-age=0',
      'Referrer-Policy':'no-referrer',
      'X-Robots-Tag':'noindex, nofollow',
    },
  })
}

export async function GET(
  request:Request,
  {params}:{params:Promise<{scriptId:string}>},
){
  const operator=await resolvePlatformOperator()
  if(!operator.ok)return reply({ok:false,error:'access_denied'},
    operator.reason==='unauthenticated'?401:403)

  const access=await resolveProjectAccess()
  if(!access.ok)return access.response
  if(access.userId!==operator.userId)return reply({ok:false,error:'access_denied'},403)

  let scriptId:string
  try{scriptId=validatePreviewScriptId((await params).scriptId)}
  catch{return reply({ok:false,error:'invalid_request'},400)}

  const db=createAdminClient()
  const {data:script,error}=await db.from('media_scripts')
    .select('id,project_id,status,video_status,hook,audio_url,timing_url,duration_ms,images')
    .eq('id',scriptId)
    .eq('project_id',THE_PROMPT_PILOT_PROJECT_ID)
    .maybeSingle()

  // A foreign and a nonexistent script are indistinguishable (service-role
  // clients bypass RLS). No private asset is signed before ownership passes.
  if(error||!script||!assertProjectAllowed(script.project_id,access.allowedProjectIds))
    return reply({ok:false,error:'not_found'},404)

  const images=jsonStringArray(script.images)
  let selected:(string|null)[]
  try{
    selected=parseHybridPreviewSelection(new URL(request.url).searchParams,images.length)
  }catch(e){
    return reply({ok:false,error:e instanceof HybridPreviewRefusal?e.code:'invalid_request'},400)
  }
  if(!script.audio_url||!script.timing_url||
    typeof script.duration_ms!=='number'||
    !Number.isFinite(script.duration_ms)||script.duration_ms<1000||
    script.duration_ms>120000||script.video_status!=='ready'||
    !isTrustedPreviewSourceUrl(script.audio_url,process.env.NEXT_PUBLIC_SUPABASE_URL)||
    !isTrustedPreviewSourceUrl(script.timing_url,process.env.NEXT_PUBLIC_SUPABASE_URL)||
    images.some(i=>!isTrustedPreviewSourceUrl(i,process.env.NEXT_PUBLIC_SUPABASE_URL))){
    return reply({ok:false,error:'source_not_ready'},409)
  }

  try{
    const sceneVideos=await readProjectOwnedReelVideoInputs({
      projectId:script.project_id,
      imageCount:images.length,
      videoAssetIds:selected,
    })
    const inputProps=await buildVideoInputProps({
      hook:script.hook??'',
      audioUrl:script.audio_url,
      timingUrl:script.timing_url,
      durationMs:script.duration_ms,
      images,
      sceneVideos,
      accentColor:'#6366f1',
    })
    return reply({
      ok:true,
      mode:'private_review_only',
      scriptId:script.id,
      projectId:script.project_id,
      sourceAlreadyPublished:script.status==='published',
      canGenerate:false,
      canPublish:false,
      canSchedule:false,
      imageCount:images.length,
      videoCount:sceneVideos.filter(Boolean).length,
      renderInput:inputProps,
    })
  }catch(e){
    if(e instanceof VideoSlotRefusal){
      const code=e.code==='project_mismatch'||e.code==='asset_unavailable'?'asset_unavailable':
        e.code==='invalid_slots'?'invalid_selection':'asset_invalid'
      return reply({ok:false,error:code},code==='invalid_selection'?400:404)
    }
    // Do not log signed URLs, remote errors, project identifiers or auth tokens.
    return reply({ok:false,error:'preview_unavailable'},503)
  }
}
