'use client'
import * as React from 'react'
import {useState} from 'react'
import type {OperatorHistoryEvent} from '@/lib/social-launch/scheduling/operator-review-history-fixture'

// Preview component, NOT mounted in a production route. Buttons only invoke
// an injected operator-only handler; no Facebook write or receipt completion.
type Observation='possible_match_observed'|'no_match_observed'|'review_deferred'
export type ReviewPanelModel={
 projectId:string;jobId:string;publicationId:string
 publicationState:string;providerOutcome:'unknown';operatorRequired:true
 automaticRetryAllowed:false;canFinalize:false;canPublish:false
 observationSaved:boolean;history:readonly OperatorHistoryEvent[]
 limitReached:boolean;instruction:string
}
type Submission={
 projectId:string;jobId:string;publicationId:string
 requestId:string;observation:Observation;candidateId:string|null
 confirmHumanObservation:true
}
type Props={
 initial:ReviewPanelModel
 recordObservation:(input:Submission)=>Promise<ReviewPanelModel>
 readHistory:()=>Promise<ReviewPanelModel>
}
const labels:Record<Observation,string>={
 possible_match_observed:'Jag såg en möjlig matchning på Facebook',
 no_match_observed:'Jag hittade ingen matchning i det granskade urvalet',
 review_deferred:'Jag behöver granska detta senare',
}
const pageId=/^[0-9]{1,80}_[0-9]{1,80}$/
export function ScheduledOperatorReviewPanelFixture({initial,recordObservation,readHistory}:Props){
 const [view,setView]=useState(initial)
 const [observation,setObservation]=useState<Observation>('review_deferred')
 const [candidate,setCandidate]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [pendingRequestId,setPendingRequestId]=useState<string|null>(null)
 const matched=observation!=='possible_match_observed'||pageId.test(candidate)
 const safe=view.providerOutcome==='unknown'&&view.automaticRetryAllowed===false&&
  view.canFinalize===false&&view.canPublish===false
 async function submit(event:React.FormEvent){
  event.preventDefault()
  if(busy||!confirmed||!matched||!safe)return
  const requestId=pendingRequestId??crypto.randomUUID()
  setPendingRequestId(requestId);setBusy(true);setError('')
  try{
   const next=await recordObservation({
    projectId:view.projectId,jobId:view.jobId,publicationId:view.publicationId,
    requestId,observation,
    candidateId:observation==='possible_match_observed'?candidate:null,
    confirmHumanObservation:true,
   })
   if(next.providerOutcome!=='unknown'||next.canFinalize||next.canPublish||next.automaticRetryAllowed)
    throw Error('Resultatet behöver kontrolleras på nytt')
   setView(next);setPendingRequestId(null);setConfirmed(false)
  }catch{setError('Noteringen kunde inte bekräftas. Läs historiken eller försök spara samma notering igen.')}
  finally{setBusy(false)}
 }
 async function reload(){
  if(busy)return
  setBusy(true);setError('')
  try{
   const next=await readHistory()
   if(next.providerOutcome!=='unknown'||next.canFinalize||next.canPublish||next.automaticRetryAllowed)
    throw Error('Invalid state')
   setView(next)
  }catch{setError('Kunde inte läsa granskningshistoriken.')}
  finally{setBusy(false)}
 }
 const change=(value:Observation)=>{
  setObservation(value);setConfirmed(false);setPendingRequestId(null)
 }
 return <section aria-label="Granska Facebook-publicering med operatörskontroll">
  <h3>Registrera din Facebook-granskning</h3>
  <p><strong>Meta-resultat: ej verifierat</strong> · Intern status: {view.publicationState}</p>
  <p>{view.instruction}</p>
  <p>Det här är bara en personlig granskningsnotering. Den bekräftar inte ett Meta-kvitto och skickar inget nytt inlägg.</p>
  <h4>Tidigare observationer</h4>
  {view.history.length? <ol>{view.history.map(entry=>
   <li key={entry.eventId}>
    <strong>{entry.observationLabel}</strong> · {entry.recordedLabel}
    <p>Operatör: {entry.operatorId.slice(-8)}
    {entry.candidateId?' · Möjlig kandidat: '+entry.candidateId:''}
    {' · Inte verifierat av Meta'}</p>
   </li>)}</ol>:<p>Inga tidigare observationer registrerade.</p>}
  {view.limitReached&&<p>Visar de 25 senaste observationerna; äldre poster kan finnas.</p>}
  <button type="button" disabled={busy} onClick={()=>void reload()}>Läs om historiken</button>
  <form onSubmit={event=>void submit(event)}>
   <fieldset disabled={busy||!safe}>
    <legend>Vad har du observerat?</legend>
    {(['possible_match_observed','no_match_observed','review_deferred'] as const).map(value=>
     <label key={value} style={{display:'block'}}>
      <input name="operator-observation" type="radio" checked={observation===value}
       onChange={()=>change(value)}/>{labels[value]}
     </label>)}
    {observation==='possible_match_observed'&&<label>
     Facebook-inläggets ID (sida_inlägg)
     <input value={candidate} onChange={event=>{
      setCandidate(event.target.value);setConfirmed(false);setPendingRequestId(null)
     }} placeholder="12345_67890"/>
    </label>}
    <label style={{display:'block'}}>
     <input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>
     Jag har själv gjort denna observation och förstår att den inte verifierar någon publicering.
    </label>
    <button type="submit" disabled={!confirmed||!matched||!safe||busy}>
     {busy?'Sparar…':'Spara min granskningsnotering'}
    </button>
   </fieldset>
  </form>
  {error&&<p role="status">{error}</p>}
  <p><strong>Automatisk ompublicering är spärrad.</strong> Bekräfta publicering är inte möjligt i denna vy.</p>
 </section>
}
