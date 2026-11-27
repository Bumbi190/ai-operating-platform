import type { projectGrowthDashboard } from './growth-dashboard-advisory'

type Projection = NonNullable<ReturnType<typeof projectGrowthDashboard>>
type RowKind = 'metric' | 'signal' | 'detail' | 'idea' | 'criterion' | 'rate'
type Bar = { value: number; maximum: number; caption?: string }
type Row = { label: string; value: string; kind: RowKind; bar?: Bar; attention?: boolean }
type Section = {
  id: 'analytics' | 'reference' | 'quality' | 'learning'
  title: string
  note: string
  rows: Row[]
  rateScale?: string
}
const missing = 'Underlag saknas; inget nollvärde antas.'
const count = (n: number) => new Intl.NumberFormat('sv-SE').format(n)
const rate = (n: number) => n > 0 && n < 0.0001 ? 'under 0,01 %' : new Intl.NumberFormat('sv-SE', { style: 'percent', maximumFractionDigits: 2 }).format(n)
const row = (kind: RowKind, label: string, value: string, extra?: Pick<Row, 'bar' | 'attention'>): Row =>
  ({ kind, label, value, ...extra })
const coverage = (value: number, maximum: number): Bar | undefined => maximum > 0
  ? { value, maximum, caption: count(value) + ' av ' + count(maximum) + ' i underlaget' }
  : undefined
const freshness = (f: { fresh: number; stale: number; unknown: number }): Row[] => [
  row('detail', 'Observationer inom färskhetsfönstret', count(f.fresh)),
  row('detail', 'Äldre observationer', count(f.stale)),
  row('detail', 'Okänd aktualitet', count(f.unknown)),
]
const criteria = { hook: 'Inledning', clarity: 'Tydlighet', relevance: 'Relevans', cta: 'Uppmaning', visual_readability: 'Visuell läsbarhet', source_support: 'Källstöd' }
const ratings = { needs_work: 'Behöver förbättras', partial: 'Delvis', meets: 'Uppfyllt enligt uppgift', unknown: 'Ej bedömt' }
const hypotheses = {
  test_subject_first: 'Prova huvudmotivet först',
  test_text_hierarchy: 'Prova tydligare texthierarki',
  test_concrete_visual: 'Prova ett konkret visuellt motiv',
  test_visible_demonstration: 'Prova en synlig demonstration',
  test_comparison_layout: 'Prova en jämförelselayout',
  test_contrast: 'Prova kontrast',
}

/** Presentation contract for the authorized, validated local projection only.
 * Not a parser of untrusted JSON, authentication boundary or live data reader.
 * Keep each section's limitations next to its metrics; no detached winner card.
 * Bars encode coverage or descriptive ratios only, not quality gates or predictions.
 */
