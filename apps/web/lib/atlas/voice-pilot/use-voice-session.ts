'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AtlasConversationController } from '@/lib/atlas/conversation/controller'
import { browserDependencies, createPcmVoiceCapture } from '@/lib/atlas/voice-pilot/pcm-capture'
import { createPcmSpeechPlayer } from '@/lib/atlas/voice-pilot/player'
import { takeSpeechChunk } from '@/lib/atlas/voice-pilot/reply'
import { isAtlasSwedishVoice, type AtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
import type { StreamEvent } from '@/lib/os/chat-shared'
import { createClient } from '@/lib/supabase/client'

type Timing = { quietMs: number | null; textMs: number | null; audioMs: number | null }

export function useAtlasVoiceSession({ enabled = true, streamingAvailable = false, live = false, conversation: shared, beforeStart, onEvent, projectId = null }: {
  enabled?: boolean; streamingAvailable?: boolean; live?: boolean
  conversation?: AtlasConversationController; beforeStart?(): void
  onEvent?(event: StreamEvent, conversationId: string): void
  projectId?: string | null
} = {}) {
  const [local] = useState(() => new AtlasConversationController())
  const conversation = shared ?? local
  const latest = useRef({ beforeStart, onEvent, projectId })
  latest.current = { beforeStart, onEvent, projectId }
  const openingRef = useRef(false), micRef = useRef(false), draftReceiver = useRef<((text: string) => void) | null>(null), voicesReady = useRef<Promise<boolean>>(Promise.resolve(false))
  const snapshot = useSyncExternalStore(conversation.subscribe, conversation.snapshot, conversation.snapshot)
  const [voices, setVoices] = useState<{ key: AtlasSwedishVoice; label: string }[]>([])
  const [voice, setVoice] = useState<AtlasSwedishVoice>('anders')
  const [inputMode, setInputMode] = useState<'batch' | 'streaming'>(live && streamingAvailable ? 'streaming' : 'batch')
  const [measurements, setMeasurements] = useState<{ mode: 'batch' | 'streaming'; endToPlaybackMs: number }[]>([])
  const [pauseMs, setPauseMs] = useState(1200)
  const [playbackMode, setPlaybackMode] = useState<'speakers' | 'headphones'>('speakers')
  const [outputBusy, setOutputBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [timing, setTiming] = useState<Timing | null>(null)
  const [mic, setMic] = useState(false), [opening, setOpening] = useState(false), [speaking, setSpeaking] = useState(false)
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
  function stopAll() {
    queuedVoice.current = null
    lifetime.current++; openingRef.current = false; micRef.current = false; draftReceiver.current = null; stopSpeech(); capture.current?.stop(); capture.current = null
    if (mounted.current) { setMic(false); setOpening(false); setListening(false); setTranscribing(false) }
  }

  useEffect(() => {
    if (!enabled) { stopAll(); return }
    mounted.current = true
    const abort = new AbortController()
    voicesReady.current = fetch('/api/atlas/voice-pilot/speech', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('lookup_failed')
      const data = await response.json()
      if (!mounted.current || abort.signal.aborted) return false
      const found = Array.isArray(data.voices) ? data.voices.filter((v: any) => isAtlasSwedishVoice(v.key) && typeof v.label === 'string') : []
      setVoices(found)
      if (found.length) setVoice(found[0].key)
      else setNotice('Anders och Peter är inte tillgängliga i det anslutna ElevenLabs-kontot. Du kan fortfarande testa textchatten.')
      return found.length > 0
    }).catch(() => { if (mounted.current && !abort.signal.aborted) setNotice('Rösterna kunde inte hämtas. Ladda om sidan och försök igen.'); return false })
    const hide = () => { if (document.hidden) stopAll() }
    const leave = () => stopAll()
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave)
    const { data: auth } = createClient().auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { stopAll(); heldDraft.current = ''; writeDraft('', 'text'); setReply(''); setNotice(''); conversation.clearOnSignout() }
    })
    return () => {
      mounted.current = false; abort.abort(); stopAll(); player.current?.dispose(); player.current = null
      auth.subscription.unsubscribe(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave)
    }
    // One owned device lifetime per mounted trial page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, enabled])

  const previousConversation = useRef<string | null>(null)
  useEffect(() => {
    if (previousConversation.current && previousConversation.current !== snapshot.id) {
      turnGeneration.current++; sendingRef.current = false; setSending(false)
      stopAll(); heldDraft.current = ''; writeDraft('', 'text'); setReply(''); setNotice('')
    }
    previousConversation.current = snapshot.id
    // Switching threads retires input rather than sending it into another project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.id])

  useEffect(() => {
    if (!mic) return
    const timer = setTimeout(() => { stopAll(); setNotice('Mikrofonen stängdes efter tio minuter. Starta den igen om du vill fortsätta.') }, 10 * 60 * 1000)
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
  async function startMic() {
    if (micRef.current || openingRef.current) return
    if (!enabled || !mounted.current) return
    openingRef.current = true
    latest.current.beforeStart?.(); setNotice(''); setOpening(true)
    const token = lifetime.current
    try {
    // Resume in the tap before awaiting the lazy transport module.
    const prepared = speak().prepare()
    void prepared.catch(() => {})
    const streamTurn = streamingAvailable && inputMode === 'streaming'
      ? (await import('@/lib/atlas/voice-pilot/stream-client')).beginVoiceStream : undefined
    if (!mounted.current || token !== lifetime.current) return
    const next = createPcmVoiceCapture({ pauseMs, playbackMode,
      endpoint: quietMs => { lastQuietMs.current = quietMs },
      listening: value => { if (mounted.current && token === lifetime.current) setListening(value) },
      processing: value => { if (mounted.current && token === lifetime.current) setTranscribing(value) },
      active: value => { if (mounted.current && token === lifetime.current) { setMic(value); micRef.current = value; openingRef.current = false; setOpening(false) } },
      notice: message => { if (mounted.current && token === lifetime.current) { openingRef.current = false; setOpening(false); setNotice(message) } },
      draft: text => { if (mounted.current && token === lifetime.current) writeDraft([heldDraft.current, text].filter(Boolean).join(' '), 'voice') },
      interrupt: () => { if (mounted.current && token === lifetime.current) stopSpeech() },
      receive: text => {
        if (!mounted.current || token !== lifetime.current) return
        const receiver = draftReceiver.current
        if (receiver) { stopAll(); receiver(text); return }
        const combined = [heldDraft.current, text].filter(Boolean).join(' ')
        writeDraft(combined, 'voice')
        if (sendingRef.current || conversation.snapshot().pending) {
          heldDraft.current = combined
          queuedVoice.current = { text: combined, revision: draftRevision.current, lifetime: token, endpointAt: performance.now() - lastQuietMs.current }
          setNotice('Jag hörde dig. Din fortsättning skickas när det pågående svaret är klart. Redigera texten om du vill ändra den först.')
        } else void submitRef.current(combined, 'voice', lastQuietMs.current)
      },
    }, streamTurn ? { ...browserDependencies(), streamTurn } : undefined)
    capture.current = next
    next.setOutputActive(outputActive.current)
      await prepared
      if (!await voicesReady.current) { if (mounted.current && token === lifetime.current) stopAll(); return }
      if (mounted.current && token === lifetime.current) await next.start()
    } catch { if (mounted.current && token === lifetime.current) { stopAll(); setNotice('Ljudet kunde inte starta. Prova att klicka på provlyssna först.') } }
  }

  function resumeQueuedVoice(token: number, completed: boolean) {
    // Read the ref after the await: speech callbacks can populate it during a turn.
    const queued = queuedVoice.current
    // Voice turns remain serial; stop, errors, edits and unfinished phrases win.
    if (mounted.current && token === lifetime.current && completed && queued &&
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
    const record = { quietMs: quietMs ?? null, textMs: null as number | null, audioMs: null as number | null, startedAt: performance.now(), audioToken, mode: inputMode }
    timedReply.current = record; setTiming({ ...record })
    let responseText = '', spoken = 0, completed = false
    const current = () => mounted.current && token === lifetime.current
    const flush = (final: boolean) => {
      if (!current() || audioToken !== speechEpoch.current || !voices.some(v => v.key === selectedVoice)) return
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
        resumeQueuedVoice(token, completed)
      }
    }
  }
  submitRef.current = submit

  const phase = speaking ? 'speaking' as const : sending || transcribing ? 'thinking' as const : listening ? 'listening' as const : 'idle' as const
  return { snapshot, voices, voice, setVoice, inputMode, setInputMode, measurements, pauseMs, setPauseMs, playbackMode, setPlaybackMode,
    outputBusy, listening, transcribing, timing, mic, opening, speaking, draft, reply, notice, sending, phase,
    active: mic || opening || outputBusy, sample,
    toggleMic: () => { if (micRef.current || openingRef.current) stopAll(); else void startMic() }, startMic: () => { draftReceiver.current = null; void startMic() },
    captureDraft: (receive: (text: string) => void) => { stopAll(); draftReceiver.current = receive; void startMic(); return stopAll },
    stopAll, interruptForCorrection, finish: () => capture.current?.finish(),
    editDraft: (text: string) => { queuedVoice.current = null; heldDraft.current = text; capture.current?.discard(); writeDraft(text, 'text') },
    submitDraft: () => submit(draft, draftSource.current), submitText: (text: string) => submit(text, 'text'),
  }
}
export type AtlasVoiceSession = ReturnType<typeof useAtlasVoiceSession>
