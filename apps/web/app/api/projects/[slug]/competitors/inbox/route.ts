import { getCandidateInboxSummary, postCandidateInboxReceipt } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-route'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15
export const POST = (request: Request, { params }: { params: { slug: string } }) =>
  postCandidateInboxReceipt('owner', request, params.slug)

export const GET = (request: Request, { params }: { params: { slug: string } }) =>
  getCandidateInboxSummary('owner',request,params.slug)
