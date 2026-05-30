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
 *      Deletes a memory item (human correction)
 *
 * POST /api/memory/patterns/seed
 *      Seeds brand memory for a project (one-time setup)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getMemory,
  getProjectMemorySummary,
  deleteMemoryItem,
  seedBrandMemory,
  MemoryCategory,
} from '@/lib/ai/memory/memory-store'
import { getPatternStats } from '@/lib/ai/memory/feedback-store'

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

  await deleteMemoryItem(id)
  return NextResponse.json({ deleted: true })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, projectId } = body

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

  if (action === 'seed_brand') {
    await seedBrandMemory(projectId)
    return NextResponse.json({ seeded: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
