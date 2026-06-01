'use client'

/**
 * TokenUpdater — klistra in ett nytt Instagram/Facebook-token (med rätt scopes)
 * direkt från inställningarna. Sparar i platform_tokens via /api/media/token,
 * och kan därefter verifiera Instagram-insights med ett klick.
 */

import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'

export function TokenUpdater() {
  const [platform, setPlatform] = useState<'instagram' | 'facebook'>('instagram')
  const [token, setToken] = useState('')
  const [days, setDays] = useState('60')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/media/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, token: token.trim(), expires_days: Number(days) || undefined }),
      })
      const j = await res.json()
      if (res.ok) { setMsg({ ok: true, text: 'Token sparat ✓' }); setToken('') }
      else setMsg({ ok: false, text: j.error ?? 'Kunde inte spara' })
    } catch {
      setMsg({ ok: false, text: 'Nätverksfel' })
    } finally { setSaving(false) }
  }

  async function check() {
    setChecking(true); setCheckMsg(null)
    try {
      const res = await fetch('/api/media/insights/check')
      const j = await res.json()
      if (j.ok) setCheckMsg({ ok: true, text: 'Insights fungerar! Engagemang fylls i automatiskt.' })
      else setCheckMsg({ ok: false, text: j.message ?? 'Insights kunde inte läsas' })
    } catch {
      setCheckMsg({ ok: false, text: 'Nätverksfel' })
    } finally { setChecking(false) }
  }

  const inputStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' } as const

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Klistra in ett nytt token (t.ex. efter att du lagt till <code className="font-mono bg-muted px-1 rounded text-xs">instagram_manage_insights</code>).
        Sparas direkt och får företräde framför env-variabler.
      </p>

      <div className="flex gap-2">
        {(['instagram', 'facebook'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${platform === p ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-zinc-400 border border-white/10'}`}
          >
            {p === 'instagram' ? 'Instagram' : 'Facebook'}
          </button>
        ))}
      </div>

      <textarea
        value={token}
        onChange={e => setToken(e.target.value)}
        placeholder="Klistra in access token…"
        rows={3}
        className="w-full px-3 py-2 rounded-lg text-xs font-mono text-white/90 resize-none focus:outline-none scrollbar-thin"
        style={inputStyle}
      />

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Giltigt (dagar):</label>
        <input value={days} onChange={e => setDays(e.target.value)} className="w-16 px-2 py-1 rounded-lg text-xs text-white/90 focus:outline-none" style={inputStyle} />
        <button
          onClick={save}
          disabled={saving || !token.trim()}
          className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-600 disabled:opacity-40 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Spara token
        </button>
      </div>

      {msg && (
        <p className={`text-xs inline-flex items-center gap-1.5 ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} {msg.text}
        </p>
      )}

      <div className="pt-2 border-t border-border">
        <button
          onClick={check}
          disabled={checking}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          Verifiera Instagram-insights
        </button>
        {checkMsg && (
          <p className={`text-xs mt-2 inline-flex items-center gap-1.5 ${checkMsg.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
            {checkMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />} {checkMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}
