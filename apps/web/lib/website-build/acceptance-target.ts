/**
 * lib/website-build/acceptance-target.ts — branch-scoped live-acceptance boundary.
 *
 * The Studio PR preview (VERCEL_ENV=preview on this one branch) may still be wired
 * to the PRODUCTION Supabase project. Until it is explicitly provisioned against an
 * isolated database, every state-mutating WebBuilder entry point on that preview
 * must refuse BEFORE auth, database or spend code runs.
 *
 * Deliberately narrow: every other deployment — production, other branches' previews,
 * local dev, CI — is out of scope and sees no behaviour change. This guard only ever
 * adds a refusal; it never grants access, so auth, RLS, approvals, the spend gate and
 * idempotency are all still enforced downstream when it passes.
 *
 * No `server-only` marker and no database import, so it stays a pure predicate.
 */
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'

export const ACCEPTANCE_BRANCH='codex/atlas-builder-references-20261017'
export const PRODUCTION_SUPABASE_REF='iboepohjwrhtgshrqaol'
const SUPABASE_REF=/^[a-z0-9]{20}$/

export type AcceptanceBlocker=
 |'ACCEPTANCE_MODE_NOT_ENABLED'
 |'ISOLATED_REF_MISSING'
 |'ISOLATED_REF_INVALID'
 |'ISOLATED_REF_IS_PRODUCTION'
 |'SUPABASE_URL_NOT_ISOLATED_REF'
 |'SPEND_GATE_NOT_ENFORCED'
export type AcceptanceTarget=
 |{scope:'out_of_scope'}
 |{scope:'acceptance';allowed:true;ref:string}
 |{scope:'acceptance';allowed:false;blockers:AcceptanceBlocker[]}

// Read from process.env at invocation time, like isSpendGateEnforced().
export function isAcceptanceScope():boolean{
 const env=process.env
 return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===ACCEPTANCE_BRANCH
}

/** Exact `https://<ref>.supabase.co` host match; any path, port or credentials fails. */
function urlMatchesRef(raw:string|undefined,ref:string):boolean{
 if(!raw)return false
 let url:URL
 try{url=new URL(raw)}catch{return false}
 return url.protocol==='https:'&&url.hostname===`${ref}.supabase.co`&&!url.port&&!url.username&&!url.password&&(url.pathname===''||url.pathname==='/')&&!url.search&&!url.hash
}

export function evaluateAcceptanceTarget():AcceptanceTarget{
 if(!isAcceptanceScope())return {scope:'out_of_scope'}
 const env=process.env
 const blockers:AcceptanceBlocker[]=[]
 if(env.WEBSITE_BUILDER_ACCEPTANCE_MODE!=='1')blockers.push('ACCEPTANCE_MODE_NOT_ENABLED')
 const ref=env.WEBSITE_BUILDER_ACCEPTANCE_SUPABASE_REF?.trim()??''
 if(!ref)blockers.push('ISOLATED_REF_MISSING')
 else if(ref===PRODUCTION_SUPABASE_REF)blockers.push('ISOLATED_REF_IS_PRODUCTION')
 else if(!SUPABASE_REF.test(ref))blockers.push('ISOLATED_REF_INVALID')
 // Checked independently of the ref above: a production URL must block even when
 // the authorized ref variable is missing or malformed.
 if(!ref||ref===PRODUCTION_SUPABASE_REF||!urlMatchesRef(env.NEXT_PUBLIC_SUPABASE_URL,ref))blockers.push('SUPABASE_URL_NOT_ISOLATED_REF')
 if(!isSpendGateEnforced())blockers.push('SPEND_GATE_NOT_ENFORCED')
 return blockers.length?{scope:'acceptance',allowed:false,blockers}:{scope:'acceptance',allowed:true,ref}
}

/**
 * Returns a refusal Response for a state-mutating entry point, or null when the
 * request may continue to the normal (unchanged) auth and admission path.
 * The body names no env values; blocker codes are logged server-side only.
 */
export function acceptanceTargetDenial(surface:string):Response|null{
 const target=evaluateAcceptanceTarget()
 if(target.scope==='out_of_scope'||target.allowed)return null
 console.warn(`[website-build acceptance] refused ${surface}: ${target.blockers.join(',')}`)
 return Response.json({error:'ACCEPTANCE_TARGET_NOT_ISOLATED'},{status:503,headers:{'cache-control':'private, no-store'}})
}
