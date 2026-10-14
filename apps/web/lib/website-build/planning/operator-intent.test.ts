import {describe,it,expect} from 'vitest'
import {resolvePlanOperatorIntent} from './operator-intent'
const ref={projectId:'10000000-0000-4000-8000-000000000001',planId:'60000000-0000-4000-8000-000000000001',revisionId:'70000000-0000-4000-8000-000000000001',sha256:'a'.repeat(64)}
describe('visible plan operator intent',()=>{
 it.each(['kör',' KÖR! ','jag godkänner.','bygg enligt planen'])('accepts exact reviewed-plan confirmation %s',text=>expect(resolvePlanOperatorIntent(text,ref)).toBe('approve_visible_plan'))
 it.each(['kör inte','"kör"','Kan du köra?','Jag godkänner, men byt färg först','Bygg enligt planen och publicera','godkänn',''])('does not infer authority from %s',text=>expect(resolvePlanOperatorIntent(text,ref)).toBe('ordinary_turn'))
 it('requires an explicitly displayed plan reference',()=>expect(resolvePlanOperatorIntent('kör',null)).toBe('ordinary_turn'))
})
