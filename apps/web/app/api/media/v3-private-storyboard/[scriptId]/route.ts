/**
 * Private The Prompt V3 storyboard preview for NEW, unpublished scripts.
 *
 * Does not generate videos, reserve credits, mutate rows, render remotely,
 * schedule or publish. It returns the authorized source images/voice/timing
 * and a V3 editorial-hold shot plan for review only.
 */
import {NextResponse} from 'next/server'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {resolveProjectAccess,assertProjectAllowed} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {jsonStringArray} from '@/lib/supabase/json'
import {isTrustedPreviewSourceUrl,validatePreviewScriptId} from '@/lib/media/hybrid-preview-request'
import {buildVideoInputProps,type WordTiming} from '@/lib/media/video-props'
import {
  planThePromptV3PrivateStoryboard,
  THEPROMPT_V3_PROJECT,
  V3StoryboardRefusal,
} from '@/lib/media/theprompt-v3-storyboard'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export const maxDuration=30

const MAX_TIMING_BYTES=100_000
// A documented source-script claim conflict from manual checking 28 Oct 2026.
// This particular narration incorrectly says AI decided UK asylum claims.
// Do NOT promote this to production even when DB quality_score.passed=true.
const DOCUMENTED_FACT_CONFLICT_SCRIPT='b9271d5b-5254-4ad8-a36c-ce7c66e9c63e'

function response(body:unknown,status=200){
  return NextResponse.json(body,{status,headers:{
    'Cache-Control':'private, no-store, max-age=0',
    'Referrer-Policy':'no-referrer',
    'X-Robots-Tag':'noindex, nofollow',
  }})
}
function isExactProjectMediaUrl(value:unknown,kind:'audio'|'data'|'images',scriptId:string):value is string{
  if(!isTrustedPreviewSourceUrl(value,process.env.NEXT_PUBLIC_SUPABASE_URL))return false
  try{
    const url=new URL(value)
    const stem=`/storage/v1/object/public/media-assets/${kind}/${THEPROMPT_V3_PROJECT}/${scriptId}`
    return url.pathname.startsWith(stem) &&
      !url.search && !url.hash
  }catch{return false}
}

async function readVerifiedWordTiming(timingUrl:string):Promise<WordTiming[]>{
  const result=await fetch(timingUrl,{
    redirect:'error',
    cache:'no-store',
    signal:AbortSignal.timeout(9000),
  })
  const length=Number(result.headers.get('content-length')??0)
  if(!result.ok||length>MAX_TIMING_BYTES)throw new Error('TIMING_UNAVAILABLE')
  const data=await result.text()
  if(data.length>MAX_TIMING_BYTES)throw new Error('TIMING_OVERSIZED')
  const decoded=JSON.parse(data) as {words?:WordTiming[]}
  if(!Array.isArray(decoded.words))throw new Error('TIMING_INVALID')
  return decoded.words
}

export async function GET(
  request:Request,
  {params}:{params:Promise<{scriptId:string}>},
){
  const operator=await resolvePlatformOperator()
  if(!operator.ok)return response({ok:false,error:'access_denied'},
    operator.reason==='unauthenticated'?401:403)
  const access=await resolveProjectAccess()
  if(!access.ok)return access.response
  if(access.userId!==operator.userId)return response({ok:false,error:'access_denied'},403)

  let id:string
  try{id=validatePreviewScriptId((await params).scriptId)}
  catch{return response({ok:false,error:'invalid_request'},400)}
  if([...new URL(request.url).searchParams.keys()].length>0)
    return response({ok:false,error:'invalid_request'},400)

  const db=createAdminClient()
  const {data:script,error}=await db.from('media_scripts')
    .select('id,project_id,status,news_item_id,voice_status,video_status,hook,audio_url,timing_url,duration_ms,images,quality_score')
    .eq('id',id)
    .eq('project_id',THEPROMPT_V3_PROJECT)
    .maybeSingle()
  if(error||!script||!assertProjectAllowed(script.project_id,access.allowedProjectIds))
    return response({ok:false,error:'not_found'},404)
  if(script.status==='published')return response({ok:false,error:'already_published'},409)
  const images=jsonStringArray(script.images)
  if(script.voice_status!=='ready'||typeof script.duration_ms!=='number'||
    !Number.isInteger(script.duration_ms)||
    images.length===0||images.length>5||
    !isExactProjectMediaUrl(script.audio_url,'audio',id)||
    !isExactProjectMediaUrl(script.timing_url,'data',id)||
    images.some(img=>!isExactProjectMediaUrl(img,'images',id)))
    return response({ok:false,error:'source_not_ready'},409)

  try{
    const words=await readVerifiedWordTiming(script.timing_url)
    const quality=script.quality_score
    const verdict=quality&&typeof quality==='object'&&!Array.isArray(quality)
      ?String((quality as Record<string,unknown>).verdict??'')
      :''
    const sourceFactStatus=id===DOCUMENTED_FACT_CONFLICT_SCRIPT
      ?'conflict' as const:'unverified' as const
    const storyboard=planThePromptV3PrivateStoryboard({
      projectId:script.project_id,
      scriptId:id,
      status:script.status,
      durationMs:script.duration_ms,
      imageCount:images.length,
      words,
      qualityVerdict:verdict,
      sourceFactStatus,
    })
    const renderInput=await buildVideoInputProps({
      hook:script.hook??'',
      audioUrl:script.audio_url,
      timingUrl:script.timing_url,
      durationMs:script.duration_ms,
      images,
      v3Storyboard:storyboard,
      wordTimings:words,
    })
    return response({
      ok:true,
      mode:'private_review_only',
      style:'theprompt-dynamic-v3',
      scriptId:script.id,
      projectId:script.project_id,
      sourceNotPublished:true,
      editorialHold:storyboard.editorialHold,
      canGenerate:false,canPublish:false,canSchedule:false,
      noPaidCalls:true,
      renderInput,
    })
  }catch(e){
    const reason=e instanceof V3StoryboardRefusal?e.code:'preview_unavailable'
    return response({ok:false,error:reason},409)
  }
}
