import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ExternalLink,
  Instagram,
  Radio,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Zap,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Film,
  Calendar,
  ArrowLeft,
  Activity,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { sv } from 'date-fns/locale/sv'

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaScript = {
  id: string
  hook: string | null
  status: string
  video_status: string
  published_at: string | null
  generated_at: string | null
  instagram_url: string | null
  facebook_url: string | null
  quality_score: { overall?: number } | null
  images: string[] | null
  media_news_items: { title: string; source_name: string | null } | null
}

type PlatformToken = {
  platform: string
  expires_at: string | null
  refreshed_at: string
}

// ─── Token health ─────────────────────────────────────────────────────────────

function TokenBadge({ token }: { token: PlatformToken | null }) {
  if (!token) {
    return (
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-amber-400">Token saknas</span>
      </div>
    )
  }

  const daysLeft = token.expires_at
    ? Math.round((new Date(token.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const isCritical = daysLeft !== null && daysLeft < 10
  const color = isCritical ? '#f87171' : '#34d399'
  const Icon = isCritical ? AlertTriangle : ShieldCheck

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-sm font-bold" style={{ color }}>
          {daysLeft !== null ? `${daysLeft}d` : 'Aktiv'}
        </span>
        {!isCritical && daysLeft !== null && (
          <span className="text-[10px] text-zinc-600">kvar</span>
        )}
      </div>
      <span className="text-[10px] text-zinc-600">
        Förnyades {formatDistanceToNow(new Date(token.refreshed_at), { locale: sv, addSuffix: true })}
      </span>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusChip({ status, videoStatus }: { status: string; videoStatus: string }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
        <CheckCircle2 className="w-2.5 h-2.5" /> Publicerad
      </span>
    )
  }
  if (videoStatus === 'rendering') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Renderar
      </span>
    )
  }
  if (videoStatus === 'failed' || status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
        <XCircle className="w-2.5 h-2.5" /> Fel
      </span>
    )
  }
  if (videoStatus === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
        <Film className="w-2.5 h-2.5" /> Klar för publicering
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: 'rgba(255,255,255,0.04)', color: '#52525b', border: '1px solid rgba(255,255,255,0.07)' }}>
      <Clock className="w-2.5 h-2.5" /> I kö
    </span>
  )
}

// ─── Quality bar ──────────────────────────────────────────────────────────────

