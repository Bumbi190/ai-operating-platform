'use client';
import {useEffect,useState} from 'react';
import {X,Scale,ChevronRight} from 'lucide-react';
import type {CalendarDecisionSummary} from '@/lib/calendar/decision-projection';
import styles from './Calendar.module.css';
type Detail={decisionId:string;title:string;status:string;statement:string;rationale:string|null;expectedImpact:string|null;outcome:unknown;review:{description:string;dueAt:string|null}|null;decidedAt:string|null;lastRecordAt:string};
export function CalendarDecisions({week,projectId,userId}:{week:string;projectId:string;userId:string}){
 const [records,setRecords]=useState<CalendarDecisionSummary[]>([]);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [truncated,setTruncated]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [detail,setDetail]=useState<Detail|null>(null);
 const [detailError,setDetailError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();setRecords([]);setStatus('loading');setSelected(null);setDetail(null);
  const end=new Date(week+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
  fetch('/api/calendar/decisions?fromDate='+week+'&toDateExclusive='+end.toISOString().slice(0,10),{signal:controller.signal,cache:'no-store'})
   .then(async res=>{if(!res.ok)throw Error();return res.json()})
   .then(result=>{if(controller.signal.aborted)return;setRecords(Array.isArray(result.decisions)?result.decisions:[]);setTruncated(result.truncated===true);setStatus(result.available===false?'error':'ready')})
   .catch(()=>{if(!controller.signal.aborted)setStatus('error')});
  return()=>controller.abort();
 },[week,userId]);
 useEffect(()=>{
  if(!selected)return;
  const controller=new AbortController();setDetail(null);setDetailError(false);
  fetch('/api/calendar/decisions?decisionId='+encodeURIComponent(selected),{signal:controller.signal,cache:'no-store'})
   .then(async res=>{if(!res.ok)throw Error();return res.json()})
   .then(data=>{if(!controller.signal.aborted)setDetail(data.decision)})
   .catch(()=>{if(!controller.signal.aborted)setDetailError(true)});
  return()=>controller.abort();
 },[selected,userId]);
 const visible=records.filter(r=>projectId==='all'||r.projectId===projectId);
 const local=(utc:string)=>new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(utc));
 return <section className={styles.decisionSection} aria-label="Atlas beslut">
  <div className={styles.decisionHeader}><Scale size={16}/><strong>Atlas beslut den här veckan</strong><span>{visible.length}</span></div>
  {status==='loading'&&<p role="status">Läser beslut…</p>}
  {status==='error'&&<p role="alert">Beslutshistoriken kunde inte läsas fullständigt. Öppna Atlas för kontroll.</p>}
  {truncated&&<p>Visningen är begränsad. Alla historiska beslut visas inte här.</p>}
  {status!=='loading'&&visible.length===0&&<p>Inga beslut att visa för den valda veckan.</p>}
  {visible.map(record=><button type="button" className={styles.decisionItem} key={record.id} onClick={()=>setSelected(record.sourceId)}><span><strong>{record.title}</strong><small>{local(record.occurredAt)} · {record.status} · {record.hasOutcome?'Utfall finns':'Inget utfall registrerat'}</small></span><ChevronRight size={16}/></button>)}
  {selected&&<aside className={styles.decisionDetail} role="dialog" aria-label="Beslutsdetaljer"><div className={styles.decisionHeader}><strong>Atlas beslutsunderlag</strong><button type="button" className={styles.iconButton} aria-label="Stäng beslutsdetaljer" onClick={()=>setSelected(null)}><X size={18}/></button></div>
   {detailError&&<p role="alert">Det här beslutet kunde inte hämtas eller är inte tillgängligt för dig.</p>}
   {!detail&&!detailError&&<p>Läser beslutsunderlag…</p>}
   {detail&&<div className={styles.decisionBody}><h3>{detail.title}</h3><p><b>Status:</b> {detail.status}</p><p><b>Beslut:</b> {detail.statement}</p><p><b>Motivering:</b> {detail.rationale||'Ingen motivering registrerad'}</p><p><b>Förväntad effekt:</b> {detail.expectedImpact||'Ej registrerad'}</p><p><b>Observerat utfall:</b> {detail.outcome&&typeof detail.outcome==='object'&&'summary' in detail.outcome?String(detail.outcome.summary):'Inget utfall registrerat ännu'}</p>{detail.review&&<p><b>Uppföljning:</b> {detail.review.description}</p>}<small>Besluts-ID: {detail.decisionId}</small></div>}
  </aside>}
 </section>;
}
