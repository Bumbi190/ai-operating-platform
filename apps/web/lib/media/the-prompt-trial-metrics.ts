/**
 * Honest per-platform creative trial metric comparator.
 * Requires actual historical observations; never reconstructs 24h figures
 * from a single later cumulative view count. Read-only and provider-free.
 */
import type {CreativeVariant} from './the-prompt-trial-plan'
type Platform='instagram'|'facebook'|'youtube'
export interface TrialMeasurement {
  scriptId:string
  platform:Platform
  variant:CreativeVariant
  publishedAt:string
  fetchedAt:string
  views:number|null
  likes?:number|null
  comments?:number|null
  saved?:number|null
  shares?:number|null
  avgViewPct?:number|null
}
export interface TrialCohort {
  platform:Platform
  variant:CreativeVariant
  targetHours:24|72
  observedPosts:number
  medianViews:number|null
  medianInteractions:number|null
  watchPctSampleSize:number
  medianAvgViewPct:number|null
  exploratory:true
}
const targets=[24,72] as const
const platforms=['instagram','facebook','youtube'] as const
const variants=['text_motion','story_visual'] as const
const validNum=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0
const median=(v:number[]):number|null=>{
  if(!v.length)return null
  const a=[...v].sort((x,y)=>x-y)
  return a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2
}
export function compareCreativeTrial(input:readonly TrialMeasurement[],toleranceHours=4):{
  cohorts:TrialCohort[]
  rejectedRows:number
  warnings:string[]
}{
  if(!(toleranceHours>0&&toleranceHours<=6))throw Error('UNSUPPORTED_AGE_TOLERANCE')
  const chosen=new Map<string,{metric:TrialMeasurement;delta:number}>()
  let rejectedRows=0
  for(const row of input){
    if(!row||!row.scriptId||!platforms.includes(row.platform)||
       !variants.includes(row.variant)||!validNum(row.views)){rejectedRows++;continue}
    const start=Date.parse(row.publishedAt),end=Date.parse(row.fetchedAt)
    const age=(end-start)/3600000
    if(!Number.isFinite(start)||!Number.isFinite(end)||age<0){rejectedRows++;continue}
    const target=targets.find(h=>Math.abs(age-h)<=toleranceHours)
    if(!target)continue
    const key=[target,row.platform,row.scriptId].join('|')
    const delta=Math.abs(age-target)
    const current=chosen.get(key)
    if(current){
      if(current.metric.variant!==row.variant){rejectedRows++;continue}
      if(current.delta<delta)continue
      if(current.delta===delta&&
        Date.parse(current.metric.fetchedAt)>=end)continue
    }
    chosen.set(key,{metric:row,delta})
  }
  const cohorts:TrialCohort[]=[]
  for(const targetHours of targets)for(const platform of platforms)for(const variant of variants){
    const sampled=[...chosen.entries()].filter(([key,r])=>
      key.startsWith(targetHours+'|'+platform+'|')&&r.metric.variant===variant)
      .map(([,r])=>r.metric)
    const availableInteractions=sampled
      .filter(x=>[x.likes,x.comments,x.saved,x.shares].some(validNum))
      .map(x=>[x.likes,x.comments,x.saved,x.shares].filter(validNum)
        .reduce((sum,v)=>sum+v,0))
    const retention=platform==='youtube'?sampled
      .filter(x=>validNum(x.avgViewPct)&&x.avgViewPct>0&&x.avgViewPct<=1000)
      .map(x=>x.avgViewPct!):[]
    cohorts.push({
      targetHours,platform,variant,observedPosts:sampled.length,
      medianViews:median(sampled.map(x=>x.views!)),
      medianInteractions:median(availableInteractions),
      watchPctSampleSize:retention.length,
      medianAvgViewPct:median(retention),exploratory:true,
    })
  }
  return {cohorts,rejectedRows,warnings:[
    'Experimental seven-day cohorts are small: descriptive observations, never causal proof.',
    '24h/72h windows contain only actual measurements within the declared tolerance; missing is null.',
    'Compare each platform separately. Differences in news topics, time and audience can confound results.',
    'Instagram/Facebook retention is unavailable here; no seconds-watched data is inferred.',
    'Do not treat missing engagement metrics as zeros.',
  ]}
}
