/**
 * GET  /api/memory/patterns?projectId=xxx
 *      Returns the project's platform memory (patterns, triggers, etc.)
 *
 * GET  /api/memory/patterns?projectId=xxx&category=rejection_triggers
 *      Returns memory filtered by category
 *
 * GET  /api/memory/patterns?projectId=xxx&summary=true
 *      Returns full ProjectMemorySummary for the dashboard
 *
 * DELETE /api/memory/patterns/:id
 *      Tombstones a memory item (human correction, audit-preserving)
 *
 * POST /api/memory/patterns
 *      Seeds The Prompt brand memory for an explicitly matching project
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getMemory,
  getProjectMemorySummary,
  tombstoneMemoryItem,
  seedBrandMemory,
  MemoryCategory,
} from '@/lib/ai/memory/memory-store'
import { getPatternStats } from '@/lib/ai/memory/feedback-store'
import {
  STAGE1_THE_PROMPT_SEED_ACTION,
  isThePromptSeedProject,
  normalizeMemoryPatternPostFields,
  validateMemoryPatternPostFields,
} from '@/lib/ai/memory/stage1-foundation'

const VALID_CATEGORIES: MemoryCategory[] = [
  'hook_patterns',
  'avoided_phrases',
  'brand_voice',
  'content_patterns',
  'rejection_triggers',
]

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const category = searchParams.get('category') as MemoryCategory | null
  const summary = searchParams.get('summary') === 'true'
  const stats = searchParams.get('stats') === 'true'
  const minConfidence = parseFloat(searchParams.get('minConfidence') ?? '0')

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  // Verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (summary) {
    const data = await getProjectMemorySummary(projectId)
    return NextResponse.json(data)
  }

  if (stats) {
    const data = await getPatternStats(projectId)
    return NextResponse.json({ stats: data })
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Invalid category. Use: ${VALID_CATEGORIES.join(', ')}` },
      { status: 400 }
    )
  }

  const items = await getMemory(projectId, category ?? undefined, minConfidence)
  return NextResponse.json({ items, total: items.length })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { data: memory } = await supabase
    .from('platform_memory')
    .select('id, project_id')
    .eq('id', id)
    .maybeSingle()

  if (!memory) {
    return NextResponse.json({ error: 'Memory item not found' }, { status: 404 })
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', memory.project_id)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!project) {
    return NextResponse.json({ error: 'Memory item not found' }, { status: 404 })
  }

  await tombstoneMemoryItem(id, user.id)
  return NextResponse.json({ tombstoned: true, lifecycleState: 'tombstoned' })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await readMemoryPatternPostFields(req)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const validation = validateMemoryPatternPostFields(parsed)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const { projectId, action } = validation

  // Verify ownership through the user-scoped client before any admin write.
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (action === STAGE1_THE_PROMPT_SEED_ACTION) {
    if (!isThePromptSeedProject(project)) {
      return NextResponse.json(
        { error: 'The Prompt seed can only run for an explicitly matching The Prompt project' },
        { status: 400 }
      )
    }

    await seedBrandMemory(projectId)
    return NextResponse.json({ seeded: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function readMemoryPatternPostFields(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const body = await req.json()
      return normalizeMemoryPatternPostFields(body)
    } catch {
      return { error: 'Invalid JSON' }
    }
  }

  try {
    const formData = await req.formData()
    return normalizeMemoryPatternPostFields({
      action: formData.get('action'),
      projectId: formData.get('projectId'),
    })
  } catch {
    return { error: 'Invalid request body' }
  }
}
