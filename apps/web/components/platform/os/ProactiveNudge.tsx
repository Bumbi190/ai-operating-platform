'use client'

/**
 * ProactiveNudge — den proaktiva assistenten (V3, Feature 8 + 10).
 *
 * Istället för att vänta på att operatören frågar, säger assistenten självmant
 * till om det viktigaste just nu — i jag-form, konversationellt — och erbjuder
 * att hjälpa till. Kan avfärdas (kom ihåg per signal i localStorage).
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, X, ArrowRight, MessageSquare } from 'lucide-react'
import type { AttentionItem } from '@/lib/os/priority'
import { AgenticButton } from './AgenticButton'

/** Gör om en attention-item till en mänsklig, jag-form-observation. */
function observe(item: AttentionItem): string {
  if (item.id.startsWith('fail-'))  return `Jag märkte att ${item.business} har körningar som misslyckades. Vill du att jag hjälper dig åtgärda det?`
  if (item.id.startsWith('appr-'))  return `Godkännanden hopar sig i ${item.business}. Vill du beta av dem nu?`
  if (item.id.startsWith('idle-'))  return `Jag märkte att ${item.business} varit inaktiv ett tag. Vill du att vi tittar på det?`
  if (item.id === 'ig-insights')    return `Instagram-engagemang läses inte in — tokenet saknar behörighet. Vill du att jag hjälper dig fixa det?`
  return `${item.title}. Vill du att jag hjälper dig?`
}

export function ProactiveNudge({ item }: { item: AttentionItem | null }) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (!item) return
    try {
      const key = `omnira_nudge_dismissed_${item.id}`
      setDismissed(localStorage.getItem(key) === '1')
    } catch { setDismissed(false) }
  }, [item])

  if (!item || item.severity === 'info' || dismissed) return null

  function dismiss() {
    try { localStorage.setItem(`omnira_nudge_dismissed_${item!.id}`, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  function ask() {
    router.push(`/chat?send=${encodeURIComponent(`Hjälp mig med: ${item!.title}`)}`)
  }

  const accent = item.severity === 'urgent' ? '#f87171' : '#d4a574'

  return (
    <div
      className="mb-6 rounded-2xl p-4 relative overflow-hidden animate-fade-in-up flex items-start gap-3"
      style={{ background: 'rgba(212,165,116,0.05)', border: `1px solid ${accent}33`, animationFillMode: 'both' }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center chrome-edge shrink-0 mt-0.5"
        style={{ background: `${accent}1c`, border: `1px solid ${accent}40` }}
      >
        <Sparkles className="w-4 h-4" style={{ color: accent }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="eyebrow eyebrow-gold !text-[8.5px] mb-1">Assistenten</p>
        <p className="text-[13.5px] text-white/95 leading-relaxed">{observe(item)}</p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {item.agentic ? (
            <AgenticButton endpoint={item.agentic.endpoint} body={item.agentic.body} label={item.agentic.label} />
          ) : item.action ? (
            <button
              onClick={() => router.push(item.action!.href)}
              className="btn-omnira ease-os press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold"
            >
              {item.action.label} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : null}
          <button
            onClick={ask}
            className="btn-ghost ease-os press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Fråga assistenten
          </button>
        </div>
      </div>

      <button onClick={dismiss} className="text-meta hover:text-zinc-300 transition-colors shrink-0" aria-label="Avfärda">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
