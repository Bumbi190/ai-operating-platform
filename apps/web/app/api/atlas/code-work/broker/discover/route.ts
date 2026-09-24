import { handleControlRequest } from '@/lib/atlas/code-broker/control-channel/handler'

export const dynamic = 'force-dynamic'

/** SDF-1C2 broker control channel: `discover`. Signed-request authenticated; see the handler. */
export async function POST(request: Request) {
  return handleControlRequest(request, 'discover')
}
