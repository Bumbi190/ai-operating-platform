'use client'

/**
 * BreakingButton — NEWSJACKING-triggern i UI:t.
 *
 * Öppnar en modal med tre lägen och POST:ar till POST /api/media/breaking:
 *   • Auto   → tom body, News Hunter tar dagens största story
 *   • URL    → { url }  (skrapas via Hermes på servern)
 *   • Text   → { text } (klistrad artikeltext, full kontroll)
 *
 * Auth sker via inloggad operatörs-cookie (same-origin fetch). Kedjan kan ta
 * några minuter (analys→manus→röst→bild→render→publicering). Tar den längre än
 * inline-budgeten lämnas videon över till pipeline-retry, som publicerar den
 * automatiskt så snart rendern är klar — det förklaras i UI:t.
 */

import { useState } from 'react'
import { Radio, X, Loader2, CheckCircle2, AlertTriangle, Clock, Sparkles, Link2, FileText } from 'lucide-react'

type Mode = 'auto' | 'url' | 'text'

type BreakingResult = {
  ok: boolean
  scriptId?: string
  hook?: string
  error?: string
  steps?: {
    source?: string
    renderReady?: boolean
    note?: string
    [k: string]: unknown
  }
}

// Inline-budgeten på servern är ~5 min; ge fetchen lite marginal innan vi
// faller tillbaka på "fortsätter i bakgrunden".
const REQUEST_TIMEOUT_MS = 310_000

