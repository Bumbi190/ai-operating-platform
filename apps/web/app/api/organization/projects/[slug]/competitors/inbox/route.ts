import { postCandidateInboxReceipt } from '@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-route'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15
export const POST = (request: Request, { params }: { params: { slug: string } }) =>
  postCandidateInboxReceipt('collaborator',request,params.slug)
