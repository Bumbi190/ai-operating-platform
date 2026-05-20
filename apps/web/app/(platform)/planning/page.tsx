import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Target, Lightbulb, CheckSquare, Zap, ArrowRight } from 'lucide-react'
import { PlanningBoard } from './PlanningBoard'

export default async function PlanningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toLocaleDateString('sv-SE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  // Current sprint definition — hardcoded for now, will be DB-driven
  const currentSprint = {
    name: 'Sprint 1 — Kärnsystem',
    goal: 'Sätt upp Familje-Stunden pipeline, kostnadsöversikt och manager-agent',
    start: '2026-05-16',
    end: '2026-05-30',
    daysLeft: Math.max(0, Math.ceil((new Date('2026-05-30').getTime() - Date.now()) / 86400000)),
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planering</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">{currentSprint.name}</div>
          <div className="text-sm font-medium mt-0.5">{currentSprint.daysLeft} dagar kvar</div>
        </div>
      </div>

      {/* Current sprint */}
      <section className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 flex gap-4">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-indigo-400 font-medium mb-1">Nuvarande sprint — Mål</div>
          <p className="text-sm">{currentSprint.goal}</p>
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span>{currentSprint.start} → {currentSprint.end}</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Aktiv
            </span>
          </div>
        </div>
      </section>

      {/* Planning board */}
      <PlanningBoard />

      {/* Roadmap */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Roadmap — Kommande sprintar</h2>
        </div>
        <div className="divide-y divide-border">
          {[
            {
              sprint: 'Sprint 2',
              label: 'Godkännandeflöde & Manager-agent',
              items: ['Manager-agent granskar output', 'Approval UI i plattformen', 'Notifieringar vid godkännande'],
              status: 'planned',
            },
            {
              sprint: 'Sprint 3',
              label: 'Schemaläggning & Automation',
              items: ['Cron-schemaläggning per workflow', 'Auto-körning 1:a varje månad', 'Slack/e-post-notis vid klart'],
              status: 'planned',
            },
            {
              sprint: 'Sprint 4',
              label: 'PDF-export & Leverans',
              items: ['Sammanställ månadspaket till PDF', 'Upload till Google Drive', 'Godkänn → skicka till prenumeranter'],
              status: 'planned',
            },
            {
              sprint: 'Sprint 5',
              label: 'Bildgenerering & Design',
              items: ['DALL-E 3 färgläggningsbilder', 'Midjourney-integration', 'Canva-export av layout'],
              status: 'planned',
            },
          ].map((item) => (
            <div key={item.sprint} className="px-5 py-4 flex gap-4">
              <div className="shrink-0 w-16 text-xs font-medium text-muted-foreground pt-0.5">{item.sprint}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-2">{item.label}</div>
                <ul className="space-y-1">
                  {item.items.map((i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground/50 self-start pt-0.5">Planerad</span>
            </div>
          ))}
        </div>
      </section>

      {/* How to use */}
      <section className="rounded-xl border border-dashed border-border p-5 flex gap-3">
        <Lightbulb className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Så fungerar planeringen</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Lägg till uppgifter i listan nedan och flytta dem mellan kolumner. Chatt-assistenten kan hjälpa dig prioritera, planera nästa sprint och diskutera förbättringar — skriv t.ex. <em>"Vad borde vi fokusera på i sprint 2?"</em>
          </p>
        </div>
      </section>
    </div>
  )
}
