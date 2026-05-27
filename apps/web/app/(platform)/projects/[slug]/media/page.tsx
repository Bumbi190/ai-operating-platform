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

// ─── Sub-components ───────────────────────────────────────────────────────────

function TokenHealth({ token }: { token: PlatformToken | null }) {
  if (!token) {
    return (
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm">Token saknas</span>
      </div>
    )
  }

  const daysLeft = token.expires_at
    ? Math.round((new Date(token.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const refreshed = formatDistanceToNow(new Date(token.refreshed_at), { locale: sv, addSuffix: true })

  if (daysLeft !== null && daysLeft < 10) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-red-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="text-sm font-medium">{daysLeft} dagar kvar</span>
        </div>
        <span className="text-xs text-muted-foreground">Förnyades {refreshed}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-emerald-400">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span className="text-sm font-medium">{daysLeft !== null ? `${daysLeft} dagar kvar` : 'Aktiv'}</span>
      </div>
      <span className="text-xs text-muted-foreground">Förnyades {refreshed}</span>
    </div>
  )
}

function StatusBadge({ status, videoStatus }: { status: string; videoStatus: string }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" /> Publicerad
      </span>
    )
  }
  if (videoStatus === 'rendering') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        <Loader2 className="w-3 h-3 animate-spin" /> Renderar
      </span>
    )
  }
  if (videoStatus === 'failed' || status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
        <XCircle className="w-3 h-3" /> Fel
      </span>
    )
  }
  if (videoStatus === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Film className="w-3 h-3" /> Klar för publicering
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-muted-foreground border border-white/10">
      <Clock className="w-3 h-3" /> I kö
    </span>
  )
}

function QualityBar({ score }: { score: number | null | undefined }) {
  if (!score) return null
  const pct = Math.round(score * 10)
  const color = score >= 8 ? 'bg-emerald-400' : score >= 6 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{score.toFixed(1)}</span>
    </div>
  )
}

// ─── Next scheduled times ─────────────────────────────────────────────────────

