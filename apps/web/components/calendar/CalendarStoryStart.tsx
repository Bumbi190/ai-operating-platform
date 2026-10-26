'use client';
import {useEffect,useRef,useState} from 'react';
import type {StoryJobReview,StoryJobReceipt} from '@/lib/calendar/production-start-types';
import styles from './Calendar.module.css';
const statusText:Record<StoryJobReceipt['status'],string>={pending:'Godkänt och lagt i kö. Sagan är ännu inte skapad.',running:'Atlas arbetar med sagan.',succeeded:'Sagojobbet är klart. Resultatet behöver granskas före fortsatt produktion.',failed:'Jobbet avslutades utan ett bekräftat färdigt resultat.',cancelled:'Jobbet har avbrutits.',needs_review:'Resultatet är osäkert och behöver granskas. Starta inte en ny körning innan det har retts ut.'};
const errors:Record<string,string>={configuration:'Sagokörning är inte aktiverad i den här miljön.',not_ready:'Jobbet kan inte startas nu. Kontrollera paus, flödets steg och eventuella pågående jobb.',changed:'Planen eller kostnaden har ändrats. Hämta en ny granskning innan du godkänner.',expired:'Granskningen har gått ut. Hämta en ny granskning.',UNAUTHORIZED:'Logga in igen för att granska jobbet.',NOT_FOUND:'Jobbet kunde inte hittas för ditt projekt.'};
export function CalendarStoryStart({projectId,instanceId}:{projectId:string;instanceId:string}){
 const [review,setReview]=useState<StoryJobReview|null>(null),[receipt,setReceipt]=useState<StoryJobReceipt|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const key=useRef<string|null>(null),pending=useRef<AbortController|null>(null);
 useEffect(()=>{void submit('status');return()=>pending.current?.abort();},[]);
 async function submit(operation:'prepare'|'approve'|'status',fresh=false){
  pending.current?.abort();const controller=new AbortController();pending.current=controller;
  setBusy(true);setError(null);
  if(operation==='prepare'){setConsent(false);if(fresh)key.current=null;key.current??=crypto.randomUUID();}
  const knownId=receipt?.requestId??review?.requestId;
  const body=operation==='prepare'?{operation,projectId,instanceId,requestKey:key.current}:operation==='approve'?{operation,requestId:review?.requestId,reviewedHash:review?.reviewedHash}:knownId?{operation,requestId:knownId}:{operation,projectId,instanceId};
  try{
   const response=await fetch('/api/calendar/production-start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
   const value=await response.json();
   if(!response.ok||!value.ok){if(!controller.signal.aborted)setError(errors[value.code]??'Svaret kunde inte bekräftas. Försök igen med samma jobb; det skapar inte en extra körning.');return;}
   if(controller.signal.aborted)return;
   if(value.review){setReview(value.review);setReceipt(value.review.receipt??null);}
   else if(value.receipt)setReceipt(value.receipt);
  }catch{if(!controller.signal.aborted)setError('Svaret kunde inte bekräftas. Försök igen med samma jobb; det skapar inte en extra körning.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <section aria-label="Körgodkännande">
  <h4>Körgodkännande</h4>
  {!review&&!receipt&&<button type="button" className={styles.secondaryButton} disabled={busy} onClick={()=>void submit('prepare')}>Förbered körgodkännande</button>}
  {review&&!receipt&&<>
   <p><strong>{review.month} · {review.theme}</strong></p>
   <p>Leverantör: {review.provider}. Modell: {review.model}.</p>
   <p>Högsta tillåtna reservation: <strong>{Number(review.maximumSek).toLocaleString('sv-SE',{minimumFractionDigits:4,maximumFractionDigits:4})} kr</strong> för ett sagojobb. Slutkostnaden kan bli lägre.</p>
   <p>Godkännandet gäller till {new Date(review.expiresAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}, svensk tid. Budget och paus kontrolleras igen före körning.</p>
   <label className={styles.checkbox}><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/>Jag godkänner detta sagojobb och kostnadstaket ovan.</label>
   <button type="button" className={styles.primaryButton} disabled={busy||!consent} onClick={()=>void submit('approve')}>Godkänn och starta</button>
   <button type="button" className={styles.textButton} disabled={busy} onClick={()=>void submit('prepare',true)}>Hämta ny granskning</button>
  </>}
  {receipt&&<><p role="status">{statusText[receipt.status]}</p><p style={{overflowWrap:'anywhere'}}>Jobb-ID: {receipt.runId}</p><button type="button" className={styles.secondaryButton} disabled={busy} onClick={()=>void submit('status')}>Uppdatera jobbstatus</button>{(receipt.status==='failed'||receipt.status==='cancelled')&&<button type="button" className={styles.secondaryButton} disabled={busy} onClick={()=>void submit('prepare',true)}>Granska en ny körning</button>}</>}
  {busy&&<p role="status">Kontrollerar jobbet…</p>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
