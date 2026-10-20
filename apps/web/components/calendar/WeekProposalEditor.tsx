'use client';
import {useState} from 'react';
import type {CalendarWeekModel} from '@/lib/calendar/types';
import {stockholmMinute} from '@/lib/calendar/time';
import {proposeCalendarWeek} from '@/lib/calendar/week-proposal';
import {adjustWeekProposal} from '@/lib/calendar/week-adjust';
import styles from './Calendar.module.css';
export function WeekProposalEditor({model}:{model:CalendarWeekModel}){
 const initial=proposeCalendarWeek(model);
 const [proposals,setProposals]=useState(initial.proposals);
 const [edits,setEdits]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState('');
 return <details className={styles.unscheduled}><summary>F?rslag p? veckoplan (granska f?rst)</summary>
  <p className={styles.unscheduledIntro}>Flytta f?reslagna arbetspass och granska resultatet. ?ndringarna ?r endast ett utkast: inget bokas och inget godk?nns h?r.</p>
  {initial.blocked?<p className={styles.unscheduledIntro}>Planering pausad: alla kalenderk?llor beh?ver vara tillg?ngliga.</p>:proposals.length===0?<p className={styles.unscheduledIntro}>Inga aktuella uppgifter att f?resl? f?r den h?r veckan.</p>:proposals.map(item=><div className={styles.unscheduledItem} key={item.taskId}>
   <div className={styles.unscheduledBody}><div className={styles.unscheduledMeta}><span>{model.projects.find(p=>p.id===item.projectId)?.name??'Projekt'}</span><span>{new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(item.startUtc))}</span></div><strong>{item.title}</strong><label className={styles.unscheduledEditLabel}>F?reslagen starttid <input aria-label={'Flytta '+item.title} type="datetime-local" value={edits[item.taskId]??stockholmMinute(item.startUtc)} onChange={e=>setEdits(v=>({...v,[item.taskId]:e.target.value}))}/></label></div>
   <button type="button" onClick={()=>{const result=adjustWeekProposal(model,proposals,item.taskId,edits[item.taskId]??stockholmMinute(item.startUtc));if(!result.ok){setNotice(result.reason==='CONFLICT'?'Tiden krockar med en annan h?ndelse.':'V?lj en giltig ledig vardagstid inom veckan, kl. 09?17.');return;}setProposals(result.proposals);setNotice('F?rslaget ?ndrades endast i denna vy. Inget har bokats.');}}>Flytta f?rslag</button>
  </div>)}
  {notice&&<p role="status" className={styles.unscheduledIntro}>{notice}</p>}
 </details>;
}
