'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AtlasConversationController } from '@/lib/atlas/conversation/controller'
import { browserDependencies, createPcmVoiceCapture } from '@/lib/atlas/voice-pilot/pcm-capture'
import { createPcmSpeechPlayer } from '@/lib/atlas/voice-pilot/player'
import { takeSpeechChunk } from '@/lib/atlas/voice-pilot/reply'
import { completeVoiceDocumentOpening, continuesIncompleteVoiceDocument, needsCompleteVoiceDocument } from '@/lib/atlas/voice-pilot/document-mode'
import { isAtlasSwedishVoice, preferredAtlasVoice, type AtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
import { createMicSignalStore, type MicSignalStore } from '@/lib/atlas/voice-pilot/mic-diagnostics'
import type { StreamEvent } from '@/lib/os/chat-shared'
import { createClient } from '@/lib/supabase/client'

type Timing = { quietMs: number | null; textMs: number | null; audioMs: number | null }

export function useAtlasVoiceSession({ enabled = true, streamingAvailable = false, live = false, conversation: shared, beforeStart, onEvent, onDraftCaptureEnd, projectId = null }: {
  enabled?: boolean; streamingAvailable?: boolean; live?: boolean
  conversation?: AtlasConversationController; beforeStart?(): void
  onEvent?(event: StreamEvent, conversationId: string): void
  onDraftCaptureEnd?(notice: string | null): void
  projectId?: string | null
} = {}) {
  const [local] = useState(() => new AtlasConversationController())
  const conversation = shared ?? local
  const latest = useRef({ beforeStart, onEvent, onDraftCaptureEnd, projectId })
  latest.current = { beforeStart, onEvent, onDraftCaptureEnd, projectId }
  const openingRef = useRef(false), micRef = useRef(false), captureEpoch = useRef(0)
  const draftReceiver = useRef<((text: string) => void) | null>(null), voicesReady = useRef<Promise<boolean>>(Promise.resolve(false))
  const snapshot = useSyncExternalStore(conversation.subscribe, conversation.snapshot, conversation.snapshot)
  const [voices, setVoices] = useState<{ key: AtlasSwedishVoice; label: string }[]>([])
  const [voice, setVoice] = useState<AtlasSwedishVoice>('anders')
  const [inputMode, setInputMode] = useState<'batch' | 'streaming'>(live && streamingAvailable ? 'streaming' : 'batch')
  const [measurements, setMeasurements] = useState<{ mode: 'batch' | 'streaming'; endToPlaybackMs: number }[]>([])
  // Live voice can safely use the already-tested 1.2 s minimum pause.
  // Isolated manual voice trials keep the original 1.4 s default.
  const [pauseMs, setPauseMs] = useState(live ? 1200 : 1400)
  const [playbackMode, setPlaybackMode] = useState<'speakers' | 'headphones'>('speakers')
  const [outputBusy, setOutputBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [timing, setTiming] = useState<Timing | null>(null)
  const [mic, setMic] = useState(false), [opening, setOpening] = useState(false), [speaking, setSpeaking] = useState(false)
  const [micProblem, setMicProblem] = useState<string | null>(null)
  const micSignalStoreRef = useRef<MicSignalStore | null>(null)
  micSignalStoreRef.current ??= createMicSignalStore()
  const [micDevices, setMicDevices] = useState<{ id: string; label: string }[]>([])
  const [micDeviceId, setMicDeviceId] = useState('')
  const micDeviceRef = useRef('')
  const [draft, setDraft] = useState(''), [reply, setReply] = useState(''), [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const turnGeneration = useRef(0)
  const mounted = useRef(false), sendingRef = useRef(false), speechEpoch = useRef(0), lifetime = useRef(0)
  const player = useRef<ReturnType<typeof createPcmSpeechPlayer> | null>(null)
  const capture = useRef<ReturnType<typeof createPcmVoiceCapture> | null>(null)
  const heldDraft = useRef(''), draftRevision = useRef(0), draftSource = useRef<'text' | 'voice'>('text')
  const queuedVoice = useRef<{ text: string; revision: number; lifetime: number; endpointAt: number } | null>(null)
  const outputActive = useRef(false), lastQuietMs = useRef(0)
  const timedReply = useRef<(Timing & { startedAt: number; audioToken: number; mode: 'batch' | 'streaming' }) | null>(null)
  const writeDraft = (text: string, source: 'text' | 'voice') => { draftRevision.current++; draftSource.current = source; setDraft(text) }
  const submitRef = useRef<(text: string, source: 'text' | 'voice', quietMs?: number) => Promise<void>>(async () => {})
  const speak = () => player.current ??= createPcmSpeechPlayer({
    notice: message => { if (mounted.current) setNotice(message) },
    outputActive: value => {
      outputActive.current = value
      capture.current?.setOutputActive(value)
      if (mounted.current) setOutputBusy(value)
    },
    playing: value => {
      if (!mounted.current) return
      setSpeaking(value)
      const current = timedReply.current
      if (value && current && current.audioToken === speechEpoch.current && current.audioMs === null) {
        current.audioMs = performance.now() - current.startedAt; setTiming({ ...current })
        if (current.quietMs !== null) setMeasurements(previous => [...previous, { mode: current.mode, endToPlaybackMs: current.quietMs! + current.audioMs! }].slice(-40))
      }
    },
  })
  function stopSpeech() { speechEpoch.current++; timedReply.current = null; player.current?.stop() }
  function interruptForCorrection() {
    queuedVoice.current = null
    stopSpeech(); capture.current?.discard()
    setNotice(mic ? 'Rösten är avbruten. Säg rättelsen när Atlas lyssnar. Ett redan påbörjat jobb fortsätter; din rättelse skickas därefter.' : 'Rösten är stoppad. Ett redan påbörjat jobb fortsätter och svaret finns kvar i text.')
  }
  /** Mute affects only microphone capture, never TTS, the active reply or the call. */
  function pauseMic() {
    setMicProblem(null) // Only a deliberate mute is labelled "muted".
    micSignalStoreRef.current?.reset()
    captureEpoch.current++ // invalidate any pending mic-start or late capture callback
    openingRef.current = false; micRef.current = false
    const owned = capture.current; capture.current = null
    owned?.stop()
    if (mounted.current) { setMic(false); setOpening(false); setListening(false); setTranscribing(false) }
  }
  function stopAll() {
    queuedVoice.current = null; heldDraft.current = ''
    if (draftReceiver.current) latest.current.onDraftCaptureEnd?.('Mikrofoninspelningen avslutades. Du kan starta den igen.')
    lifetime.current++; draftReceiver.current = null; stopSpeech(); pauseMic()
  }

  async function refreshMicDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return
    try {
      const found = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === 'audioinput' && Boolean(device.deviceId))
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Mikrofon ${index + 1}`,
        }))
      if (mounted.current) setMicDevices(found)
    } catch { /* Browser permission and device enumeration are optional. */ }
  }

  useEffect(() => {
    if (!enabled) { stopAll(); return }
    mounted.current = true
    void refreshMicDevices()
    const devicesChanged = () => { void refreshMicDevices() }
    navigator.mediaDevices?.addEventListener?.('devicechange', devicesChanged)
    const abort = new AbortController()
    voicesReady.current = fetch('/api/atlas/voice-pilot/speech', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('lookup_failed')
      const data = await response.json()
      if (!mounted.current || abort.signal.aborted) return false
      const found = Array.isArray(data.voices) ? data.voices.filter((v: any) => isAtlasSwedishVoice(v.key) && typeof v.label === 'string') : []
      setVoices(found)
      if (found.length) setVoice(preferredAtlasVoice(found))
      else setNotice('Anders och Peter är inte tillgängliga i det anslutna ElevenLabs-kontot. Du kan fortfarande testa textchatten.')
      return found.length > 0
    }).catch(() => { if (mounted.current && !abort.signal.aborted) setNotice('Rösterna kunde inte hämtas. Ladda om sidan och försök igen.'); return false })
    // A live, owner-started call must survive app navigation and a temporarily hidden tab.
    // A full document unload cannot retain a browser-owned microphone; stop it on pagehide.
    const leave = () => stopAll()
    window.addEventListener('pagehide', leave)
    const { data: auth } = createClient().auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { stopAll(); heldDraft.current = ''; writeDraft('', 'text'); setReply(''); setNotice(''); conversation.clearOnSignout() }
    })
    return () => {
      mounted.current = false; abort.abort(); stopAll(); player.current?.dispose(); player.current = null
      auth.subscription.unsubscribe(); window.removeEventListener('pagehide', leave)
      navigator.mediaDevices?.removeEventListener?.('devicechange', devicesChanged)
    }
    // One owned device lifetime per mounted trial page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, enabled])

  const previousConversation = useRef(snapshot.id), createdConversation = useRef<string | null>(null)
  useEffect(() => conversation.subscribeCreated(id => { createdConversation.current = id }), [conversation])
  useEffect(() => {
    if (!enabled) return
    return conversation.subscribeSettled(event => {
      if (!event.current || event.conversationId !== conversation.snapshot().id) return
      if (!event.ok) { queuedVoice.current = null; return }
      // A hook-owned turn drains in its own finally. Full-chat/build producers settle here.
      if (!sendingRef.current) resumeQueuedVoice(lifetime.current, true)
    })
    // refs guard the current device lifetime and draft revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, enabled])
  useEffect(() => {
    const createdHere = previousConversation.current === null && createdConversation.current === snapshot.id
    if (previousConversation.current !== snapshot.id && !createdHere) {
      turnGeneration.current++; sendingRef.current = false; setSending(false)
      stopAll(); heldDraft.current = ''; writeDraft('', 'text'); setReply(''); setNotice('')
    }
    previousConversation.current = snapshot.id; createdConversation.current = null
    // Explicit thread selection retires input, including null-to-existing activation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.id])

  useEffect(() => {
    if (!mic) return
    const timer = setTimeout(() => {
      pauseMic()
      setMicProblem('Mikrofonen pausades efter tio minuter av säkerhetsskäl. Slå på den igen för att fortsätta.')
      setNotice('Mikrofonen pausades efter tio minuter. Samtalet är kvar – slå på mikrofonen för att fortsätta.')
    }, 10 * 60 * 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic])

  async function sample(text: string) {
    latest.current.beforeStart?.(); stopSpeech(); setNotice('')
    const token = lifetime.current, audioToken = speechEpoch.current
    try {
      await speak().prepare()
      if (mounted.current && token === lifetime.current && audioToken === speechEpoch.current) speak().enqueue(text, voice)
    } catch { if (mounted.current && token === lifetime.current && audioToken === speechEpoch.current) setNotice('Klicka på provlyssna igen för att aktivera ljudet i webbläsaren.') }
  }
  async function startMic(mode: 'speakers' | 'headphones' = playbackMode) {
    if (micRef.current || openingRef.current) return
    if (!enabled || !mounted.current) return
    openingRef.current = true
    setMicProblem(null)
    latest.current.beforeStart?.(); setNotice(''); setOpening(true)
    const token = lifetime.current, micToken = ++captureEpoch.current
    const selectedDeviceId = micDeviceRef.current
    const currentMic = () => mounted.current && token === lifetime.current && micToken === captureEpoch.current
    try {
      // Resume in the tap before awaiting the lazy transport module.
      const prepared = speak().prepare()
      void prepared.catch(() => {})
      const streamTurn = streamingAvailable && inputMode === 'streaming'
      ? (await import('@/lib/atlas/voice-pilot/stream-client')).beginVoiceStream : undefined
      if (!currentMic()) return
      const next = createPcmVoiceCapture({ pauseMs, playbackMode: mode,
      endpoint: quietMs => { lastQuietMs.current = quietMs },
      onSignal: value => { if (currentMic()) micSignalStoreRef.current?.update(value) },
      listening: value => { if (currentMic()) setListening(value) },
      processing: value => { if (currentMic()) setTranscribing(value) },
      active: value => { if (currentMic()) {
        if (!value && (micRef.current || openingRef.current))
          setMicProblem('Mikrofonen tappade anslutningen. Tryck på mikrofonknappen för att återansluta.')
        else if (value) setMicProblem(null)
        setMic(value); micRef.current = value; openingRef.current = false; setOpening(false)
        if (!value && draftReceiver.current) latest.current.onDraftCaptureEnd?.('Mikrofoninspelningen avslutades. Du kan starta den igen.')
      } },
      notice: message => { if (currentMic()) {
        if (draftReceiver.current) { draftReceiver.current = null; latest.current.onDraftCaptureEnd?.(message); stopAll() }
        openingRef.current = false; setOpening(false); setNotice(message)
        // After an unexpected source stop, preserve its actual reason even
        // though an unrelated conversation turn might clear the notice later.
        if (!micRef.current) setMicProblem(message)
      } },
      draft: text => { if (currentMic()) writeDraft([heldDraft.current, text].filter(Boolean).join(' '), 'voice') },
      interrupt: () => { if (currentMic()) stopSpeech() },
      receive: text => {
        if (!currentMic()) return
        const receiver = draftReceiver.current
        if (receiver) { draftReceiver.current = null; stopAll(); receiver(text); return }
        const combined = [heldDraft.current, text].filter(Boolean).join(' ')
        writeDraft(combined, 'voice')
        if (sendingRef.current || conversation.snapshot().pending) {
          heldDraft.current = combined
          queuedVoice.current = { text: combined, revision: draftRevision.current, lifetime: token, endpointAt: performance.now() - lastQuietMs.current }
          setNotice('Jag hörde dig. Din fortsättning skickas när det pågående svaret är klart. Redigera texten om du vill ändra den först.')
        } else void submitRef.current(combined, 'voice', lastQuietMs.current)
      },
    }, streamTurn
      ? { ...browserDependencies(selectedDeviceId), streamTurn }
      : browserDependencies(selectedDeviceId))
      capture.current = next
      next.setOutputActive(outputActive.current)
      await prepared
      if (!await voicesReady.current) {
        if (currentMic()) { pauseMic(); setNotice('Inga röster är tillgängliga. Samtalet är kvar.') }
        return
      }
      if (currentMic()) {
        await next.start()
        if (currentMic()) void refreshMicDevices()
      } else next.stop()
    } catch { if (currentMic()) {
      pauseMic()
      setMicProblem('Mikrofonen kunde inte starta. Kontrollera anslutningen och tryck för att återansluta.')
      setNotice('Mikrofonen kunde inte starta. Kontrollera anslutningen och försök igen.')
    } }
  }

  function resumeQueuedVoice(token: number, completed: boolean) {
    // Read the ref after the await: speech callbacks can populate it during a turn.
    const queued = queuedVoice.current
    // Voice turns remain serial; stop, errors, edits and unfinished phrases win.
    if (mounted.current && token === lifetime.current && completed && !sendingRef.current && !conversation.snapshot().pending && queued &&
        queued.lifetime === token && queued.revision === draftRevision.current &&
        !capture.current?.hasPendingInput()) {
      queuedVoice.current = null
      void submitRef.current(queued.text, 'voice', performance.now() - queued.endpointAt)
    }
  }

  async function submit(text: string, inputSource: 'text' | 'voice', quietMs?: number) {
    if (!enabled || !text.trim() || sendingRef.current || conversation.snapshot().pending) return
    const turnToken = ++turnGeneration.current
    sendingRef.current = true; setSending(true)
    const submittedRevision = draftRevision.current
    queuedVoice.current = null; heldDraft.current = ''; capture.current?.discard()
    latest.current.beforeStart?.(); stopSpeech(); setNotice(''); setReply('')
    const token = lifetime.current, audioToken = speechEpoch.current, selectedVoice = voice
    const lastAssistantText = [...conversation.snapshot().history].reverse().find(m => m.role === 'assistant')?.content
    const completeDocument = needsCompleteVoiceDocument(text) || continuesIncompleteVoiceDocument(text, lastAssistantText)
    const record = { quietMs: quietMs ?? null, textMs: null as number | null, audioMs: null as number | null, startedAt: performance.now(), audioToken, mode: inputMode }
    timedReply.current = record; setTiming({ ...record })
    let responseText = '', spoken = 0, completed = false, submittedConversationId: string | null = null
    const current = () => mounted.current && token === lifetime.current
    const flush = (final: boolean) => {
      if (!current() || audioToken !== speechEpoch.current || !voices.some(v => v.key === selectedVoice)) return
      if (completeDocument) {
        if (spoken) return
        const spokenOpening = completeVoiceDocumentOpening(responseText, final)
        if (spokenOpening) {
          // The full transcript still streams into the chat; only this one
          // complete opening is ever queued for speech, never Markdown/code.
          speak().enqueue(spokenOpening, selectedVoice)
          spoken = 1
        }
        return
      }
      for (;;) {
        const rest = responseText.slice(spoken)
        const length = takeSpeechChunk(rest, spoken === 0, final)
        if (!length) return
        speak().enqueue(rest.slice(0, length), selectedVoice); spoken += length
      }
    }
    try {
      // Resume during the submit gesture, before any network waits.
      if (voices.length) await speak().prepare().catch(() => {})
      if (!current()) return
      const id = await conversation.ensureConversation({ firstText: text, inputSource, projectId: latest.current.projectId })
      if (!id) throw new Error('conversation_failed')
      submittedConversationId = id
      if (!current()) return
      if (draftRevision.current === submittedRevision) writeDraft('', inputSource)
      const outcome = await conversation.sendTurn({ conversationId: id!, text, inputSource,
        onEvent: event => {
          if (!current()) return
          latest.current.onEvent?.(event, id)
          if (event.event === 'text' && typeof event.text === 'string') {
            if (event.text && record.textMs === null && timedReply.current === record) { record.textMs = performance.now() - record.startedAt; setTiming({ ...record }) }
            responseText += event.text; setReply(responseText); flush(false)
          }
        },
      })
      completed = outcome.ok
      if (current()) { flush(true); if (!outcome.ok) setNotice(outcome.notice ?? 'Atlas kunde inte slutföra svaret. Öppna chatten för att fortsätta.') }
    } catch { if (current()) setNotice('Samtalet kunde inte starta. Texten finns kvar, försök igen.') }
    finally {
      if (turnToken === turnGeneration.current) {
        sendingRef.current = false; if (mounted.current) setSending(false)
        // Stop clears retired input. A deliberate restart may have queued fresh speech while this job ran.
        resumeQueuedVoice(lifetime.current, completed && conversation.snapshot().id === submittedConversationId)
      }
    }
  }
  submitRef.current = submit

  const phase = speaking ? 'speaking' as const : sending || transcribing ? 'thinking' as const : listening ? 'listening' as const : 'idle' as const
  return { snapshot, voices, voice, setVoice, inputMode, setInputMode, measurements, pauseMs, setPauseMs, playbackMode, setPlaybackMode,
    outputBusy, listening, transcribing, timing, mic, micProblem, micSignalStore: micSignalStoreRef.current,
    micDevices, micDeviceId, opening, speaking, draft, reply, notice, sending, phase,
    active: mic || opening || outputBusy, sample,
    toggleMute: () => { if (micRef.current || openingRef.current) pauseMic(); else void startMic() },
    setCallAudioMode: (mode: 'speakers' | 'headphones') => {
      if (mode !== 'speakers' && mode !== 'headphones') return
      if (mode === playbackMode) return
      const wasActive = micRef.current || openingRef.current
      pauseMic(); setPlaybackMode(mode)
      // Use the explicit new mode: React state is not synchronous in this click.
      if (wasActive) void startMic(mode)
    },
    selectMicDevice: (id: string) => {
      if (id && !micDevices.some(device => device.id === id)) return
      const wasActive = micRef.current || openingRef.current
      pauseMic(); micDeviceRef.current = id; setMicDeviceId(id)
      if (wasActive) void startMic()
    },
    toggleMic: () => { if (micRef.current || openingRef.current) stopAll(); else void startMic() }, startMic: () => { if (draftReceiver.current) stopAll(); void startMic() },
    captureDraft: (receive: (text: string) => void) => { stopAll(); latest.current.onDraftCaptureEnd?.(null); const token = lifetime.current; draftReceiver.current = receive; void startMic(); return () => { if (token === lifetime.current) stopAll() } },
    stopAll, interruptForCorrection, finish: () => capture.current?.finish(),
    editDraft: (text: string) => { queuedVoice.current = null; heldDraft.current = text; capture.current?.discard(); writeDraft(text, 'text') },
    submitDraft: () => submit(draft, draftSource.current), submitText: (text: string) => submit(text, 'text'),
  }
}
export type AtlasVoiceSession = ReturnType<typeof useAtlasVoiceSession>
