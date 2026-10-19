/**
 * The Prompt seven-day creative trial — a deterministic PLAN, not a scheduler
 * or permission to publish. No cron/provider/database/network calls.
 *
 * Both variants must use fresh, independently verified news, canonical
 * Victoria, word-aligned English captions and the approved FOLLOW outro.
 * Slots are local Stockholm wall times; existing UTC cron must be reviewed
 * separately before implementing this plan (DST in October).
 */
export type CreativeVariant='text_motion'|'story_visual'
export type TrialSlot='10:00'|'20:00'
export interface PlannedEpisode{
  localDate:string
  localTime:TrialSlot
  variant:CreativeVariant
  dayIndex:number
  expectedProject:'the-prompt'
  approvalRequired:true
}
export interface TrialPlan{
  startLocalDate:string
  endLocalDate:string
  slots:PlannedEpisode[]
  expectedPosts:14
  maxPostsPerDay:2
  warnings:readonly string[]
}
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/
function nextDate(date:string,days:number):string{
  const at=new Date(date+'T00:00:00.000Z')
  at.setUTCDate(at.getUTCDate()+days)
  return at.toISOString().slice(0,10)
}
/** Caller picks start only after release/approval; no automatic tomorrow. */
export function planThePromptTrial(startLocalDate:string):TrialPlan{
  if(!ISO_DATE.test(startLocalDate)||
     !Number.isFinite(Date.parse(startLocalDate+'T00:00:00Z'))||
     new Date(startLocalDate+'T00:00:00Z').toISOString().slice(0,10)!==startLocalDate)
    throw Error('INVALID_TRIAL_START_DATE')
  const slots:PlannedEpisode[]=[]
  for(let dayIndex=0;dayIndex<7;dayIndex++){
    const localDate=nextDate(startLocalDate,dayIndex)
    slots.push({
      localDate,localTime:'10:00',
      variant:dayIndex%2===0?'text_motion':'story_visual',
      dayIndex,expectedProject:'the-prompt',approvalRequired:true,
    })
    slots.push({
      localDate,localTime:'20:00',
      variant:dayIndex%2===0?'story_visual':'text_motion',
      dayIndex,expectedProject:'the-prompt',approvalRequired:true,
    })
  }
  return{
    startLocalDate,endLocalDate:nextDate(startLocalDate,6),
    slots,expectedPosts:14,maxPostsPerDay:2,
    warnings:[
      'A scheduled slot does not authorize a post; require approved source, media rights and actual rendered video.',
      'Never add a third upload or publish older clips merely to fill a missed slot.',
      'Subjects and posting windows still vary; a seven-day comparison is exploratory, not causal proof.',
      'Measure platform-specific views and engagement at the same actual post age, never by calendar day alone.',
      'Publishing stays on Europe/Stockholm local wall clock, with separate DST-safe reviewed cron changes.',
    ],
  }
}
