'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'

interface Props {
  runId: string
}

export function ResumeRunButton({ runId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleResume() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/runs/${runId}/resume`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Kunde inte återuppta körningen')
        setLoading(false)
        return
      }

      // Ladda om sidan — körningen är nu 'running' igen
      router.refresh()
    } catch {
      setError('Nätverksfel — försök igen')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleResume}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Återupptar...
          </>
        ) : (
          <>
            <RotateCcw className="w-3.5 h-3.5" />
            Fortsätt körning
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
