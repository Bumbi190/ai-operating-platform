import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Target, Lightbulb, Zap, ArrowRight } from 'lucide-react'
import { PlanningBoard } from './PlanningBoard'
import { OSPage, OSLayer } from '@/components/platform/os'

export default async function PlanningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toLocaleDateString('sv-SE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  return (
    <OSPage className="animate-fade-in">
      {/* HERO */}
      <OSLayer layer="hero" className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planering</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Aktiva projekt</div>
          <div className="text-sm font-medium mt-0.5">The Prompt · Buggskanner</div>
        </div>
      </OSLayer>

      {/* OPERATIONAL · active focus + board */}
      <OSLayer layer="operational" className="space-y-5 lg:space-y-6">
      <section className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5 flex gap-4">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-indigo-400 font-medium mb-1">Aktivt fokus</div>
          <p className="text-sm">Stabilisera The Prompt autonoma pipeline (IG + FB publicering, cron-schemaläggning) och implementera buggskanner-agent</p>
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              The Prompt — Aktiv
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              Familje-Stunden — På is
            </span>
          </div>
        </div>
      </section>

      {/* Planning board */}
      <PlanningBoard />
      </OSLayer>

      {/* INTELLIGENCE · roadmap */}
      <OSLayer layer="intelligence">
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Roadmap — Kommande faser</h2>
        </div>
        <div className="divide-y divide-border">
          {[
            {
              phase: 'Fas 1',
              label: 'The Prompt — Pipeline-stabilisering',
              items: [
                'Verifierad IG + FB-publicering med retry-logik',
                'pg_cron schemaläggning (07:30 + 17:30 UTC)',
                'Granskningssida visar korrekt antal väntande',
              ],
              status: 'active',
            },
            {
              phase: 'Fas 2',
              label: 'Buggskanner-agent',
              items: [
                'Agent som skannar Next.js-kodbasen efter TypeScript-fel',
                'Rapporterar buggar via granskningsflödet',
                'Schemalagd daglig körning',
              ],
              status: 'planned',
            },
            {
              phase: 'Fas 3',
              label: 'The Prompt — Innehållskvalitet',
              items: [
                'Förbättrad AI-betygsättning av manus',
                'A/B-testning av krokar och CTA:er',
                'Prestandaspårning per publicerat klipp',
              ],
              status: 'planned',
            },
            {
              phase: 'Fas 4',
              label: 'Familje-Stunden — Återaktivering',
              items: [
                'Återuppta pipeline för månatligt innehåll',
                'PDF-export och leveransautomation',
                'Prenumerantshantering',
              ],
              status: 'on-ice',
            },
          ].map((item) => (
            <div key={item.phase} className="px-5 py-4 flex gap-4">
              <div className="shrink-0 w-16 text-xs font-medium text-muted-foreground pt-0.5">{item.phase}</div>
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
              <span className={`shrink-0 text-xs self-start pt-0.5 ${
                item.status === 'active' ? 'text-emerald-400' :
                item.status === 'on-ice' ? 'text-zinc-600' :
                'text-muted-foreground/50'
              }`}>
                {item.status === 'active' ? 'Aktiv' : item.status === 'on-ice' ? 'På is' : 'Planerad'}
              </span>
            </div>
          ))}
        </div>
      </section>

      </OSLayer>

      {/* FOOTER · how-to */}
      <OSLayer layer="footer">
      <section className="rounded-xl border border-dashed border-border p-5 flex gap-3">
        <Lightbulb className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Så fungerar planeringen</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Lägg till uppgifter i listan nedan och flytta dem mellan kolumner. Chatt-assistenten kan hjälpa dig prioritera, planera nästa sprint och diskutera förbättringar — skriv t.ex. <em>"Vad borde vi fokusera på i sprint 2?"</em>
          </p>
        </div>
      </section>
      </OSLayer>
    </OSPage>
  )
}
