// Human-triggered, exact-grant read only; default-off in server configuration.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export { approvedPosthogGET as GET, approvedPosthogPOST as POST } from '@/lib/atlas/capability/posthog-approved-http'
