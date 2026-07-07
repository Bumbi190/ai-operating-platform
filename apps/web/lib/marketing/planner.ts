/**
 * Campaign Planner — ren planbyggare (Fas 2).
 *
 * Deterministisk, KB-driven montering av en månadskampanjplan + content briefs
 * enligt docs/familje-stunden-campaign-planner-design.md. INGEN LLM, INGEN
 * påhittad fakta: allt härleds ur marketing-canon (projektion av KB) + Stripe-
 * signaler. Saknad data → [LUCKA] flaggas, aldrig gissas.
 *
 * Funktionen är PUR (ingen DB, ingen server-only) så den kan enhetstestas och
 * återanvändas av workflow-handlern. ⛔ The Prompt berörs aldrig.
 */
import {
  THEMES, themeByMonthIndex, nextTheme, CALENDAR_TEMPLATE,
  CORE_MESSAGE, PROOF_POINTS, APPROVED_ANGLE_TAGS, FORBIDDEN_ANGLE_TAGS,
  CTA, CHARACTER_ROLES, BRAND, type CanonLevel, type ThemeCanon, type CtaType,
} from './kb/marketing-canon'

export interface RevenueSignals {
  available: boolean
  active_subscribers: number | null
  trialing: number | null
  mrr_sek: number | null
  trial_to_paid_rate: number | null
  churn_rate: number | null
}

export const ANNUAL_GOAL_SUBSCRIBERS = 200 // [KANON — pitch]

export interface GapFlag { field: string; level: CanonLevel; blocking: boolean; note: string }

export interface PlannedBrief {
  brief_key: string
  post_key: string
  channel: 'instagram' | 'facebook'
  format: string
  beat: string
  scheduled_week: string | null
  scheduled_date: string | null
  objective: string
  brief_payload: Record<string, unknown>
  canon_level: Record<string, string>
}

export interface BuiltPlan {
  plan_key: string
  target_month: string          // YYYY-MM-01
  theme_key: string | null
  theme_name: string | null
  next_theme_key: string | null
  theme_status: CanonLevel
  campaign_angle: Record<string, unknown>
  revenue_strategy: Record<string, unknown>
  gaps: GapFlag[]
  human_input_needed: string[]
  canon_level: Record<string, string>
  briefs: PlannedBrief[]
}

// ─── Datum-/vecka-hjälpare (ISO-vecka, deterministiskt, ingen lib) ───────────
function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime()); r.setUTCDate(r.getUTCDate() + n); return r
}
function lastDayOfMonth(year: number, month1: number): Date {
  return new Date(Date.UTC(year, month1, 0)) // month1 = 1–12 → day 0 of next month
}

function weekForBeat(beat: string, firstDay: Date, year: number, month1: number): { week: string | null; date: string | null } {
  switch (beat) {
    case 'teaser': return { week: isoWeek(addDays(firstDay, -7)), date: null }
    case 'launch': return { week: null, date: firstDay.toISOString().slice(0, 10) }
    case 'mid':    return { week: isoWeek(addDays(firstDay, 18)), date: null }
    case 'bridge': return { week: isoWeek(addDays(lastDayOfMonth(year, month1), -2)), date: null }
    default:       return { week: null, date: null }
  }
}

// ─── Revenue Reader → kampanjmål + beat-viktning (regelbaserat, [OSÄKER]) ─────
function revenueStrategy(rev: RevenueSignals): { strategy: Record<string, unknown>; gaps: GapFlag[] } {
  const gaps: GapFlag[] = []
  const base = { teaser: 0.2, launch: 0.4, mid: 0.25, bridge: 0.15 }

  if (!rev.available) {
    gaps.push({ field: 'revenue', level: 'LUCKA', blocking: false, note: 'Ingen revenue_snapshot tillgänglig — default-viktning används.' })
    return {
      strategy: { focus: 'default-balanserad (revenue LUCKA)', beat_weighting: base, canon_level: 'LUCKA', based_on: 'ingen Stripe-data' },
      gaps,
    }
  }

  const weighting = { ...base }
  const notes: string[] = []
  const active = rev.active_subscribers ?? 0
  const trialing = rev.trialing ?? 0

  // Regel: lågt active vs mål → awareness/provmånad (default lutar redan dit).
  if (active < ANNUAL_GOAL_SUBSCRIBERS) notes.push('lågt active vs mål 200 → awareness + provmånad')
  // Regel: många trial + okänd/låg konvertering → mer mitt-i-månaden (konvertering).
  if (trialing >= Math.max(3, active) && (rev.trial_to_paid_rate == null || rev.trial_to_paid_rate < 0.3)) {
    weighting.mid += 0.1; weighting.launch -= 0.1; notes.push('många trial / låg konvertering → tyngre mitt-i-månaden')
  }
  // Regel: churn → mer retention (bridge).
  if ((rev.churn_rate ?? 0) > 0) { weighting.bridge += 0.1; weighting.mid -= 0.1; notes.push('churn > 0 → tyngre retention/bro') }

  if (rev.trial_to_paid_rate == null) {
    gaps.push({ field: 'revenue.trial_to_paid_rate', level: 'LUCKA', blocking: false, note: 'Saknas i RevenueIntel.' })
  }

  return {
    strategy: {
      focus: notes.join('; ') || 'balanserad',
      beat_weighting: weighting,
      canon_level: 'OSAKER',
      based_on: `active=${active}, trialing=${trialing}, mrr=${rev.mrr_sek ?? 'n/a'} [KANON]; viktningsregel [OSÄKER]`,
    },
    gaps,
  }
}