export function BreakingButton({ projectId }: { projectId: string }) {
  const [open, setOpen]       = useState(false)
  const [mode, setMode]       = useState<Mode>('auto')
  const [url, setUrl]         = useState('')
  const [text, setText]       = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<BreakingResult | null>(null)
  const [handoff, setHandoff] = useState(false)   // fetchen tog för lång tid → bakgrund
  const [error, setError]     = useState<string | null>(null)

  const reset = () => {
    setResult(null); setError(null); setHandoff(false)
  }

  const close = () => {
    if (loading) return   // blockera stängning mitt i en körning
    setOpen(false)
    setTimeout(reset, 200)
  }

  const submit = async () => {
    setLoading(true); reset()

    const body: { project_id: string; url?: string; text?: string } = { project_id: projectId }
    if (mode === 'url'  && url.trim())  body.url  = url.trim()
    if (mode === 'text' && text.trim()) body.text = text.trim()

    try {
      const res = await fetch('/api/media/breaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => ({}))) as BreakingResult
      if (!res.ok || !data.ok) {
        setError(data.error || `Något gick fel (HTTP ${res.status})`)
        if (data.steps) setResult(data)
      } else {
        setResult(data)
      }
    } catch (e) {
      // Timeout/avbrott = servern jobbar troligen vidare; säkerhetsnätet tar vid.
      const isTimeout = e instanceof DOMException && e.name === 'TimeoutError'
      if (isTimeout) setHandoff(true)
      else setError(e instanceof Error ? e.message : 'Nätverksfel')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    !loading &&
    (mode === 'auto' || (mode === 'url' && url.trim().length > 0) || (mode === 'text' && text.trim().length > 0))

  const renderReady = result?.steps?.renderReady === true
  const showResult  = !!result && !error
  const showHandoff = handoff || (showResult && result?.steps?.renderReady === false)

  return (
    <>
      {/* ── Triggerknapp i headern ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="ease-os press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
        style={{
          background: 'rgba(248,113,113,0.10)',
          border: '1px solid rgba(248,113,113,0.25)',
          color: '#fca5a5',
        }}
        title="Producera och publicera en video direkt, utanför det dagliga schemat"
      >
        <Radio className="w-3.5 h-3.5" />
        🚨 Breaking
      </button>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={close}
        >
          <div
            className="relative w-full max-w-md rounded-2xl glass p-5 animate-fade-in-up"
            style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }}>
                  <Radio className="w-4 h-4" style={{ color: '#fca5a5' }} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-zinc-100">🚨 Breaking — newsjacking</h2>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Producerar &amp; publicerar direkt, utanför schemat</p>
                </div>
              </div>
              <button onClick={close} disabled={loading}
                className="text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Resultat / fel / handoff ─────────────────────────────────── */}
            {(showResult || error || showHandoff) ? (
              <div className="space-y-3">
                {error && !showResult && (
                  <div className="flex items-start gap-2.5 rounded-xl p-3"
                    style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-red-300">Det gick inte att producera</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{error}</p>
                    </div>
                  </div>
                )}

                {showHandoff && (
                  <div className="flex items-start gap-2.5 rounded-xl p-3"
                    style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)' }}>
                    <Clock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-indigo-300">Producerar i bakgrunden</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Rendern tog längre än inline-budgeten. Säkerhetsnätet (pipeline-retry) slutför och
                        publicerar videon automatiskt inom några minuter — du behöver inte göra något mer.
                      </p>
                    </div>
                  </div>
                )}

                {showResult && result?.hook && (
                  <div className="rounded-xl p-3 space-y-2"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span className="text-[9.5px] font-semibold text-zinc-600 uppercase tracking-[0.15em]">Hook</span>
                      {result.steps?.source && (
                        <span className="ml-auto text-[9px] text-zinc-700 uppercase tracking-wide">
                          källa: {result.steps.source}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-300 leading-snug">{result.hook}</p>
                    {renderReady && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[11px] font-semibold text-emerald-300">
                          Publicerad till Instagram, Facebook &amp; YouTube
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={close}
                  className="ease-os press w-full px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#d4d4d8' }}
                >
                  Stäng
                </button>
              </div>
            ) : (
              /* ── Formulär ───────────────────────────────────────────────── */
              <div className="space-y-4">
                {/* Lägesväljare */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {([
                    { id: 'auto', label: 'Auto', icon: Sparkles },
                    { id: 'url',  label: 'URL',  icon: Link2 },
                    { id: 'text', label: 'Text', icon: FileText },
                  ] as const).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setMode(id)}
                      disabled={loading}
                      className="ease-os flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
                      style={mode === id
                        ? { background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5' }
                        : { background: 'transparent', border: '1px solid transparent', color: '#71717a' }}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Lägesbeskrivning + input */}
                {mode === 'auto' && (
                  <p className="text-[11px] text-zinc-500 leading-relaxed px-0.5">
                    News Hunter hämtar dagens största AI-story automatiskt och producerar en reel av den.
                    Inget att fylla i — klicka bara nedan.
                  </p>
                )}

                {mode === 'url' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide px-0.5">Artikel-URL</label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={loading}
                      placeholder="https://…"
                      className="w-full px-3 py-2.5 rounded-xl text-[12px] text-zinc-200 placeholder:text-zinc-700 outline-none transition-all disabled:opacity-40 focus:ring-1 focus:ring-red-400/30"
                      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                    <p className="text-[10px] text-zinc-700 px-0.5">Skrapas på servern och blir manusunderlag.</p>
                  </div>
                )}

                {mode === 'text' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide px-0.5">Artikeltext</label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      disabled={loading}
                      rows={5}
                      placeholder="Klistra in artikeltexten här för full kontroll…"
                      className="w-full px-3 py-2.5 rounded-xl text-[12px] text-zinc-200 placeholder:text-zinc-700 outline-none transition-all resize-none disabled:opacity-40 focus:ring-1 focus:ring-red-400/30"
                      style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </div>
                )}

                {/* Tidsnotis */}
                <div className="flex items-start gap-2 px-0.5">
                  <Clock className="w-3 h-3 text-zinc-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    Hela kedjan (analys → manus → röst → bild → render → publicering) tar några minuter.
                    Håll fönstret öppet om du vill se resultatet — annars slutförs den ändå i bakgrunden.
                  </p>
                </div>

                {/* Submit */}
                <button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="ease-os press w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[12px] font-bold transition-all"
                  style={canSubmit
                    ? { background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)', color: '#fca5a5', cursor: 'pointer' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', cursor: 'not-allowed' }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Producerar…
                    </>
                  ) : (
                    <>
                      <Radio className="w-4 h-4" />
                      Producera &amp; publicera nu
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
