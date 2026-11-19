import { officeWorkflowHandlers } from '@/lib/atlas/office/workflow-server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const POST = officeWorkflowHandlers.presence
