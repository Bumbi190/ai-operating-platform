/**
 * GET  /api/conversations — list user's conversations (newest first)
 * POST /api/conversations — create a new conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllowedProjectIds, assertProjectAllowed } from '@/lib/atlas/isolation'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  let query = db
    .from('conversations')
    .select('id, title, project_id, created_at, updated_at, projects(name, slug)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const body = await req.json().catch(() => ({}))
  const { project_id, title } = body as { project_id?: string; title?: string }

  // ISOLATION. A conversation is USER-owned — `user_id` is taken from the
  // session and never from the body — but `project_id` arrived from the request
  // and was written through the service-role client with no check, so a caller
  // could tag their conversation with another tenant's project.
  //
  // PROJECTLESS IS THE NORMAL CASE, NOT AN EDGE CASE: 90 of 91 live rows carry
  // no project, and four of the five callers post `{}` or an explicit null. So
  // omitting the field stays valid and untouched — only a SUPPLIED value is
  // validated.
  //
  // A foreign or nonexistent project is REFUSED rather than quietly rewritten
  // to null. Silently nulling would be indistinguishable from success to the
  // caller, and on a surface where almost every row is projectless it would
  // hide the mistake completely. `assertProjectAllowed` answers false for both
  // cases, so they return the same 404.
  if (project_id != null) {
    const allowedProjectIds = await getAllowedProjectIds(db, user.id)
    if (!assertProjectAllowed(project_id, allowedProjectIds)) {
      return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })
    }
  }

  const { data, error } = await db
    .from('conversations')
    .insert({
      user_id: user.id,
      project_id: project_id ?? null,
      title: title ?? 'Ny chatt',
    })
    .select('id, title, project_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
