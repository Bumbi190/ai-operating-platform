/**
 * GET /api/runs/[id]/monthly-pdf
 *
 * Genererar det kompletta månadspaket-PDF:et:
 * omslag, innehåll, aktiviteter, färgläggning, pyssel, krysslista, diplom, avslutning.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSaga } from '@/lib/ebook/sagaParser'
import { buildMonthlyPdfHtml } from '@/lib/ebook/monthlyPdfTemplate'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: runRaw } = await supabase
    .from('runs')
    .select('id, context')
    .eq('id', params.id)
    .single()

  if (!runRaw) return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })

  const run = runRaw as { id: string; context: Record<string, string> | null }
  const context = (run.context ?? {}) as Record<string, string>

  const sagaText = context['saga'] ?? ''
  if (!sagaText || sagaText.length < 50) {
    return NextResponse.json({ error: 'Ingen saga hittades i denna körning.' }, { status: 400 })
  }

  const saga = parseSaga(sagaText)
  const baseUrl = request.nextUrl.origin

  // Referensbilderna används ENBART som stil-guider i images.edit() för att generera
  // NYA bilder — de ska aldrig visas direkt i PDF:en som bakgrunder.
  // Struktursidor (omslag, innehåll etc.) använder AI-genererade sagabilder som bakgrund.

  // Try multiple possible output_key names — workflow may use different names
  // e.g. 'checklista' instead of 'komplement', 'färgläggningsbilder' instead of 'bilder'
  const html = buildMonthlyPdfHtml({
    tema:             context['tema'],
    aktiviteter:      context['aktiviteter'],
    saga:             context['saga'],
    komplement:       context['komplement']         ?? context['checklista']          ?? context['checklist'],
    bilder:           context['bilder']             ?? context['färgläggningsbilder'] ?? context['farglaggningsbilder'],
    sagabilder:       context['sagabilder'],
    aktivitetsbilder: context['aktivitetsbilder'],
    runId:            params.id,
    sagaTitle:        saga.title,
    sagaSubtitle:     saga.subtitle,
  }, baseUrl)

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