function getNextCronTimes() {
  const now = new Date()
  const times = [
    { hour: 7, minute: 30, label: 'Morgon' },
    { hour: 17, minute: 30, label: 'Kväll' },
  ]

  for (const t of times) {
    const candidate = new Date(now)
    candidate.setUTCHours(t.hour, t.minute, 0, 0)
    if (candidate > now) {
      return { label: t.label, time: candidate }
    }
  }
  // Tomorrow morning
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(7, 30, 0, 0)
  return { label: 'Morgon', time: tomorrow }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default async function MediaDashboardPage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = await createClient()
  const db = createAdminClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (!project) notFound()

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [scriptsRes, tokenRes, weekCountRes, monthCountRes] = await Promise.all([
    db
      .from('media_scripts')
      .select('id, hook, status, video_status, published_at, generated_at, instagram_url, facebook_url, quality_score, images, media_news_items(title, source_name)')
      .eq('project_id', project.id)
      .order('generated_at', { ascending: false })
      .limit(30),
    db
      .from('platform_tokens')
      .select('platform, expires_at, refreshed_at')
      .eq('platform', 'instagram')
      .maybeSingle(),
    db
      .from('media_scripts')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'published')
      .gte('published_at', weekAgo),
    db
      .from('media_scripts')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'published')
      .gte('published_at', monthAgo),
  ])

  const scripts = (scriptsRes.data ?? []) as MediaScript[]
  const igToken = tokenRes.data as PlatformToken | null
  const weekCount = weekCountRes.count ?? 0
  const monthCount = monthCountRes.count ?? 0

  const published = scripts.filter(s => s.status === 'published')
  const inQueue   = scripts.filter(s => s.status !== 'published')
  const lastPost  = published[0]
  const nextCron  = getNextCronTimes()

  const avgQuality = published.length > 0
    ? published.reduce((sum, s) => sum + ((s.quality_score as any)?.overall ?? 0), 0) / published.length
    : null

  return (
    <div className="min-h-screen p-6 space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/projects/${params.slug}`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {project.name}
            </Link>
            <span className="text-muted-foreground/40 text-xs">/</span>
            <span className="text-xs text-muted-foreground">Media Pipeline</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0">
              <span className="text-black font-black text-xs leading-none">TP</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">The Prompt</h1>
              <p className="text-xs text-muted-foreground">AI news. Daily. No fluff.</p>
            </div>
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Pipeline aktiv</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${params.slug}/scripts`}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 rounded-lg transition-colors"
          >
            Scripts
          </Link>
          <Link
            href={`/projects/${params.slug}/news`}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 rounded-lg transition-colors"
          >
            Nyheter
          </Link>
        </div>
      </div>

      {/* ── Status cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Token health */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-xs uppercase tracking-wider">Instagram Token</span>
          </div>
          <TokenHealth token={igToken} />
        </div>

        {/* Last publish */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Radio className="w-3.5 h-3.5" />
            <span className="text-xs uppercase tracking-wider">Senaste post</span>
          </div>
          {lastPost?.published_at ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {formatDistanceToNow(new Date(lastPost.published_at), { locale: sv, addSuffix: true })}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {format(new Date(lastPost.published_at), 'HH:mm', { locale: sv })} UTC
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Ingen ännu</span>
          )}
        </div>

        {/* This week */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-xs uppercase tracking-wider">Denna vecka</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-2xl font-bold text-foreground tabular-nums">{weekCount}</span>
            <span className="text-xs text-muted-foreground">{monthCount} senaste 30 dagarna</span>
          </div>
        </div>

        {/* Next cron */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-xs uppercase tracking-wider">Nästa körning</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {nextCron.label} · {format(nextCron.time, 'HH:mm')} UTC
            </span>
            <span className="text-xs text-muted-foreground">
              om {formatDistanceToNow(nextCron.time, { locale: sv })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Published reels ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Publicerade reels
            <span className="text-xs text-muted-foreground font-normal">({published.length})</span>
          </h2>
          {avgQuality && (
            <span className="text-xs text-muted-foreground">
              Snitt kvalitet: <span className="text-foreground">{avgQuality.toFixed(1)}/10</span>
            </span>
          )}
        </div>

        {published.length === 0 ? (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-8 text-center">
            <Film className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Inga publicerade reels ännu</p>
          </div>
        ) : (
          <div className="space-y-2">
            {published.map((s) => {
              const news = s.media_news_items
              const thumb = s.images?.[0]

              return (
                <div
                  key={s.id}
                  className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.10] rounded-xl p-4 transition-all"
                >
                  <div className="flex items-start gap-4">

                    {/* Thumbnail */}
                    {thumb ? (
                      <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-white/5">
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-16 rounded-lg bg-white/5 shrink-0 flex items-center justify-center">
                        <Film className="w-5 h-5 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                        {s.hook ?? '—'}
                      </p>
                      {news && (
                        <p className="text-xs text-muted-foreground truncate">
                          {news.source_name ? `📰 ${news.source_name} · ` : ''}
                          {news.title}
                        </p>
                      )}
                      <QualityBar score={(s.quality_score as any)?.overall} />
                    </div>

                    {/* Meta + links */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {s.published_at && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(s.published_at), 'd MMM · HH:mm', { locale: sv })}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        {s.instagram_url && (
                          <a
                            href={s.instagram_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Instagram className="w-3 h-3" />
                            IG
                          </a>
                        )}
                        {s.facebook_url && (
                          <a
                            href={s.facebook_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
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

      {/* ── Pipeline queue ───────────────────────────────────────────────────── */}
      {inQueue.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-400" />
            Pipeline-kö
            <span className="text-xs text-muted-foreground font-normal">({inQueue.length})</span>
          </h2>
          <div className="space-y-2">
            {inQueue.map((s) => (
              <div
                key={s.id}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center gap-4"
              >
                <StatusBadge status={s.status} videoStatus={s.video_status} />
                <p className="flex-1 text-sm text-muted-foreground truncate">
                  {s.hook ?? '(hook saknas)'}
                </p>
                {s.generated_at && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(s.generated_at), { locale: sv, addSuffix: true })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Schedule info ────────────────────────────────────────────────────── */}
      <section className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" />
          Schema (UTC)
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Morgon', pipeline: '07:20–07:45', publish: '08:00' },
            { label: 'Kväll',  pipeline: '17:20–17:45', publish: '18:00' },
          ].map((slot) => (
            <div key={slot.label} className="space-y-1">
              <p className="text-xs font-medium text-foreground">{slot.label}</p>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span className="text-xs text-muted-foreground">{slot.pipeline} · Pipeline</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">{slot.publish} · Publicering</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
