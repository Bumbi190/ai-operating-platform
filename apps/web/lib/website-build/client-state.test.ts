import { describe, expect, it } from 'vitest'
import { acceptDraft, prepareFeedback, reduceBuildSnapshot } from './client-state'
import type { BuildSessionView } from './types'
const session = (version: number, sessionId = 'one') => ({ projectId: 'project', sessionId, stateVersion: version } as BuildSessionView)
describe('durable client state', () => {
  it('rejects stale snapshots and other sessions', () => { const current = session(3); expect(reduceBuildSnapshot(current, session(2))).toBe(current); expect(reduceBuildSnapshot(current, session(3))).toBe(current); expect(reduceBuildSnapshot(current, session(4, 'other'))).toBe(current); expect(reduceBuildSnapshot(current, session(4))).toHaveProperty('stateVersion', 4) })
  it('retry preserves text, source, id and the viewed revision even after editing', () => {
    const draft = prepareFeedback({ text: 'Gör rubriken större', inputSource: 'voice', pending: null }, 'v1', 'receipt')
    const retry = prepareFeedback({ ...draft, text: 'Ändra också färg' }, 'v2', 'new-id')
    expect(retry.pending).toEqual(draft.pending)
    expect(retry.pending).toMatchObject({ idempotencyKey: 'receipt', viewedRevisionId: 'v1', inputSource: 'voice' })
    expect(acceptDraft(retry).text).toBe('Ändra också färg')
  })
  it('a server receipt clears only the draft it acknowledges', () => { const draft = prepareFeedback({ text: 'Hej', inputSource: 'text', pending: null }, null, 'id'); expect(acceptDraft(draft)).toEqual({ text: '', inputSource: 'text', pending: null }) })
})
