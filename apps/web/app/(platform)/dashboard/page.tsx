import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, Power, Gauge, ChevronRight, Compass } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

import type { Project } from '@/lib/supabase/types'
import { getPlatformConfig } from '@/lib/media/safeguards'
import {
  fetchBusinessSnapshots, fetchHeroSummary,
  fetchPendingApprovalsDetailed, fetchFailedRuns,
} from '@/lib/os/business'
import { buildExecutiveBriefing, deriveOperatorName } from '@/lib/os/briefing'

import {
  OSPage, OSLayer, ExecutiveBriefing, BusinessCard, QuickAdd,
  SectionHeader, EmptyState, MissionState,
} from '@/components/platform/os'
import { PauseToggle } from './PauseToggle'
import { ApprovalsBanner, FailedRunBanner } from './DashboardClient'

export const dynamic = 'force-dynamic'

// ─── Page · Omnira Command Center ──────────────────────────────────────────────
//
//   Verksamhetscentrerad, inte system-centrerad. Operatören förstår på tre
//   sekunder: vad tjänar pengar, vad är trasigt, vad väntar på mitt beslut.
//   Systemtelemetri (puls, agentflotta, minnesgraf) bor numera på /system.
//
export default async function DashboardPage() {
  const supabase = await createClient()
  const db = createAdminClient()

  const [{ data: { user } }, projectsRes, platformConfig, pendingApprovals, failedRuns] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('projects')
      .select('id, owner_id, name, slug, color, settings, created_at')
      .order('created_at', { ascending: true }),
    getPlatformConfig(db),
    fetchPendingApprovalsDetailed(db),
    fetchFailedRuns(db),
  ])

  const projects = (projectsRes.data ?? []) as Project[]
  const businesses = await fetchBusinessSnapshots(db, projects)
  const hero = await fetchHeroSummary(db, projects, businesses)

  const operatorName = deriveOperatorName(
    (user?.user_metadata?.full_name as string | undefined) ?? (user?.user_metadata?.name as string | undefined),
    user?.email,
  )

  // Signal: publicerade inlägg finns men inga insights → IG-token saknar behörighet
  const [pubCountRes, insCountRes] = await Promise.all([
    (db.from('media_scripts') as any).select('id', { count: 'exact', head: true }).eq('status', 'published'),
    (db.from('media_insights') as any).select('id', { count: 'exact', head: true }),
  ])
  const instagramInsightsMissing = (pubCountRes.count ?? 0) > 0 && (insCountRes.count ?? 0) === 0

  const briefing = buildExecutiveBriefing(businesses, hero, operatorName, { instagramInsightsMissing })
  const monthlyPackageSlug = projects.find(p => /familje/i.test(p.slug) || /familje/i.test(p.name))?.slug ?? null

  return (
    <OSPage className="boot-in">

      {/* LAYER 1 · EXECUTIVE BRIEFING — AI-first hemvy ───────────────────── */}
      <OSLayer layer="hero">
        <ExecutiveBriefing briefing={briefing} monthlyPackageSlug={monthlyPackageSlug} />

        {/* Global pausstatus — operationellt kritiskt, stannar på förstasidan */}
        {platformConfig.automation_paused && (
          <MissionState tier="critical" surface className="rounded-2xl px-5 py-4 mb-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center chrome-edge"
                  style={{ background: 'var(--state-critical-bg)', border: '1px solid var(--state-critical-border)' }}
                >
                  <Power className="w-4 h-4" style={{ color: 'var(--state-critical)' }} />
                </div>
                <div>
                  <p className="eyebrow eyebrow-gold !text-[9px]">Automation pausad</p>
                  <p className="text-[13.5px] text-white/95 font-medium tracking-tight">
                    {platformConfig.paused_reason ?? 'All automation är manuellt pausad'}
                    {platformConfig.paused_at && ` · sedan ${formatDistanceToNow(new Date(platformConfig.paused_at), { addSuffix: true, locale: sv })}`}
                  </p>
                </div>
              </div>
              <div className="ml-auto"><PauseToggle paused={true} /></div>
            </div>
          </MissionState>
        )}
      </OSLayer>

      {/* LAYER 2 · OPERATÖRSÅTGÄRDER — trasigt först, sen godkännanden ─────── */}
      <OSLayer layer="operational" className="space-y-4">
        <FailedRunBanner runs={failedRuns} />
        <ApprovalsBanner approvals={pendingApprovals} />
      </OSLayer>

      {/* LAYER 3 · BUSINESS COMMAND CENTER ────────────────────────────────── */}
      <OSLayer layer="intelligence">
        <section>
          <SectionHeader
            eyebrow="Verksamheter"
            title="Business Command Center"
            caption={`${hero.activeBusinesses} av ${projects.length} verksamheter aktiva`}
            right={
              <div className="flex items-center gap-3">
                <Link href="/system" className="text-[11px] text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1 transition-colors">
                  <Gauge className="w-3.5 h-3.5" /> Systemtelemetri <ChevronRight className="w-3 h-3 opacity-60" />
                </Link>
                {projects.length > 0 && <QuickAdd projects={projects.map(p => ({ id: p.id, name: p.name, slug: p.slug, color: p.color }))} />}
                <Link href="/projects/new" className="btn-omnira ease-os press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Ny verksamhet
                </Link>
              </div>
            }
          />

          {businesses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
              {businesses.map((b, i) => (
                <BusinessCard key={b.id} business={b} delay={i * 70} />
              ))}
            </div>
          ) : (
            <EmptyState
              eyebrow="Inga verksamheter"
              title="Inväntar första verksamheten"
              body="Skapa din första autonoma verksamhet för att börja driva den från Command Center."
              icon={<Compass className="w-6 h-6 text-indigo-300" />}
              action={
                <Link href="/projects/new" className="btn-omnira ease-os press inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Skapa verksamhet
                </Link>
              }
            />
          )}
        </section>
      </OSLayer>

    </OSPage>
  )
}
