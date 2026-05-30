/**
 * GET /api/runs/[id]/mp3-manus
 *
 * Visar MP3-manuset som en snygg HTML-sida för ElevenLabs-uppladdning.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSaga } from '@/lib/ebook/sagaParser'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: runRaw } = await supabase
    .from('runs').select('id, context').eq('id', params.id).single()

  if (!runRaw) return NextResponse.json({ error: 'Körning hittades inte' }, { status: 404 })

  const context = (runRaw as { id: string; context: Record<string, string> | null }).context ?? {}
  const sagaText = context['saga'] ?? ''
  const saga = parseSaga(sagaText)
  const mp3 = saga.mp3Script || sagaText

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<title>${esc(saga.title)} — Ljudsaga</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #0f172a; color: #f1f5f9; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 2rem 1rem; }
  .card { background: #1e293b; border-radius: 1rem; padding: 2.5rem; max-width: 780px; width: 100%; border: 1px solid #334155; }
  h1 { font-size: 1.5rem; color: #a78bfa; margin-bottom: .3rem; }
  .subtitle { color: #94a3b8; font-size: .9rem; margin-bottom: 1.5rem; }
  .badge { display: inline-block; background: #7c3aed; color: white; font-size: .7rem; padding: .2rem .7rem; border-radius: 999px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 1rem; }
  .instructions { background: #0f172a; border: 1px solid #334155; border-radius: .5rem; padding: 1rem 1.2rem; margin-bottom: 1.5rem; font-size: .85rem; color: #94a3b8; line-height: 1.6; }
  .instructions strong { color: #c4b5fd; }
  .manus-box { background: #0f172a; border: 1px solid #4c1d95; border-radius: .75rem; padding: 1.5rem; font-size: .95rem; line-height: 1.8; color: #e2e8f0; white-space: pre-wrap; max-height: 60vh; overflow-y: auto; margin-bottom: 1.5rem; font-family: Georgia, serif; }
  .btn-row { display: flex; gap: .75rem; flex-wrap: wrap; }
  .btn { padding: .65rem 1.4rem; border-radius: .5rem; font-size: .88rem; font-weight: 700; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: .5rem; text-decoration: none; }
  .btn-copy { background: #7c3aed; color: white; }
  .btn-copy:hover { background: #6d28d9; }
  .btn-back { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
  .copied { background: #059669 !important; }
</style>
</head>
<body>
<div class="card">
  <span class="badge">🎙️ Ljudsaga</span>
  <h1>${esc(saga.title)}</h1>
  <p class="subtitle">${esc(saga.subtitle)} · MP3-manus för ElevenLabs</p>

  <div class="instructions">
    <strong>Så här gör du:</strong> Kopiera texten nedan → öppna <strong>ElevenLabs.io</strong> → klistra in → välj röst → generera MP3. Markörerna [PAUS], [LUGNT], [GLAD] är riktmärken för röstton.
  </div>

  <div class="manus-box" id="manus">${esc(mp3)}</div>

  <div class="btn-row">
    <button class="btn btn-copy" id="copyBtn" onclick="copyManus()">📋 Kopiera hela manuset</button>
    <a class="btn btn-back" href="javascript:history.back()">← Tillbaka</a>
  </div>
</div>

<script>
function copyManus() {
  const text = document.getElementById('manus').innerText
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn')
    btn.textContent = '✅ Kopierat!'
    btn.classList.add('copied')
    setTimeout(() => { btn.textContent = '📋 Kopiera hela manuset'; btn.classList.remove('copied') }, 2500)
  })
}
</script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
