import {it,expect} from 'vitest'
import {LOCAL_TEXT_QUALIFICATIONS} from '../catalog'
import {qualificationValid} from '../policy'
it('admits only the independently approved release model and task with exact evidence',()=>{
 expect(LOCAL_TEXT_QUALIFICATIONS).toHaveLength(1)
 const [{evidenceHash,qualification:q}]=LOCAL_TEXT_QUALIFICATIONS
 expect(qualificationValid(q,evidenceHash)).toBe(true)
 expect([q.candidateId,q.taskKind]).toEqual(['qwen3.5:9b','classify'])
 expect(q.adapterHash).toBe('d3147751141553a3227e3aed020e015d9621938185e9a3786b53aaec463346e3')
 expect(q.review.reviewRunId).toBe('c9f3548b-982f-4778-bd48-7fffefa4468d')
 expect(q.review.accuracy).toBe(1)
})
