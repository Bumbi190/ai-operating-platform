import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import { analysisDraftsEnabled } from '@/lib/atlas/project-analytics/analysis-draft-feature'
import { saveAnalysisDraft, listAnalysisDrafts } from '@/lib/atlas/project-analytics/analysis-draft-service'
import { readAnalysisSelectorBody, analysisResponse } from '@/lib/atlas/project-analytics/analysis-draft-http'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  if (!analysisDraftsEnabled()) return analysisResponse({ status: 'conflict' }, params.slug, true)
  const refused = assertSameOrigin(request)
  if (refused) return refused
  let selector
  try {
    selector = await readAnalysisSelectorBody(request)
  } catch {
    return NextResponse.json(
      { error: 'invalid_request' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  return analysisResponse(await saveAnalysisDraft(params.slug, selector), params.slug, true)
}
export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const url = new URL(request.url)
  if ([...url.searchParams.keys()].some((k) => k !== 'cursor') || url.searchParams.getAll('cursor').length > 1)
    return analysisResponse({ status: 'not_found' }, params.slug)
  return analysisResponse(await listAnalysisDrafts(params.slug, url.searchParams.get('cursor')), params.slug)
}
