/**
 * Atlas Instagram experiments: strictly advisory, deterministic and read-only.
 *
 * No publication, scheduling, automatic variant assignment, Graph calls,
 * provider spending, invented engagement data or statistical significance.
 * Each brand uses its OWN verified summary; no cross-account comparison.
 */
import type { GrowthBrand, InstagramPerformanceSummary } from './instagram-metrics'

export type InstagramExperimentSuggestion = {
  kind: 'collect_baseline' | 'refresh_data' | 'manual_review'
  brand: GrowthBrand
  title: string
  rationale: string
  action: string
  measurement: string
  minimumPosts: number
  observedPosts: number
  reviewRequired: true
}

export const BASELINE_MIN_POSTS = 6
export const EVALUATION_MIN_PER_VARIANT = 3
export const TARGET_COMPARISON_AGE_HOURS = 48
const FRESHNESS_DAYS = 7

/**
 * Offer no comparative test when an account has too little data or its
 * last refresh is unknown/stale. A recommendation is a hypothesis only.
 */
export function suggestInstagramExperiment(
  brand: GrowthBrand,
  summary: InstagramPerformanceSummary,
  lastFetchedAt: string | null,
  now: Date = new Date(),
): InstagramExperimentSuggestion {
  if (brand !== summary.brand) throw new Error('Mixed Instagram brand summaries')
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid evaluation time')

  const common = { brand, observedPosts: summary.sampleSize, minimumPosts: BASELINE_MIN_POSTS, reviewRequired: true as const }
  if (summary.sampleSize < BASELINE_MIN_POSTS) {
    const missing = BASELINE_MIN_POSTS - summary.sampleSize
    return {
      ...common,
      kind: 'collect_baseline',
      title: 'Samla fler jämförbara inlägg',
      rationale: `Bara ${summary.sampleSize} Instagram-inlägg har uppmätta visningar. Underlaget är för litet för att avgöra vilket format som fungerar bäst.`,
      action: `Samla minst ${missing} ytterligare godkända inlägg. Behåll varumärkets vanliga innehålls- och publiceringsregler.`,
      measurement: 'Registrera visningar, delningar och sparningar vid samma ålder efter publicering. Inga vinnare utses.',
    }
  }

  const fetchedMs = lastFetchedAt === null ? NaN : Date.parse(lastFetchedAt)
  if (!Number.isFinite(fetchedMs) || fetchedMs > now.getTime() + 60_000 ||
      now.getTime() - fetchedMs > FRESHNESS_DAYS * 86_400_000) {
    return {
      ...common,
      kind: 'refresh_data',
      title: 'Uppdatera Insights före nya slutsatser',
      rationale: 'Senaste verifierade datainsamlingen saknas eller är äldre än sju dagar.',
      action: 'Kontrollera det befintliga dagliga Insights-jobbet. Ändra inte innehåll eller publiceringsschema automatiskt.',
      measurement: 'Använd endast nya, daterade mätvärden från samma konto.',
    }
  }

  if (brand === 'the-prompt') {
    return {
      ...common,
      kind: 'manual_review',
      title: 'Testidé: två sakliga hook-vinklar',
      rationale: `${summary.sampleSize} uppmätta inlägg finns. Det räcker för att formulera en hypotes, inte för att påstå att någon hook orsakar fler visningar.`,
      action: 'Föreslå sex framtida, redaktörsgodkända AI-nyhetsvideos: tre med den verifierade nyheten först och tre med det konkreta problemet först. Behåll samma röst, fakta- och källkontroll.',
      measurement: 'Jämför varianterna först efter samma 48-timmarsfönster: delningar/räckvidd och sparningar/räckvidd; visningar som sekundärt mått. Märk A/B manuellt.',
    }
  }
  return {
    ...common,
    kind: 'manual_review',
    title: 'Testidé: två föräldravänliga öppningar',
    rationale: `${summary.sampleSize} uppmätta inlägg finns. Detta är ett förslag, inte bevis för att något format konverterar bättre.`,
    action: 'Föreslå sex framtida, godkända Instagram-inlägg: tre som visar vardagsnyttan först och tre som öppnar med en nyfiken detalj ur en verklig aktivitet. Behåll Nova/Plings godkända bilder och svensk ton.',
    measurement: 'Jämför sparningar/räckvidd och delningar/räckvidd vid samma 48-timmarsålder. Räkna inte nya prenumeranter som orsakade utan separat spårbar attribution.',
  }
}

