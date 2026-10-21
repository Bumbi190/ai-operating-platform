import {createHash} from 'node:crypto'
import type {SocialContentInput} from './types'
import {FAMILY_WEEKLY_PROJECT_ID,type FamilyWeekGap} from './family-weekly-coverage'

/**
 * Project-owned, public MARKETING evidence. No subscriber story pages,
 * entitlement assumptions, private audio or signed media URLs.
 *
 * Adding a month requires a new, reviewed source pack: changing dates, themes,
 * asset hashes or text templates never happens from user-provided tool args.
 */
export type FamilyEditorialPack={
  readonly id:string
  readonly projectId:typeof FAMILY_WEEKLY_PROJECT_ID
  readonly themeMonth:string
  readonly proof:{readonly kind:'owner-reviewed-public-preview';readonly heroSha256:string;
    readonly activitySha256:string;readonly privateSubscriberAssetsIncluded:false}
  readonly planRevisionId:string
  readonly eligibleDates:Readonly<Record<string,{
    readonly variant:string
    readonly title:string
    readonly text:string
    readonly mediaBrief:string
  }>>
  readonly allowedKinds:readonly ['ordinary']
  readonly mayClaimRelease:false
  readonly mayGenerateMedia:false
  readonly mayPublish:false
}
const SHA=/^[0-9a-f]{64}$/
const APPROVED_FAMILY_PLAN='e745041f-ad3a-493f-bd3b-025525d561b2'

/**
 * Existing owner-grounded public preview of November, recorded before launch.
 * Copy below is STILL a proposed caption that needs editorial review.
 * No release claims such as "now available" are authorized.
 */
const NOVEMBER_2026_PREVIEW:FamilyEditorialPack={
 id:'family-public-november-preview-2026-v1',
 projectId:FAMILY_WEEKLY_PROJECT_ID,
 themeMonth:'2026-11',
 proof:{
  kind:'owner-reviewed-public-preview',
  heroSha256:'5789a09f28ad95334d5d1a3a08af3cc3d3201468d28f66f310da860db0815a76',
  activitySha256:'ffd12c414aba2b71e2c39965c22e5c71f1028905eb5ed64217c054893604b31b',
  privateSubscriberAssetsIncluded:false,
 },
 planRevisionId:APPROVED_FAMILY_PLAN,
 eligibleDates:{
  '2026-10-23':{
   variant:'forest',title:'En smygtitt p? november',
   text:'Vi f?rbereder L?v- och Skuggm?naden med Nova och Pling. Snart v?ntar nya skogs?ventyr och aktiviteter att uppt?cka tillsammans. Vad hoppas ni f? utforska?',
   mediaBrief:'V?lj en redan godk?nd, projekt?gd novemberillustration med Nova och Pling. Registrera bilden i Omnira och granska dess hash innan godk?nnande. Inga privata sagosidor eller ljud f?r publiceras.',
  },
  '2026-10-27':{
   variant:'shadows',title:'F?lj skuggorna med Nova och Pling',
   text:'Vilka former kan en skugga g?mma? I november bjuder Nova och Pling in till L?v- och Skuggm?naden. En liten smygtitt p? ett ?ventyr som snart v?ntar.',
   mediaBrief:'Anv?nd endast en redan granskad, offentlig novemberillustration med Nova och Pling. Ingen privat medlemsbild eller ljudfil f?r anv?ndas.',
  },
  '2026-10-30':{
   variant:'leaves',title:'Snart v?ntar L?v- och Skuggm?naden',
   text:'Bland l?v och skuggor v?ntar nya stunder med Nova och Pling. Vi f?rbereder november tillsammans ? med fantasi, lek och tid f?r varandra.',
   mediaBrief:'V?lj en godk?nd offentlig novemberillustration med l?v, skuggor och Nova och Pling. Skapa inte en ny bild automatiskt.',
  },
 },
 allowedKinds:['ordinary'],
 mayClaimRelease:false,
 mayGenerateMedia:false,
 mayPublish:false,
}
const PINNED_SOURCE_PACKS:readonly FamilyEditorialPack[]=[NOVEMBER_2026_PREVIEW]

/** Read-only compatibility marker, NOT release or caption approval. */
export const FAMILY_PUBLIC_PREVIEW_EVIDENCE=Object.freeze({
 projectId:NOVEMBER_2026_PREVIEW.projectId,
 month:NOVEMBER_2026_PREVIEW.themeMonth,
 heroSha256:NOVEMBER_2026_PREVIEW.proof.heroSha256,
 activitySha256:NOVEMBER_2026_PREVIEW.proof.activitySha256,
 privateAssetsIncluded:false as const,
})

