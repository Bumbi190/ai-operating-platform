'use client';
import {useEffect,useRef,useState} from 'react';
import type {CalendarProductionPreview,ProductionRequirement} from '@/lib/calendar/production-preview-types';
import styles from './Calendar.module.css';
const requirements:Record<ProductionRequirement,string>={
 supported_contract:'Flödet behöver en stödd sagoplan. Öppna planeringsflödet för att kontrollera version och månad.',
 active_instance:'Flödet är avslutat. Ett aktivt flöde behövs för nytt arbete.',
 project_resumed:'Projektets körning är pausad eller kunde inte bekräftas.',
 content_generation_state:'Flödet behöver nå steget för sagogenerering.',
 execution_approval:'Ett separat körgodkännande för exakt detta jobb krävs.',
 budget_check:'Kostnad och tillgänglig budget behöver kontrolleras inför körning.',
};
export function CalendarProductionPreview({projectId,instanceId}:{projectId:string;instanceId:string}){
 const [preview,setPreview]=useState<CalendarProductionPreview|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 async function load(){
  pending.current?.abort();const controller=new AbortController();pending.current=controller;
  setPreview(null);setError(false);setLoading(true);
  try{
   const query=new URLSearchParams({projectId,instanceId});
   const response=await fetch('/api/calendar/production-preview?'+query,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new Error('unavailable');
   const body=await response.json();if(!body.ok||!body.preview)throw new Error('unavailable');
   if(!controller.signal.aborted)setPreview(body.preview);
  }catch{if(!controller.signal.aborted)setError(true);}
  finally{if(!controller.signal.aborted)setLoading(false);}
 }
 return <section aria-label="Produktionsjobb" className={styles.sourceSummary}>
  <button type="button" className={styles.secondaryButton} disabled={loading} onClick={()=>void load()}>{loading?'Hämtar produktionsjobb…':preview?'Uppdatera produktionsjobb':error?'Försök igen':'Granska produktionsjobb'}</button>
  {loading&&<p role="status">Hämtar den sparade sagoplanen…</p>}
  {error&&<p role="alert">Produktionsjobbet kunde inte hämtas. Försök igen.</p>}
  {preview&&<div>
   <h3>{preview.title}</h3>
   <p>Förhandsgranskning. Kalenderns arbetstid är en planerad tid; inget jobb startas här.</p>
   {preview.brief&&<>
    <p><strong>{preview.brief.month} · {preview.brief.theme}</strong></p>
    <p>{preview.brief.language} · {preview.brief.audience.min_age}–{preview.brief.audience.max_age} år</p>
    <p>{preview.brief.pages.total_pages} sidor totalt: {preview.brief.pages.cover_pages} omslag, {preview.brief.pages.content_pages} innehållssidor och {preview.brief.pages.closing_pages} avslut.</p>
   </>}
   {preview.state&&<p>Aktuellt steg: {preview.state}</p>}
   {preview.checks.length>0&&<><h4>Resultatkontroller</h4><ul>{preview.checks.map(check=><li key={check.key}>{check.label}: {check.status==='satisfied'?'bekräftat':check.status==='pending'?'väntar på resultat':'behöver kontrolleras'}</li>)}</ul></>}
   <p>Kostnad: ännu inte fastställd.</p>
   <h4>Före körning</h4><ul>{preview.requirements.map(key=><li key={key}>{requirements[key]}</li>)}</ul>
   <p>Körgodkännande och start från kalendern är ännu inte tillgängliga. Sagan behöver också granskas före fortsatt produktion och publicering.</p>
  </div>}
 </section>;
}
