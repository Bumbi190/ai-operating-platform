import { describe, expect, it } from 'vitest'
import { interpretBuildFeedback } from './feedback-interpretation'
const first = { id: 'a', sequence: 1, authorId: 'u', text: 'Gör knappen blå', inputSource: 'text' as const, viewedRevisionId: null, status: 'received' as const, interpretation: null, appliedRevisionId: null, createdAt: '2026-10-14T00:00:00Z' }
const second = { ...first, id: 'b', sequence: 2, text: 'Gör samma knapp grön istället' }
describe('feedback interpretation contract', () => {
  it('clear_later_correction_supersedes_only_same_detail', () => {
    const result = interpretBuildFeedback({ items: [{ feedbackId: 'b', summary: 'Grön ersätter blå.', disposition: 'apply', changeKey: 'cta.color', supersedesFeedbackIds: ['a'] }, { feedbackId: 'a', summary: 'Blå knapp.', disposition: 'apply', changeKey: 'cta.color', supersedesFeedbackIds: [] }] }, [first, second])
    expect(result.items.map(i => i.feedbackId)).toEqual(['a', 'b'])
    expect(result.items[1].supersedesFeedbackIds).toEqual(['a'])
  })
  it('rejects_unknown_duplicate_missing_and_forward_feedback_ids', () => {
    for (const items of [[], [{ feedbackId: 'unknown' }], [{ feedbackId: 'a' }, { feedbackId: 'a' }]]) expect(() => interpretBuildFeedback({ items }, [first, second])).toThrowError('INVALID_FEEDBACK_INTERPRETATION')
    expect(() => interpretBuildFeedback({ items: [{ feedbackId: 'a', summary: 'A', disposition: 'apply', changeKey: 'x', supersedesFeedbackIds: ['b'] }, { feedbackId: 'b', summary: 'B', disposition: 'apply', changeKey: 'x', supersedesFeedbackIds: [] }] }, [first, second])).toThrowError('INVALID_FEEDBACK_INTERPRETATION')
  })
  it('rejects_supersession_of_unrelated_detail', () => {
    expect(() => interpretBuildFeedback({ items: [{ feedbackId: 'a', summary: 'A', disposition: 'apply', changeKey: 'cta.color', supersedesFeedbackIds: [] }, { feedbackId: 'b', summary: 'B', disposition: 'apply', changeKey: 'hero.title', supersedesFeedbackIds: ['a'] }] }, [first, second])).toThrowError('INVALID_FEEDBACK_INTERPRETATION')
  })
  it('retains_questions_and_ambiguous_decisions_without_claiming_applied', () => {
    const result = interpretBuildFeedback({ items: [{ feedbackId: 'a', summary: 'Vilken knapp menar du?', disposition: 'decision', changeKey: null, supersedesFeedbackIds: [] }] }, [first])
    expect(result.items[0].disposition).toBe('decision')
    expect(result.items[0].summary).toBe('Vilken knapp menar du?')
  })
})
