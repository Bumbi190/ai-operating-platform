import React from 'react'
import type {SocialContentPost} from '@/lib/social-launch/content/types'
import styles from './SocialContentPanel.module.css'
const reasons:Record<string,string>={news_source_expired:'Nyheten är för gammal eller har ett framtida källdatum.',news_evidence_required:'Granskningsunderlag saknas.',news_evidence_changed:'Underlaget har ändrats och behöver förberedas igen.',news_evidence_invalid:'Underlaget kunde inte verifieras.',news_project_stopped:'Projektet är pausat.',video_transport_unavailable:'Videopublicering är inte ansluten.',release_authority_missing:'Separat publiceringsbeslut saknas.',schedule_not_activated:'Veckotestet är inte aktiverat.',review_required:'Innehållet behöver godkännas.',account_required:'Mottagarkonto saknas.',destination_changed:'Mottagarkontot har ändrats.',plan_changed:'Kanalplanen har ändrats.',activation_required:'Kalendern skickar inget automatiskt.'}
export function NewsReviewEvidence({review}:{review:NonNullable<SocialContentPost['newsReview']>}){
 return <section className={styles.newsEvidence} aria-label="Nyhetens granskningsunderlag">
  <h4>{review.review_packet_ready?'Underlaget är klart för granskning':'Underlaget behöver kontrolleras'}</h4>
  {review.source&&<p>Originalkälla: <a href={review.source.url} target="_blank" rel="noreferrer">{review.source.url}</a><br/>Publicerad: <time dateTime={review.source.publishedAt}>{new Date(review.source.publishedAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})} Stockholm</time></p>}
  {review.video&&<p>3 illustrationer · Röst: {review.voiceLabel} · Engelskt tal och engelsk text</p>}
  <p>{review.aiDisclosure}</p>
  <p>Mottagare: {review.destinationLabel??'Kontokoppling saknas'}{review.channel?' · '+review.channel:''}</p>
  {review.blockers.map(reason=><p key={reason}>{reasons[reason]??'Underlaget behöver granskas igen.'}</p>)}
  <h4>Publicering är inte aktiverad</h4>
  <ul>{[...new Set(review.publicationBlockers)].map(reason=><li key={reason}>{reasons[reason]??'Kräver en ny kontroll före publicering.'}</li>)}</ul>
 </section>
}