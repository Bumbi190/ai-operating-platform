/**
 * Opt-in, project-scoped, append-only measurement ledger for experimental
 * The Prompt creative posts. Reuses ALREADY FETCHED provider metrics; never
 * calls Meta, YouTube or a paid AI service. Unconfigured default: no writes.
 *
 * Prerequisites BEFORE enabling:
 * - separately reviewed proposed media_pilot_metric_snapshots SQL
 * - creative_version persisted by a governed publisher (not arbitrary client)
 * - THE_PROMPT_TRIAL_SNAPSHOT_ENABLED=true AND THE_PROMPT_PILOT_PROJECT_ID set
 * - credential/retention/rollout checks for a bounded seven-day trial.
 */
export type TrialPlatform='instagram'|'facebook'|'youtube'
export type TrialCreativeVersion='text_motion'|'story_visual'
export type TrialWriteInput={
  projectId:string;scriptId:string;platform:TrialPlatform
  publishedAt:string|null;fetchedAt:string
  creativeVersion:string|null
  views:number|null;likes?:number|null;comments?:number|null
  saved?:number|null;shares?:number|null;avgViewPct?:number|null
}
type Sink={from:(table:string)=>{upsert:(row:Record<string,unknown>,options:{onConflict:string,ignoreDuplicates:boolean})=>Promise<{error:{message:string}|null}>}}
type Result='disabled'|'out_of_scope'|'not_a_trial_post'|'invalid_measurement'|'recorded'
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const valid=(v:unknown)=>v===null||v===undefined||
  typeof v==='number'&&Number.isFinite(v)&&v>=0
export async function recordTrialMetricSnapshot(sink:Sink,input:TrialWriteInput,env={
  enabled:process.env.THE_PROMPT_TRIAL_SNAPSHOT_ENABLED,
  projectId:process.env.THE_PROMPT_PILOT_PROJECT_ID,
}):Promise<Result>{
  if(env.enabled!=='true')return 'disabled'
  if(!env.projectId||!uuid.test(env.projectId)||
    input.projectId!==env.projectId||!uuid.test(input.scriptId))return 'out_of_scope'
  if(input.creativeVersion!=='text_motion'&&input.creativeVersion!=='story_visual')
    return 'not_a_trial_post'
  const publish=Date.parse(input.publishedAt??''),fetch=Date.parse(input.fetchedAt)
  if(!Number.isFinite(publish)||!Number.isFinite(fetch)||fetch<publish||
    !['instagram','facebook','youtube'].includes(input.platform)||
    ![input.views,input.likes,input.comments,input.saved,input.shares,input.avgViewPct].every(valid))
    return 'invalid_measurement'
  const {error}=await sink.from('media_pilot_metric_snapshots').upsert({
    project_id:input.projectId,script_id:input.scriptId,platform:input.platform,
    creative_version:input.creativeVersion,
    published_at:new Date(publish).toISOString(),fetched_at:new Date(fetch).toISOString(),
    views:input.views,likes:input.likes??null,comments:input.comments??null,
    saved:input.saved??null,shares:input.shares??null,avg_view_pct:input.avgViewPct??null,
  },{onConflict:'project_id,script_id,platform,fetched_at',ignoreDuplicates:true})
  if(error)throw Error('PILOT_SNAPSHOT_PERSISTENCE_FAILED')
  return 'recorded'
}
