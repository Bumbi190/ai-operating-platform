/**
 * Code-work model router and hard per-job SEK caps.
 * Plan: docs/superpowers/plans/2026-10-20-model-router-and-first-job.md (approved 2026-10-20 08:38).
 *
 * Selection is deterministic server code: the model never chooses or raises its own profile, and nothing here
 * upgrades to a more expensive profile on its own. Per-call ceilings reuse the canonical price book and
 * `tokenWindowCeiling` (lib/cost/spend-ceiling.ts), so an unverified input is priced at the model's full context
 * window and an unboundable call is refused. The job budget only admits a call whose worst case fits the remaining
 * cap; billing itself still goes through `withGovernedSpend`. Nothing here dispatches a provider call.
 */
import {tokenWindowCeiling,type RateSnapshot} from '@/lib/cost/spend-ceiling'
import type {VerifiedInputCeiling} from '@/lib/cost/qualified-text-budget'

export type ModelFamily='qwen'|'openai_gpt'|'anthropic_claude'
export type AuthorProfileId='small'|'standard'|'complex'
export interface ModelProfile{readonly id:string;readonly provider:'ollama_local'|'openai'|'anthropic';readonly family:ModelFamily;readonly modelId:string|null;readonly capSek:number;readonly outputCap:number}

const freeze=<T extends object>(v:T):Readonly<T>=>Object.freeze(v)
/** Small's model is whichever local coder passed qualification (pinned by digest at runtime), never a free choice. */
export const AUTHOR_PROFILES:Readonly<Record<AuthorProfileId,ModelProfile>>=freeze({
 small:freeze({id:'small',provider:'ollama_local' as const,family:'qwen' as const,modelId:null,capSek:0,outputCap:4096}),
 standard:freeze({id:'standard',provider:'openai' as const,family:'openai_gpt' as const,modelId:'gpt-5.4-mini-2026-03-17',capSek:2,outputCap:4096}),
 complex:freeze({id:'complex',provider:'anthropic' as const,family:'anthropic_claude' as const,modelId:'claude-sonnet-5-5',capSek:10,outputCap:8192}),
})
export const REVIEWER_PROFILES:ReadonlyArray<ModelProfile>=freeze([
 freeze({id:'reviewer_gpt',provider:'openai' as const,family:'openai_gpt' as const,modelId:'gpt-5.4-mini-2026-03-17',capSek:3,outputCap:1536}),
 freeze({id:'reviewer_claude',provider:'anthropic' as const,family:'anthropic_claude' as const,modelId:'claude-haiku-5-5',capSek:3,outputCap:1536}),
])
const MAX_AUTHOR_CAP=Math.max(...Object.values(AUTHOR_PROFILES).map(p=>p.capSek)),MAX_REVIEWER_CAP=Math.max(...REVIEWER_PROFILES.map(p=>p.capSek))

export interface CodeWorkRequestShape{kind:'ui_fix'|'bugfix'|'feature'|'refactor';filesInScope:number;securitySensitive:boolean}
export interface LocalQualification{modelId:string;digest:string}
export interface ProfileProposal{author:AuthorProfileId;authorModel:string|null;reviewer:string;reviewerFamily:ModelFamily;risk:'low'|'medium'|'high';requiresOwnerChoice:boolean;reasons:string[]}

