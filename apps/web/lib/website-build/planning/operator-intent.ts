import type {PlanRevisionRef} from './types'
export function resolvePlanOperatorIntent(text:string,ref:PlanRevisionRef|null):'approve_visible_plan'|'ordinary_turn'{
 if(!ref||typeof text!=='string')return 'ordinary_turn'
 const normalized=text.trim().toLocaleLowerCase('sv-SE').replace(/[.!]+$/,'').trim()
 return ['kör','jag godkänner','bygg enligt planen'].includes(normalized)?'approve_visible_plan':'ordinary_turn'
}