function QualityBar({ score }: { score: number | null | undefined }) {
  if (!score) return null
  const pct = Math.round(score * 10)
  const color = score >= 8 ? '#34d399' : score >= 6 ? '#fbbf24' : '#f87171'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}60` }} />
      </div>
      <span className="text-[10px] text-zinc-500 tabular-nums w-5 text-right">{score.toFixed(1)}</span>
    </div>
  )
}

// ─── Next cron time ───────────────────────────────────────────────────────────

function getNextCron() {
  const now = new Date()
  const slots = [
    { hour: 7, minute: 20 },
    { hour: 17, minute: 20 },
  ]
  for (const t of slots) {
    const c = new Date(now)
    c.setUTCHours(t.hour, t.minute, 0, 0)
    if (c > now) return c
  }
  const t = new Date(now)
  t.setUTCDate(t.getUTCDate() + 1)
  t.setUTCHours(7, 20, 0, 0)
  return t
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  children,
  icon: Icon,
  color = '#6366f1',
  delay = 0,
}: {
  label: string
  children: React.ReactNode
  icon: React.ElementType
  color?: string
  delay?: number
}) {
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden glass animate-fade-in-up"
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon className="w-3 h-3" style={{ color }} />
        </div>
        <span className="text-[9.5px] font-semibold text-zinc-600 uppercase tracking-[0.15em]">{label}</span>
      </div>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default async function MediaDashboardPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const db = createAdminClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (!project) notFound()

  const now = new Date()
  const weekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [scriptsRes, tokenRes, weekCountRes, monthCountRes] = await Promise.all([
    db.from('media_scripts')
      .select('id, hook, status, video_status, published_at, generated_at, instagram_url, facebook_url, quality_score, images, media_news_items(title, source_name)')
      .eq('project_id', project.id)
      .order('generated_at', { ascending: false })
      .limit(30),
    db.from('platform_tokens').select('platform, expires_at, refreshed_at').eq('platform', 'instagram').maybeSingle(),
    db.from('media_scripts').select('id', { count: 'exact', head: true }).eq('project_id', project.id).eq('status', 'published').gte('published_at', weekAgo),
    db.from('media_scripts').select('id', { count: 'exact', head: true }).eq('project_id', project.id).eq('status', 'published').gte('published_at', monthAgo),
  ])

  const scripts   = (scriptsRes.data ?? []) as MediaScript[]
  const igToken   = tokenRes.data as PlatformToken | null
  const weekCount = weekCountRes.count ?? 0
  const monthCount = monthCountRes.count ?? 0

  const published = scripts.filter(s => s.status === 'published')
  const inQueue   = scripts.filter(s => s.status !== 'published')
  const lastPost  = published[0]
  const nextCron  = getNextCron()

  const avgQuality = published.length > 0
    ? published.reduce((sum, s) => sum + ((s.quality_score as any)?.overall ?? 0), 0) / published.length
    : null

  const tokenDaysLeft = igToken?.expires_at
    ? Math.round((new Date(igToken.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="relative min-h-screen">

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute" style={{
          top: '-10%', left: '30%',
          width: '500px', height: '300px',
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%)',
          animation: 'orb 25s ease-in-out infinite',
        }} />
      </div>

      <div className="relative z-10 p-7 max-w-[1100px] mx-auto space-y-6">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between animate-fade-in-up">
          <div>
            <Link
              href={`/projects/${params.slug}`}
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors mb-2"
            >
              <ArrowLeft className="w-3 h-3" />
              {project.name}
            </Link>

            <div className="flex items-center gap-4">
              {/* TP logo */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                <span className="text-white font-black text-sm leading-none">TP</span>
              </div>

              <div>
                <h1 className="text-xl font-black text-zinc-100 tracking-tight">The Prompt</h1>
                <p className="text-[11px] text-zinc-600 mt-0.5">AI news · daily reels · autonomous pipeline</p>
              </div>

              {/* Live indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <div className="relative">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                </div>
                <span className="text-[10px] font-semibold text-emerald-400">Pipeline aktiv</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/projects/${params.slug}/scripts`}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-zinc-600 hover:text-zinc-400 transition-colors"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Scripts
            </Link>
            <Link href={`/projects/${params.slug}/news`}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-zinc-600 hover:text-zinc-400 transition-colors"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Nyheter
            </Link>
          </div>
        </div>

        {/* ── Status cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          <StatCard label="Instagram Token" icon={ShieldCheck} color={tokenDaysLeft !== null && tokenDaysLeft < 10 ? '#f87171' : '#34d399'} delay={60}>
            <TokenBadge token={igToken} />
          </StatCard>

          <StatCard label="Senaste post" icon={Radio} color="#818cf8" delay={100}>
            {lastPost?.published_at ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-zinc-300">
                  {formatDistanceToNow(new Date(lastPost.published_at), { locale: sv, addSuffix: true })}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {format(new Date(lastPost.published_at), 'HH:mm')} UTC
                </span>
              </div>
            ) : (
              <span className="text-sm text-zinc-600">Ingen ännu</span>
            )}
          </StatCard>

          <StatCard label="Denna vecka" icon={TrendingUp} color="#60a5fa" delay={140}>
            <div className="flex flex-col gap-0.5">
              <span className="text-3xl font-black text-zinc-200 tabular-nums leading-none">{weekCount}</span>
              <span className="text-[10px] text-zinc-600">{monthCount} senaste 30 dagarna</span>
              {avgQuality && (
                <span className="text-[10px] text-zinc-700">⌀ kvalitet {avgQuality.toFixed(1)}/10</span>
              )}
            </div>
          </StatCard>

          <StatCard label="Nästa körning" icon={Zap} color="#a78bfa" delay={180}>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-zinc-300">
                {format(nextCron, 'HH:mm')} UTC
              </span>
              <span className="text-[10px] text-zinc-600">
                om {formatDistanceToNow(nextCron, { locale: sv })}
              </span>
            </div>
          </StatCard>
        </div>

        {/* ── Published reels ───────────────────────────────────────────────── */}
        <section className="animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Publicerade reels
              <span className="font-normal text-zinc-700">({published.length})</span>
            </h2>
            {avgQuality && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-700">Snitt kvalitet</span>
                <span className="text-[10px] font-bold"
                  style={{ color: avgQuality >= 8 ? '#34d399' : avgQuality >= 6 ? '#fbbf24' : '#f87171' }}>
                  {avgQuality.toFixed(1)}/10
                </span>
              </div>
            )}
          </div>

          {published.length === 0 ? (
            <div className="rounded-2xl p-12 text-center"
              style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.06)' }}>
              <Film className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-600">Inga publicerade reels ännu</p>
            </div>
          ) : (
            <div className="space-y-2">
              {published.map((s, i) => {
                const news  = s.media_news_items
                const thumb = s.images?.[0]
                const score = (s.quality_score as any)?.overall as number | undefined

                return (
                  <div
                    key={s.id}
                    className="group relative rounded-2xl p-4 overflow-hidden transition-all duration-300 hover:-translate-y-px"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    {/* Hover top line */}
                    <div className="absolute inset-x-0 top-0 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)' }} />

                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <span className="text-[11px] font-black text-zinc-700 w-6 text-center shrink-0">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>

                      {/* Thumbnail */}
                      {thumb ? (
                        <div className="w-10 h-14 rounded-xl overflow-hidden shrink-0"
                          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-14 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <Film className="w-4 h-4 text-zinc-700" />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-[13px] font-semibold text-zinc-200 leading-snug line-clamp-2">
                          {s.hook ?? '—'}
                        </p>
                        {news && (
                          <p className="text-[10.5px] text-zinc-600 truncate">
                            {news.source_name ? `${news.source_name} · ` : ''}
                            {news.title}
                          </p>
                        )}
                        {score !== undefined && <QualityBar score={score} />}
                      </div>

                      {/* Meta + links */}
                      <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                        {s.published_at && (
                          <span className="text-[10px] text-zinc-600 font-mono">
                            {format(new Date(s.published_at), 'd MMM · HH:mm', { locale: sv })}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          {s.instagram_url && (
                            <a href={s.instagram_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:scale-105"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#a1a1aa' }}>
                              <Instagram className="w-2.5 h-2.5" />
                              IG
                            </a>
                          )}
                          {s.facebook_url && (
                            <a href={s.facebook_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:scale-105"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#a1a1aa' }}>
                              <ExternalLink className="w-2.5 h-2.5" />
                              FB
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Pipeline queue ────────────────────────────────────────────────── */}
        {inQueue.length > 0 && (
          <section className="animate-fade-in-up" style={{ animationDelay: '280ms', animationFillMode: 'both' }}>
            <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
              <Activity className="w-3 h-3 text-amber-400" />
              Pipeline-kö
              <span className="font-normal text-zinc-700">({inQueue.length})</span>
            </h2>
            <div className="space-y-1.5">
              {inQueue.map((s) => (
                <div key={s.id}
                  className="rounded-xl px-4 py-2.5 flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <StatusChip status={s.status} videoStatus={s.video_status} />
                  <p className="flex-1 text-[12px] text-zinc-500 truncate">{s.hook ?? '(hook saknas)'}</p>
                  {s.generated_at && (
                    <span className="text-[10px] text-zinc-700 shrink-0 font-mono">
                      {formatDistanceToNow(new Date(s.generated_at), { locale: sv, addSuffix: true })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Schedule ──────────────────────────────────────────────────────── */}
        <section
          className="rounded-2xl p-5 animate-fade-in-up glass"
          style={{ animationDelay: '320ms', animationFillMode: 'both' }}
        >
          <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-4">
            <Calendar className="w-3 h-3" />
            Schema (UTC)
          </h2>
          <div className="grid grid-cols-2 gap-6">
            {[
              { label: 'Morgon', pipeline: '07:20', publish: '08:00' },
              { label: 'Kväll',  pipeline: '17:20', publish: '18:00' },
            ].map((slot) => (
              <div key={slot.label} className="space-y-2">
                <p className="text-xs font-semibold text-zinc-400">{slot.label}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#818cf8' }} />
                    <span className="text-[11px] text-zinc-600">
                      <span className="font-mono text-zinc-400">{slot.pipeline}</span> Pipeline startar
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#34d399', boxShadow: '0 0 4px rgba(52,211,153,0.5)' }} />
                    <span className="text-[11px] text-zinc-600">
                      <span className="font-mono text-zinc-400">{slot.publish}</span> Publicering
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
