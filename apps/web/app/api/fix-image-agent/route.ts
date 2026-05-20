/**
 * POST /api/fix-image-agent
 * Uppdaterar bildgenereringsagenten direkt i databasen.
 * Byter dall-e-3 → gpt-image-1, tar bort style-parametern.
 * Engångsfix — kan köras säkert flera gånger (idempotent).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  return POST()
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()

  // Hitta ALLA agenter med dall-e-3 eller dall-e som modell
  const { data: agents, error } = await db
    .from('agents')
    .select('id, name, model')
    .or('model.eq.dall-e-3,model.like.dall-e%')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, message: 'Inga dall-e agenter hittades — redan fixat!', updated: [] })
  }

  const updated: string[] = []

  for (const agent of agents) {
    const { error: updateError } = await db
      .from('agents')
      .update({
        model: 'gpt-image-1',
        description: 'Genererar färgläggningsbilder med GPT Image 1 (dall-e-3 pensionerad 2026-03-04)',
        system_prompt: 'Genererar bilder med GPT Image 1. Input ska vara ett JSON-array med bildprompts. Returnera inget annat.',
      })
      .eq('id', agent.id)

    if (!updateError) {
      updated.push(`${agent.name} (${agent.id.slice(0, 8)}) — ${agent.model} → gpt-image-1`)
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Uppdaterade ${updated.length} agent(er)`,
    updated,
  })
}
