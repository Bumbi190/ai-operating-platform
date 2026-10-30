'use client';
import {useEffect,useRef,useState} from 'react';
import type {CalendarEntry,CalendarRange,CalendarWeekModel} from '@/lib/calendar/types';
import {layoutCalendarWeek} from '@/lib/calendar/layout';
import {stockholmDate,stockholmMinute} from '@/lib/calendar/time';
import {calendarProgress,calendarResponsibility} from '@/lib/calendar/progress';
import styles from './Calendar.module.css';
const dateLabel=(date:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('sv-SE',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export function calendarStatus(entry:CalendarEntry):string {
 return calendarProgress(entry).label;
}
export function CalendarWeek({entries,range,projects,selectedDay,onDay,onSelect,onCreate}:{entries:CalendarEntry[];range:CalendarRange;projects:CalendarWeekModel['projects'];selectedDay:string;onDay:(date:string)=>void;onSelect:(entry:CalendarEntry)=>void;onCreate:(date:string,minute:number)=>void}){
 const proposals=entries.filter(e=>e.pendingChange).map<CalendarEntry>(e=>({...e,id:e.id+':proposal',title:'Tidsförslag · '+e.title,time:e.pendingChange!.time,status:'proposal',pendingChange:null}));
 const displayed=[...entries,...proposals],originals=new Map(entries.map(e=>[e.id,e]));
 const layout=layoutCalendarWeek(displayed,range),byId=new Map(displayed.map(e=>[e.id,e])),scroll=useRef<HTMLDivElement>(null);
 const [now,setNow]=useState(()=>new Date().toISOString());
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date().toISOString()),60000);return()=>clearInterval(timer);},[]);
 const today=stockholmDate(now),local=stockholmMinute(now),nowMinute=Number(local.slice(11,13))*60+Number(local.slice(14,16));
 useEffect(()=>{if(scroll.current)scroll.current.scrollTop=8*60;},[range.fromDate]);
 const accent=(entry:CalendarEntry)=>entry.projectId?projects.find(p=>p.id===entry.projectId)?.color??'#85a6ff':'#92cce7';
 const renderEntry=(entry:CalendarEntry,slot?:{startMinute:number;endMinute:number;column:number;columnCount:number;isPoint:boolean})=>{
  const original=originals.get(entry.id)??originals.get(entry.id.replace(/:proposal$/,''))??entry;
  const proposed=original.id!==entry.id;
  const progress=calendarProgress(entry),responsibility=calendarResponsibility(entry);
  const time=entry.time.kind==='timed'?stockholmMinute(entry.time.startUtc).slice(11,16):entry.displayLabel??'Heldag';
  return <button key={entry.id} type="button" className={styles.event+(slot?.isPoint?' '+styles.point:'')+(entry.status==='cancelled'?' '+styles.cancelled:'')} style={{'--event-accent':accent(entry),...(slot?{top:slot.startMinute,height:Math.max(23,slot.endMinute-slot.startMinute),left:'calc('+slot.column+'/'+slot.columnCount+' * 100% + 3px)',width:'calc(100% / '+slot.columnCount+' - 6px)'}:{})} as React.CSSProperties}
   data-event-id={original.id} data-proposal={proposed} data-start-utc={entry.time.kind==='timed'?entry.time.startUtc:''} data-end-utc={entry.time.kind==='timed'?entry.time.endUtc??'':''} data-status={entry.status} data-columns={slot?.columnCount??1} onClick={e=>{e.stopPropagation();onSelect(original)}} aria-label={entry.title+' · '+time+' · '+calendarStatus(entry)}>
   <span className={styles.statusDot} data-tone={progress.tone} title={progress.label} aria-hidden="true"/>
   <span className={styles.eventTitle}>{entry.title}</span><span className={styles.eventMeta}>{time}{slot?.isPoint?' · sluttid saknas':''} · {progress.label}{responsibility?' · '+responsibility:''}</span>{entry.pendingChange&&<span className={styles.pending}>Ny tid föreslagen</span>}{slot&&slot.columnCount>1&&<span className={styles.conflict}>Överlapp</span>}
  </button>;
 };
 return <section className={styles.calendar} aria-label="Veckokalender">
  <div className={styles.statusLegend} aria-label="Kalenderstatus">{[['waiting','Väntar eller pågår'],['review','Behöver granskas'],['success','Klart'],['error','Fel eller spärrat']].map(([tone,label])=><span key={tone}><i className={styles.statusDot} data-tone={tone} aria-hidden="true"/>{label}</span>)}</div>
  <div className={styles.mobileDays} aria-label="Välj dag">{layout.days.map(day=><button type="button" key={day.date} aria-label={dateLabel(day.date,{weekday:'long',day:'numeric'})} aria-pressed={selectedDay===day.date} onClick={()=>onDay(day.date)}><span>{dateLabel(day.date,{weekday:'short'})}</span><strong>{Number(day.date.slice(8))}</strong></button>)}</div>
  <div className={styles.weekHeader}><div className={styles.zone}>svensk tid</div>{layout.days.map(day=><div key={day.date} className={styles.dayHeader} data-active={selectedDay===day.date} data-today={today===day.date}><span>{dateLabel(day.date,{weekday:'long'})}</span><strong>{Number(day.date.slice(8))}</strong></div>)}</div>
  <div className={styles.allDayRow}><div className={styles.allDayLabel}>Heldag</div>{layout.days.map(day=><div key={day.date} data-date={day.date} data-active={selectedDay===day.date} className={styles.allDayCell}>{day.allDay.map(entry=>renderEntry(entry))}</div>)}</div>
  <div className={styles.timeScroll} ref={scroll}><div className={styles.timeGrid}><div className={styles.hours}>{Array.from({length:24},(_,hour)=><span key={hour} style={{top:hour*60}}>{String(hour).padStart(2,'0')}:00</span>)}</div>
   {layout.days.map(day=><div key={day.date} className={styles.dayColumn} data-date={day.date} data-active={selectedDay===day.date} tabIndex={0} role="button" aria-label={'Boka tid '+dateLabel(day.date,{weekday:'long',day:'numeric'})} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onCreate(day.date,9*60)}}} onClick={e=>{if(e.target!==e.currentTarget)return;const rect=e.currentTarget.getBoundingClientRect();onCreate(day.date,Math.min(1410,Math.max(0,Math.floor((e.clientY-rect.top)/30)*30)));}}>
    {day.timed.map(slot=>{const entry=byId.get(slot.entryId);return entry?renderEntry(entry,slot):null})}
    {today===day.date&&<div className={styles.now} style={{top:nowMinute}} aria-label="Aktuell tid"/>}
   </div>)}
  </div></div>
 </section>;
}
