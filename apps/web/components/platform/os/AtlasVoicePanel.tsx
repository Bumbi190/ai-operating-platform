'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { MessageCircle, Mic, MicOff, Minus, PhoneOff, Send } from 'lucide-react'
import type { AtlasVoiceSession } from '@/lib/atlas/voice-pilot/use-voice-session'
import { isAtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
import styles from './AtlasVoicePanel.module.css'

/** The platform layout owns this one call across its client-side navigations. */
export function AtlasVoicePanel({ session: s, minimized, onMinimize, onShow, onClose, runtimeNotice }: {
  session: AtlasVoiceSession; minimized: boolean; onMinimize(): void; onShow(): void; onClose(): void
  // Retain compatible props for the existing runtime caller; navigation is handled by Atlas itself.
  onBuild(): void
  projects: { id: string; slug: string; name: string }[]
  projectName: string | null
  runtimeNotice?: string
}) {
  const panel = useRef<HTMLElement>(null), messages = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!minimized) panel.current?.focus() }, [minimized])
  useEffect(() => {
    if (messages.current) messages.current.scrollTop = messages.current.scrollHeight
  }, [s.snapshot.entries, s.reply, minimized])

  const micOn = s.mic || s.opening
  const muteLabel = micOn ? 'Muta mikrofonen' : 'Slå på mikrofonen'
  const voiceLabel = s.voice === 'nova' ? 'Nova' : s.voices.find(v => v.key === s.voice)?.label ?? 'Atlas'
  const status = s.transcribing ? 'Tolkar det du sa' : s.speaking ? 'Pratar' : s.sending ? 'Arbetar'
    : s.opening ? 'Startar mikrofonen' : s.listening ? 'Lyssnar' : micOn ? 'Redo att lyssna' : 'Mikrofonen är mutad'
  const mute = () => s.toggleMute()
  const muteIcon = micOn ? <Mic size={17} /> : <MicOff size={17} />
  const endIcon = <PhoneOff size={17} />

  if (minimized) return <aside className={styles.dock} aria-label="Pågående röstsamtal med Atlas">
    <div className={styles.identity} aria-live="polite">
      <strong>{voiceLabel}</strong><span>{status}</span>
    </div>
    <div className={styles.actions}>
      <button type="button" onClick={mute} aria-label={muteLabel} aria-pressed={!micOn} title={muteLabel}>{muteIcon}</button>
      <button type="button" onClick={onShow} aria-label="Visa chatten" title="Visa chatten"><MessageCircle size={18} /></button>
      <button type="button" className={styles.hangup} onClick={onClose} aria-label="Lägg på" title="Lägg på">{endIcon}</button>
    </div>
  </aside>

  return <section ref={panel} tabIndex={-1} className={styles.panel} aria-label="Atlas röstsamtal">
    <header className={styles.header}>
      <div className={styles.identity} aria-live="polite">
        <strong>{voiceLabel}</strong><span>{status}</span>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={mute} aria-label={muteLabel} aria-pressed={!micOn} title={muteLabel}>{muteIcon}</button>
        <button type="button" onClick={onMinimize} aria-label="Minimera chatten" title="Minimera chatten"><Minus size={18} /></button>
        <button type="button" className={styles.hangup} onClick={onClose} aria-label="Lägg på" title="Lägg på">{endIcon}</button>
      </div>
    </header>
    {runtimeNotice && <p className={styles.notice} role="alert">{runtimeNotice}</p>}
    {s.notice && <p className={styles.notice} role="alert">{s.notice}</p>}
    <div ref={messages} className={styles.messages} aria-live="polite">
      {!s.snapshot.history.length && !s.snapshot.pending && <p className={styles.empty}>Säg något till Nova, eller skriv här. Samtalet fortsätter när du minimerar chatten och navigerar i Omnira.</p>}
      {s.snapshot.history.map((message, i) => <div key={i} className={message.role === 'user' ? styles.userMessage : styles.atlasMessage}>
        <small>{message.role === 'user' ? 'Du' : voiceLabel}</small>
        <p>{message.content}</p>
      </div>)}
      {s.snapshot.pending && <p className={styles.pending}>{s.reply || 'Nova arbetar…'}</p>}
      {s.snapshot.testDataReviews.length > 0 && s.snapshot.id && <p className={styles.review}>
        {s.snapshot.testDataReviews.length} granskning(ar) väntar. <Link href={'/chat/' + s.snapshot.id}>Öppna i hela chatten</Link>
      </p>}
    </div>
    <form className={styles.composer} onSubmit={e => { e.preventDefault(); void s.submitDraft() }}>
      <label className={styles.visuallyHidden} htmlFor="atlas-shared-voice-draft">Skriv till Nova</label>
      <textarea id="atlas-shared-voice-draft" value={s.draft}
        onChange={e => s.editDraft(e.target.value)} rows={2} placeholder="Skriv till Nova…" />
      <button type="submit" aria-label="Skicka meddelande" title="Skicka meddelande"
        disabled={s.sending || s.snapshot.pending || !s.draft.trim()}><Send size={18} /></button>
    </form>
    <details className={styles.voiceSettings}>
      <summary>Byt röst</summary>
      <label htmlFor="atlas-shared-voice-select">Röst</label>
      <select id="atlas-shared-voice-select"
        value={s.voices.some(v => v.key === s.voice) ? s.voice : ''}
        disabled={!s.voices.length || s.sending || s.snapshot.pending}
        onChange={e => {
          const selected = e.currentTarget.value
          if (!isAtlasSwedishVoice(selected) || !s.voices.some(v => v.key === selected)) return
          s.stopAll(); s.setVoice(selected)
        }}>
        {!s.voices.length && <option value="">Hämtar röster…</option>}
        {s.voices.length > 0 && !s.voices.some(v => v.key === s.voice) && <option value="">Välj tillgänglig röst</option>}
        {s.voices.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
      </select>
    </details>
  </section>
}
