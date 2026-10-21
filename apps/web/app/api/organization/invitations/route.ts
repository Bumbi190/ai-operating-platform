import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers })
}

/**
 * Explicitly disabled until the membership bootstrap and invite callback
 * are verified. This endpoint never accepts a requested role or project ID.
 */
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin !== new URL(request.url).origin || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return reply({ error: 'Invalid origin or content type' }, 403)

  if (process.env.OMNIRA_COLLAB_INVITES_ENABLED !== 'true')
    return reply({ error: 'Invitations disabled' }, 503)

  const operator = await resolvePlatformOperator()
  if (!operator.ok) return reply({ error: 'Forbidden' }, 403)

  const db = createAdminClient()
  const { data: owner, error: ownerError } = await (db as any).from('omnira_organization_memberships')
    .select('user_id, role, revoked_at')
    .eq('user_id', operator.userId)
    .maybeSingle()
  if (ownerError || !owner || owner.role !== 'owner' || owner.revoked_at !== null)
    return reply({ error: 'Owner authority required' }, 403)

  let input: unknown
  try { input = await request.json() } catch { return reply({ error: 'Invalid request' }, 400) }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return reply({ error: 'Invalid request' }, 400)
  const body = input as Record<string, unknown>
  // No caller-supplied role, redirect, metadata or project targeting.
  if (Object.keys(body).some(key => key !== 'email') || typeof body.email !== 'string')
    return reply({ error: 'Invalid fields' }, 400)
  const email = body.email.trim().toLowerCase()
  if (email.length > 254 || !emailPattern.test(email) || email === operator.email.trim().toLowerCase())
    return reply({ error: 'Invalid email' }, 400)

  const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://app.omniraos.se/auth/callback?next=/organization',
  })
  if (inviteError || !invited.user) {
    // Do not disclose whether a recipient already has an account.
    return reply({ error: 'Invitation could not be created' }, 409)
  }
  const { error: membershipError } = await (db as any).from('omnira_organization_memberships')
    .insert({ user_id: invited.user.id, role: 'collaborator' })
  if (membershipError) {
    // Fail closed: invited auth user has NO organization access.
    return reply({ error: 'Membership creation failed; invitation must be reviewed' }, 503)
  }
  return reply({ invited: true }, 201)
}
