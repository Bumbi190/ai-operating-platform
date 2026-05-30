'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'

export function SeedButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSeed() {
    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setStatus('error')
        setMessage(data.error ?? 'Något gick fel')
      } else {
        setStatus('done')
        setMessage(data.message + (data.tip ? ` ${data.tip}` : ''))
      }
    } catch {
      setStatus('error')
      setMessage('Kunde inte nå servern')
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleSeed}
        disabled={status === 'loading' || status === 'done'}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === 'done' ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {status === 'loading' ? 'Installerar...' : status === 'done' ? 'Installerat!' : 'Installera Familje-Stunden'}
      </button>

      {message && (
        <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
          status === 'error'
            ? 'bg-destructive/10 border border-destructive/20 text-destructive'
            : 'bg-green-500/10 border border-green-500/20 text-green-500'
        }`}>
          {status === 'error' ? (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          {message}
        </div>
      )}
    </div>
  )
}
