import { websiteBuildApi } from '@/lib/website-build/api'
export const dynamic = 'force-dynamic'
export async function POST(request: Request, context: { params: Promise<{}> }) {
  return websiteBuildApi('create', request, await context.params)
}
