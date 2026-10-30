import {it,expect} from 'vitest'
import {humanStoryTargetHash,assertApprovedStorySpend} from '../workflows/story/human-scope'
const base={actionTargetHash:'a'.repeat(64),briefHash:'b'.repeat(64),promptHash:'c'.repeat(64),maximumSek:'7.1234'}
it('pins action, brief, prompt and exact maximum amount',()=>{
 const original=humanStoryTargetHash(base)
 for(const field of ['actionTargetHash','briefHash','promptHash','maximumSek'] as const)
  expect(humanStoryTargetHash({...base,[field]:field==='maximumSek'?'7.1235':'d'.repeat(64)})).not.toBe(original)
})
it('accepts only a current hard ceiling no larger than explicit human consent',()=>{
 expect(()=>assertApprovedStorySpend(7.1234,7.1234)).not.toThrow()
 for(const ceiling of [7.1235,NaN,Infinity,-1])expect(()=>assertApprovedStorySpend(ceiling,7.1234)).toThrow()
 for(const cap of [0,NaN,Infinity,-1])expect(()=>assertApprovedStorySpend(1,cap)).toThrow()
})
