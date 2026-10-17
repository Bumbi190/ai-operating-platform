/**
 * Read-only, platform-separated evidence for a controlled creative pilot.
 *
 * This module never collects credentials, calls a social API, changes a
 * publication queue, or infers watch time from views. Feed it already
 * authorized media_insights + media_scripts rows.
 */
export type Platform = 'instagram' | 'facebook' | 'youtube'
export type SnapshotAge = '0-24h' | '24-72h' | '3-7d' | '7-30d' | '30d+'
export type Reliability = 'exploratory' | 'comparison_ready'
export interface PostEvidenceRow {
  scriptId: string
  platform: Platform
  topic: string | null
  hook: string | null
  publishedAt: string | null
  fetchedAt: string | null
  views: number | null
  likes?: number | null
  comments?: number | null
  saved?: number | null
  shares?: number | null
  avgViewPct?: number | null
  creativeVersion?: string | null
}
export interface EvidenceGroup {
  platform: Platform
  age: SnapshotAge
  topic: string
  creativeVersion: string
  posts: number
  medianViews: number
  p75Views: number
  totalViews: number
  knownEngagementPosts: number
  totalKnownInteractions: number
  retentionSamples: number
  medianAvgViewPct: number | null
  reliability: Reliability
}
export interface EvidenceAudit {
  totalInputRows: number
  uniquePosts: number
  excluded: number
  duplicateSnapshots: number
  platforms: Record<Platform, {posts: number; retentionSamples: number}>
  groups: EvidenceGroup[]
  warnings: string[]
}
const platformNames: Platform[] = ['instagram', 'facebook', 'youtube']
const limits: {age:SnapshotAge;maxHours:number}[] = [
  {age:'0-24h',maxHours:24},
  {age:'24-72h',maxHours:72},
  {age:'3-7d',maxHours:168},
  {age:'7-30d',maxHours:720},
  {age:'30d+',maxHours:Number.POSITIVE_INFINITY},
]
const finiteNonnegative = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0
const median = (sorted: number[]): number => {
  if(!sorted.length)return 0
  const mid=Math.floor(sorted.length/2)
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2
}
const percentile = (sorted: number[],p:number):number => {
  if(!sorted.length)return 0
  const n=(sorted.length-1)*p,l=Math.floor(n),h=Math.ceil(n)
  return sorted[l]+(sorted[h]-sorted[l])*(n-l)
}
const ageOf = (row:PostEvidenceRow):SnapshotAge|null => {
  const start=Date.parse(row.publishedAt??''),end=Date.parse(row.fetchedAt??'')
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null
  const hours=(end-start)/3_600_000
  return limits.find(l=>hours<l.maxHours)!.age
}
const normalize = (value: string|null|undefined):string =>
  typeof value==='string'&&value.trim()?value.trim().toLowerCase():'unknown'
const knownRetain = (row:PostEvidenceRow) =>
  row.platform==='youtube' && finiteNonnegative(row.avgViewPct) &&
  row.avgViewPct!>0 && row.avgViewPct!<=1000

/**
 * Latest row wins per exact script+platform, never sum multiple refreshes.
 * Confidence is a minimum sample-size guard, NOT statistical proof of causality.
 * 24h and 72h cross-day comparisons must use snapshots sampled at comparable ages.
 */
export function evaluateHistoricalPosts(input:readonly PostEvidenceRow[]):EvidenceAudit {
  const latest=new Map<string,{row:PostEvidenceRow;age:SnapshotAge}>()
  let excluded=0,duplicates=0
  for(const row of input){
    if(!row||!row.scriptId||!platformNames.includes(row.platform)||
       !finiteNonnegative(row.views) || row.views>100_000_000_000 ||
       !ageOf(row)){excluded++;continue}
    const age=ageOf(row)!
    const key=row.platform+'|'+row.scriptId
    const prior=latest.get(key)
    if(prior){duplicates++
      if(Date.parse(prior.row.fetchedAt!)>=Date.parse(row.fetchedAt!))continue
    }
    latest.set(key,{row,age})
  }
  const grouped=new Map<string,{platform:Platform;age:SnapshotAge;topic:string;version:string;rows:PostEvidenceRow[]}>()
  const platforms={
    instagram:{posts:0,retentionSamples:0},facebook:{posts:0,retentionSamples:0},youtube:{posts:0,retentionSamples:0},
  }
  for(const {row,age} of latest.values()){
    platforms[row.platform].posts++
    if(knownRetain(row))platforms[row.platform].retentionSamples++
    const topic=normalize(row.topic),version=normalize(row.creativeVersion)
    const key=[row.platform,age,topic,version].join('|')
    if(!grouped.has(key))grouped.set(key,{platform:row.platform,age,topic,version,rows:[]})
    grouped.get(key)!.rows.push(row)
  }
  const groups:EvidenceGroup[]=[...grouped.values()].map(group=>{
    const posts=group.rows.length
    const views=group.rows.map(row=>row.views!).sort((a,b)=>a-b)
    const relevant=group.rows.filter(knownRetain).map(row=>row.avgViewPct!).sort((a,b)=>a-b)
    const metrics=group.rows.filter(row=>[row.likes,row.comments,row.saved,row.shares]
      .some(finiteNonnegative))
    const sumActions=metrics.reduce((sum,row)=>sum+[row.likes,row.comments,row.saved,row.shares]
      .filter(finiteNonnegative).reduce((acc,v)=>acc+v,0),0)
    return {
      platform:group.platform,age:group.age,topic:group.topic,creativeVersion:group.version,
      posts,medianViews:median(views),p75Views:percentile(views,.75),
      totalViews:views.reduce((sum,v)=>sum+v,0),
      knownEngagementPosts:metrics.length,
      totalKnownInteractions:sumActions,
      retentionSamples:relevant.length,
      medianAvgViewPct:relevant.length?median(relevant):null,
      reliability:posts>=8?'comparison_ready' as const:'exploratory' as const,
    }
  }).sort((a,b)=>a.platform.localeCompare(b.platform) ||
    limits.findIndex(x=>x.age===a.age)-limits.findIndex(x=>x.age===b.age) ||
    a.topic.localeCompare(b.topic)||a.creativeVersion.localeCompare(b.creativeVersion))
  return {
    totalInputRows:input.length,uniquePosts:latest.size,excluded,duplicateSnapshots:duplicates,
    platforms,groups,
    warnings:[
      'Observation only: topic, hook and format are not randomized, and platform algorithms differ.',
      'Never compare raw cumulative views from different snapshot-age buckets or across platforms.',
      'Instagram and Facebook watch-time/retention is unavailable in this dataset; views are not watch time.',
      'A >=8-post group enables a descriptive comparison, not statistical proof of creative uplift.',
      'Without repeated per-post 24h/72h snapshots, historical age-bucket medians cannot establish identical-age A/B outcomes.',
      'Null engagement and null average view percentage mean unavailable, not zero.',
    ],
  }
}
