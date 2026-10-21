import * as React from 'react'
import type { WatchReadinessLoad } from '@/lib/atlas/project-analytics/handlarborsen-watch-readiness-service'
import { WATCH_PILOT_PROPOSAL as pilot } from '@/lib/atlas/project-analytics/handlarborsen-watch-readiness-core'
import styles from './HandlarborsenCompetitors.module.css'

const budgetLabels={
  available:'Budgetutrymme finns – endast en ögonblicksbild',
  project_missing:'Projektbudget saknas',global_missing:'Gemensamt budgettak saknas',
  both_missing:'Projektbudget och gemensamt budgettak saknas',
  exhausted:'Budgetutrymmet är förbrukat',unknown:'Budget kunde inte verifieras',
}
const stopLabels={clear:'Ej pausad',paused:'Pausad',unknown:'Kunde inte verifieras'}
export function HandlarborsenWatchReadiness({result}:{result:WatchReadinessLoad|null}) {
  if(!result||result.status==='unauthorized'||result.status==='forbidden')return null
  return <section className={styles.panel} aria-labelledby="watch-readiness-title">
    <p className={styles.kicker}>Atlas · Driftberedskap</p>
    <h2 id="watch-readiness-title">Inför återkommande konkurrentbevakning</h2>
    <p><strong>Automatisk bevakning är avstängd.</strong> Den här kontrollen visar beredskap och är inte ett körningstillstånd.</p>
    {result.status==='ok'?<>
      <dl className={styles.facts}>
        <div><dt>Gemensamt nödstopp</dt><dd>{stopLabels[result.globalStop]}</dd></div>
        <div><dt>Projektets nödstopp</dt><dd>{stopLabels[result.projectStop]}</dd></div>
        <div><dt>Budget</dt><dd>{budgetLabels[result.budget]}</dd></div>
        <div><dt>Befintlig kostnadsgrind</dt><dd>{result.enforcement==='enforced'?'Tvingande':result.enforcement==='advisory'?'Rådgivande – räcker inte för automatisk bevakning':'Kunde inte verifieras'}</dd></div>
      </dl>
      <p>Avläst <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})}</time> (Stockholm). Budgetutrymme är inte ett godkännande att använda det.</p>
    </>:<p role="status">Driftstatus kunde inte verifieras. Okänd stopp- eller budgetstatus ger inget körningstillstånd.</p>}
    <details>
      <summary>Återstår inför aktivering</summary>
      <ul className="my-3 list-disc space-y-2 pl-5">
        <li>Godkända källor och villkor för automatisk läsning. Upptäckt av nya konkurrenter behöver dessutom ett godkänt sökgränssnitt.</li>
        <li>Beständig körhistorik, unika körningar och skydd mot samtidiga eller upprepade anrop.</li>
        <li>Verifierad strikt kostnadsgrind, avräkning och nödstopp precis före varje externt anrop.</li>
        <li>Separat godkännande av körschema och produktionsaktivering.</li>
      </ul>
    </details>
    <p>Föreslagen första pilot: kontroll av kända officiella källor var {pilot.intervalDays}:e dag, högst {pilot.maxHttpRequests} HTTP-anrop per kontroll, {pilot.maxAutomaticRetries} automatiska omförsök och {pilot.paidProviderCalls} betalda sök- eller modellanrop. Förslaget är inte aktiverat.</p>
  </section>
}
