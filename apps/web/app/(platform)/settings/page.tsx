import { createClient } from '@/lib/supabase/server'
import { User, Key, Info, Zap, Database } from 'lucide-react'
import { SeedButton } from './SeedButton'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const hasOpenAI = !!process.env.OPENAI_API_KEY

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inställningar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Konto och plattformsinställningar
        </p>
      </div>

      {/* Account */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Konto</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">E-postadress</p>
            <p className="text-sm font-mono">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Konto-ID</p>
            <p className="text-xs font-mono text-muted-foreground">{user?.id ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Inloggningsmetod</p>
            <p className="text-sm">Magic link (e-post)</p>
          </div>
        </div>
      </section>

      {/* API Keys */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">API-nycklar</h2>
        </div>
        <div className="p-5 space-y-3">
          {[
            { label: 'Anthropic API', desc: 'Används för alla Claude-agenter', ok: !!process.env.ANTHROPIC_API_KEY },
            { label: 'OpenAI / DALL-E', desc: 'Bildgenerering med DALL-E 3', ok: hasOpenAI },
            { label: 'Ideogram', desc: 'Cinematiska scenbilder för videor', ok: !!process.env.IDEOGRAM_API_KEY },
            { label: 'ElevenLabs', desc: 'Victoria röstgenerering', ok: !!process.env.ELEVENLABS_API_KEY },
            { label: 'Supabase', desc: 'Databas och autentisering', ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL },
          ].map((item, i) => (
            <div key={i} className={`flex items-center justify-between py-2 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${
                item.ok
                  ? 'text-green-500 bg-green-500/10 border-green-500/20'
                  : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${item.ok ? 'bg-green-500' : 'bg-amber-500'}`} />
                {item.ok ? 'Konfigurerad' : 'Saknas'}
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            API-nycklar konfigureras via <code className="font-mono bg-muted px-1 rounded">.env.local</code>
          </p>
        </div>
      </section>

      {/* Seed data */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Exempeldata</h2>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Installera Familje-Stunden agenter och månadspaket-workflow. Kör detta en gång för att komma igång.
          </p>
          <SeedButton />
        </div>
      </section>

      {/* Platform info */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Plattform</h2>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono text-xs">0.2.0-MVP</span>
          </div>
          <div className="flex justify-between border-t border-border pt-3">
            <span className="text-muted-foreground">Stack</span>
            <span className="text-xs text-right text-muted-foreground">Next.js 14 · Supabase · Claude · DALL-E 3</span>
          </div>
          <div className="flex justify-between border-t border-border pt-3">
            <span className="text-muted-foreground">Modell (standard)</span>
            <span className="font-mono text-xs">claude-sonnet-4-6</span>
          </div>
        </div>
      </section>

      {/* Roadmap hint */}
      <section className="rounded-xl border border-dashed border-border p-5 flex gap-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Kommande funktioner</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Schemalagda körningar (cron), godkännandeflöde, PDF-export,
            webhook-triggers och team-inbjudningar planeras i nästa fas.
          </p>
        </div>
      </section>
    </div>
  )
}
