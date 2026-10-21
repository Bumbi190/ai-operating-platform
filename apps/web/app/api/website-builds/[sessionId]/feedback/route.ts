import { websiteBuildApi } from '@/lib/website-build/api'
export const dynamic = 'force-dynamic'
export async function POST(request: Request, context: { params: Promise<{ sessionId: string; revisionId?: string }> }) {
  return websiteBuildApi('feedback', request, await context.params)
}
