/**
 * GET /api/runs/[id]/ebook?format=epub|pdf
 *
 * Genererar e-boken (EPUB eller HTML-för-PDF) från en körnings saga-output.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSaga } from '@/lib/ebook/sagaParser'
import { buildEpub } from '@/lib/ebook/epubBuilder'
import { buildPdfHtml } from '@/lib/ebook/pdfTemplate'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = request.nextUrl.searchParams.get('format') ?? 'epub'

  // Hämta körningen — cast to any to bypass Supabase generated type issues
  const { data: runRaw } = await supabase
    .from('runs')
    .select('id, context')
    .eq('id', params.id)
    .single()

  if (!runRaw) return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })

  const run = runRaw as { id: string; context: Record<string, string> | null }
  const context = (run.context ?? {}) as Record<string, string>
  const sagaText = context['saga'] ?? ''

  if (!sagaText || sagaText.length < 100) {
    return NextResponse.json(
      { error: 'Denna körning har ingen saga att exportera. Kör månadspaket-workflow och försök igen.' },
      { status: 400 },
    )
  }

  // Hämta saga-illustrationer (sagabilder) — prioritera saga-specifika bilder
  // allImageUrls: alla URLs inklusive base64 (används i PDF-HTML som stödjer data:)
  // storageUrls:  bara riktiga HTTP-URLs (används i EPUB — base64 gör filen för stor)
  let allImageUrls: string[] = []
  let storageUrls: string[] = []

  // sagabilder = färgglada saga-illustrationer (steg 8); bilder = färgläggningsbilder (steg 6)
  // PDF-sagan ska använda sagabilder om de finns, annars fall tillbaka på bilder
  const sagabilderRaw = context['sagabilder'] ?? ''
  const bilderRaw     = context['bilder'] ?? ''
  const imageSource   = sagabilderRaw || bilderRaw

  if (imageSource) {
    try {
      const parsed = JSON.parse(imageSource)
      allImageUrls = (parsed.urls ?? []).filter(Boolean)
      storageUrls  = allImageUrls.filter((u: string) => !u.startsWith('data:'))
    } catch { /* ingen bild-JSON */ }
  }

  // Parsa sagan
  const saga = parseSaga(sagaText)
  const safeTitle = saga.title.replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase()

  // ── EPUB ──────────────────────────────────────────────────────────────────
  if (format === 'epub') {
    try {
      const epubBuffer = await buildEpub(saga, storageUrls)
      // Convert Node Buffer → ArrayBuffer for NextResponse compatibility
      const arrayBuf = epubBuffer.buffer.slice(epubBuffer.byteOffset, epubBuffer.byteOffset + epubBuffer.byteLength)
      return new NextResponse(arrayBuf as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/epub+zip',
          'Content-Disposition': `attachment; filename="${safeTitle}.epub"`,
          'Content-Length': epubBuffer.length.toString(),
        },
      })
    } catch (err) {
      console.error('EPUB build error:', err)
      return NextResponse.json({ error: 'Kunde inte generera EPUB' }, { status: 500 })
    }
  }

  // ── PDF (HTML-vy för browser-print) ───────────────────────────────────────
  if (format === 'pdf') {
    // PDF kan använda alla URLs inklusive base64 — webbläsaren hanterar data:-URLs direkt
    const html = buildPdfHtml(saga, allImageUrls)
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  }

  return NextResponse.json({ error: 'Okänt format. Använd ?format=epub eller ?format=pdf' }, { status: 400 })
}
