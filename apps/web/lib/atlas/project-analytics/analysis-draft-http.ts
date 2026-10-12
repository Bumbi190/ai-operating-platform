import 'server-only'
import { NextResponse } from 'next/server'
import { validateSaveSelector, type SaveSelector } from './analysis-review-contract'
import type { AnalysisFailure, SaveResult, AnalysisDraftView, AnalysisListResult } from './analysis-draft-service'
export async function readAnalysisSelectorBody(request: Request): Promise<SaveSelector> {
  if (Number(request.headers.get('content-length')) > 4096) throw Error('invalid_request')
  const reader = request.body?.getReader()
  if (!reader) throw Error('invalid_request')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 4096) {
        await reader.cancel()
        throw Error('invalid_request')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  if (!validateSaveSelector(value)) throw Error('invalid_request')
  return value
}
export function analysisResponse(
  result: SaveResult | AnalysisFailure | AnalysisDraftView | AnalysisListResult,
  slug: string,
  post = false,
): NextResponse {
  const headers = { 'Cache-Control': 'private, no-store' }
  if ('status' in result) {
    if (result.status === 'ok')
      return NextResponse.json(
        {
          id: result.id,
          created: result.created,
          href: '/projects/' + encodeURIComponent(slug) + '/atlas/analysis-drafts/' + result.id,
        },
        { status: post ? (result.created ? 201 : 200) : 200, headers },
      )
    const statuses = { no_session: 401, not_found: 404, conflict: 409, unavailable: 503 }
    return NextResponse.json({ error: result.status }, { status: statuses[result.status], headers })
  }
  return NextResponse.json(result, { headers })
}
