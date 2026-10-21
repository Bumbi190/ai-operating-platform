import { websiteBuildApi } from '@/lib/website-build/api'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, context: { params: Promise<{ sessionId: string; revisionId?: string }> }) {
  return websiteBuildApi('artifact', request, await context.params)
}
