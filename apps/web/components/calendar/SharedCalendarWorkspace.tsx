'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, LockKeyhole } from 'lucide-react'
import type { CalendarEntry, CalendarWeekModel } from '@/lib/calendar/types'
import { addCalendarDays } from '@/lib/calendar/time'
import { CalendarWeek } from './CalendarWeek'
import styles from './Calendar.module.css'

const label = (date: string) => new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric', month: 'long', timeZone: 'UTC',
}).format(new Date(date + 'T12:00:00Z'))

export function SharedCalendarWorkspace({ initialWeek }: { initialWeek: CalendarWeekModel }) {
  const [filter, setFilter] = useState('all')
  const [selectedDay, setSelectedDay] = useState(initialWeek.range.fromDate)
  const [selected, setSelected] = useState<CalendarEntry | null>(null)
  const start = initialWeek.range.fromDate
  const entries = initialWeek.entries.filter(entry =>
    filter === 'all' || (filter === 'private'
      ? entry.source.kind === 'manual' && entry.projectId === null
      : entry.projectId === filter))
  const unavailable = Object.entries(initialWeek.availability)
    .filter(([, available]) => !available).map(([source]) => source)

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.pageIcon}><CalendarDays size={23} /></span>
        <div><p className={styles.eyebrow}>OMNIRA · GEMENSAM ARBETSKALENDER</p><h1>Kalender</h1></div>
      </div>
      <p className={styles.lede}>Samma arbetsplanering. Slutbesluten ligger hos ägaren.</p>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.weekControls}>
        <div className={styles.arrows}>
          <Link className={styles.iconButton} aria-label="Föregående vecka" href={'/organization/calendar?week=' + addCalendarDays(start, -7)}><ChevronLeft size={19} /></Link>
          <Link className={styles.iconButton} aria-label="Nästa vecka" href={'/organization/calendar?week=' + addCalendarDays(start, 7)}><ChevronRight size={19} /></Link>
        </div>
        <Link className={styles.secondaryButton} href="/organization/calendar">Idag</Link>
        <div className={styles.rangeLabel}>
          <strong>{label(start)} – {label(addCalendarDays(start, 6))}</strong>
          <span>Svensk tid · skrivskyddat</span>
        </div>
      </div>
      <div className={styles.toolbarActions}>
        <label className={styles.filterLabel}>
          <span className={styles.srOnly}>Visa i kalendern</span>
          <select aria-label="Visa i kalendern" value={filter} onChange={e => { setFilter(e.target.value); setSelected(null) }}>
            <option value="all">Alla händelser</option>
            <option value="private">Privata tider (upptagen)</option>
            {initialWeek.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </div>
    </div>
    <p className={styles.help}><LockKeyhole size={14} aria-hidden="true" style={{ display: 'inline', marginRight: 6 }} />
      Läsbehörighet: du ser projektplanering och bokade tider. Privata mötesdetaljer är dolda. Du kan inte ändra eller godkänna något här.
    </p>
    {(unavailable.length > 0 || Object.values(initialWeek.truncated).some(Boolean)) &&
      <p role="status" className={styles.help}>Vissa källor kunde inte läsas fullständigt eller innehåller fler poster än visningsgränsen.</p>}
    <div className={styles.calendarWrap}>
      <CalendarWeek readOnly entries={entries} range={initialWeek.range}
        projects={initialWeek.projects} selectedDay={selectedDay}
        onDay={setSelectedDay} onSelect={setSelected} onCreate={() => {}} />
    </div>
    {selected && <section className={styles.unscheduled} aria-live="polite">
      <h2>{selected.title}</h2>
      <p>Status: {selected.status}. {selected.time.kind === 'all_day' ? 'Heldag' :
        new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm' }).format(new Date(selected.time.startUtc))}</p>
      <button type="button" className={styles.secondaryButton} onClick={() => setSelected(null)}>Stäng detaljer</button>
    </section>}
    <footer className={styles.footer}>
      <Link href="/organization/atlas">Tillbaka till Atlas</Link>
      {initialWeek.projects.map(project => <span key={project.id}><i style={{ background: project.color }} />{project.name}</span>)}
    </footer>
  </main>
}
