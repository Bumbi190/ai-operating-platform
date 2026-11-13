/**
 * GET /api/atlas/campus/snapshot — authenticated, read-only Agent Campus data.
 *
 * This preview-only route reuses the existing Omnira organisation reader,
 * including its signed-in user check and project/agent/run scope. It does not
 * start runs, change approvals, write to Supabase, or invent live activity.
 * Consumers must explicitly distinguish workflow membership from execution.
 */
import { NextResponse } from 'next/server'
import { loadOrganisationModel } from '@/lib/os/organisation'
import { projectCampusSnapshot } from '@/lib/atlas/campus/snapshot'
import { readScopedStepEvidence } from '@/lib/atlas/campus/step-evidence-reader'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const

export async function GET() {
  try {
    const organisation = await loadOrganisationModel()
    if (!organisation) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_HEADERS },
      )
    }
    // Optional, bounded cookie-RLS read. A failed or incomplete evidence read
    // yields NO agent-step indicators, not guessed activity.
    const proof = await readScopedStepEvidence(organisation)
    const snapshot = projectCampusSnapshot(
      organisation, new Date(), proof.available ? proof.signals : null,
    )
    if (!snapshot) {
      return NextResponse.json(
        { error: 'Campus data unavailable' },
        { status: 503, headers: PRIVATE_HEADERS },
      )
    }
    return NextResponse.json(
      snapshot,
      { status: 200, headers: PRIVATE_HEADERS },
    )
  } catch {
    // Never echo Supabase errors, credentials or project information to users.
    return NextResponse.json(
      { error: 'Campus data unavailable' },
      { status: 503, headers: PRIVATE_HEADERS },
    )
  }
}
