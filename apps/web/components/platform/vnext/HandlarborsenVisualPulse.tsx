import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  CarFront,
  CircleCheck,
  UsersRound,
} from 'lucide-react'
import type { MarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import {
  buildHandlarborsenVisualPulse,
  type PulseStage,
  type PulseValue,
} from '@/lib/atlas/project-analytics/handlarborsen-visual-pulse'
import styles from './HandlarborsenVisualPulse.module.css'

const stageIcons = {
  companies: UsersRound,
  inventory: CarFront,
  trading: Activity,
} as const

/**
 * A deliberately read-only visual layer. Values come only from the already scoped,
 * validated stored report. Analysis and manual next checks belong to Atlas Intelligence.
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
            Marknadspuls
          </h2>
          <p className={styles.intro}>
            Lägesbild från senast sparade statistik.
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

      <div className={styles.contentGrid}>
        <div className={styles.pulseColumn}>
          <div className={styles.pulseHighlights} aria-label="Senast observerade värden inom företag, fordon och handel">
            {pulse.stages.map((stage) => {
              const Icon = stageIcons[stage.id]
              return (
                <div className={styles.highlightCard} key={stage.id} data-stage={stage.id}>
                  <span className={styles.highlightIcon} aria-hidden="true"><Icon size={19} /></span>
                  <span className={styles.highlightBody}>
                    <strong>{stage.title}</strong>
                    <span className={styles.highlightValue}>{stage.main.value === null ? 'Okänt' : stage.main.value.toLocaleString('sv-SE')}</span>
                    <small>{stage.main.label}</small>
                  </span>
                </div>
              )
            })}
          </div>
          <details className={styles.disclosure}>
        <summary>Visa fördjupning <span>Företag, fordon och handel</span></summary>
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
          </details>
        </div>

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