export type InstagramVariantObservation = {
  postId: string
  brand: GrowthBrand
  variant: 'A' | 'B'
  /** Exact age of the first-party measurement in hours since publication. */
  measuredAtAgeHours: number | null
  reach: number | null
  saves: number | null
  shares: number | null
}

export type InstagramVariantReview =
  | { status: 'insufficient' | 'not_comparable'; brand: GrowthBrand; aPosts: number; bPosts: number; note: string }
  | { status: 'descriptive'; brand: GrowthBrand; aPosts: number; bPosts: number; aSaveRate: number; bSaveRate: number; aShareRate: number; bShareRate: number; note: string }

/**
 * Review only manually tagged variant data at the same post age. Do not infer
 * causality, select a winner, or publish anything. Rates are pooled counts
 * divided by pooled reach, not a rounded mean of individual rates.
 */
export function reviewInstagramVariants(
  brand: GrowthBrand, observations: readonly InstagramVariantObservation[],
): InstagramVariantReview {
  const ids = new Set<string>()
  for (const p of observations) {
    if (p.brand !== brand) throw new Error('Mixed Instagram variant accounts')
    if (!p.postId.trim() || ids.has(p.postId)) throw new Error('Duplicate or empty post ID')
    ids.add(p.postId)
    if (p.variant !== 'A' && p.variant !== 'B') throw new Error('Invalid variant label')
    for (const n of [p.reach, p.saves, p.shares]) {
      if (n !== null && (!Number.isSafeInteger(n) || n < 0)) throw new Error('Invalid metric count')
    }
  }
  const a = observations.filter(p => p.variant === 'A')
  const b = observations.filter(p => p.variant === 'B')
  const counts = { brand, aPosts: a.length, bPosts: b.length }
  if (a.length < EVALUATION_MIN_PER_VARIANT || b.length < EVALUATION_MIN_PER_VARIANT) {
    return { ...counts, status: 'insufficient', note: 'Minst tre märkt jämförbara inlägg per variant krävs innan en beskrivande jämförelse.' }
  }
  const valid = observations.every(p =>
    p.measuredAtAgeHours !== null &&
    Number.isFinite(p.measuredAtAgeHours) &&
    p.measuredAtAgeHours >= TARGET_COMPARISON_AGE_HOURS &&
    p.measuredAtAgeHours <= TARGET_COMPARISON_AGE_HOURS + 6 &&
    p.reach !== null && p.reach > 0 &&
    p.saves !== null && p.shares !== null)
  if (!valid) return { ...counts, status: 'not_comparable', note: 'Samma mätålder (48–54 timmar), positiv räckvidd och verifierade sparningar/delningar krävs för varje inlägg.' }
  const rate = (rows: InstagramVariantObservation[], key: 'saves' | 'shares') =>
    rows.reduce((n, p) => n + p[key]!, 0) / rows.reduce((n, p) => n + p.reach!, 0)
  return {
    ...counts, status: 'descriptive',
    aSaveRate: rate(a, 'saves'), bSaveRate: rate(b, 'saves'),
    aShareRate: rate(a, 'shares'), bShareRate: rate(b, 'shares'),
    note: 'Beskrivande skillnader, inte ett kausalt eller statistiskt säkerställt resultat. Mänsklig granskning krävs.',
  }
}
