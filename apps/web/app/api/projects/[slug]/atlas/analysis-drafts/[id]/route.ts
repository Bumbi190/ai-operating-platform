import { getAnalysisDraft } from '@/lib/atlas/project-analytics/analysis-draft-service'
import { analysisResponse } from '@/lib/atlas/project-analytics/analysis-draft-http'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  return analysisResponse(await getAnalysisDraft((await params).slug, (await params).id), (await params).slug)
}
