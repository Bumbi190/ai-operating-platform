'use client';
import type {CalendarEntry} from '@/lib/calendar/types';
import {calendarAttention,calendarProgress} from '@/lib/calendar/progress';
import styles from './Calendar.module.css';
export function CalendarAttention({entries,onSelect}:{entries:CalendarEntry[];onSelect:(entry:CalendarEntry)=>void}){
 const attention=calendarAttention(entries);
 if(!attention.length)return null;
 return <section className={styles.attention} aria-label="Kalendernotiser för veckan">
  <details><summary>Behöver din uppmärksamhet ({attention.length})</summary>
   <p>Fel och granskningsbehov i den visade veckan. Öppna en post för nästa steg.</p>
   <ul>{attention.map(entry=>{const progress=calendarProgress(entry);return <li key={entry.id}>
    <span className={styles.statusDot} data-tone={progress.tone} aria-hidden="true"/>
    <div><strong>{entry.title}</strong><span>{progress.label}</span></div>
    <button type="button" className={styles.secondaryButton} aria-label={'Öppna kalendernotis: '+entry.title} onClick={()=>onSelect(entry)}>Öppna</button>
   </li>})}</ul>
  </details>
 </section>;
}
