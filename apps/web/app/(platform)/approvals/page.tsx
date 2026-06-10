import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { CheckCircle2, XCircle, Clock, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { ApprovalCard } from './ApprovalCard'
import { Panel, SectionHeader, PulseDot, HeroStat, OSPage, OSLayer, ViewVisibleSync } from '@/components/platform/os'

export const dynamic = 'force-dynamic'

interface ApprovalRow {
  id: string
  output_key: string
  content: string
  status: 'pending' | 'approved' | 'rejected' | 'revised'
  reviewer_notes: string | null
  created_at: string
  reviewed_at: string | null
  runs?: null  // Not fetched — ApprovalCard handles this with fallbacks
}

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: approvals, error: approvalsError } = await db
    .from('approvals')
    .select('id, output_key, content, status, reviewer_notes, created_at, reviewed_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (approvalsError) {
    console.error('[approvals/page] Query error:', approvalsError.message)
  }

  const all = (approvals ?? []) as ApprovalRow[]
  const counts = {
    pending:  all.filter(a => a.status === 'pending').length,
    approved: all.filter(a => a.status === 'approved').length,
    rejected: all.filter(a => a.status === 'rejected').length,
    revised:  all.filter(a => a.status === 'revised').length,
  }

  const reviewedToday = all.filter(a => {
    if (!a.reviewed_at) return false
    return new Date(a.reviewed_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
  }).length

  // Atlas view awareness — publish the approval rows on screen.
  const visibleRefs = all.slice(0, 12).map(a => ({
    domain: 'approvals', id: a.id, label: `${a.output_key} (${a.status})`,
  }))

  return (
    <OSPage>
      <ViewVisibleSync refs={visibleRefs} />

      {/* ── HERO LAYER ──────────────────────────────────────────────────── */}
      <OSLayer layer="hero">
      <header className="grid grid-cols-12 gap-5 lg:gap-7 items-end animate-fade-in-up">
        <div className="col-span-12 lg:col-span-7 3xl:col-span-8">
          <div className="flex items-center gap-2 mb-3">
            <PulseDot tone="amber" size={6} />
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-300">
              Exekutiv granskningskanal
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center chrome-edge shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(251,191,36,0.18), rgba(168,85,247,0.10))',
                border: '1px solid rgba(251,191,36,0.35)',
                boxShadow: '0 12px 32px -8px rgba(251,191,36,0.35)',
              }}
            >
              <ShieldCheck className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h1 className="text-[36px] font-black tracking-tight leading-[1.05] text-gradient-aurora">
                Granskningscenter
              </h1>
              <p className="text-[12.5px] text-zinc-400 mt-1.5 max-w-xl leading-relaxed">
                AI-betygsatta utdata köade för exekutiv bedömning · godkänn, revidera eller avvisa autonoma beslut
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 3xl:col-span-4 grid grid-cols-2 gap-3">
          <HeroStat
            label="Väntar på granskning"
            value={counts.pending}
            color="#fbbf24"
            glow={counts.pending > 0}
            caption={counts.pending > 0 ? 'Kräver operatörsbeslut' : 'Inkorg tom'}
            delay={60}
          />
          <HeroStat
            label="Beslutat idag"
            value={reviewedToday}
            color="#34d399"
            caption={`${counts.approved} godkänd · ${counts.rejected} avvisad`}
            delay={120}
          />
        </div>
      </header>
      </OSLayer>

      {/* ── OPERATIONAL · stat tiles, full width ────────────────────────── */}
      <OSLayer layer="operational">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 2xl:gap-5">
        <StatTile label="Väntande"    value={counts.pending}  color="#fbbf24" icon={<Clock        className="w-3.5 h-3.5" />} live />
        <StatTile label="Godkänd"    value={counts.approved} color="#34d399" icon={<CheckCircle2 className="w-3.5 h-3.5" />} />
        <StatTile label="Avvisad"    value={counts.rejected} color="#f87171" icon={<XCircle      className="w-3.5 h-3.5" />} />
        <StatTile label="Revideringar" value={counts.revised} color="#60a5fa" icon={<RefreshCw   className="w-3.5 h-3.5" />} />
      </section>
      </OSLayer>

      {/* ── INTELLIGENCE · the actual approval queue ───────────────────── */}
      <OSLayer layer="intelligence">
      {all.length === 0 ? (
        <Panel className="p-16 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 chrome-edge"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <ShieldCheck className="w-6 h-6 text-indigo-300" />
          </div>
          <p className="text-[14px] text-zinc-300 font-medium">Inkorg tom</p>
          <p className="text-[11.5px] text-meta mt-1.5 max-w-sm mx-auto">
            Starta ett arbetsflöde — autonoma utdata som underkänns av AI-utvärderaren hamnar här för exekutiv granskning.
          </p>
        </Panel>
      ) : (
        <div className="space-y-10">
          {counts.pending > 0 && (
            <section>
              <SectionHeader
                eyebrow="Prioritetskö"
                title="Inväntar beslut"
                caption={`${counts.pending} utdata${counts.pending === 1 ? '' : ''} flaggad${counts.pending === 1 ? '' : 'e'} för mänsklig bedömning`}
                right={
                  <span className="inline-flex items-center gap-2 text-[10.5px] text-amber-300 font-semibold uppercase tracking-[0.2em]">
                    <Sparkles className="w-3 h-3" /> AI-poängsatt
                  </span>
                }
              />
              <div className="space-y-3">
                {all.filter(a => a.status === 'pending').map((a, i) => (
                  <ApprovalCard key={a.id} approval={a} delay={i * 60} />
                ))}
              </div>
            </section>
          )}

          {all.some(a => a.status !== 'pending') && (
            <section>
              <SectionHeader
                eyebrow="Arkiv"
                title="Beslutat"
                caption="Utdata som operatören har granskat"
              />
              <div className="space-y-3">
                {all.filter(a => a.status !== 'pending').map((a, i) => (
                  <ApprovalCard key={a.id} approval={a} delay={i * 40} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      </OSLayer>
    </OSPage>
  )
}

function StatTile({
  label, value, color, icon, live = false,
}: { label: string; value: number; color: string; icon: React.ReactNode; live?: boolean }) {
  return (
    <Panel className="px-5 py-4 relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.5 }}
      />
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-secondary">{label}</span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center chrome-edge"
          style={{ background: `${color}1a`, border: `1px solid ${color}33` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-black num tracking-tight" style={{ color }}>
          {value}
        </span>
        {live && value > 0 && <PulseDot tone="amber" size={5} />}
      </div>
    </Panel>
  )
}
