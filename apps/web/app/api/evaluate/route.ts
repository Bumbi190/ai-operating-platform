/**
 * POST /api/evaluate
 *
 * Evaluates a piece of content and stores the result in the evaluations table.
 *
 * Body:
 *   content       string   — the text to evaluate
 *   contentType   string   — 'script' | 'hook' | 'caption' | 'image_prompt' | 'news' | 'text'
 *   projectId     string   — UUID of the project
 *   outputId?     string   — UUID of the linked output (optional)
 *   scriptId?     string   — UUID of the linked media_script (optional)
 *   deepScore?    boolean  — if true, runs Haiku hook scoring (default: false)
 *
 * Returns: EvaluationResult + the stored DB record id
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluate, toDbRecord, ContentType } from '@/lib/ai/evaluator/content-evaluator'
import { resolveProjectAccess, assertProjectAllowed, projectForbidden } from '@/lib/auth/project-access'
import { scopeProjectFilter } from '@/lib/atlas/isolation'

const VALID_CONTENT_TYPES: ContentType[] = ['script', 'hook', 'caption', 'image_prompt', 'news', 'text']

export async function POST(req: NextRequest) {
  // Auth + project boundary
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  let body: {
    content?: string
    contentType?: string
    projectId?: string
    outputId?: string
    scriptId?: string
    deepScore?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { content, contentType, projectId, outputId, scriptId, deepScore = false } = body

  // Validate
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }
  if (!contentType || !VALID_CONTENT_TYPES.includes(contentType as ContentType)) {
    return NextResponse.json(
      { error: `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}` },
      { status: 400 }
    )
  }
  // ISOLATION (C-1): if a project is targeted, it must be one the caller owns
  // BEFORE we evaluate or store anything for it. (projectId omitted → evaluate-only,
  // never stored.) Replaces the previous implicit RLS `projects` lookup with an
  // explicit owner assertion.
  if (projectId && !assertProjectAllowed(projectId, access.allowedProjectIds)) {
    return projectForbidden()
  }

  // Run evaluation (always — projectId is only needed for DB storage)
  const result = await evaluate({
    content,
    contentType: contentType as ContentType,
    deepScore,
  })

  // Store in DB only if an owned projectId is provided
  if (projectId) {
    const db = createAdminClient()
    const record = toDbRecord(result, {
      projectId,
      contentType: contentType as ContentType,
      outputId,
      scriptId,
    })

    const { data: stored, error } = await db
      .from('evaluations')
      .insert(record)
      .select('id')
      .single()

    if (!error && stored) {
      return NextResponse.json({ result, id: stored.id, stored: true })
    }
  }

  // Return result without storage (projectId missing or insert failed)
  return NextResponse.json({ result, id: null, stored: false })
}

/**
 * GET /api/evaluate?outputId=xxx
 * GET /api/evaluate?scriptId=xxx
 * GET /api/evaluate?projectId=xxx&limit=20
 *
 * Retrieves stored evaluation(s).
 */
export async function GET(req: NextRequest) {
  const access = await resolveProjectAccess()
  if (!access.ok) return access.response

  const { searchParams } = new URL(req.url)
  const outputId = searchParams.get('outputId')
  const scriptId = searchParams.get('scriptId')
  const projectId = searchParams.get('projectId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  const db = createAdminClient()
  let query = db
    .from('evaluations')
    .select('*')
    // ISOLATION (C-1): every branch (outputId/scriptId/projectId) is bounded to the
    // caller's owned projects, so a foreign projectId — or an output/script that
    // belongs to another tenant — yields zero rows. Empty allow-list → impossible
    // id → no rows (fail closed).
    .in('project_id', scopeProjectFilter(access.allowedProjectIds))
    .order('created_at', { ascending: false })
    .limit(limit)

  if (outputId) query = query.eq('output_id', outputId)
  else if (scriptId) query = query.eq('script_id', scriptId)
  else if (projectId) query = query.eq('project_id', projectId)
  else return NextResponse.json({ error: 'Provide outputId, scriptId, or projectId' }, { status: 400 })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ evaluations: data ?? [] })
}
