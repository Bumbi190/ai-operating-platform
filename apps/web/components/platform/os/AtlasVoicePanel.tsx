'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Mic, MicOff, Minus, PhoneOff } from 'lucide-react'
import type { AtlasVoiceSession } from '@/lib/atlas/voice-pilot/use-voice-session'
import styles from './AtlasVoicePanel.module.css'

export function AtlasVoicePanel({ session: s, minimized, onMinimize, onShow, onClose, onBuild, runtimeNotice, projects, projectName }: {
  session: AtlasVoiceSession; minimized: boolean; onMinimize(): void; onShow(): void; onClose(): void; onBuild(): void
  runtimeNotice?: string
  projects: { id: string; slug: string; name: string }[]; projectName: string | null
}) {
  const panel = useRef<HTMLElement>(null), messages = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!minimized) panel.current?.focus() }, [minimized])
  useEffect(() => { if (messages.current) messages.current.scrollTop = messages.current.scrollHeight }, [s.snapshot.entries, s.reply, minimized])
  const status = s.transcribing ? 'Atlas tolkar det du sa…' : s.speaking ? 'Atlas pratar' : s.listening ? 'Atlas lyssnar' : s.opening ? 'Mikrofonen görs redo…' : s.sending ? 'Atlas arbetar…' : s.mic ? 'Väntar på nästa tur…' : 'Mikrofonen är avstängd'
  if (minimized) return <div className={styles.dock}>
    <button onClick={onShow} aria-label="Visa röstsamtalet"><Mic size={18} /><span>{status}</span></button>
    <button onClick={onClose} aria-label="Avsluta röstsamtalet"><PhoneOff size={18} /></button>
  </div>
  return <section ref={panel} tabIndex={-1} className={styles.panel} aria-label="Atlas röstsamtal">
    <header className={styles.header}>
      <div><strong>Atlas</strong><p role="status">{status}</p></div>
      <button onClick={onMinimize} aria-label="Minimera röstsamtalet"><Minus size={20} /></button>
      <button onClick={onClose} aria-label="Avsluta röstsamtalet"><PhoneOff size={20} /></button>
    </header>
    <nav className={styles.links} aria-label="Samtalets arbetsytor">
      <button onClick={onBuild} disabled={s.snapshot.pending && !s.snapshot.id}>Bygg med Atlas</button>
      <Link href="/projects">Projekt</Link><Link href="/costs">Kostnader</Link>
      <details><summary>Välj projektvy</summary>{projects.map(p => <Link key={p.id} href={'/projects/' + p.slug}>{p.name}</Link>)}</details>
    </nav>
    <div className={styles.body}>
      <p className={styles.hint}>{projectName ? 'Samtalets projekt: ' + projectName : 'Samtal med Atlas över hela Omnira'}. Du kan minimera och byta sida medan vi pratar.</p>
      <div className={styles.controls}>
        <button onClick={() => void s.toggleMic()}>{s.mic || s.opening ? <MicOff size={16} /> : <Mic size={16} />}{s.opening ? 'Avbryt mikrofonstart' : s.mic ? 'Stäng mikrofonen' : 'Starta mikrofonen'}</button>
        <button onClick={s.interruptForCorrection}>Avbryt och rätta</button>
      </div>
      {runtimeNotice && <p className={styles.notice} role="alert">{runtimeNotice}</p>}
      {s.notice && <p className={styles.notice} role="alert">{s.notice}</p>}
      <div ref={messages} className={styles.messages} aria-live="polite">
        {s.snapshot.history.map((message, i) => <div key={i} data-role={message.role}><small>{message.role === 'user' ? 'Du' : 'Atlas'}</small><p>{message.content}</p></div>)}
        {s.snapshot.pending && <p>{s.reply || 'Atlas tänker…'}</p>}
      </div>
      <form onSubmit={e => { e.preventDefault(); void s.submitDraft() }} className={styles.composer}>
        <label htmlFor="atlas-shared-voice-draft">Prata eller skriv till Atlas</label>
        <textarea id="atlas-shared-voice-draft" value={s.draft} onChange={e => s.editDraft(e.target.value)} rows={2} />
        <button disabled={s.sending || s.snapshot.pending || !s.draft.trim()}>Skicka till Atlas</button>
      </form>
      <details className={styles.settings}><summary>Röstinställningar</summary>
        <label>Ljud<select value={s.playbackMode} onChange={e => { s.stopAll(); s.setPlaybackMode(e.target.value === 'headphones' ? 'headphones' : 'speakers') }}><option value="speakers">Högtalare</option><option value="headphones">Hörlurar</option></select></label>
        <label>Tid att tänka<select value={s.pauseMs} onChange={e => { s.stopAll(); s.setPauseMs(Number(e.target.value)) }}><option value={1200}>1,2 sekunder</option><option value={2000}>2 sekunder</option><option value={3500}>3,5 sekunder</option><option value={5000}>5 sekunder</option></select></label>
        <p>{s.playbackMode === 'speakers' ? 'Atlas lyssnar när han har tystnat. Tryck på Avbryt och rätta för att avbryta.' : 'Med hörlurar kan du avbryta genom att börja prata.'}</p>
      </details>
      {s.snapshot.id && <Link className={styles.fullChat} href={'/chat/' + s.snapshot.id}>Öppna hela samtalet</Link>}
    </div>
  </section>
}
