import {describe,it,expect,vi} from 'vitest'
vi.mock('@/lib/media/text-client',()=>({getMediaTextClient:vi.fn()}))
import {assertPassingScriptQuality,type QualityScore} from '@/lib/media/quality'
const good:QualityScore={hook_strength:8,retention_score:8,visual_relevance:8,shareability:8,discussion_potential:8,hallucination_risk:9,overall:8,passed:true,verdict:'Grounded',weak_spots:[]}
describe('final script quality gate',()=>{
 it('admits the exact final passing evaluation',()=>expect(()=>assertPassingScriptQuality(good)).not.toThrow())
 it.each([null,{...good,passed:false},{...good,hallucination_risk:3},{...good,hook_strength:7}])('stops missing or rejected final evidence',score=>expect(()=>assertPassingScriptQuality(score)).toThrow('MEDIA_SCRIPT_QUALITY_REVIEW_REQUIRED'))
})
