'use client';
import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import {CalendarTimePicker} from './CalendarTimePicker';
import {stockholmMinute,stockholmDate} from '@/lib/calendar/time';
import {calendarStatus} from './CalendarWeek';
import {calendarProgress,calendarResponsibility} from '@/lib/calendar/progress';
import type {CalendarWorkspaceState} from './use-calendar';
import styles from './Calendar.module.css';
export function CalendarEventPanel({state:s}:{state:CalendarWorkspaceState}){
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  panel.current?.querySelector<HTMLElement>('input,button,a')?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();s.closePanel();}};
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('keydown',escape);previous?.focus();};
 },[]);
 const f=s.form,source=s.selected?.source.kind,manual=!source||source==='manual',social=source==='social';
 const field=(key: keyof NonNullable<typeof f>,value:string|boolean)=>s.patchForm({[key]:value});
 const shownTime=s.selected?.time;
 return <aside className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="calendar-panel-title" ref={panel}>
  <div className={styles.panelTop}><div><p className={styles.eyebrow}>{social?'Publicering':s.selected?'Kalenderhändelse':'Ny kalenderhändelse'}</p><h2 id="calendar-panel-title">{s.selected?.title??'Boka en stund'}</h2></div><button type="button" aria-label="Stäng panel" className={styles.iconButton} onClick={s.closePanel}><X size={20}/></button></div>
  {s.selected&&<div className={styles.sourceSummary}><span>{calendarStatus(s.selected)}</span>{shownTime?.kind==='timed'?<p>{stockholmMinute(shownTime.startUtc).replace('T',' kl ')}{shownTime.endUtc?' – '+stockholmMinute(shownTime.endUtc).replace('T',' kl '):' · sluttid saknas'}</p>:shownTime?.kind==='all_day'?<p>Heldag från {shownTime.startDate}</p>:null}
   {calendarResponsibility(s.selected)&&<p>Utförs av: {calendarResponsibility(s.selected)}</p>}
   {calendarProgress(s.selected).needsAttention&&<p>Öppna källan nedan för att granska läget och nästa steg.</p>}
   {s.selected.pendingChange&&<p>Föreslagen tid: {s.selected.pendingChange.time.kind==='timed'?stockholmMinute(s.selected.pendingChange.time.startUtc).replace('T',' kl '):s.selected.pendingChange.time.startDate}</p>}
  </div>}
  {social&&<p className={styles.help}>Den godkända tiden gäller tills det nya tidsförslaget har granskats.</p>}
  {f&&(manual||social)&&<form className={styles.form} onSubmit={e=>{e.preventDefault();void s.save();}}>
   <fieldset disabled={s.editorSaving} style={{display:'contents'}}>
   {manual&&<>
    <label>Titel<input aria-label="Titel" maxLength={150} required value={f.title} onChange={e=>field('title',e.target.value)}/></label>
    <label>Typ<select value={f.kind} onChange={e=>field('kind',e.target.value)}><option value="private">Privat möte</option><option value="work_block">Arbetsblock</option></select></label>
    <label>Projekt<select value={f.projectId} onChange={e=>field('projectId',e.target.value)}><option value="">Utan projekt</option>{s.model.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    {f.kind==='work_block'&&<label>Arbetsstatus<select value={f.workStatus} onChange={e=>field('workStatus',e.target.value)}><option value="planned">Planerat</option><option value="in_progress">Pågår</option><option value="done">Klart</option></select></label>}
    <label className={styles.checkbox}><input type="checkbox" checked={f.allDay} onChange={e=>field('allDay',e.target.checked)}/>Heldag</label>
   </>}
   <div className={styles.formRow}><label>Datum<input aria-label="Datum" type="date" required value={f.startDate} onChange={e=>field('startDate',e.target.value)}/></label>{!f.allDay&&<CalendarTimePicker label="Starttid" value={f.startTime} onChange={value=>field('startTime',value)} disabled={s.editorSaving}/>}</div>
   {manual&&<>
    {!f.allDay&&<label className={styles.checkbox}><input type="checkbox" checked={f.noEnd} onChange={e=>field('noEnd',e.target.checked)}/>Ingen sluttid</label>}
    {(f.allDay||!f.noEnd)&&<div className={styles.formRow}><label>{f.allDay?'Sista dag':'Slutdatum'}<input aria-label={f.allDay?'Sista dag':'Slutdatum'} type="date" required value={f.endDate} onChange={e=>field('endDate',e.target.value)}/></label>{!f.allDay&&<CalendarTimePicker label="Sluttid" value={f.endTime} onChange={value=>field('endTime',value)} disabled={s.editorSaving}/>}</div>}
    <label>Upprepning<select aria-label="Upprepning" value={f.repeat} onChange={e=>field('repeat',e.target.value)}><option value="none">Ingen</option><option value="daily">Varje dag</option><option value="weekly">Varje vecka</option></select></label>
    {f.repeat!=='none'&&<><label>Upprepa till (valfritt)<input aria-label="Upprepa till" type="date" min={f.startDate} value={f.repeatUntil} onChange={e=>field('repeatUntil',e.target.value)}/></label><button type="button" className={styles.secondaryButton} disabled={s.editorSaving||stockholmDate(new Date().toISOString())<f.startDate} onClick={()=>field('repeatUntil',stockholmDate(new Date().toISOString()))}>Avsluta upprepning efter idag</button><p className={styles.help}>Tidigare tillfällen behålls. Spara för att avsluta serien. Välj Ingen om du vill göra om den till ett engångsmöte.</p></>}
    <label>Plats<input maxLength={500} value={f.location} onChange={e=>field('location',e.target.value)}/></label>
    <label>Anteckning<textarea rows={4} maxLength={5000} value={f.description} onChange={e=>field('description',e.target.value)}/></label>
   </>}
   </fieldset>
   {s.saveError&&<p className={styles.error} role="alert">{s.saveError}</p>}
   <button type="submit" className={styles.primaryButton} disabled={s.saving}>{s.saving?'Sparar…':social?'Föreslå ny tid':'Spara'}</button>
   {s.selected?.source.kind==='manual'&&<button type="button" className={styles.secondaryButton} disabled={s.saving} onClick={()=>void s.changeStatus(s.selected?.status==='cancelled'?'restore':'cancel')}>{s.selected.status==='cancelled'?'Återställ händelse':'Avboka händelse'}</button>}
   <button type="button" className={styles.textButton} onClick={s.discard}>Kasta utkast</button>
  </form>}
  {!f&&s.saveError&&<p className={styles.error} role="alert">{s.saveError}</p>}
  {s.selected?.href&&<a className={styles.sourceLink} href={s.selected.href}>{social||source==='monthly'?'Öppna granskningen':'Visa arbetsflödet'} <span aria-hidden="true">↗</span></a>}
 </aside>;
}