function ctaSecondaryFor(type: CtaType): string[] {
  if (type === 'follow') return ['Prova gratis']
  if (type === 'subscribe') return ['Prova gratis']
  if (type === 'trial') return ['Följ @familjestunden']
  return []
}

function keyPointsFor(theme: ThemeCanon): string[] {
  const monthName = theme.monthSv.charAt(0).toUpperCase() + theme.monthSv.slice(1)
  const symbols = theme.symbols.slice(0, 3).join(', ')
  return [
    `${monthName} = ${theme.name}${symbols ? `: ${symbols}` : ''}`,
    'Allt färdigt i ett PDF-paket — ingen förberedelse',
    `Nova & Pling guidar genom ${theme.name.toLowerCase()}`,
    'Ingår: saga, ljudsaga, pyssel, diplom',
  ]
}

/**
 * Bygg en komplett kampanjplan + briefs för en månad.
 * @param targetMonth "YYYY-MM"
 */
export function buildCampaignPlan(targetMonth: string, rev: RevenueSignals): BuiltPlan {
  const m = /^(\d{4})-(\d{2})$/.exec(targetMonth)
  if (!m) throw new Error(`Ogiltig target_month "${targetMonth}" (förväntar YYYY-MM)`)
  const year = Number(m[1]); const month1 = Number(m[2])
  if (month1 < 1 || month1 > 12) throw new Error(`Ogiltig månad i "${targetMonth}"`)

  const theme = themeByMonthIndex(month1)
  if (!theme) throw new Error(`Inget tema för månad ${month1}`)
  const next = nextTheme(month1)
  const firstDay = new Date(Date.UTC(year, month1 - 1, 1))
  const monthDate = firstDay.toISOString().slice(0, 10)
  const planKey = `fs-${m[1]}-${m[2]}`

  const gaps: GapFlag[] = []
  const humanInput: string[] = ['Bekräfta kadens (8 poster) och exakta datum']

  // ── Gap Guard: tema-status ──────────────────────────────────────────────
  const themeStatus: CanonLevel = theme.defined ? 'KANON' : 'LUCKA'
  if (!theme.defined) {
    gaps.push({ field: 'theme', level: 'LUCKA', blocking: true, note: `Tema för ${theme.monthSv} ej fastställt — temaspecifik copy får ej genereras.` })
    humanInput.push(`Fastställ tema för ${theme.monthSv} innan kampanj produceras`)
  }
  if (theme.contentGap) {
    gaps.push({ field: 'theme.content', level: 'LUCKA', blocking: false, note: 'Paketinnehåll/saga ej fullständigt verifierat i KB för denna månad.' })
  }
  // Palett aldrig verifierad i KB.
  gaps.push({ field: 'theme.palette', level: 'LUCKA', blocking: false, note: 'Färgpalett ej verifierad — inga exakta hex får anges.' })
  // Saga finns men text ej analyserad.
  if (theme.hasSaga) {
    gaps.push({ field: 'theme.saga_text', level: 'LUCKA', blocking: false, note: 'Saga-PDF finns men ej textanalyserad — ingen citerad handling.' })
  }
  // Landningssida ej konfigurerad → blockerande för trial/subscribe-CTA.
  gaps.push({ field: 'cta.landing_url', level: 'LUCKA', blocking: true, note: 'Landningssidans UTM-URL ej konfigurerad.' })
  humanInput.push('Bekräfta landningssidans UTM-URL')
  // Exakta veckodagar osäkra tills engagemangsdata finns.
  gaps.push({ field: 'calendar.exact_weekdays', level: 'OSAKER', blocking: false, note: 'Optimal posttid okänd tills engagemangsdata finns (v3).' })

  const { strategy, gaps: revGaps } = revenueStrategy(rev)
  gaps.push(...revGaps)

  // ── Kampanjvinkel (Angle Selector) ──────────────────────────────────────
  const campaignAngle = {
    primary_angle: theme.defined ? theme.primaryAngle : null,
    emotional_pillar: theme.defined ? theme.emotionalPillar : null,
    core_message: CORE_MESSAGE,
    proof_points: [...PROOF_POINTS],
    approved_angle_tags: [...APPROVED_ANGLE_TAGS],
    forbidden_angle_tags: [...FORBIDDEN_ANGLE_TAGS],
    cta: { primary: CTA.primary, secondary: [...CTA.secondary] },
    brand: { handle: BRAND.handle, tone: BRAND.tone, age: BRAND.age },
    canon_level: {
      primary_angle: theme.defined ? 'OSAKER' : 'LUCKA',
      emotional_pillar: theme.defined ? 'OSAKER' : 'LUCKA',
      core_message: 'KANON', cta: 'KANON', proof_points: 'KANON',
    },
  }

  // ── Calendar Builder + Brief Generator ──────────────────────────────────
  const briefs: PlannedBrief[] = CALENDAR_TEMPLATE.map((spec, i) => {
    const { week, date } = weekForBeat(spec.beat, firstDay, year, month1)
    const briefKey = `brief-${String(i + 1).padStart(2, '0')}`
    const postKey = `${planKey}-${String(i + 1).padStart(2, '0')}`
    const needsLanding = spec.ctaType === 'trial' || spec.ctaType === 'subscribe'

    // Asset-referenser (befintliga kanoniska tillgångar; Drafter binder faktiska filer).
    const assetRefs = theme.keyVisualPath
      ? [theme.keyVisualPath, 'characters/index.json#nova_pose_default', 'characters/index.json#pling_pose_default']
      : ['characters/index.json#nova_pose_default', 'characters/index.json#pling_pose_default']

    const payload: Record<string, unknown> = {
      brief_id: briefKey,
      post_id: postKey,
      channel: spec.channel,
      format: spec.format,
      beat: spec.beat,
      objective: spec.objective,
      emotional_pillar: theme.defined ? theme.emotionalPillar : null,
      primary_angle: theme.defined ? theme.primaryAngle : null,
      core_message: CORE_MESSAGE,
      key_points: theme.defined ? keyPointsFor(theme) : [],
      asset_refs: assetRefs,
      character_usage: { nova: CHARACTER_ROLES.nova, pling: CHARACTER_ROLES.pling },
      cta: { type: spec.ctaType, label: spec.ctaLabel, secondary: ctaSecondaryFor(spec.ctaType), landing_url_slot: needsLanding ? null : null },
      landing_url_slot: null,
      tone: BRAND.tone,
      must_not: [...theme.mustNot, ...FORBIDDEN_ANGLE_TAGS],
      canon_level: {
        key_points: 'KANON/OSAKER', asset_refs: 'KANON-ref/LUCKA-innehåll',
        cta: 'KANON', primary_angle: 'OSAKER', emotional_pillar: 'OSAKER', core_message: 'KANON',
      },
    }

    return {
      brief_key: briefKey,
      post_key: postKey,
      channel: spec.channel,
      format: spec.format,
      beat: spec.beat,
      scheduled_week: week,
      scheduled_date: date,
      objective: spec.objective,
      brief_payload: payload,
      canon_level: { theme: themeStatus, angle: theme.defined ? 'OSAKER' : 'LUCKA', cta: 'KANON' },
    }
  })

  humanInput.push('Verifiera palett innan färgkänsliga assets används')

  return {
    plan_key: planKey,
    target_month: monthDate,
    theme_key: theme.themeKey,
    theme_name: theme.name,
    next_theme_key: next?.themeKey ?? null,
    theme_status: themeStatus,
    campaign_angle: campaignAngle,
    revenue_strategy: strategy,
    gaps,
    human_input_needed: humanInput,
    canon_level: {
      theme: themeStatus, value_prop: 'KANON', emotional_pillars: 'KANON',
      pricing: 'KANON', angle_text: 'OSAKER', calendar_dates: 'OSAKER',
    },
    briefs,
  }
}
