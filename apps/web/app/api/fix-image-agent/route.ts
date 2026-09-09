/**
 * POST /api/fix-image-agent
 * Uppdaterar bildgenereringsagenten direkt i databasen.
 * Byter dall-e-3 → gpt-image-1, tar bort style-parametern.
 * Engångsfix — kan köras säkert flera gånger (idempotent).
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  // MACHINE BOUNDARY. This repair is deliberately platform-wide — it rewrites
  // EVERY dall-e agent in the database, across all projects — so a project guard
  // would misdescribe it. A session was the wrong credential: any signed-in user
  // could rewrite every tenant's image agent, and GET delegates to POST, so a
  // page load sufficed.
  //
  // The credential is the one this repo already uses for unattended surfaces
  // (`publishing/smoke`, `collectors/social/account`, `media/news/cron`), and it
  // is never shipped to a browser. Production-disabling by NODE_ENV was the
  // other candidate and was rejected: the repo has no env-gating convention at
  // all, and inventing one for a single route is worse than reusing the
  // established machine principal.
  //
  // Nothing in the app calls this route: the dev path is the standalone
  // `scripts/fix-image-agent.ts`, which talks to Supabase directly and is
  // unaffected. Live truth at the time of writing: zero dall-e agents remain,
  // and dall-e-3 was retired 2026-03-04.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
