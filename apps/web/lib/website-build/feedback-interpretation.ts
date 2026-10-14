import type { BuildFeedback, FeedbackInterpretation } from './types'
export class WebsiteBuildPermanentError extends Error { constructor(readonly code: string, message = code) { super(message); this.name = 'WebsiteBuildPermanentError' } }
export function parseWebsiteModelJson(content: string): unknown {
  try { return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) }
  catch { throw new WebsiteBuildPermanentError('INVALID_MODEL_JSON', 'Atlas svarade med ett ogiltigt sidpaket. Ingen automatisk betald omkörning görs.') }
}
export function interpretBuildFeedback(input: unknown, snapshot: BuildFeedback[]): FeedbackInterpretation {
  const fail = (): never => { throw new WebsiteBuildPermanentError('INVALID_FEEDBACK_INTERPRETATION') }
  if (!input || typeof input !== 'object' || !('items' in input) || !Array.isArray(input.items) || input.items.length !== snapshot.length) fail()
  const originals = new Map(snapshot.map(f => [f.id, f]))
  const seen = new Set<string>()
  const items = (input as { items: unknown[] }).items.map(raw => {
    if (!raw || typeof raw !== 'object') fail()
    const row = raw as Record<string, unknown>
    if (typeof row.feedbackId !== 'string' || !originals.has(row.feedbackId) || seen.has(row.feedbackId) || typeof row.summary !== 'string' || !row.summary.trim() || row.summary.length > 2000 || !['apply','answer','reject','decision'].includes(String(row.disposition)) || !(row.changeKey === null || typeof row.changeKey === 'string' && /^[a-z][a-z0-9._-]{0,99}$/.test(row.changeKey)) || !Array.isArray(row.supersedesFeedbackIds) || row.supersedesFeedbackIds.some(id => typeof id !== 'string') || new Set(row.supersedesFeedbackIds).size !== row.supersedesFeedbackIds.length) fail()
    seen.add(row.feedbackId as string)
    return { feedbackId: row.feedbackId as string, summary: row.summary as string, disposition: row.disposition as FeedbackInterpretation['items'][number]['disposition'], changeKey: row.changeKey as string | null, supersedesFeedbackIds: row.supersedesFeedbackIds as string[] }
  }).sort((a,b) => originals.get(a.feedbackId)!.sequence - originals.get(b.feedbackId)!.sequence)
  const byId = new Map(items.map(i => [i.feedbackId, i]))
  for (const item of items) for (const oldId of item.supersedesFeedbackIds) {
    const old = byId.get(oldId)
    if (!old || !item.changeKey || old.changeKey !== item.changeKey || originals.get(oldId)!.sequence >= originals.get(item.feedbackId)!.sequence || item.disposition !== 'apply') fail()
  }
  return { items }
}
export function isWebsiteBuildPermanentError(error: unknown): boolean { return error instanceof WebsiteBuildPermanentError }
