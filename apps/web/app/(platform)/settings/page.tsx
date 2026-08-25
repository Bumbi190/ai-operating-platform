import { createClient } from '@/lib/supabase/server'
import { User, Key, Info, Zap, Database, Instagram } from 'lucide-react'
import { SeedButton } from './SeedButton'
import { TokenUpdater } from './TokenUpdater'
import { OSPage, OSLayer, Panel, PanelHeader, StatusChip } from '@/components/platform/os'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const hasOpenAI = !!process.env.OPENAI_API_KEY

  return (
    <OSPage density="spacious" className="animate-fade-in">
      {/* Hero */}
      <OSLayer layer="hero">
        <div>
          <p className="eyebrow os-eyebrow-accent mb-3">Operator · system configuration</p>
          <h1 className="text-3xl 2xl:text-4xl font-bold tracking-tight">Inställningar</h1>
          <p className="text-sm 2xl:text-base text-muted-foreground mt-2 max-w-2xl">
            Konto, integrationer och plattformsinställningar
          </p>
        </div>
      </OSLayer>

      {/* Operational systems — 3-col grid on lg+, 4-col on 3xl                */}
      <OSLayer layer="operational" className="grid grid-cols-1 lg:grid-cols-2 3xl:grid-cols-3 gap-4 lg:gap-5">

      {/* Account */}
      <Panel className="p-5">
        <PanelHeader icon={<User className="w-4 h-4 text-muted-foreground" />} title="Konto" />
        <div className="space-y-4">
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
      </Panel>

      {/* API Keys */}
      <Panel className="p-5">
        <PanelHeader icon={<Key className="w-4 h-4 text-muted-foreground" />} title="API-nycklar" />
        <div className="space-y-3">
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
              <StatusChip
                tone={item.ok ? 'emerald' : 'amber'}
                label={item.ok ? 'Konfigurerad' : 'Saknas'}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            API-nycklar konfigureras via <code className="font-mono bg-muted px-1 rounded">.env.local</code>
          </p>
        </div>
      </Panel>

      {/* Seed data */}
      <Panel className="p-5">
        <PanelHeader icon={<Database className="w-4 h-4 text-muted-foreground" />} title="Exempeldata" />
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Installera Familje-Stunden agenter och månadspaket-workflow. Kör detta en gång för att komma igång.
          </p>
          <SeedButton />
        </div>
      </Panel>

      {/* Social media tokens */}
      <Panel className="p-5">
        <PanelHeader icon={<Instagram className="w-4 h-4 text-muted-foreground" />} title="Instagram / Facebook-token" />
        <TokenUpdater />
      </Panel>

      {/* Platform info */}
      <Panel className="p-5">
        <PanelHeader icon={<Zap className="w-4 h-4 text-muted-foreground" />} title="Plattform" />
        <div className="space-y-3 text-sm">
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
      </Panel>

      {/* Roadmap hint */}
      <section className="rounded-xl border border-dashed border-border p-5 flex gap-3 lg:col-span-2 3xl:col-span-3">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Kommande funktioner</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Schemalagda körningar (cron), godkännandeflöde, PDF-export,
            webhook-triggers och team-inbjudningar planeras i nästa fas.
          </p>
        </div>
      </section>
      </OSLayer>
    </OSPage>
  )
}
