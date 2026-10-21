/**
 * Handlarbörsen visual pulse — present-only view of an already authorized report.
 *
 * Each stage is a separate stock or cumulative measure, NOT a cohort funnel.
 * Every suggested next step cites a stored observation. No actions, persistence,
 * provider calls, scheduling or claims of AI reasoning happen here.
 */
import type { MarketplaceMetricKey } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import type {
  MarketplaceReport,
  MetricView,
} from './handlarborsen-marketplace-report'
import { STALE_AFTER_HOURS } from './handlarborsen-marketplace-report'

export interface PulseValue {
  label: string
  value: number | null
  reason: string | null
}

export interface PulseStage {
  id: 'companies' | 'inventory' | 'trading'
  title: string
  description: string
  main: PulseValue
  secondary: PulseValue
}

export interface PulseSuggestion {
  id: string
  priority: 'check' | 'review' | 'observe'
  title: string
  evidence: string
  nextStep: string
}

export interface HandlarborsenVisualPulseModel {
  snapshotDate: string
  availableCount: number
  totalCount: number
  historyCount: number
  stages: PulseStage[]
  suggestions: PulseSuggestion[]
}

function metricValue(
  metrics: ReadonlyMap<string, MetricView>,
  key: MarketplaceMetricKey,
): number | null {
  return metrics.get(key)?.value ?? null
}

function pulseValue(
  metrics: ReadonlyMap<string, MetricView>,
  key: MarketplaceMetricKey,
  label: string,
): PulseValue {
  const metric = metrics.get(key)
  return {
    label,
    value: metric?.value ?? null,
    reason: metric?.value === null ? metric.reasonLabel : null,
  }
}

export function buildHandlarborsenVisualPulse(
  report: MarketplaceReport,
): HandlarborsenVisualPulseModel | null {
  if (report.state !== 'ok' || !report.latest) return null
  const { latest, history, collection } = report
  const metrics = new Map(latest.metrics.map((metric) => [metric.key, metric]))
  const suggestions: PulseSuggestion[] = []

  if (latest.freshness === 'stale' || collection?.latestAttemptFailed) {
    const evidence = [
      latest.freshness === 'stale'
        ? `Senast sparade mätningen är äldre än ${STALE_AFTER_HOURS} timmar.`
        : null,
      collection?.latestAttemptFailed
        ? 'Senaste registrerade insamlingsförsöket gav ingen ny lyckad rapport.'
        : null,
    ]
      .filter(Boolean)
      .join(' ')
    suggestions.push({
      id: 'collection',
      priority: 'check',
      title: 'Kontrollera statistikinsamlingen',
      evidence,
      nextStep:
        'Granska insamlingsstatus och senaste körningen innan du drar slutsatser av siffrorna.',
    })
  }

  if (latest.completeness !== 'complete') {
    suggestions.push({
      id: 'quality',
      priority: 'check',
      title: 'Granska saknade mätvärden',
      evidence: `${latest.unavailableCount} av ${latest.metrics.length} värden är okända i den sparade rapporten.`,
      nextStep:
        'Se vilka mått som saknas i statistikrapporten. Okänt ska inte tolkas som noll.',
    })
  }

  if (history.snapshotCount < 2) {
    suggestions.push({
      id: 'history',
      priority: 'observe',
      title: 'Bygg upp jämförelseunderlag',
      evidence:
        'Det finns bara en verifierad dagsrapport. Ingen utveckling mellan dagar kan bedömas ännu.',
      nextStep:
        'Följ nästa dagliga insamling och jämför först när ytterligare en rapport sparats.',
    })
  }

  const registered = metricValue(metrics, 'companies_registered_total')
  const verified = metricValue(metrics, 'companies_verified_total')
  if (registered !== null && verified !== null && registered > verified) {
    suggestions.push({
      id: 'verification',
      priority: 'review',
      title: 'Granska verifieringsläget',
      evidence: `${registered} företag är registrerade totalt och ${verified} är verifierade nu. Skillnaden kan även innehålla stängda företag.`,
      nextStep:
        'Kontrollera företagens faktiska status i Handlarbörsens adminpanel innan du kontaktar någon.',
    })
  }

  const published = metricValue(metrics, 'vehicles_published_active')
  if (published === 0) {
    suggestions.push({
      id: 'inventory',
      priority: 'review',
      title: 'Kontrollera annonsflödet',
      evidence: 'Inga fordon var publicerade vid senaste mätningen.',
      nextStep:
        'Verifiera att pilotföretagen kan publicera fordon innan ett större pilotutskick.',
    })
  }

  const bids24h = metricValue(metrics, 'bids_last_24h')
  if (bids24h === 0 && published !== 0) {
    suggestions.push({
      id: 'bids',
      priority: 'observe',
      title: 'Följ budaktiviteten',
      evidence:
        'Inga nya bud registrerades under den senast uppmätta 24-timmarsperioden.',
      nextStep:
        'Följ aktiviteten under flera dagar och med verkliga pilothandlare innan du bedömer efterfrågan.',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'follow-up',
      priority: 'observe',
      title: 'Fortsätt följa pilotflödet',
      evidence: `Senaste verifierade rapporten är från ${latest.snapshotDate}.`,
      nextStep:
        'Jämför nästa dagsrapport och utvärdera användarnas återkoppling innan du prioriterar ändringar.',
    })
  }

  return {
    snapshotDate: latest.snapshotDate,
    availableCount: latest.availableCount,
    totalCount: latest.metrics.length,
    historyCount: history.snapshotCount,
    stages: [
      {
        id: 'companies',
        title: 'Företag',
        description: 'Registrering och verifiering',
        main: pulseValue(
          metrics,
          'companies_registered_total',
          'Registrerade totalt',
        ),
        secondary: pulseValue(
          metrics,
          'companies_verified_total',
          'Verifierade nu',
        ),
      },
      {
        id: 'inventory',
        title: 'Fordon',
        description: 'Tillgängligt och reserverat utbud',
        main: pulseValue(
          metrics,
          'vehicles_published_active',
          'Publicerade nu',
        ),
        secondary: pulseValue(metrics, 'vehicles_reserved', 'Reserverade nu'),
      },
      {
        id: 'trading',
        title: 'Handel',
        description: 'Separata ackumulerade totaler',
        main: pulseValue(metrics, 'bids_total', 'Bud totalt'),
        secondary: pulseValue(
          metrics,
          'deals_completed_total',
          'Slutförda affärer totalt',
        ),
      },
    ],
    suggestions: suggestions.slice(0, 3),
  }
}
