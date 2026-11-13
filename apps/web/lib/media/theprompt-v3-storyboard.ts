/**
 * The Prompt Dynamic V3: deterministic, private, zero-spend storyboarding.
 *
 * Takes a NEW, unpublished, project-owned script and creates 2–3s shots from
 * its existing fallback images. This is a data plan only: no AI requests,
 * no image admission, no Supabase writes, no render, no social dispatch.
 *
 * The style is approved; the narration/facts are NEVER approved by this plan.
 */
export const THEPROMPT_V3_PROJECT='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
export const THEPROMPT_V3_MASTER_SHA256=
  'd23d62737aa04b4203159b0da0f775a88addf50274e16c79d3bfa12e8f092788'
export const THEPROMPT_V3_FPS=30
export const THEPROMPT_V3_OUTRO_FRAMES=75

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface TimedWord {
  word:string
  startMs:number
  endMs:number
}

export interface V3StoryboardShot {
  index:number
  imageIndex:number
  startFrame:number
  durationFrames:number
  zoomFrom:number
  zoomTo:number
  panFrom:[number,number]
  panTo:[number,number]
  transitionInFrames:number
}

export interface V3PrivateStoryboard {
  schema:'theprompt.v3.private-storyboard.v1'
  projectId:string
  scriptId:string
  referenceSha256:string
  fps:30
  contentFrames:number
  outroFrames:75
  totalFrames:number
  shots:V3StoryboardShot[]
  safeAudioMilliseconds:number
  captionWordCount:number
  editorialHold:{required:true;reasons:string[];overlay:string}
  canGenerate:false
  canPublish:false
  canSchedule:false
}

export interface V3StoryboardInput {
  projectId:string
  scriptId:string
  status:string
  durationMs:number
  imageCount:number
  words:ReadonlyArray<TimedWord>
  qualityVerdict?:string|null
  sourceFactStatus:'conflict'|'unverified'|'independently_reviewed'
}

export class V3StoryboardRefusal extends Error {
  readonly code:string
  constructor(code:string) {
    super('THEPROMPT_V3_STORYBOARD_REFUSED')
    this.name='V3StoryboardRefusal'
    this.code=code
  }
}

function verifyTiming(words:ReadonlyArray<TimedWord>,durationMs:number):boolean {
  if(!Array.isArray(words)||words.length<6||words.length>1000)return false
  let previousEnd=0
  for(const word of words){
    if(!word||typeof word.word!=='string'||!word.word.trim()||word.word.length>75||
       !Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)||
       word.startMs<0||word.endMs<word.startMs||
       word.endMs>durationMs+500||word.startMs<previousEnd-200)return false
    previousEnd=Math.max(previousEnd,word.endMs)
  }
  return true
}

const motionCycles=[
  {zoomFrom:1.03,zoomTo:1.13,panFrom:[0,0] as [number,number],panTo:[-9,-6] as [number,number]},
  {zoomFrom:1.15,zoomTo:1.04,panFrom:[6,-3] as [number,number],panTo:[-5,4] as [number,number]},
  {zoomFrom:1.04,zoomTo:1.16,panFrom:[-6,4] as [number,number],panTo:[8,-4] as [number,number]},
  {zoomFrom:1.14,zoomTo:1.03,panFrom:[8,2] as [number,number],panTo:[-3,-6] as [number,number]},
] as const

export function planThePromptV3PrivateStoryboard(input:V3StoryboardInput):V3PrivateStoryboard {
  if(!input||input.projectId!==THEPROMPT_V3_PROJECT||!UUID.test(input.scriptId))
    throw new V3StoryboardRefusal('PROJECT_OR_SCRIPT_INVALID')
  if(input.status==='published')throw new V3StoryboardRefusal('ALREADY_PUBLISHED')
  if(!['approved','pending_review'].includes(input.status))
    throw new V3StoryboardRefusal('SOURCE_STATUS_UNSUPPORTED')
  if(!Number.isInteger(input.durationMs)||input.durationMs<10000||input.durationMs>90000)
    throw new V3StoryboardRefusal('DURATION_INVALID')
  if(!Number.isInteger(input.imageCount)||input.imageCount<1||input.imageCount>5)
    throw new V3StoryboardRefusal('IMAGES_INVALID')
  if(!verifyTiming(input.words,input.durationMs))
    throw new V3StoryboardRefusal('WORD_TIMING_INVALID')
  if(!['conflict','unverified','independently_reviewed'].includes(input.sourceFactStatus))
    throw new V3StoryboardRefusal('FACT_STATUS_REQUIRED')

  const contentFrames=Math.ceil(input.durationMs*THEPROMPT_V3_FPS/1000)
  // Aim for roughly 2.2 seconds per image shot, the approved V3's rhythm.
  const shotCount=Math.max(input.imageCount,Math.min(15,Math.round(contentFrames/66)))
  const shots:V3StoryboardShot[]=Array.from({length:shotCount},(_,index)=>{
    const startFrame=Math.floor(index*contentFrames/shotCount)
    const endFrame=index===shotCount-1
      ? contentFrames
      : Math.floor((index+1)*contentFrames/shotCount)
    const motion=motionCycles[index%motionCycles.length]
    return {
      index,
      imageIndex:index%input.imageCount,
      startFrame,
      durationFrames:endFrame-startFrame,
      zoomFrom:motion.zoomFrom,
      zoomTo:motion.zoomTo,
      panFrom:[...motion.panFrom] as [number,number],
      panTo:[...motion.panTo] as [number,number],
      // Four short visual crossfades on a 10-shot ~22-second reel.
      transitionInFrames:index>0&&(index%3===1||index===shotCount-1)?10:0,
    }
  })
  const reasons=['operator_editorial_review_required']
  if(input.sourceFactStatus==='conflict')reasons.push('source_claim_conflict')
  if(input.sourceFactStatus==='unverified')reasons.push('source_facts_unverified')
  if(/parse error|parse failure|unreadable/i.test(input.qualityVerdict??''))
    reasons.push('quality_report_invalid')

  return {
    schema:'theprompt.v3.private-storyboard.v1',
    projectId:input.projectId,
    scriptId:input.scriptId,
    referenceSha256:THEPROMPT_V3_MASTER_SHA256,
    fps:30,
    contentFrames,
    outroFrames:75,
    totalFrames:contentFrames+75,
    shots,
    safeAudioMilliseconds:input.durationMs,
    captionWordCount:input.words.length,
    editorialHold:{
      required:true,
      reasons,
      overlay:'EDITORIAL HOLD — NOT FOR PUBLICATION',
    },
    canGenerate:false,
    canPublish:false,
    canSchedule:false,
  }
}
