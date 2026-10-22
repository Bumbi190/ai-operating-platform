import {beforeEach, describe, expect, it, vi} from 'vitest'
const provider=vi.hoisted(()=>({create:vi.fn()}))
vi.mock('@/lib/media/text-client',()=>({getMediaTextClient:()=>({messages:{create:provider.create}})}))
import {scoreScript,shouldRegenerate} from '@/lib/media/quality'
import {TEST_AUTONOMOUS_GLOBAL} from './execution-fixtures'
const good={hook_strength:8,retention_score:8,visual_relevance:8,shareability:8,discussion_potential:8,hallucination_risk:9,overall:8,passed:true,verdict:'Grounded.',weak_spots:[]}
function respond(value:unknown){provider.create.mockResolvedValue({content:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]})}
async function score(){return scoreScript(TEST_AUTONOMOUS_GLOBAL,'Verified hook','Source-grounded script','Source facts')}
beforeEach(()=>{vi.clearAllMocks();respond(good)})
describe('media quality admission',()=>{
 it('preserves a complete passing evaluation',async()=>{expect(await score()).toEqual(good)})
 it.each(['{"hook_strength":8','not JSON','null','{}'])('blocks unusable evaluation %s',async text=>{respond(text);const result=await score();expect(result.passed).toBe(false);expect(shouldRegenerate(result)).toBe(true)})
 it.each([NaN,-1,11,'8',null])('blocks invalid score %s',async value=>{respond({...good,hook_strength:value});expect((await score()).passed).toBe(false)})
 it('computes engagement from dimensions instead of trusting invented overall',async()=>{respond({...good,retention_score:2,overall:10});const result=await score();expect(result.overall).toBe(6.8);expect(result.passed).toBe(false)})
 it('blocks a weak hook even with strong average',async()=>{respond({...good,hook_strength:7,retention_score:10});expect((await score()).passed).toBe(false)})
 it('does not turn an explicit editorial rejection into approval',async()=>{respond({...good,passed:false});const result=await score();expect(shouldRegenerate(result)).toBe(true)})
 it('rejects malformed weakness feedback',async()=>{respond({...good,weak_spots:'none'});expect((await score()).passed).toBe(false)})
 it('preserves provider errors rather than fabricating approval',async()=>{provider.create.mockRejectedValue(new Error('budget refused'));await expect(score()).rejects.toThrow('budget refused')})
})
