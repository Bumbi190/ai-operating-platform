/**
 * Brand / Canon Guard — ren bedömningsmotor (Fas 3, WF3).
 *
 * Deterministisk validering av ett draft_post mot kunskapsbasen enligt
 * docs/familje-stunden-brand-guard-design.md. Guard SKRIVER ALDRIG copy och
 * MODIFIERAR ALDRIG utkastet — den läser, bedömer och returnerar en rapport.
 *
 * Ren funktion (ingen DB, ingen LLM, ingen server-only) → exakt enhetstestbar.
 * Scoring: start 100, CRITICAL→rejected (kapas till band ≤40), HIGH −20,
 * MEDIUM −10, warnings 0. Trösklar: ≥90 approved, 70–89 warning, <70 rejected.
 * ⛔ The Prompt = automatisk CRITICAL.
 */
import { themeByMonthIndex, THEMES, CTA, PROOF_POINTS, resolveTheme } from './kb/marketing-canon'

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export interface Violation {
  id: string; severity: Severity; category: string; field: string
  explanation: string; kb_ref: string; recommended_action?: string
}
export interface GapFlagOut { field: string; level: 'LUCKA' | 'OSAKER'; blocking: boolean }

export interface GuardPlanContext {
  theme_key: string | null
  expected?: { beat?: string; channel?: string; format?: string }
}

export interface GuardResult {
  verdict: 'approved' | 'warning' | 'rejected'
  score: number
  score_breakdown: Record<string, unknown>
  violations: Violation[]
  warnings: Violation[]
  gap_flags: GapFlagOut[]
  checks: Record<string, boolean>
  recommendation: string
}

const ALLOWED_PRICES = new Set([0, 59, 129, 199])
const VALID_CTA_LABELS = new Set<string>([CTA.primary, ...CTA.secondary])
const HARD_CTA_TYPES = new Set(['trial', 'subscribe'])

// Starka "fingeravtryck" från andra teman (för korsinblandning).
const OTHER_THEME_TOKENS: Record<string, string[]> = {
  julmanaden: ['jul', 'tomte', 'lucia', 'julgran'],
  rymdmanaden: ['rymd', 'planet', 'galax', 'astronaut'],
  karleksmanad: ['alla hjärtans'],
  varens_forsta_steg: ['påsk'],
}

function collectText(draft: Record<string, any>): string {
  const parts: string[] = []
  const cap = draft.caption ?? {}
  parts.push(cap.hook, cap.story, cap.value, cap.cta_line, draft.caption_rendered)
  if (Array.isArray(draft.carousel_slides)) for (const s of draft.carousel_slides) parts.push(s.headline, s.body)
  if (draft.reel_spec?.scenes) for (const sc of draft.reel_spec.scenes) parts.push(sc.on_screen_text, sc.voiceover_note)
  if (draft.fb_post) parts.push(draft.fb_post.primary_text)
  if (Array.isArray(draft.hashtags)) parts.push(draft.hashtags.join(' '))
  return parts.filter(Boolean).join('  ').toLowerCase()
}

function isRealUrl(v: unknown): boolean {
  return typeof v === 'string' && /(https?:\/\/|www\.|\.se\b|\.com\b)/i.test(v) && !/^<.*>$/.test(v.trim())
}

