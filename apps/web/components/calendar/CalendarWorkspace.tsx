'use client';
import {CalendarDays,ChevronLeft,ChevronRight,Plus} from 'lucide-react';
import type {CalendarWeekModel} from '@/lib/calendar/types';
import {addCalendarDays} from '@/lib/calendar/time';
import {WeekProposalEditor} from './WeekProposalEditor';
import {useCalendarWorkspace} from './use-calendar';
import {CalendarWeek} from './CalendarWeek';
import {CalendarEventPanel} from './CalendarEventPanel';
import {CalendarDecisions} from './CalendarDecisions';
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
 const oldAtlasTasks=s.model.unscheduledTasks.filter(task=>task.source==='dream'&&task.createdAt&&Date.parse(task.createdAt)<Date.now()-30*86400000);
 const currentTasks=s.model.unscheduledTasks.filter(task=>!oldAtlasTasks.includes(task));
 return <main className={styles.workspace} data-week={s.week}>
  <header className={styles.header}><div className={styles.heading}><span className={styles.pageIcon}><CalendarDays size={23}/></span><div><p className={styles.eyebrow}>DIN VECKA</p><h1>Kalender</h1></div></div><p className={styles.lede}>Plats för jobbet. Tid för livet.</p></header>
  <div className={styles.toolbar}><div className={styles.weekControls}><div className={styles.arrows}><button type="button" className={styles.iconButton} aria-label="Föregående vecka" onClick={s.previous}><ChevronLeft size={19}/></button><button type="button" className={styles.iconButton} aria-label="Nästa vecka" onClick={s.next}><ChevronRight size={19}/></button></div><button type="button" className={styles.secondaryButton} onClick={s.today}>Idag</button><div className={styles.rangeLabel}><strong>{format(s.week)} – {format(addCalendarDays(s.week,6))}</strong><span>Vecka {weekNumber} · svensk tid</span></div></div>
   <div className={styles.toolbarActions}><label className={styles.filterLabel}><span className={styles.srOnly}>Visa i kalendern</span><select aria-label="Visa i kalendern" value={s.filter} onChange={e=>s.setFilter(e.target.value)}><option value="all">Alla händelser</option><option value="private">Privat</option>{s.model.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button type="button" className={styles.primaryButton} disabled={!s.sessionReady} onClick={()=>s.form?s.resume():s.newEvent()}><Plus size={17}/>{s.form?'Fortsätt utkast':'Ny händelse'}</button></div>
  </div>
  {(s.notice||(!s.loading&&!s.readError&&(unavailable.length>0||truncated)))&&<div className={styles.notices} role="status">{s.notice&&<p>{s.notice}</p>}{!s.loading&&!s.readError&&unavailable.length>0&&<p>Kunde inte läsa {unavailable.join(', ')}. Dina övriga händelser visas.</p>}{truncated&&<p>Alla poster ryms inte i den här hämtningen. Öppna källan för hela listan.</p>}</div>}
  {s.readError&&<div className={styles.error} role="alert">{s.readError} <button type="button" onClick={s.reload}>Försök igen</button></div>}
  <div className={styles.calendarWrap} aria-busy={s.loading}>{s.loading&&<span className={styles.loading}>Läser veckan…</span>}<CalendarWeek entries={entries} range={s.range} projects={s.model.projects} selectedDay={s.selectedDay} onDay={s.setSelectedDay} onSelect={s.selectEntry} onCreate={s.newEvent}/></div>
  {s.sessionReady&&<CalendarDecisions week={s.week} projectId={s.filter} userId={userId}/>}
  <footer className={styles.footer}><span><i/> Privat</span>{s.model.projects.map(project=><span key={project.id}><i style={{background:project.color}}/>{project.name}</span>)}<small>Privata bokningar och projektens scheman.</small></footer>
  {currentTasks.length>0&&<details className={styles.unscheduled}><summary>Oplanerade projektuppgifter ({currentTasks.length})</summary><p className={styles.unscheduledIntro}>Uppgifter från projektens arbetslistor som ännu inte fått en tid i din kalender. Det här är inte nya beslut från Atlas och uppgifterna behöver inte höra till den valda veckan.</p>{currentTasks.slice(0,8).map(task=>{const project=s.model.projects.find(p=>p.id===task.projectId);const status=({pending:'Väntar',in_progress:'Pågår',done:'Klar',failed:'Misslyckad',cancelled:'Avbruten'} as Record<string,string>)[task.status]??'Status okänd';const trimmed=task.title.trim();const short=trimmed.length>110?trimmed.slice(0,107).trimEnd()+'…':trimmed;return <div key={task.id} className={styles.unscheduledItem}><div className={styles.unscheduledBody}><div className={styles.unscheduledMeta}><span>{project?.name??'Projekt'}</span><span>{status}</span></div><strong>{short}</strong>{short!==trimmed&&<details className={styles.unscheduledOriginal}><summary>Visa hela uppgiften</summary><p>{trimmed}</p></details>}</div><button type="button" onClick={()=>s.newEvent(s.selectedDay,9*60,task)}>Planera tid</button></div>})}</details>}

  {oldAtlasTasks.length>0&&<details className={styles.unscheduled}><summary>Äldre förslag från Atlas ({oldAtlasTasks.length})</summary><p className={styles.unscheduledIntro}>Skapade av Atlas minnesanalys för mer än 30 dagar sedan. De kan fortfarande vara öppna, men är inte automatiskt prioriterade för den här veckan. Granska innan du planerar tid; inget har raderats.</p>{oldAtlasTasks.slice(0,8).map(task=><div key={task.id} className={styles.unscheduledItem}><div className={styles.unscheduledBody}><div className={styles.unscheduledMeta}><span>{s.model.projects.find(p=>p.id===task.projectId)?.name??'Projekt'}</span><span>{task.createdAt?new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'short',day:'numeric'}).format(new Date(task.createdAt)):''}</span></div><strong>{task.title.length>110?task.title.slice(0,107)+'…':task.title}</strong><details className={styles.unscheduledOriginal}><summary>Visa original och status</summary><p>{task.title}</p><p>Status: {task.status}</p></details></div><button type="button" onClick={()=>s.newEvent(s.selectedDay,9*60,task)}>Planera tid</button></div>)}</details>}
  <WeekProposalEditor key={s.week} model={s.model}/>
  {s.panelOpen&&<CalendarEventPanel state={s}/>}
 </main>;
}
