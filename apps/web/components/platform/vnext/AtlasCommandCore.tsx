'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Mic, MicOff, Square } from 'lucide-react'
import { useAtlas, useAtlasAudioLevel } from '@/lib/atlas/runtime'
import {
  ATLAS_ORB_STATE_CHIP_LABELS,
  ATLAS_ORB_STATE_LABELS,
  isAtlasOrbState,
  resolveAtlasOrbState,
} from '@/lib/atlas/orb-state'
import { OPERATOR_NAME } from '@/lib/atlas/identity'
import { AtlasFace } from './AtlasFace'
import styles from './AtlasHomeVNext.module.css'

/**
 * Writes the playback audio level into `--atlas-audio-level` on the command
 * core. It subscribes on its own, so the per-frame level re-renders this
 * null component only — never the face, the composer or the identity column.
 * `override` is the dev-only review harness (see below); it never reaches a
 * production build.
 */
function AtlasAudioLevelBridge({ target, override }: { target: RefObject<HTMLElement>; override: number | null }) {
  const level = useAtlasAudioLevel()
  const value = override ?? level
  useEffect(() => {
    target.current?.style.setProperty('--atlas-audio-level', Math.min(1, Math.max(0, value)).toFixed(3))
  }, [target, value])
  return null
}

/**
 * Atlas Home's command core: the face, the identity column, and the composer.
 *
 * This is the single runtime owner of Atlas's visible state on this page. It
 * reads the live runtime once, resolves it through `resolveAtlasOrbState`, and
 * hands the result down; the face and the chip only display it.
 */
export function AtlasCommandCore() {
  const atlas = useAtlas()
  const searchParams = useSearchParams()
  const coreRef = useRef<HTMLElement>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const busy = submitting || atlas.voicePhase === 'thinking'
  const textBusy = busy || atlas.voicePhase === 'listening' || atlas.voicePhase === 'speaking'
  const runtimeOrbState = resolveAtlasOrbState({
    voicePhase: atlas.voicePhase,
    executing: atlas.execution,
    awaitingApproval: atlas.awaitingApproval,
    warning: atlas.warning,
  })
  // Isolated visual QA harness (`?orbPreview=<state>`, `?orbAudio=0..1`). Next
  // replaces NODE_ENV at build time, so both parameters are dead code in a
  // production build: an operator can never see or set a previewed state, and
  // the runtime signals are never touched — the preview only replaces what
  // this one page DRAWS.
  const previewState = process.env.NODE_ENV === 'development'
    ? searchParams.get('orbPreview')
    : null
  const orbState = isAtlasOrbState(previewState) ? previewState : runtimeOrbState
  const previewAudioRaw = process.env.NODE_ENV === 'development' ? searchParams.get('orbAudio') : null
  const previewAudio = previewAudioRaw !== null && Number.isFinite(Number(previewAudioRaw)) ? Number(previewAudioRaw) : null
  const stateDescription = ATLAS_ORB_STATE_LABELS[orbState]

  function handleVoiceToggle() {
    if (atlas.voicePhase === 'speaking') {
      atlas.stopAudio()
      return
    }
    if (atlas.voicePhase === 'listening') {
      atlas.deactivate()
      return
    }
    if (!busy) atlas.activate()
  }

  async function submitMessage() {
    const text = message.trim()
    if (!text || textBusy) return
    setSubmitting(true)
    setMessage('')
    try {
      await atlas.sendMessage(text)
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitMessage()
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submitMessage()
    }
  }

  const voiceLabel = atlas.voicePhase === 'listening'
    ? 'Stäng av mikrofonen'
    : atlas.voicePhase === 'speaking' ? 'Avbryt svaret' : 'Starta röstläge'

  return (
    <section ref={coreRef} className={styles.commandCore} aria-labelledby="atlas-vnext-title" data-state={orbState}>
      <AtlasAudioLevelBridge target={coreRef} override={previewAudio} />
      <AtlasFace state={orbState} />

      {/* The forehead core is Atlas's own control: it starts and stops voice,
          as the orb did. Invisible until focused or hovered. */}
      <button
        type="button"
        className={styles.faceCore}
        onClick={handleVoiceToggle}
        disabled={busy && atlas.voicePhase !== 'speaking'}
        aria-label={atlas.voicePhase === 'speaking' ? 'Avbryt Atlas svar' : 'Aktivera Atlas röst'}
        aria-describedby="atlas-state-description"
      />

      <div className={styles.identityBlock}>
        <p className={styles.eyebrow}>Hej {OPERATOR_NAME}.</p>
        <h1 id="atlas-vnext-title" className={styles.title}>Atlas</h1>
        <p className={styles.statusChip} data-state={orbState}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>{ATLAS_ORB_STATE_CHIP_LABELS[orbState]}</span>
        </p>
        <span id="atlas-state-description" className={styles.visuallyHidden} aria-live="polite">
          Atlas status: {stateDescription}.
        </span>
        <p className={styles.lead}>Din centrala intelligens.</p>
        <p className={styles.supportingLine}>
          Jag förstår, analyserar och agerar över hela Omnira.
        </p>
        <ul className={styles.pillars} aria-label="Atlas arbetssätt">
          <li>Insikt</li>
          <li>Samband</li>
          <li data-quiet="true">Handling</li>
        </ul>
      </div>

      <div className={styles.dialogue} aria-live="polite">
        {atlas.transcript && atlas.voicePhase === 'listening' ? (
          <p className={styles.transcript}>{atlas.transcript}</p>
        ) : null}
        {atlas.response ? (
          <div className={styles.responsePanel}>
            <div className={styles.responseHeading}>
              <span>Atlas</span>
              {atlas.perf ? <span className={styles.performance}>{atlas.perf}</span> : null}
            </div>
            <p>{atlas.response}</p>
            {atlas.conversationId && atlas.voicePhase === 'idle' ? (
              <button
                type="button"
                className={styles.openConversation}
                onClick={() => atlas.openWorkspace(`/chat/${atlas.conversationId}`)}
              >
                Öppna samtalet
              </button>
            ) : null}
          </div>
        ) : null}
        {atlas.awaitingApproval?.detail ? (
          <p className={styles.runtimeDetail} role="status">{atlas.awaitingApproval.detail}</p>
        ) : null}
        {atlas.warning?.detail ? (
          <div className={styles.runtimeNotice} role="alert">
            <span className={styles.runtimeNoticeDot} aria-hidden="true" />
            <p>{atlas.warning.detail}</p>
          </div>
        ) : null}
      </div>

      <form className={styles.composer} onSubmit={handleSubmit}>
        <button
          type="button"
          className={styles.voiceButton}
          onClick={handleVoiceToggle}
          disabled={busy}
          aria-label={voiceLabel}
          data-active={atlas.voicePhase === 'listening' || atlas.voicePhase === 'speaking' || undefined}
        >
          {atlas.voicePhase === 'listening' ? <MicOff size={19} /> : atlas.voicePhase === 'speaking' ? <Square size={16} /> : <Mic size={19} />}
        </button>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Starta en konversation med Atlas…"
          aria-label="Meddelande till Atlas"
          aria-describedby="atlas-composer-hint"
          rows={1}
          disabled={textBusy}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={textBusy || !message.trim()}
          aria-label="Skicka till Atlas"
        >
          <ArrowRight size={20} strokeWidth={2.2} />
        </button>
        <span id="atlas-composer-hint" className={styles.visuallyHidden}>
          Enter skickar · Skift + Enter ger ny rad
        </span>
      </form>
    </section>
  )
}
