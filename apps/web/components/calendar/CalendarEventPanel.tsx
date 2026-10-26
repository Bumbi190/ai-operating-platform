'use client';
import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';
import {CalendarTimePicker} from './CalendarTimePicker';
import {CalendarProductionPreview} from './CalendarProductionPreview';
import {CalendarContentDetail} from './CalendarContentDetail';
import type {CalendarUndatedReview} from '@/lib/calendar/types';
import {stockholmMinute,stockholmDate} from '@/lib/calendar/time';
import {calendarStatus} from './CalendarWeek';
import {calendarProgress,calendarResponsibility} from '@/lib/calendar/progress';
import type {CalendarWorkspaceState} from './use-calendar';
import styles from './Calendar.module.css';
export function CalendarEventPanel({state:s,undated}:{state:CalendarWorkspaceState;undated?:CalendarUndatedReview}){
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  panel.current?.querySelector<HTMLElement>('input,button,a')?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();s.closePanel();}};
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('keydown',escape);previous?.focus();};
 },[]);
 const f=s.form,source=undated?.source.kind??s.selected?.source.kind,manual=!source||source==='manual',social=source==='social';
 const detailSource=undated?.source??s.selected?.contentSource??s.selected?.source;
 const field=(key: keyof NonNullable<typeof f>,value:string|boolean)=>s.patchForm({[key]:value});
 const shownTime=s.selected?.time;
 return <aside className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="calendar-panel-title" ref={panel}>
  <div className={styles.panelTop}><div><p className={styles.eyebrow}>{social||source==='media'?'Publicering':s.selected?'Kalenderhändelse':'Ny kalenderhändelse'}</p><h2 id="calendar-panel-title">{undated?.title??s.selected?.title??'Boka en stund'}</h2></div><button type="button" aria-label="Stäng panel" className={styles.iconButton} onClick={s.closePanel}><X size={20}/></button></div>
  {s.selected&&<div className={styles.sourceSummary}><span>{calendarStatus(s.selected)}</span>{shownTime?.kind==='timed'?<p>{stockholmMinute(shownTime.startUtc).replace('T',' kl ')}{shownTime.endUtc?' – '+stockholmMinute(shownTime.endUtc).replace('T',' kl '):' · sluttid saknas'}</p>:shownTime?.kind==='all_day'?<p>{source==='media'?'Datum: ':'Heldag från '}{shownTime.startDate}</p>:null}
   {calendarResponsibility(s.selected)&&<p>{manual?'Planerat ansvar':'Utförs av'}: {calendarResponsibility(s.selected)}</p>}
   {s.selected.linkedWorkflow&&<p>{s.selected.linkedWorkflow.title}. Planeringsflöde; detta bekräftar inte att material har producerats.</p>}
   {source==='media'&&<p>{s.selected.dateBasis==='first_publication'?'Första publicering · kanalernas egna utfall visas nedan.':s.selected.dateBasis==='reported_publication'?'Rapporterad publicering · kvitto saknas.':s.selected.dateBasis==='approval'?'Godkännandedatum · ingen fast publiceringstid.':'Nyhetens skapandedatum · ingen fast publiceringstid.'}</p>}
   {calendarProgress(s.selected).needsAttention&&source!=='media'&&!social&&<p>Öppna källan nedan för att granska läget och nästa steg.</p>}
   {s.selected.pendingChange&&<p>Föreslagen tid: {s.selected.pendingChange.time.kind==='timed'?stockholmMinute(s.selected.pendingChange.time.startUtc).replace('T',' kl '):s.selected.pendingChange.time.startDate}</p>}
  </div>}
  {undated&&<p className={styles.help}>Datum saknas · ingen publiceringstid har antagits.</p>}
  {detailSource&&(detailSource.kind==='media'||detailSource.kind==='social')&&<CalendarContentDetail key={s.userId+':'+JSON.stringify(detailSource)} source={detailSource} userId={s.userId}/>}
  {s.selected?.linkedWorkflow?.instanceId&&s.selected.projectId&&s.selected.status!=='cancelled'&&f?.kind==='work_block'&&f.responsibility==='atlas_planned'&&f.projectId===s.selected.projectId&&f.workflowInstanceId===s.selected.linkedWorkflow.instanceId&&<CalendarProductionPreview key={s.selected.projectId+':'+s.selected.linkedWorkflow.instanceId} projectId={s.selected.projectId} instanceId={s.selected.linkedWorkflow.instanceId}/>}
  {social&&<p className={styles.help}>Den godkända tiden gäller tills det nya tidsförslaget har granskats.</p>}
  {f&&(manual||social)&&<form className={styles.form} onSubmit={e=>{e.preventDefault();void s.save();}}>
   <fieldset disabled={s.editorSaving} style={{display:'contents'}}>
   {manual&&<>
    <label>Titel<input aria-label="Titel" maxLength={150} required value={f.title} onChange={e=>field('title',e.target.value)}/></label>
    <label>Typ<select aria-label="Typ" value={f.kind} onChange={e=>field('kind',e.target.value)}><option value="private">Privat möte</option><option value="work_block">Arbetsblock</option></select></label>
    <label>Projekt<select value={f.projectId} onChange={e=>field('projectId',e.target.value)}><option value="">Utan projekt</option>{s.model.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    {f.kind==='work_block'&&!f.workflowInstanceId&&<label>Arbetsstatus<select value={f.workStatus} onChange={e=>field('workStatus',e.target.value)}><option value="planned">Planerat</option><option value="in_progress">Pågår</option><option value="done">Klart</option></select></label>}
    {f.kind==='work_block'&&<>
     <label>Planerat ansvar<select aria-label="Planerat ansvar" value={f.responsibility} onChange={e=>field('responsibility',e.target.value)}><option value="self">Du</option><option value="atlas_planned">Atlas – planerat</option></select></label>
     {f.responsibility==='atlas_planned'&&<>
      <label>Kopplat Atlas-flöde<select aria-label="Kopplat Atlas-flöde" disabled={!f.projectId} value={f.workflowInstanceId} onChange={e=>field('workflowInstanceId',e.target.value)}><option value="">Inget kopplat flöde</option>{f.workflowInstanceId&&!(s.model.workflowOptions??[]).some(w=>w.id===f.workflowInstanceId&&w.projectId===f.projectId)&&<option value={f.workflowInstanceId}>Kopplingen behöver kontrolleras</option>}{(s.model.workflowOptions??[]).filter(w=>w.projectId===f.projectId).map(w=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
      <p className={styles.help}>{!f.projectId?'Välj projekt för att koppla ett befintligt planeringsflöde.':!s.model.availability.workflows?'Flöden kunde inte läsas. Läs om veckan.':'Kalenderns status följer flödet. Arbetstiden här ändrar inte flödets körschema.'}</p>
     </>}
     {f.responsibility==='atlas_planned'&&<p className={styles.help}>Startar inte automatiskt. Arbetsblocket planeras för Atlas; ett körbart flöde behöver kopplas in separat.</p>}
    </>}
    <label className={styles.checkbox}><input type="checkbox" checked={f.allDay} onChange={e=>field('allDay',e.target.checked)}/>Heldag</label>
   </>}
   <div className={styles.formRow}><label>Datum<input aria-label="Datum" type="date" required value={f.startDate} onChange={e=>field('startDate',e.target.value)}/></label>{!f.allDay&&<CalendarTimePicker label="Starttid" value={f.startTime} onChange={value=>field('startTime',value)} disabled={s.editorSaving}/>}</div>
   {manual&&<>
    {!f.allDay&&<label className={styles.checkbox}><input type="checkbox" checked={f.noEnd} onChange={e=>field('noEnd',e.target.checked)}/>Ingen sluttid</label>}
    {(f.allDay||!f.noEnd)&&<div className={styles.formRow}><label>{f.allDay?'Sista dag':'Slutdatum'}<input aria-label={f.allDay?'Sista dag':'Slutdatum'} type="date" required value={f.endDate} onChange={e=>field('endDate',e.target.value)}/></label>{!f.allDay&&<CalendarTimePicker label="Sluttid" value={f.endTime} onChange={value=>field('endTime',value)} disabled={s.editorSaving}/>}</div>}
    <label>Upprepning<select aria-label="Upprepning" value={f.repeat} onChange={e=>field('repeat',e.target.value)}><option value="none">Ingen</option><option value="daily">Varje dag</option><option value="weekly">Varje vecka</option></select></label>
    {f.repeat!=='none'&&<><label>Upprepa till (valfritt)<input aria-label="Upprepa till" type="date" min={f.startDate} value={f.repeatUntil} onChange={e=>field('repeatUntil',e.target.value)}/></label><button type="button" className={styles.secondaryButton} disabled={s.editorSaving||stockholmDate(new Date().toISOString())<f.startDate} onClick={()=>field('repeatUntil',stockholmDate(new Date().toISOString()))}>Avsluta upprepning efter idag</button><p className={styles.help}>Ändringar gäller hela serien, även planerat ansvar. Tidigare tillfällen behålls. Spara för att avsluta serien. Välj Ingen om du vill göra om den till ett engångsmöte.</p></>}
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
  {s.selected?.linkedWorkflow?.href&&<a className={styles.sourceLink} href={s.selected.linkedWorkflow.href}>Öppna planeringsflödet <span aria-hidden="true">↗</span></a>}
  {s.selected?.href&&<a className={styles.sourceLink} href={s.selected.href}>{source==='media'?'Öppna nyhetsfilmerna':social||source==='monthly'?'Öppna granskningen':'Visa arbetsflödet'} <span aria-hidden="true">↗</span></a>}
 </aside>;
}
