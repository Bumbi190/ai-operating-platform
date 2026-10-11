import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  CarFront,
  CircleCheck,
  Lightbulb,
  UsersRound,
} from 'lucide-react'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  buildHandlarborsenVisualPulse,
  type PulseStage,
  type PulseSuggestion,
  type PulseValue,
} from '@/lib/atlas/project-analytics/handlarborsen-visual-pulse'
import styles from './HandlarborsenVisualPulse.module.css'

const stageIcons = {
  companies: UsersRound,
  inventory: CarFront,
  trading: Activity,
} as const

const priorityLabel: Record<PulseSuggestion['priority'], string> = {
  check: 'Kontrollera',
  review: 'Granska',
  observe: 'Bevaka',
}

/**
 * A deliberately read-only visual layer. Values come only from the already scoped,
 * validated stored report. Recommendations are deterministic suggestions, not
 * an Atlas decision, approval, task or execution.
 */
export function HandlarborsenVisualPulse({
  report,
  reportHref,
}: {
  report: MarketplaceReport
  reportHref: string | null
}) {
  const pulse = buildHandlarborsenVisualPulse(report)
  if (!pulse) return null
  const isComplete = pulse.availableCount === pulse.totalCount

  return (
    <section className={styles.surface} aria-labelledby="hb-market-pulse">
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.kicker}>Handlarbörsen / marknadspuls</p>
          <h2 className={styles.title} id="hb-market-pulse">
            Verksamheten i en överblick
          </h2>
          <p className={styles.intro}>
            Tre separata delar av marknadsplatsen, baserade på senast sparade
            statistik.
          </p>
        </div>
        <span
          className={styles.source}
          data-quality={isComplete ? 'complete' : 'partial'}
        >
          {isComplete ? (
            <CircleCheck size={15} aria-hidden="true" />
          ) : (
            <AlertCircle size={15} aria-hidden="true" />
          )}
          Rapport {pulse.snapshotDate} · {pulse.availableCount}/
          {pulse.totalCount} tillgängliga mått
        </span>
      </header>

      <ol className={styles.stages} aria-label="Marknadsplatsens tre områden">
        {pulse.stages.map((stage, index) => (
          <StageCard key={stage.id} stage={stage} index={index + 1} />
        ))}
      </ol>
      <p className={styles.boundary} role="note">
        Företag, fordon och handel är separata lägesvärden – inte en uppmätt
        kundresa eller konvertering.
        {pulse.historyCount < 2
          ? ' Förändringar över tid kan visas först efter fler sparade dagsrapporter.'
          : ` ${pulse.historyCount} dagsrapporter finns för historisk jämförelse.`}
      </p>

      <div className={styles.proposalPanel}>
        <div className={styles.proposalHeading}>
          <div>
            <p className={styles.kicker}>Nästa steg</p>
            <h3 className={styles.proposalTitle}>Förslag att granska</h3>
            <p className={styles.proposalIntro}>
              Regelbaserade observationer – ingen agent har fattat beslut och
              inget utförs automatiskt.
            </p>
          </div>
          <Lightbulb
            size={21}
            className={styles.lightbulb}
            aria-hidden="true"
          />
        </div>
        <ol className={styles.suggestions}>
          {pulse.suggestions.map((suggestion, index) => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              index={index + 1}
            />
          ))}
        </ol>
        {reportHref ? (
          <Link href={reportHref} className={styles.reportLink}>
            Öppna underliggande statistikrapport
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </section>
  )
}

function Value({ item }: { item: PulseValue }) {
  return (
    <div
      className={styles.valueItem}
      data-unknown={item.value === null ? 'true' : undefined}
    >
      <span className={styles.value}>
        {item.value === null ? 'Okänt' : item.value.toLocaleString('sv-SE')}
      </span>
      <span className={styles.valueLabel}>{item.label}</span>
      {item.value === null && item.reason ? (
        <span className={styles.reason}>{item.reason}</span>
      ) : null}
    </div>
  )
}

function StageCard({ stage, index }: { stage: PulseStage; index: number }) {
  const Icon = stageIcons[stage.id]
  return (
    <li className={styles.stage} data-stage={stage.id}>
      <div className={styles.stageHead}>
        <span className={styles.stageIndex}>
          {String(index).padStart(2, '0')}
        </span>
        <Icon size={19} className={styles.stageIcon} aria-hidden="true" />
      </div>
      <h3 className={styles.stageTitle}>{stage.title}</h3>
      <p className={styles.stageDescription}>{stage.description}</p>
      <div className={styles.valueGrid}>
        <Value item={stage.main} />
        <Value item={stage.secondary} />
      </div>
    </li>
  )
}

function SuggestionRow({
  suggestion,
  index,
}: {
  suggestion: PulseSuggestion
  index: number
}) {
  const Icon =
    suggestion.priority === 'check'
      ? AlertCircle
      : suggestion.priority === 'review'
        ? Lightbulb
        : Activity
  return (
    <li className={styles.suggestion} data-priority={suggestion.priority}>
      <span className={styles.suggestionIndex}>
        {String(index).padStart(2, '0')}
      </span>
      <div className={styles.suggestionBody}>
        <div className={styles.suggestionTitleRow}>
          <h4 className={styles.suggestionTitle}>{suggestion.title}</h4>
          <span className={styles.priority}>
            <Icon size={12} aria-hidden="true" />
            {priorityLabel[suggestion.priority]}
          </span>
        </div>
        <p className={styles.evidence}>
          <strong>Underlag:</strong> {suggestion.evidence}
        </p>
        <p className={styles.nextStep}>
          <strong>Förslag:</strong> {suggestion.nextStep}
        </p>
      </div>
    </li>
  )
}
