'use client';
import {CalendarDays,ChevronLeft,ChevronRight,Plus} from 'lucide-react';
import type {CalendarWeekModel} from '@/lib/calendar/types';
import {addCalendarDays} from '@/lib/calendar/time';
import {useCalendarWorkspace} from './use-calendar';
import {CalendarWeek} from './CalendarWeek';
import {CalendarEventPanel} from './CalendarEventPanel';
import styles from './Calendar.module.css';
export function CalendarWorkspace(props:{initialWeek:CalendarWeekModel;userId:string}){return <CalendarWorkspaceBody key={props.userId} {...props}/>;}
function CalendarWorkspaceBody({initialWeek,userId}:{initialWeek:CalendarWeekModel;userId:string}){
 const s=useCalendarWorkspace(initialWeek,userId);
 const entries=s.model.entries.filter(entry=>s.filter==='all'||(s.filter==='private'?entry.source.kind==='manual'&&entry.manualEvent?.kind==='private':entry.projectId===s.filter));
 const format=(date:string)=>new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
 const weekNumber=(()=>{const d=new Date(s.week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+3);const first=new Date(Date.UTC(d.getUTCFullYear(),0,4));return 1+Math.round(((d.getTime()-first.getTime())/86400000-3+(first.getUTCDay()+6)%7)/7);})();
 const sourceNames={manual:'den privata kalendern',social:'sociala publiceringar',workflows:'arbetsflöden',tasks:'uppgifter'};
 const unavailable=Object.entries(s.model.availability).filter(([,ok])=>!ok).map(([key])=>sourceNames[key as keyof typeof sourceNames]);
 const truncated=Object.values(s.model.truncated).some(Boolean);
 return <main className={styles.workspace} data-week={s.week}>
  <header className={styles.header}><div className={styles.heading}><span className={styles.pageIcon}><CalendarDays size={23}/></span><div><p className={styles.eyebrow}>DIN VECKA</p><h1>Kalender</h1></div></div><p className={styles.lede}>Plats för jobbet. Tid för livet.</p></header>
  <div className={styles.toolbar}><div className={styles.weekControls}><div className={styles.arrows}><button type="button" className={styles.iconButton} aria-label="Föregående vecka" onClick={s.previous}><ChevronLeft size={19}/></button><button type="button" className={styles.iconButton} aria-label="Nästa vecka" onClick={s.next}><ChevronRight size={19}/></button></div><button type="button" className={styles.secondaryButton} onClick={s.today}>Idag</button><div className={styles.rangeLabel}><strong>{format(s.week)} – {format(addCalendarDays(s.week,6))}</strong><span>Vecka {weekNumber} · svensk tid</span></div></div>
   <div className={styles.toolbarActions}><label className={styles.filterLabel}><span className={styles.srOnly}>Visa i kalendern</span><select aria-label="Visa i kalendern" value={s.filter} onChange={e=>s.setFilter(e.target.value)}><option value="all">Alla händelser</option><option value="private">Privat</option>{s.model.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button type="button" className={styles.primaryButton} disabled={!s.sessionReady} onClick={()=>s.form?s.resume():s.newEvent()}><Plus size={17}/>{s.form?'Fortsätt utkast':'Ny händelse'}</button></div>
  </div>
  {(s.notice||(!s.loading&&!s.readError&&(unavailable.length>0||truncated)))&&<div className={styles.notices} role="status">{s.notice&&<p>{s.notice}</p>}{!s.loading&&!s.readError&&unavailable.length>0&&<p>Kunde inte läsa {unavailable.join(', ')}. Dina övriga händelser visas.</p>}{truncated&&<p>Alla poster ryms inte i den här hämtningen. Öppna källan för hela listan.</p>}</div>}
  {s.readError&&<div className={styles.error} role="alert">{s.readError} <button type="button" onClick={s.reload}>Försök igen</button></div>}
  <div className={styles.calendarWrap} aria-busy={s.loading}>{s.loading&&<span className={styles.loading}>Läser veckan…</span>}<CalendarWeek entries={entries} range={s.range} projects={s.model.projects} selectedDay={s.selectedDay} onDay={s.setSelectedDay} onSelect={s.selectEntry} onCreate={s.newEvent}/></div>
  <footer className={styles.footer}><span><i/> Privat</span>{s.model.projects.map(project=><span key={project.id}><i style={{background:project.color}}/>{project.name}</span>)}<small>Privata bokningar och projektens scheman.</small></footer>
  {s.model.unscheduledTasks.length>0&&<details className={styles.unscheduled}><summary>Uppgifter utan bestämd tid ({s.model.unscheduledTasks.length})</summary>{s.model.unscheduledTasks.slice(0,8).map(task=><div key={task.id}><span>{task.title}</span><button type="button" onClick={()=>s.newEvent(s.selectedDay,9*60,task)}>Boka tid</button></div>)}</details>}
  {s.panelOpen&&<CalendarEventPanel state={s}/>}
 </main>;
}
