import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'

export type ReadinessAudience = 'owner' | 'collaborator'
export type WatchBudget = 'available' | 'project_missing' | 'global_missing' | 'both_missing' | 'exhausted' | 'unknown'
export type WatchStop = 'clear' | 'paused' | 'unknown'
export type WatchEnforcement = 'enforced' | 'advisory' | 'unknown'
/** Proposed first known-source pilot. These limits configure no runtime or schedule. */
export const WATCH_PILOT_PROPOSAL = Object.freeze({
  intervalDays:7,maxHttpRequests:10,maxAutomaticRetries:0,paidProviderCalls:0,
})
const SCOPES = new Set([
  'project_daily','project_weekly','project_monthly','global_daily','global_weekly','global_monthly',
])
function numeric(value:unknown):number|null {
  if(typeof value!=='number' && (typeof value!=='string' || !/^-?\d+(?:\.\d+)?$/.test(value)))return null
  const n=Number(value)
  return Number.isFinite(n) && Math.abs(n)<=Number.MAX_SAFE_INTEGER ? n : null
}
/** Classifies the canonical read; never calculates, reserves or grants spend. */
export function summarizeWatchBudget(raw:unknown):WatchBudget {
  if(!Array.isArray(raw)||raw.length>6)return 'unknown'
  const seen=new Set<string>()
  let exhausted=false
  for(const value of raw) {
    if(!value || typeof value!=='object')return 'unknown'
    const row=value as Record<string,unknown>
    if(row.project_id!==HANDLARBORSEN_PROJECT_ID || typeof row.scope!=='string'
      || !SCOPES.has(row.scope) || seen.has(row.scope))return 'unknown'
    const limit=numeric(row.limit_sek),spent=numeric(row.spent_sek)
    const held=numeric(row.held_sek),remaining=numeric(row.remaining_sek)
    if(limit===null||spent===null||held===null||remaining===null||limit<0||spent<0||held<0)return 'unknown'
    seen.add(row.scope)
    if(remaining<=0)exhausted=true
  }
  const project=[...seen].some(s=>s.startsWith('project_'))
  const global=[...seen].some(s=>s.startsWith('global_'))
  if(!project&&!global)return 'both_missing'
  if(!project)return 'project_missing'
  if(!global)return 'global_missing'
  return exhausted?'exhausted':'available'
}
export type WatchReadiness = Readonly<{
  status:'ok'
  stage:'readiness_only'
  automaticActive:false
  executionAllowed:false
  checkedAt:string
  budget:WatchBudget
  enforcement:WatchEnforcement
  globalStop:WatchStop
  projectStop:WatchStop
  pending:readonly ['approved_sources','durable_run_control','verified_dispatch','activation_approval']
}>
/** A readiness report is never an authorization, even if every observed gate is healthy. */
export function deriveWatchReadiness(input:{
  checkedAt:string;budget:WatchBudget;enforcement:WatchEnforcement
  globalStop:WatchStop;projectStop:WatchStop
}):WatchReadiness {
  return {
    status:'ok',stage:'readiness_only',automaticActive:false,executionAllowed:false,
    checkedAt:input.checkedAt,budget:input.budget,enforcement:input.enforcement,
    globalStop:input.globalStop,projectStop:input.projectStop,
    pending:['approved_sources','durable_run_control','verified_dispatch','activation_approval'],
  }
}
