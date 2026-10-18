import type {HistoryAnalysis} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'
import {buildWeeklyCompetitorReport} from '@/lib/atlas/project-analytics/handlarborsen-weekly-report'
import common from './HandlarborsenCompetitors.module.css'
import styles from './HandlarborsenWeeklyReport.module.css'

const labels={missing:'Ingen sparad kontroll denna vecka',unavailable:'Kunde inte verifieras',baseline_missing:'Jämförbar föregående kontroll saknas',compared:'Senaste sidtiteln kan jämföras'}
function CheckedTime({value}:{value:string}) {
  return <time dateTime={value}>{new Date(value).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})} (Stockholm)</time>
}
/** Reuses the shared view's already-authorized history; no additional read or write. */
export function HandlarborsenWeeklyReport({history,enabled,asOf=new Date()}:{history:HistoryAnalysis|null;enabled:boolean;asOf?:Date}) {
  const report=enabled?buildWeeklyCompetitorReport(history?.status==='ok'?history.observations:null,asOf):null
  const lastDay=report?.status==='ok'?new Date(Date.parse(report.period.endExclusive+'T12:00:00.000Z')-86400000).toISOString().slice(0,10):null
  return <section className={common.panel+' '+styles.report} aria-labelledby="hb-weekly-report">
    <header className={styles.header}>
      <div><p className={common.kicker}>Atlas / Sparat beslutsunderlag</p><h2 id="hb-weekly-report">Veckounderlag</h2></div>
      <span className={styles.badge}>Sidtitlar</span>
    </header>
    {!report||report.status!=='ok'?<p role="status">{!enabled?'Historikläsning är avstängd.':'Veckounderlaget kunde inte verifieras.'} Inga jämförelsevärden visas.</p>:<>
      <p>Hittills denna vecka: <time dateTime={report.period.start}>{report.period.start}</time> till och med <time dateTime={lastDay!}>{lastDay}</time>, Stockholm. Sammanställt <CheckedTime value={report.period.asOf}/> från sparad historik.</p>
      <p className={styles.note}>Underlaget gäller sidtitlar och hämtningsstatus. Det verifierar inte nya priser, erbjudanden eller funktioner. Sociala medier ingår ännu inte. Automatisk bevakning är avstängd.</p>
      <dl className={styles.metrics}>
        <div><dt>Källor med sparad kontroll</dt><dd>{report.observedSources} / {report.sources.length}</dd></div>
        <div><dt>Senaste kontroll kan jämföras</dt><dd>{report.comparableSources} / {report.sources.length}</dd></div>
        <div><dt>Titelskillnader observerade denna vecka</dt><dd>{report.titleChangeCount===null?'Ej jämförbart':report.titleChangeCount}</dd></div>
      </dl>
      <h3>Vad har observerats?</h3>
      {report.observedSources===0?<p>Inga sparade kontroller denna vecka. Det går inte att bedöma vad som har förändrats.</p>
        :report.titleChangeCount===null?<p>Kontroller finns, men inga lyckade observationer kan jämföras. Förändringar är okända.</p>
        :<p>{report.changes.length} verifierade titelskillnader i {report.comparisonCount} jämförelser. Jämförelsen visar skillnaden mellan kontrolldatumen, inte när ändringen skedde. En oförändrad titel säger inget om övrigt sidinnehåll.</p>}
      {report.changes.length>0&&<ol className={styles.list}>{report.changes.map(change=><li className={styles.card} key={change.sourceId+change.current.checkedAt}>
        <strong>{change.name}: ändrad sidtitel</strong>
        <p>Före: <CheckedTime value={change.previous.checkedAt}/><br/>{change.previous.title}</p>
        <p>Efter: <CheckedTime value={change.current.checkedAt}/><br/>{change.current.title}</p>
        <a className={common.link} href={change.url} rel="noreferrer">Officiell källa</a>
      </li>)}</ol>}
      <details className={styles.coverage}><summary>Källor och luckor ({report.sources.length})</summary>
        <ul className={styles.list}>{report.sources.map(source=><li className={styles.card} key={source.id}>
          <a className={common.link} href={source.url} rel="noreferrer">{source.name}</a>
          <p>{labels[source.state]}</p>
          {source.latest&&<><p>Senast sparad denna vecka: <CheckedTime value={source.latest.checkedAt}/></p>
            {source.latest.title&&<p>{source.latest.title}</p>}</>}
        </li>)}</ul>
      </details>
      <h3>Vad betyder det för Handlarbörsen?</h3>
      <p>Atlas bedömning: titelmetadata kan hjälpa oss att välja vad vi bör granska härnäst. Underlaget räcker inte för att fastställa en produktförändring eller prioritera en ny funktion. Granskningsförslagen nedan har inte godkänts eller utförts.</p>
      <h3>Atlas föreslår nästa granskning</h3>
      {report.suggestions.length===0?<p>Underlaget motiverar inget nytt gransknings- eller förbättringsförslag just nu.</p>
        :<ol className={styles.list}>{report.suggestions.map(suggestion=><li className={styles.card} key={suggestion.id}>
          <span className={styles.badge}>Förslag att granska</span>
          <h4>{suggestion.title}</h4><p><strong>Bedömning:</strong> {suggestion.meaning}</p>
          <p><strong>Nästa steg:</strong> {suggestion.action}</p><p><strong>Förväntad nytta:</strong> {suggestion.benefit}</p>
          <details><summary>Daterat underlag</summary><ul>{suggestion.evidence.map(item=><li key={item.checkedAt}>
            <CheckedTime value={item.checkedAt}/>: {item.title??'Källan kunde inte verifieras vid den sparade kontrollen.'}
          </li>)}</ul><a className={common.link} href={suggestion.url} rel="noreferrer">Officiell källa</a></details>
        </li>)}</ol>}
    </>}
  </section>
}
