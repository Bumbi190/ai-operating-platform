import { getCandidateInboxSummary, postCandidateInboxReceipt } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-route'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15
export const POST = async (request: Request, { params }: { params: Promise<{ slug: string }> }) =>
  postCandidateInboxReceipt('owner', request, (await params).slug)

export const GET = async (request: Request, { params }: { params: Promise<{ slug: string }> }) =>
  getCandidateInboxSummary('owner',request,(await params).slug)