export function presentGrowthDashboard(data: Projection | null) {
  if (data === null) return null
  const a = data.analytics, r = data.reference, q = data.quality, l = data.learning
  const ratios = l.status === 'assessed' && l.comparisonStatus === 'descriptive' && l.rates ? l.rates : null
  // All four ratios share one zero-based scale. Saves/reach or shares/reach
  // can exceed 100%; never cap at 100% or present it as a probability.
  const ratioMaximum = ratios ? Math.max(0.01, ...Object.values(ratios)) : 0
  const ratio = (label: string, value: number): Row =>
    row('rate', label, rate(value), { bar: { value, maximum: ratioMaximum } })
  const sections: Section[] = [
    { id: 'analytics', title: 'Analytics Engine', note: a.status === 'not_supplied' ? missing : 'Uppgivna observationer, inte oberoende verifierade. Mätålder 48–54 timmar; aktualitet bedöms separat.', rows: a.status === 'not_supplied' ? [] : [
      row('metric', 'Inlägg i underlaget', count(a.totalPosts)),
      row('metric', 'Jämförbar mätålder', count(a.matchedAge), { bar: coverage(a.matchedAge, a.totalPosts) }),
      row('metric', 'Underlag för visningar (antal inlägg)', count(a.viewsSample)),
      row('metric', 'Underlag för engagemangsgrad (antal inlägg)', count(a.engagementSample)),
      ...freshness(a.freshness),
    ] },
    { id: 'reference', title: 'Reference Intelligence', note: r.status === 'not_supplied' ? missing : 'Uppgivna stillbildsobservationer; ljud saknas. Hypoteser, inte effektbevis. Rättigheter har inte bedömts.', rows: r.status === 'not_supplied' ? [] : [
      row('metric', 'Inspelade bildrutor', count(r.capturedFrames)),
      row('metric', 'Bildrutor med dokumenterad observation', count(r.reviewedFrames), { bar: coverage(r.reviewedFrames, r.capturedFrames) }),
      ...r.hypotheses.map(h => row('idea', 'Testidé', hypotheses[h.hypothesis])),
    ] },
    { id: 'quality', title: 'Growth Score', note: q.status === 'not_supplied' ? missing : 'Uppgiven redaktionell bedömning, inte verifierad faktakontroll eller prognos. Befintliga kvalitetsgrindar gäller.', rows: q.status === 'not_supplied' ? [] : [
      row('metric', 'Bedömda kriterier', count(q.assessedCount) + ' / ' + count(q.totalCriteria)),
      row('metric', 'Rådgivande poäng', q.advisoryPoints === null ? 'Saknas – ofullständig bedömning' : count(q.advisoryPoints) + ' / ' + count(q.maximumPoints)),
      row('signal', 'Uppgiven befintlig grind', q.reportedExistingGate === 'reported_pass' ? 'Uppges godkänd – ej verifierat' : q.reportedExistingGate === 'reported_block' ? 'Uppges blockerad' : 'Okänd', { attention: q.reportedExistingGate !== 'reported_pass' }),
      row('signal', 'Faktagranskningssignal', q.factualReviewConcern ? 'Granskning behövs' : 'Ingen signal i uppgiven bedömning – ej verifierat', { attention: q.factualReviewConcern }),
      ...q.criteria.map(c => row('criterion', criteria[c.criterion], ratings[c.rating])),
    ] },
    { id: 'learning', title: 'Learning Engine', note: l.status === 'not_supplied' ? missing : 'Uppgivna observationer, inte oberoende verifierade. Beskrivande jämförelse, inte kausalitet eller statistiskt säkerställd effekt. Ingen vinnare utses; mänsklig granskning krävs.',
      rateScale: ratios ? 'Gemensam skala 0–' + rate(ratioMaximum) + ' · ingen målnivå.' : undefined,
      rows: l.status === 'not_supplied' ? [] : [
      row('signal', 'Jämförelsestatus', l.comparisonStatus === 'descriptive' ? 'Beskrivande' : l.comparisonStatus === 'insufficient' ? 'Otillräckligt urval' : 'Ej jämförbart', { attention: l.comparisonStatus !== 'descriptive' }),
      row('metric', 'Inlägg i uppgiven experimentlista', count(l.rosterSize)),
      row('metric', 'Jämförbara inlägg', count(l.eligibleCount), { bar: coverage(l.eligibleCount, l.rosterSize) }),
      row('detail', 'Variant A (antal märkta inlägg)', count(l.aPosts)),
      row('detail', 'Variant B (antal märkta inlägg)', count(l.bPosts)),
      ...freshness(l.freshness),
      ...(ratios ? [
        ratio('A: sparningar / räckvidd', ratios.aSaveRate),
        ratio('B: sparningar / räckvidd', ratios.bSaveRate),
        ratio('A: delningar / räckvidd', ratios.aShareRate),
        ratio('B: delningar / räckvidd', ratios.bShareRate),
      ] : [row('signal', 'Jämförelsetal', 'Saknas – ingen jämförelse', { attention: true })]),
    ] },
  ]
  return {
    title: 'Growth Engine – lokal rådgivning',
    brand: data.brand === 'the-prompt' ? 'The Prompt' : 'Familje-Stunden',
    note: 'Offlineunderlag, uppgivet av anroparen och inte oberoende verifierat. Mänsklig granskning krävs. Ingen publiceringsbehörighet, ingen prognos om resultat.',
    sections,
  }
}