'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowUp, MessageSquare, Mic, MicOff, Square } from 'lucide-react'
import { useAtlas, useAtlasAudioLevel } from '@/lib/atlas/runtime'
import {
  ATLAS_ORB_STATE_LABELS,
  isAtlasOrbState,
  resolveAtlasOrbState,
} from '@/lib/atlas/orb-state'
import { AtlasOrbVisual } from './AtlasOrbVisual'
import styles from './AtlasHomeVNext.module.css'

export function AtlasCommandCore() {
  const atlas = useAtlas()
  const searchParams = useSearchParams()
  const audioLevel = useAtlasAudioLevel()
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
  // Isolated visual QA harness. Next replaces NODE_ENV at build time, so these
  // query parameters are inert in production and never alter runtime signals.
  const previewState = process.env.NODE_ENV === 'development'
    ? searchParams.get('orbPreview')
    : null
  const orbState = isAtlasOrbState(previewState) ? previewState : runtimeOrbState
  const previewAudio = process.env.NODE_ENV === 'development'
    ? Number(searchParams.get('orbAudio'))
    : 0
  const visualAudioLevel = orbState === 'speaking' && Number.isFinite(previewAudio)
    ? Math.min(1, Math.max(audioLevel, previewAudio))
    : audioLevel
  const stateDescription = ATLAS_ORB_STATE_LABELS[orbState]

  function handleOrbActivate() {
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

  return (
    <section className={styles.commandCore} aria-labelledby="atlas-vnext-title">
      <div className={styles.identityBlock}>
        <p className={styles.eyebrow}>Atlas · Executive Intelligence</p>
        <h1 id="atlas-vnext-title" className={styles.title}>
          Hej Andre.
        </h1>
        <p className={styles.supportingLine}>
          Jag håller samman dina projekt, beslut och nästa steg.
        </p>
      </div>

      <div className={styles.orbStage}>
        <AtlasOrbVisual
          state={orbState}
          label={atlas.voicePhase === 'speaking' ? 'Avbryt Atlas svar' : 'Aktivera Atlas röst'}
          stateDescription={stateDescription}
          audioLevel={visualAudioLevel}
          completionEvent={atlas.completionEvent}
          onActivate={handleOrbActivate}
        />
      </div>

      <div className={styles.runtimeReadout} aria-live="polite">
        <span className={styles.runtimeDot} data-state={orbState} />
        <span>{stateDescription}</span>
        {atlas.perf ? <span className={styles.performance}>{atlas.perf}</span> : null}
      </div>

      {atlas.awaitingApproval?.detail ? (
        <p className={styles.runtimeDetail} role="status">
          {atlas.awaitingApproval.detail}
        </p>
      ) : null}

      {atlas.transcript && atlas.voicePhase === 'listening' ? (
        <p className={styles.transcript}>{atlas.transcript}</p>
      ) : null}

      {atlas.response ? (
        <div className={styles.responsePanel} aria-live="polite">
          <div className={styles.responseHeading}>
            <MessageSquare size={14} aria-hidden="true" />
            <span>Atlas</span>
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

      <form className={styles.composer} onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Fråga Atlas eller ge ett uppdrag…"
          aria-label="Meddelande till Atlas"
          rows={1}
          disabled={textBusy}
        />
        <button
          type="button"
          className={styles.voiceButton}
          onClick={handleOrbActivate}
          disabled={busy}
          aria-label={atlas.voicePhase === 'listening' ? 'Stäng av mikrofonen' : atlas.voicePhase === 'speaking' ? 'Avbryt svaret' : 'Starta röstläge'}
        >
          {atlas.voicePhase === 'listening' ? <MicOff size={17} /> : atlas.voicePhase === 'speaking' ? <Square size={15} /> : <Mic size={17} />}
        </button>
        <button
          type="submit"
          className={styles.sendButton}
          disabled={textBusy || !message.trim()}
          aria-label="Skicka till Atlas"
        >
          <ArrowUp size={17} />
        </button>
      </form>
      <p className={styles.composerHint}>Enter skickar · Skift + Enter ger ny rad</p>
      {atlas.warning?.detail ? (
        <div className={styles.runtimeNotice} role="alert">
          <span className={styles.runtimeNoticeDot} aria-hidden="true" />
          <p>{atlas.warning.detail}</p>
        </div>
      ) : null}
    </section>
  )
}
