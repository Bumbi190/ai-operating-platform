import type { BuildSessionView, FeedbackInput } from './types'
export type BuildDraft = { text: string; inputSource: 'text' | 'voice'; pending: FeedbackInput | null }
export function reduceBuildSnapshot(current: BuildSessionView, incoming: BuildSessionView): BuildSessionView {
  return incoming.projectId === current.projectId && incoming.sessionId === current.sessionId && incoming.stateVersion > current.stateVersion ? incoming : current
}
export function prepareFeedback(draft: BuildDraft, viewedRevisionId: string | null, idempotencyKey: string): BuildDraft {
  return { ...draft, pending: draft.pending ?? { text: draft.text, inputSource: draft.inputSource, viewedRevisionId, idempotencyKey } }
}
export function acceptDraft(draft: BuildDraft): BuildDraft {
  const unchanged = draft.text === draft.pending?.text && draft.inputSource === draft.pending?.inputSource
  return { text: unchanged ? '' : draft.text, inputSource: unchanged ? 'text' : draft.inputSource, pending: null }
}