function validPack(pack:FamilyEditorialPack){
 if(pack.projectId!==FAMILY_WEEKLY_PROJECT_ID||
  pack.proof.kind!=='owner-reviewed-public-preview'||
  pack.proof.privateSubscriberAssetsIncluded!==false||
  !SHA.test(pack.proof.heroSha256)||!SHA.test(pack.proof.activitySha256)||
  pack.planRevisionId!==APPROVED_FAMILY_PLAN||
  pack.mayClaimRelease!==false||pack.mayPublish!==false||
  pack.mayGenerateMedia!==false||
  pack.allowedKinds.length!==1||pack.allowedKinds[0]!=='ordinary'||
  !/^20\d{2}-(0[1-9]|1[0-2])$/.test(pack.themeMonth))
  throw Error('FAMILY_EDITORIAL_SOURCE_NOT_APPROVED')
 const keys=Object.keys(pack.eligibleDates)
 if(keys.length<1||keys.length>12)throw Error('FAMILY_EDITORIAL_SOURCE_NOT_APPROVED')
 for(const day of keys){
  const entry=pack.eligibleDates[day]
  const dateMs=Date.parse(day+'T00:00:00.000Z')
  const releaseStart=Date.parse(pack.themeMonth+'-01T00:00:00.000Z')
  if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day)||
   !Number.isFinite(dateMs)||new Date(dateMs).toISOString().slice(0,10)!==day||
   dateMs>=releaseStart||dateMs<releaseStart-45*86400000||entry.variant.length<2||
   entry.title.length<2||entry.title.length>150||
   entry.text.length<10||entry.text.length>5000||
   entry.mediaBrief.length>1000||
   /\b(nu ute|redan sl?ppt|k?p nu|tillg?nglig nu)\b/i.test(entry.text))
   throw Error('FAMILY_EDITORIAL_SOURCE_NOT_APPROVED')
 }
}

/**
 * Server-owned source lookup; unrecognized months and slots are intentionally
 * skipped instead of triggering model guesses or borrowing last month's copy.
 */
export function getFamilyPublicEditorialSlot(input:{
  projectId:string;planRevisionId:string;date:string;kind:'ordinary'|'month_release';
  channel:'facebook'|'instagram';
}):{sourceId:string;sourceSha256:string;variant:string;draft:Pick<SocialContentInput,
  'channel'|'format'|'title'|'text'|'linkUrl'|'mediaIds'|'mediaBrief'>}|null{
 if(!['facebook','instagram'].includes(input.channel))return null
 if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID||
   input.planRevisionId!==APPROVED_FAMILY_PLAN||
   input.kind!=='ordinary')return null
 const matches=PINNED_SOURCE_PACKS.filter(pack=>
  pack.planRevisionId===input.planRevisionId&&
  Object.hasOwn(pack.eligibleDates,input.date))
 if(matches.length!==1)return null
 const pack=matches[0]
 validPack(pack)
 const entry=pack.eligibleDates[input.date]
 return {
  sourceId:pack.id,
  sourceSha256:createHash('sha256').update(JSON.stringify({
   id:pack.id,themeMonth:pack.themeMonth,proof:pack.proof,
   date:input.date,entry,
  })).digest('hex'),
  variant:entry.variant,
  draft:{
   channel:input.channel,
   format:input.channel==='facebook'?'text':'image',
   title:entry.title,text:entry.text,linkUrl:null,mediaIds:[],
   mediaBrief:input.channel==='instagram'?entry.mediaBrief:'',
  },
 }
}
export function listFamilyEditorialSources(){
 for(const source of PINNED_SOURCE_PACKS)validPack(source)
 return PINNED_SOURCE_PACKS.map(s=>({
  id:s.id,themeMonth:s.themeMonth,eligibleDates:Object.keys(s.eligibleDates),
  releaseAuthorized:false,mediaGenerationAllowed:false,canPublish:false,
 }))
}

/**
 * Atlas can see *why* a week cannot be filled, without trying a paid model
 * and without interpreting a private subscriber month as already released.
 */
export function getFamilyEditorialReadiness(input:{
  projectId:string
  planRevisionId:string
  slots:readonly FamilyWeekGap[]
}){
 if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID||
  input.planRevisionId!==APPROVED_FAMILY_PLAN||
  !Array.isArray(input.slots)||input.slots.length>64)
  throw Error('FAMILY_EDITORIAL_READINESS_UNAVAILABLE')
 const gaps=input.slots.filter(slot=>slot.status==='needs_content')
 const readiness=gaps.map(slot=>{
  const source=getFamilyPublicEditorialSlot({
   projectId:input.projectId,planRevisionId:input.planRevisionId,
   date:slot.localMinute.slice(0,10),
   kind:slot.kind,channel:slot.channel,
  })
  return {
   channel:slot.channel,kind:slot.kind,localMinute:slot.localMinute,
   sourceState:source?'public_preview_ready':'approved_public_source_missing',
   sourceId:source?.sourceId??null,
   needsOwnerReleaseEvidence:slot.kind==='month_release',
   canAutomaticallyPublish:false as const,
  }
 })
 return {
  sourceReady:readiness.filter(r=>r.sourceState==='public_preview_ready').length,
  sourceMissing:readiness.filter(r=>r.sourceState==='approved_public_source_missing').length,
  missing:readiness,
  aiSourceGuessingAllowed:false as const,
 }
}
