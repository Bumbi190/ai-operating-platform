import * as React from 'react'
import type {MetaEvidenceFixtureResult} from '@/lib/social-launch/scheduling/operator-meta-evidence-fixture'

// Test-only passive evidence comparison. No buttons, POST, review mutation,
// approval or publish callback; no production route or menu imports this view.
export function ScheduledMetaEvidenceFixture({evidence}:{evidence:MetaEvidenceFixtureResult}){
 return <section aria-label="Operatörsgranskning av möjliga Facebook-inlägg">
  <h3>Kontrollera möjliga Facebook-inlägg</h3>
  <p role="status"><strong>Meta-resultatet är fortfarande overifierat.</strong> Det interna publiceringsläget är {evidence.internalPublicationState}.</p>
  <p>{evidence.manualInstruction}</p>
  {!evidence.candidates.length&&<p>Inga kandidater visades. Starta inte ett nytt publiceringsförsök.</p>}
  {evidence.candidates.length>0&&<ul>
   {evidence.candidates.map(item=><li key={item.providerId}>
    <h4>Möjligt befintligt inlägg · {new Intl.DateTimeFormat('sv-SE',{
     timeZone:'Europe/Stockholm',dateStyle:'short',timeStyle:'short',
    }).format(new Date(item.createdAt))}</h4>
    <p>{item.text}</p>
    <img alt="Kandidatbild från Facebook som operatören behöver jämföra" src={item.imageUrl} referrerPolicy="no-referrer" style={{maxWidth:280,width:'100%'}}/>
    <p><a href={item.permalink} target="_blank" rel="noreferrer">Öppna befintligt Facebook-inlägg för manuell kontroll</a></p>
    <p>Detta är en möjlig träff, inte ett verifierat kvitto.</p>
   </li>)}
  </ul>}
  {evidence.truncated&&<p>Fler möjliga träffar finns i den lästa mängden. Kontrollera även dem manuellt.</p>}
  <p><strong>Automatisk ompublicering är spärrad.</strong> Ingen bekräftelse kan göras i denna vy.</p>
 </section>
}
