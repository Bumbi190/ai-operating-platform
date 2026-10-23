import * as React from 'react'
import type {ReviewHandoffFixture} from '@/lib/social-launch/scheduling/review-handoff-fixture'

// Review-only preview component. NO buttons, network calls, routes or
// publish/reconciliation completion handlers. Not mounted in production.
export function ScheduledMetaReviewFixture({review}:{review:ReviewHandoffFixture}){
 return <section aria-label="Facebook-publiceringar som behöver granskas">
  <h3>{review.title}</h3>
  <p role="status">{review.description}</p>
  {!review.entries.length&&<p>Inga osäkra publiceringsförsök i den här vyn.</p>}
  {review.entries.length>0&&<ol>{review.entries.map(item=>
   <li key={item.jobId}>
    <h4>Facebook · bokat {item.reservedLabel}</h4>
    <p>Referens: {item.jobId.slice(-8)} · Intern jobbstatus: {item.databaseJobState} · Publiceringsstatus: {item.publicationState}</p>
    <p><strong>Meta-bevis: saknas</strong> · Automatisk ompublicering: spärrad</p>
    <p>{item.operatorInstruction}</p>
    {item.existingManualPanelEligible?
     <p>Granskning: befintlig operatörsstyrd Facebook-panel kan användas. Ingen åtgärd startas här.</p>:
     <p>Granskning: separat kontroll krävs. Den befintliga kopplingspanelen kan inte användas för detta tillstånd.</p>}
   </li>
  )}</ol>}
  {review.limitReached&&<p>Visar högst 25 ärenden. Fler kan finnas och kräver en separat listning.</p>}
 </section>
}
