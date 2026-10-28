'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { VOICE_DOCUMENT_CONTINUATION_COMMAND } from '@/lib/atlas/voice-pilot/document-mode'
import { Check, Copy, MessageCircle, Mic, MicOff, Minus, PhoneOff, Send } from 'lucide-react'
import type { AtlasVoiceSession } from '@/lib/atlas/voice-pilot/use-voice-session'
import { isAtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
import { createMicSignalStore, type MicSignalStore } from '@/lib/atlas/voice-pilot/mic-diagnostics'
import styles from './AtlasVoicePanel.module.css'

const EMPTY_SIGNAL_STORE = createMicSignalStore()

/** Client-side sound meter only; level is derived from local PCM and never uploaded. */
function MicSignalBars({ store, active }: { store: MicSignalStore; active: boolean }) {
  const { level } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  if (!active) return null
  const percent = Math.round(Math.min(1, Math.max(0, level)) * 100)
  return <span className={styles.micSignal} role="meter" aria-label="Mikrofonens ljudnivå"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    {[3, 10, 20, 40].map((threshold, index) => <span key={index}
      data-lit={percent >= threshold ? 'true' : undefined} />)}
  </span>
}

function MicrophoneCheckStatus({ store, active }: { store: MicSignalStore; active: boolean }) {
  const { level, voiceProbability } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
  return <p role="status">{!active ? 'Mikrofonen är inte påslagen.'
    : voiceProbability >= 0.3 ? 'Tal upptäcks.'
    : level >= 0.08 ? 'Ljud kommer in, men tal har inte identifierats ännu.'
    : 'Svagt eller inget mikrofonljud.'}</p>
}

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
  const [copyResult, setCopyResult] = useState<{ index: number; ok: boolean } | null>(null)
  const copyAssistantReply = (text: string, index: number) => {
    // Explicit user gesture: copy the entire final artifact, not the TTS intro.
    if (!navigator.clipboard?.writeText) { setCopyResult({ index, ok: false }); return }
    void navigator.clipboard.writeText(text).then(
      () => setCopyResult({ index, ok: true }),
      () => setCopyResult({ index, ok: false }),
    )
  }
  useEffect(() => { if (!minimized) panel.current?.focus() }, [minimized])
  useEffect(() => {
    if (messages.current) messages.current.scrollTop = messages.current.scrollHeight
  }, [s.snapshot.entries, s.reply, minimized])

  // The controller's transcript carries persisted incomplete-draft metadata;
  // the text-only history alone cannot distinguish an unfinished Claude prompt.
  const latestAssistant = [...s.snapshot.entries].reverse().find(entry => entry.kind === 'assistant')
  const latestAssistantIndex = s.snapshot.history.reduce((last, message, index) => message.role === 'assistant' ? index : last, -1)
  const incompleteIndex = latestAssistant?.kind === 'assistant' && latestAssistant.incomplete
    && s.snapshot.history[latestAssistantIndex]?.content === latestAssistant.text ? latestAssistantIndex : -1
  const continuationIndex = incompleteIndex >= 0 && latestAssistant?.kind === 'assistant' && latestAssistant.continuationAllowed
    && !s.snapshot.pending && !s.sending ? incompleteIndex : -1
  const micOn = s.mic || s.opening
  const muteLabel = micOn ? 'Muta mikrofonen' : s.micProblem ? 'Återanslut mikrofonen' : 'Slå på mikrofonen'
  const voiceLabel = s.voice === 'nova' ? 'Nova' : s.voices.find(v => v.key === s.voice)?.label ?? 'Atlas'
  const status = s.transcribing ? 'Tolkar det du sa' : s.speaking ? 'Pratar' : s.sending ? 'Arbetar'
    : s.opening ? 'Startar mikrofonen' : s.listening ? 'Lyssnar' : micOn ? 'Redo att lyssna'
    : s.micProblem ? 'Återanslut mikrofon' : 'Mikrofonen är mutad'
  const mute = () => s.toggleMute()
  const muteIcon = micOn ? <Mic size={17} /> : <MicOff size={17} />
  const endIcon = <PhoneOff size={17} />
  const micStore = s.micSignalStore ?? EMPTY_SIGNAL_STORE

  if (minimized) return <aside className={styles.dock} aria-label="Pågående röstsamtal med Atlas">
    <div className={styles.identity} aria-live="polite">
      <strong>{voiceLabel}</strong><div className={styles.statusRow}>
        <span title={s.micProblem ?? undefined}>{status}</span>
        <MicSignalBars store={micStore} active={micOn && !s.speaking} />
      </div>
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
        <strong>{voiceLabel}</strong><div className={styles.statusRow}>
          <span title={s.micProblem ?? undefined}>{status}</span>
          <MicSignalBars store={micStore} active={micOn && !s.speaking} />
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={mute} aria-label={muteLabel} aria-pressed={!micOn} title={muteLabel}>{muteIcon}</button>
        <button type="button" onClick={onMinimize} aria-label="Minimera chatten" title="Minimera chatten"><Minus size={18} /></button>
        <button type="button" className={styles.hangup} onClick={onClose} aria-label="Lägg på" title="Lägg på">{endIcon}</button>
      </div>
    </header>
    {runtimeNotice && <p className={styles.notice} role="alert">{runtimeNotice}</p>}
    {s.notice && <p className={styles.notice} role="alert">{s.notice}</p>}
    {s.micProblem && s.micProblem !== s.notice && <p className={styles.notice} role="alert">{s.micProblem}</p>}
    <div ref={messages} className={styles.messages} aria-live="polite">
      {!s.snapshot.history.length && !s.snapshot.pending && <p className={styles.empty}>Säg något till Nova, eller skriv här. Samtalet fortsätter när du minimerar chatten och navigerar i Omnira.</p>}
      {s.snapshot.history.map((message, i) => <div key={i} className={message.role === 'user' ? styles.userMessage : styles.atlasMessage}>
        <small>{message.role === 'user' ? 'Du' : voiceLabel}</small>
        {message.role === 'assistant'
          ? <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{message.content}</ReactMarkdown></div>
          : <p>{message.content}</p>}
        {i === incompleteIndex &&
          <p className={styles.incompleteDraft} role="status">Ofullständigt utkast – använd inte som färdig Claude-prompt.</p>}
        {message.role === 'assistant' && message.content.trim() &&
          <button type="button" className={styles.copyReply}
            onClick={() => copyAssistantReply(message.content, i)}
            aria-label={i === incompleteIndex ? 'Kopiera ofullständigt utkast' : 'Kopiera hela svaret'}
            title={i === incompleteIndex ? 'Kopiera endast som ofullständigt utkast' : 'Kopiera hela svaret, inklusive eventuell Claude-prompt'}>
            {copyResult?.index === i && copyResult.ok ? <Check size={13} /> : <Copy size={13} />}
            {copyResult?.index === i ? copyResult.ok ? 'Kopierat!' : 'Kopiera manuellt' : i === incompleteIndex ? 'Kopiera utkast' : 'Kopiera hela svaret'}
          </button>}
        {message.role === 'assistant' && i === continuationIndex &&
          <button type="button" className={styles.continueDraft}
            onClick={() => { void s.submitText(VOICE_DOCUMENT_CONTINUATION_COMMAND) }}>
            Fortsätt utkast
          </button>}
      </div>)}
      {s.snapshot.pending && <div className={styles.pending} role="status">
        {s.reply ? <div className={styles.markdown}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{s.reply}</ReactMarkdown></div> : 'Nova arbetar…'}
      </div>}
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
      <summary>Mikrofontest</summary>
      <p>Taligenkänning: {s.inputMode === 'batch' ? 'stabilt läge – ljudet tolkas när du har pratat klart' : 'realtidsläge'}.</p>
      <p>Prata normalt. Staplarna vid Nova ska röra sig när mikrofonen får ljud. Om de inte gör det, prova en annan mikrofon här.</p>
      <label htmlFor="atlas-shared-mic-device">Välj mikrofon</label>
      <select id="atlas-shared-mic-device" value={s.micDeviceId}
        onChange={e => s.selectMicDevice(e.currentTarget.value)}>
        <option value="">Systemets standardmikrofon</option>
        {s.micDevices.map(device => <option key={device.id} value={device.id}>{device.label}</option>)}
      </select>
      <MicrophoneCheckStatus store={micStore} active={micOn} />
      <label className={styles.callAudioOption} htmlFor="atlas-headphones-barge-in">
        <input type="checkbox" id="atlas-headphones-barge-in"
          checked={s.playbackMode === 'headphones'}
          onChange={e => s.setCallAudioMode(e.currentTarget.checked ? 'headphones' : 'speakers')} />
        Jag använder hörlurar – låt mig avbryta Nova genom att börja prata
      </label>
      <p>Med högtalare blockeras tal under Novas svar för att hon inte ska lyssna på sin egen röst.</p>
    </details>
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
