'use client';
import React,{useState} from 'react';
import type {CalendarWeekModel} from '@/lib/calendar/types';
import {stockholmMinute} from '@/lib/calendar/time';
import {proposeCalendarWeek} from '@/lib/calendar/week-proposal';
import {adjustWeekProposal} from '@/lib/calendar/week-adjust';
import {preflightWeekApproval} from '@/lib/calendar/week-approval';
import styles from './Calendar.module.css';

export function WeekProposalEditor({model}:{model:CalendarWeekModel}) {
 const initial=proposeCalendarWeek(model);
 const [proposals,setProposals]=useState(initial.proposals);
 const [edits,setEdits]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState('');
 function move(taskId:string,start:string){
  const result=adjustWeekProposal(model,proposals,taskId,start);
  if(!result.ok){
   const messages={CONFLICT:'Tiden krockar med en annan händelse.',INCOMPLETE_SOURCES:'Källunderlaget är ofullständigt. Ladda om kalendern.',UNKNOWN_TASK:'Uppgiften är inte längre tillgänglig.',INVALID_SLOT:'Välj en ledig vardagstid inom veckan, kl. 09–17.'};
   setNotice(messages[result.reason]);return;
  }
  setProposals(result.proposals);
  setNotice('Förslaget ändrades bara här. Ingen tid har bokats.');
 }
 function validate(){
  const result=preflightWeekApproval(model,proposals);
  setNotice(result.ok?'Förkontrollen hittade inga lokala konflikter. Ingenting har bokats.':result.reason==='INCOMPLETE_SOURCES'?'Källunderlaget behöver uppdateras innan planen kan kontrolleras.':result.reason==='CONFLICT'?'Förslaget krockar med kalendern.':'Förslaget är inte längre giltigt.');
 }
 return <details className={styles.unscheduled}>
  <summary>Förslag på veckoplan (granska först)</summary>
  <p className={styles.unscheduledIntro}>Du kan flytta föreslagna arbetspass. Detta är endast ett utkast – inget bokas, sparas eller godkänns.</p>
  {initial.blocked?<p className={styles.unscheduledIntro}>Planeringen är pausad eftersom kalenderns underlag är ofullständigt.</p>:proposals.length===0?<p className={styles.unscheduledIntro}>Inga öppna uppgifter att föreslå för den här veckan.</p>:proposals.map(item=><div className={styles.unscheduledItem} key={item.taskId}>
   <div className={styles.unscheduledBody}>
    <div className={styles.unscheduledMeta}><span>{model.projects.find(p=>p.id===item.projectId)?.name??'Projekt'}</span><span>{new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(item.startUtc))}</span></div>
    <strong>{item.title}</strong>
    <label className={styles.unscheduledEditLabel}>Föreslagen starttid <input aria-label={'Flytta '+item.title} type="datetime-local" value={edits[item.taskId]??stockholmMinute(item.startUtc)} onChange={event=>setEdits(values=>({...values,[item.taskId]:event.target.value}))}/></label>
   </div>
   <button type="button" onClick={()=>move(item.taskId,edits[item.taskId]??stockholmMinute(item.startUtc))}>Flytta förslag</button>
  </div>)}
  {!initial.blocked&&proposals.length>0&&<button type="button" onClick={validate}>Kontrollera utkast (bokar inget)</button>}
  {notice&&<p role="status" className={styles.unscheduledIntro}>{notice}</p>}
 </details>;
}
