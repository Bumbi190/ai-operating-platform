import type {PlanRevisionRef} from './types'
export function resolvePlanOperatorIntent(text:string,ref:PlanRevisionRef|null):'approve_visible_plan'|'ordinary_turn'{
 if(!ref||typeof text!=='string')return 'ordinary_turn'
 const folded=text.trim().toLocaleLowerCase('sv-SE')
 let end=folded.length
 while(end>0&&(folded[end-1]==='.'||folded[end-1]==='!'))end--
 const normalized=folded.slice(0,end).trim()
 return ['kör','jag godkänner','bygg enligt planen'].includes(normalized)?'approve_visible_plan':'ordinary_turn'
}
