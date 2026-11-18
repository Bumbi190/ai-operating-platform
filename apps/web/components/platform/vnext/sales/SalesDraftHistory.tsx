import type {SalesDraftRevision,SalesWorkspace} from '@/lib/sales/types'
import {getDraftReviewHistory} from '@/lib/sales/draft-history'
import {formatTimingInstant,timingBlockerLabel} from '@/lib/sales/timing/view-model'
import styles from './SalesWorkspace.module.css'
const sourceLabels:Record<string,string>={strato_sent:'Skickat i Strato',strato_inbox:'Inkorg i Strato',resend:'Resend',operator:'Manuell avstämning'}
const sourceStates:Record<string,string>={complete:'Angivet tidsfönster kontrollerat',gap:'Begränsad omfattning – historik kan saknas',failed:'Kontrollen misslyckades'}
const historyLabels:Record<string,string>={unknown:'Äldre eller extern kontakthistorik är fortfarande okänd',owner_confirmed_none:'Ingen tidigare kontakt, ägarbekräftat i den sparade kontrollen',contacted:'Tidigare kontakt finns registrerad'}
export function SalesDraftHistory({model,draft}:{model:SalesWorkspace;draft:SalesDraftRevision}){
 const {history,timing,legacyNote}=getDraftReviewHistory(model,draft)
 return <section aria-label="Sparad kontaktkontroll">
  <h4>Senast sparade kontaktkontroll</h4>
  <p>Visar sparat underlag, inte en ny mejlkontroll. Historik och svar behöver kontrolleras på nytt före ett eventuellt utskick.</p>
  {history?<>
   <dl className={styles.metadata}>
    <dt>Mottagare</dt><dd>{history.recipient}</dd>
    <dt>Historikversion</dt><dd>{history.version}</dd>
    <dt>Sparad</dt><dd>{formatTimingInstant(history.createdAt)}</dd>
    <dt>Historikbedömning</dt><dd>{historyLabels[history.data.history]??'Historiken behöver granskas'}</dd>
    <dt>Mejlhändelser i kontrollen</dt><dd>{history.data.events.length} registrerade observationer</dd>
   </dl>
   <p>Äldre eller externa händelser kan saknas även när inga mejlhändelser är registrerade.</p>
   {timing&&timing.contactVersion!==draft.contactVersion&&<p className={styles.notice}>Kontakten har ändrats sedan utkastet skapades. Kontrollera vilken kontaktversion underlaget gäller.</p>}
   {!!timing?.blockers.length&&<div className={styles.notice}><strong>Spärrar vid senaste statusläsningen</strong><ul>{timing.blockers.map(code=><li key={code}>{code==='NOT_INITIAL_CONTACT'?'Underlaget medger inte ett vanligt första kontaktförsök':timingBlockerLabel(code)}</li>)}</ul><small>Status avläst {formatTimingInstant(model.timing.evaluatedAt)}</small></div>}
   <p>{history.data.reviewNote}</p>
   {history.data.sources.length===0&&<p>Ingen källkontroll är sparad.</p>}
   {history.data.sources.map(source=><div key={source.sourceKey}>
    <h5>{sourceLabels[source.channel]??'Okänd källa'}</h5>
    <p>{sourceStates[source.state]??'Källstatus behöver granskas'}<br/>Kontrollerat till {formatTimingInstant(source.through)}</p>
    <details className={styles.disclosure}><summary>Visa sparad avgränsning och referens</summary><div className={styles.disclosureBody}>
     <dl className={styles.metadata}><dt>Kontrollerat urval</dt><dd>{source.scopeRef}</dd><dt>Källidentitet</dt><dd>{source.identityRef}</dd><dt>Från</dt><dd>{formatTimingInstant(source.since)}</dd><dt>Avstämt</dt><dd>{formatTimingInstant(source.observedAt)}</dd><dt>Referens</dt><dd>{source.reference}</dd></dl>
    </div></details>
   </div>)}
  </>:<p>Ingen versionsbunden kontaktkontroll kan visas för utkastets mottagare. En äldre anteckning ersätter inte en sådan kontroll.</p>}
  <small>Kontaktregistret vid denna sidläsning: {model.contacts.filter(c=>c.projectId===model.projectId).length} sparade poster. Detta är inte ett leveransmått.</small>
  {legacyNote&&<details className={styles.disclosure}><summary>Äldre kontaktanteckning</summary><div className={styles.disclosureBody}><p>Anteckningen bevaras som bakgrund och visar inte automatiskt den senaste kontrollen.</p><p>{legacyNote}</p></div></details>}
 </section>
}
