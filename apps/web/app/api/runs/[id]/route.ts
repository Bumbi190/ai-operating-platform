/**
 * GET    /api/runs/[id] — läs en körning
 * DELETE /api/runs/[id] — ta bort en körning
 *
 * B5: PATCH är BORTTAGEN. Den accepterade `status` och `error` utan
 * transition-guard, utan claim-fencing och utan ownership-assert utöver
 * autentisering — och hade noll callers i repot. Livscykelövergångar ägs
 * uteslutande av sina dedikerade vägar: claim/drain, /cancel, /resume,
 * approval-PATCHen och reapern. En generell statusmutation vid sidan av dem är
 * en approval-bypass-yta (awaiting_approval → done) och kunde dessutom lämna en
 * run i ett oreapbart 'running' (reapern kräver lease_until IS NOT NULL).
 *
 * Auktorisation: handlers använder den RLS-scopade användarklienten
 * (lib/supabase/server), så policyn `runs_owner` begränsar redan varje rad till
 * `projects.owner_id = auth.uid()`. Den explicita assertProjectAllowed nedan är
 * defense in depth: den håller gränsen korrekt även om routen någon gång byts
 * till service-role-klienten, vilket tyst skulle kringgå RLS.
 *
 * En körning utanför anroparens projekt besvaras med 404 — aldrig 403 — så att
 * svaret inte kan användas för att avgöra om ett run-id existerar.
 */

import { createClient } from '@/lib/supabase/server'
import { resolveProjectAccess, assertProjectAllowed } from '@/lib/auth/project-access'
import { NextResponse } from 'next/server'

/** Enhetligt svar för "finns inte" OCH "utanför dina projekt" — ingen existensorakel. */
function notFound() {
  return NextResponse.json({ error: 'Inte hittad' }, { status: 404 })
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) return notFound()
  if (!assertProjectAllowed(data.project_id, access.allowedProjectIds)) return notFound()

  return NextResponse.json(data)
}

// DELETE /api/runs/[id] — ta bort en körning
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('runs')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