function validRequest(r:unknown):r is CodeWorkRequestShape{
 if(!r||typeof r!=='object')return false
 const v=r as Record<string,unknown>
 return ['ui_fix','bugfix','feature','refactor'].includes(v.kind as string)&&Number.isSafeInteger(v.filesInScope)&&(v.filesInScope as number)>=1&&(v.filesInScope as number)<=8&&typeof v.securitySensitive==='boolean'
}
export function reviewerFor(author:ModelFamily):ModelProfile{
 const r=REVIEWER_PROFILES.find(p=>p.family!==author);if(!r)throw Error('no_cross_family_reviewer');return r
}
/** Proposal only: the owner approves the exact profile and cap before any work starts. */
export function proposeProfiles(request:unknown,ctx:{localQualified:LocalQualification|null}):ProfileProposal{
 if(!validRequest(request))throw Error('invalid_code_work_request')
 const reasons:string[]=[]
 let author:AuthorProfileId,risk:ProfileProposal['risk'],requiresOwnerChoice=false
 if(request.securitySensitive){author='complex';risk='high';requiresOwnerChoice=true;reasons.push('security-sensitive scope: strongest author, cross-family review and an explicit owner choice')}
 else if(request.kind==='feature'||request.kind==='refactor'||request.filesInScope>4){author='complex';risk='medium';reasons.push('multi-file or structural change: a cheaper model would likely need repeated attempts')}
 else if(request.kind==='bugfix'&&request.filesInScope>1||request.filesInScope>2){author='standard';risk='low';reasons.push('more than a trivial single-file fix: local model not verified for this size')}
 else{author='small';risk='low';reasons.push('small single-file fix within the local model qualification')}
 if(author==='small'&&!ctx.localQualified){author='standard';requiresOwnerChoice=true;reasons.push('no qualified local coder model: Standard proposed, owner must choose (no automatic upgrade)')}
 const profile=AUTHOR_PROFILES[author],reviewer=reviewerFor(profile.family)
 return{author,authorModel:author==='small'?ctx.localQualified!.modelId:profile.modelId,reviewer:reviewer.id,reviewerFamily:reviewer.family,risk,requiresOwnerChoice,reasons}
}

export type CallCeiling={ok:true;sek:number;basis:'token_window'|'local_no_api'}|{ok:false;reason:string}
/** Worst case of one call in SEK. Local inference has no API fee (electricity and hardware are reported separately). */
export function callCeilingSek(profile:ModelProfile,rates:RateSnapshot,verifiedInput?:VerifiedInputCeiling):CallCeiling{
 if(profile.provider==='ollama_local')return{ok:true,sek:0,basis:'local_no_api'}
 if(!profile.modelId)return{ok:false,reason:'profile_has_no_model'}
 const c=tokenWindowCeiling(profile.modelId,profile.outputCap,rates,verifiedInput)
 return c.ok?{ok:true,sek:c.sek,basis:'token_window'}:{ok:false,reason:c.reason}
}

export type BudgetRole='author'|'reviewer'
type Ticket={readonly ticket:object}
export interface JobBudget{
 admit(role:BudgetRole,ceilingSek:number):({ok:true}&Ticket)|{ok:false;reason:'budget_exhausted'|'invalid_ceiling'|'invalid_role'}
 settle(ticket:object,actual:number|'unknown'):void
 committed(role:BudgetRole):number
 remaining(role:BudgetRole):number
}
/** Hard caps per role. Open reservations and unknown outcomes count at their full ceiling; retries are new admissions. */
export function createJobBudget(caps:{authorCapSek:number;reviewerCapSek:number}):JobBudget{
 const ok=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max
 if(!caps||!ok(caps.authorCapSek,MAX_AUTHOR_CAP)||!ok(caps.reviewerCapSek,MAX_REVIEWER_CAP))throw Error('invalid_job_budget')
 const cap:Record<BudgetRole,number>={author:caps.authorCapSek,reviewer:caps.reviewerCapSek}
 const used:Record<BudgetRole,number>={author:0,reviewer:0}
 const open=new WeakMap<object,{role:BudgetRole;ceiling:number;closed:boolean}>()
 const EPS=1e-9
 const budget:JobBudget={
  admit(role,ceilingSek){
   if(role!=='author'&&role!=='reviewer')return{ok:false,reason:'invalid_role'}
   if(typeof ceilingSek!=='number'||!Number.isFinite(ceilingSek)||ceilingSek<0)return{ok:false,reason:'invalid_ceiling'}
   if(used[role]+ceilingSek>cap[role]+EPS)return{ok:false,reason:'budget_exhausted'}
   used[role]+=ceilingSek;const ticket=Object.freeze({});open.set(ticket,{role,ceiling:ceilingSek,closed:false});return{ok:true,ticket}
  },
  settle(ticket,actual){
   const t=open.get(ticket);if(!t)throw Error('unknown_ticket');if(t.closed)throw Error('ticket_closed')
   if(actual==='unknown'){t.closed=true;return}
   if(typeof actual!=='number'||!Number.isFinite(actual)||actual<0)throw Error('invalid_settlement')
   if(actual>t.ceiling+EPS)throw Error('settlement_above_ceiling')
   used[t.role]-=t.ceiling-actual;t.closed=true
  },
  committed:role=>used[role],
  remaining:role=>Math.max(0,cap[role]-used[role]),
 }
 return Object.freeze(budget)
}