// Helord-matchning (svensk-medveten): "jul" matchar inte "juli", "rymd" inte "rymdfärja-saga" osv.
// Token får inte flankeras av ett ordtecken (inkl. å/ä/ö). Ersätter naiv substring-matchning.
function containsWord(text: string, token: string): boolean {
  const esc = token.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![0-9a-zåäö])${esc}(?![0-9a-zåäö])`, 'i').test(text)
}

/** Bedöm ett utkast. `draft` = draft_payload (oförändrat). */
export function evaluateGuard(draft: Record<string, any>, ctx: GuardPlanContext): GuardResult {
  const violations: Violation[] = []
  const warnings: Violation[] = []
  const gaps: GapFlagOut[] = []
  const text = collectText(draft)

  const theme = resolveTheme(ctx.theme_key)
  const channel = draft.channel as string
  const beat = (draft.beat as string) ?? ctx.expected?.beat
  const cta = (draft.cta ?? {}) as { type?: string; label?: string }
  const landing = draft.landing_url_slot ?? (cta as any)?.landing_url_slot ?? null

  // ── Intake / schema ──────────────────────────────────────────────────────
  const schemaComplete = Boolean(draft.caption && draft.caption_rendered && draft.channel && draft.format && draft.beat)
  if (!schemaComplete) {
    violations.push({ id: 'SCHEMA-INCOMPLETE', severity: 'HIGH', category: 'schema', field: 'draft',
      explanation: 'Obligatoriska fält saknas (caption/caption_rendered/channel/format/beat).', kb_ref: 'channel-drafter-design#4.3' })
  }

  // ── Brand ──────────────────────────────────────────────────────────────
  const noThePrompt = !/the\s*prompt|ai[\s-]*news|ai[\s-]*nyhet/i.test(text)
  if (!noThePrompt) {
    violations.push({ id: 'BR-THEPROMPT', severity: 'CRITICAL', category: 'brand', field: 'caption',
      explanation: 'The Prompt / AI News-element förekommer — total isolering bruten.', kb_ref: 'brand-rules#isolering', recommended_action: 'return_to_drafter' })
  }
  if (/\b(smartare|klyftig\w*|bättre i skolan|garanter\w*|utvecklas snabbare|blir smart\w*)\b/i.test(text)) {
    violations.push({ id: 'MKT-DEVCLAIM', severity: 'HIGH', category: 'marketing', field: 'caption',
      explanation: 'Ogrundat utvecklings-/inlärningspåstående.', kb_ref: 'marketing-bible#8' })
  }
  // Lätt språkkontroll: svensk text förväntas (åäö eller vanliga sv ord).
  const looksSwedish = /[åäö]|\b(och|att|med|för|varje|ingen|barn)\b/i.test(text)
  if (text.length > 0 && !looksSwedish) {
    violations.push({ id: 'BR-TONE', severity: 'MEDIUM', category: 'brand', field: 'caption',
      explanation: 'Texten verkar inte vara på svenska / off-brand ton.', kb_ref: 'brand-rules#ton' })
  }

  // ── Character ────────────────────────────────────────────────────────────
  const cu = (draft.character_usage ?? {}) as { nova?: string; pling?: string }
  const novaTxt = (cu.nova ?? '').toLowerCase()
  const plingTxt = (cu.pling ?? '').toLowerCase()
  if (/robot|gadget/.test(novaTxt) || /\bflicka\b|mänsklig flicka/.test(plingTxt)) {
    violations.push({ id: 'CH-ROLEMIX', severity: 'HIGH', category: 'character', field: 'character_usage',
      explanation: 'Nova/Pling-roller hopblandade (Nova=flicka/känsla, Pling=robot/förklarare).', kb_ref: 'character-bible-v2' })
  }

  // ── Theme ────────────────────────────────────────────────────────────────
  if (ctx.theme_key && !theme) {
    violations.push({ id: 'TH-WRONGTHEME', severity: 'CRITICAL', category: 'theme', field: 'theme',
      explanation: `Okänt/fel tema "${ctx.theme_key}".`, kb_ref: 'theme-bible' })
  }
  if (theme && !theme.defined) {
    violations.push({ id: 'GAP-UNDEF-THEME', severity: 'CRITICAL', category: 'theme', field: 'theme',
      explanation: 'Temaspecifik copy mot ofastställt tema.', kb_ref: 'theme-bible#luckor' })
  }
  if (theme && theme.defined) {
    const hasSymbol = theme.symbols.some((s) => text.includes(s.toLowerCase()))
    if (theme.symbols.length > 0 && !hasSymbol) {
      warnings.push({ id: 'TH-NOSYMBOL', severity: 'MEDIUM', category: 'theme', field: 'caption',
        explanation: 'Temats symboler saknas i texten.', kb_ref: 'theme-bible' })
    }
    // Korsinblandning från annat tema
    for (const [other, tokens] of Object.entries(OTHER_THEME_TOKENS)) {
      if (other === theme.themeKey) continue
      if (tokens.some((tk) => containsWord(text, tk))) {
        violations.push({ id: 'TH-OTHERTHEME', severity: 'HIGH', category: 'theme', field: 'caption',
          explanation: `Element från annat tema (${other}) inblandat.`, kb_ref: 'theme-bible' })
        break
      }
    }
    // Barnsäkerhet (must_not), t.ex. smaka okända svampar utan vuxen
    const svampRule = theme.mustNot.some((m) => m.toLowerCase().includes('svamp'))
    if (svampRule && /(smaka|ät\w*|provsmak\w*|plocka)/.test(text) && text.includes('svamp') && !/vuxen|tillsammans med en vuxen/.test(text)) {
      violations.push({ id: 'TH-UNSAFE', severity: 'CRITICAL', category: 'theme', field: 'caption',
        explanation: 'Barnosäker uppmaning kring svamp utan vuxen.', kb_ref: 'skordemanaden#12' })
    }
  }

  // ── Marketing ────────────────────────────────────────────────────────────
  const ctaPresent = Boolean(cta.label)
  if (!ctaPresent) {
    violations.push({ id: 'MKT-WRONGCTA', severity: 'MEDIUM', category: 'marketing', field: 'cta',
      explanation: 'CTA saknas.', kb_ref: 'marketing-bible#9' })
  } else if (!VALID_CTA_LABELS.has(cta.label!)) {
    violations.push({ id: 'MKT-WRONGCTA', severity: 'MEDIUM', category: 'marketing', field: 'cta',
      explanation: `CTA "${cta.label}" finns inte i CTA-ramverket.`, kb_ref: 'marketing-bible#9' })
  } else if (beat === 'teaser' && HARD_CTA_TYPES.has(cta.type ?? '')) {
    violations.push({ id: 'MKT-WRONGCTA', severity: 'MEDIUM', category: 'marketing', field: 'cta',
      explanation: 'Hård CTA (trial/subscribe) i en ren teaser.', kb_ref: 'marketing-bible#9' })
  }
  // Falskt pris
  let priceViolation = false
  for (const m of text.matchAll(/\b(\d{1,4})\s*kr\b/gi)) {
    const n = Number(m[1])
    if (!ALLOWED_PRICES.has(n)) { priceViolation = true; break }
  }
  if (priceViolation) {
    violations.push({ id: 'MKT-FALSEPRICE', severity: 'CRITICAL', category: 'marketing', field: 'caption',
      explanation: 'Pris som inte matchar 59/129/199 kr.', kb_ref: 'marketing-bible#6', recommended_action: 'return_to_drafter' })
  }
  // Landningssida för hård CTA
  const needsLanding = HARD_CTA_TYPES.has(cta.type ?? '')
  if (needsLanding) {
    if (isRealUrl(landing)) {
      violations.push({ id: 'GAP-INVENTED', severity: 'HIGH', category: 'marketing', field: 'cta.landing_url_slot',
        explanation: 'Landningssida ifylld utan källa — uppfunnen URL.', kb_ref: 'guard-design#7', recommended_action: 'return_to_drafter' })
    } else {
      violations.push({ id: 'MKT-LANDING-MISSING', severity: 'HIGH', category: 'marketing', field: 'cta.landing_url_slot',
        explanation: 'CTA kräver landningssida men landing_url_slot är LUCKA.', kb_ref: 'marketing-bible#9', recommended_action: 'operator_fill_or_return' })
      gaps.push({ field: 'cta.landing_url', level: 'LUCKA', blocking: true })
    }
  }

  // ── Asset ────────────────────────────────────────────────────────────────
  const assetPlan = Array.isArray(draft.asset_plan) ? draft.asset_plan : []
  let assetInvented = false
  for (const a of assetPlan) {
    const status = a.status as string
    if (a.asset_ref == null && status === 'LUCKA') { gaps.push({ field: a.slot ?? 'asset', level: 'LUCKA', blocking: false }); continue }
    const ref = String(a.asset_ref ?? '')
    const knownPattern = /^covers\/[a-zåäö-]+\.png$/i.test(ref) || /^characters\/index\.json#(nova|pling)_/i.test(ref) || /^(activities|stories|audio)\//i.test(ref)
    if (!knownPattern || !['available', 'pending_upload'].includes(status)) {
      assetInvented = true
      violations.push({ id: 'AS-INVENTED', severity: 'HIGH', category: 'asset', field: 'asset_plan',
        explanation: `Asset utan källa i KB-index: "${ref}" (status ${status}).`, kb_ref: 'characters/index.json' })
    }
  }

  // ── Palett-LUCKA (alltid en notering; aldrig påhittad) ──────────────────
  if (theme) {
    warnings.push({ id: 'TH-PALETTE-UNVERIFIED', severity: 'LOW', category: 'theme', field: 'theme.palette',
      explanation: 'Höstpalett ej verifierad i KB; korrekt om inga hex anges.', kb_ref: 'theme-bible#palette' })
    gaps.push({ field: 'theme.palette', level: 'LUCKA', blocking: false })
    if (theme.hasSaga) gaps.push({ field: 'theme.saga_text', level: 'LUCKA', blocking: false })
  }

  // ── Scoring ──────────────────────────────────────────────────────────────
  const hasCritical = violations.some((v) => v.severity === 'CRITICAL')
  let score = 100
  for (const v of violations) {
    if (v.severity === 'HIGH') score -= 20
    else if (v.severity === 'MEDIUM') score -= 10
  }
  if (score < 0) score = 0
  if (hasCritical) score = Math.min(score, 40)

  const blockingGap = gaps.some((g) => g.blocking)
  let verdict: GuardResult['verdict']
  if (hasCritical || score < 70) verdict = 'rejected'
  else if (score >= 90 && !blockingGap) verdict = 'approved'
  else verdict = 'warning'

  const checks = {
    schema_complete: schemaComplete,
    brand_ok: !violations.some((v) => v.category === 'brand'),
    character_ok: !violations.some((v) => v.category === 'character'),
    theme_ok: !violations.some((v) => v.category === 'theme'),
    marketing_ok: !violations.some((v) => v.category === 'marketing'),
    asset_ok: !violations.some((v) => v.category === 'asset'),
    no_the_prompt: noThePrompt,
    no_invented_facts: !assetInvented && !violations.some((v) => v.id === 'GAP-INVENTED' || v.id === 'MKT-FALSEPRICE'),
  }

  const recommendation = hasCritical
    ? 'CRITICAL — underkänn / återlämna till Drafter. Får ej publiceras.'
    : verdict === 'approved'
      ? 'On-brand och kanon-säkert — kan godkännas.'
      : blockingGap
        ? 'On-brand men blockerande lucka (t.ex. landningssida) — operatör fyller eller återlämna.'
        : 'Mindre problem — granska och åtgärda.'

  return {
    verdict, score,
    score_breakdown: {
      start: 100,
      penalties: violations.filter((v) => v.severity === 'HIGH' || v.severity === 'MEDIUM')
        .map((v) => ({ id: v.id, severity: v.severity })),
      critical: hasCritical, blocking_gap: blockingGap,
    },
    violations, warnings, gap_flags: gaps, checks, recommendation,
  }
}

// Behåll referens till importer (tysta unused i vissa byggen).
export const _GUARD_CANON_REFS = { themeByMonthIndex, PROOF_POINTS }
