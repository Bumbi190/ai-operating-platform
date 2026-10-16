'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Mic, MicOff, Play, Send, Square, ArrowLeft, Headphones } from 'lucide-react'
import { AtlasConversationController } from '@/lib/atlas/conversation/controller'
import { createPilotVoiceCapture } from '@/lib/atlas/voice-pilot/capture'
import { createPcmSpeechPlayer } from '@/lib/atlas/voice-pilot/player'
import { takeSpeechChunk } from '@/lib/atlas/voice-pilot/reply'
import { isAtlasSwedishVoice, type AtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
import { useOptionalAtlas } from '@/lib/atlas/runtime'
import { createClient } from '@/lib/supabase/client'

const SAMPLE = 'Hej André! Det är Atlas. Vi tar det lugnt, du får tänka färdigt. Om du vill ändra något är det bara att avbryta mig. Ska vi kika på Omnira tillsammans?'
const SAMPLE_NAMES = 'I dag är det fredag den sextonde oktober. Vi ses i Hässleholm klockan halv tre. Jag har tittat på Handlarbörsen och Familje-Stunden. Vad vill du börja med?'
type Timing = { quietMs: number | null; textMs: number | null; audioMs: number | null }

export function AtlasVoiceTrial() {
  const atlas = useOptionalAtlas()
  const [conversation] = useState(() => new AtlasConversationController())
  const snapshot = useSyncExternalStore(conversation.subscribe, conversation.snapshot, conversation.snapshot)
  const [voices, setVoices] = useState<{ key: AtlasSwedishVoice; label: string }[]>([])
  const [voice, setVoice] = useState<AtlasSwedishVoice>('anders')
  const [pauseMs, setPauseMs] = useState(2000)
  const [playbackMode, setPlaybackMode] = useState<'speakers' | 'headphones'>('speakers')
  const [outputBusy, setOutputBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [timing, setTiming] = useState<Timing | null>(null)
  const [mic, setMic] = useState(false), [opening, setOpening] = useState(false), [speaking, setSpeaking] = useState(false)
  const [draft, setDraft] = useState(''), [reply, setReply] = useState(''), [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)
  const mounted = useRef(false), sendingRef = useRef(false), speechEpoch = useRef(0), lifetime = useRef(0)
  const player = useRef<ReturnType<typeof createPcmSpeechPlayer> | null>(null)
  const capture = useRef<ReturnType<typeof createPilotVoiceCapture> | null>(null)
  const heldDraft = useRef(''), draftRevision = useRef(0), draftSource = useRef<'text' | 'voice'>('text')
  const outputActive = useRef(false), lastQuietMs = useRef(0)
  const timedReply = useRef<(Timing & { startedAt: number; audioToken: number }) | null>(null)
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
      }
    },
  })
  function stopSpeech() { speechEpoch.current++; timedReply.current = null; player.current?.stop() }
  function stopAll() {
    lifetime.current++; stopSpeech(); capture.current?.stop(); capture.current = null
    if (mounted.current) { setMic(false); setOpening(false); setListening(false) }
  }

  useEffect(() => {
    mounted.current = true
    const abort = new AbortController()
    void fetch('/api/atlas/voice-pilot/speech', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error('lookup_failed')
      const data = await response.json()
      if (!mounted.current || abort.signal.aborted) return
      const found = Array.isArray(data.voices) ? data.voices.filter((v: any) => isAtlasSwedishVoice(v.key) && typeof v.label === 'string') : []
      setVoices(found)
      if (found.length) setVoice(found[0].key)
      else setNotice('Anders och Peter är inte tillgängliga i det anslutna ElevenLabs-kontot. Du kan fortfarande testa textchatten.')
    }).catch(() => { if (mounted.current && !abort.signal.aborted) setNotice('Rösterna kunde inte hämtas. Ladda om sidan och försök igen.') })
    const hide = () => { if (document.hidden) stopAll() }
    const leave = () => stopAll()
    document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', leave)
    const { data: auth } = createClient().auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { stopAll(); conversation.clearOnSignout() }
    })
    return () => {
      mounted.current = false; abort.abort(); stopAll(); player.current?.dispose(); player.current = null
      auth.subscription.unsubscribe(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave)
    }
    // One owned device lifetime per mounted trial page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation])

  useEffect(() => {
    if (!mic) return
    const timer = setTimeout(() => { stopAll(); setNotice('Mikrofonen stängdes efter tio minuter. Starta den igen om du vill fortsätta.') }, 10 * 60 * 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic])

  async function sample(text: string) {
    atlas?.deactivate(); stopSpeech(); setNotice('')
    const token = lifetime.current, audioToken = speechEpoch.current
    try {
      await speak().prepare()
      if (mounted.current && token === lifetime.current && audioToken === speechEpoch.current) speak().enqueue(text, voice)
    } catch { if (mounted.current && token === lifetime.current && audioToken === speechEpoch.current) setNotice('Klicka på provlyssna igen för att aktivera ljudet i webbläsaren.') }
  }
  async function toggleMic() {
    if (mic || opening) { stopAll(); return }
    atlas?.deactivate(); setNotice(''); setOpening(true)
    const token = lifetime.current
    const next = createPilotVoiceCapture({ pauseMs, playbackMode,
      endpoint: quietMs => { lastQuietMs.current = quietMs },
      listening: value => { if (mounted.current && token === lifetime.current) setListening(value) },
      active: value => { if (mounted.current && token === lifetime.current) { setMic(value); setOpening(false) } },
      notice: message => { if (mounted.current && token === lifetime.current) { setOpening(false); setNotice(message) } },
      draft: text => { if (mounted.current && token === lifetime.current) writeDraft([heldDraft.current, text].filter(Boolean).join(' '), 'voice') },
      interrupt: () => { if (mounted.current && token === lifetime.current) stopSpeech() },
      receive: text => {
        if (!mounted.current || token !== lifetime.current) return
        const combined = [heldDraft.current, text].filter(Boolean).join(' ')
        writeDraft(combined, 'voice')
        if (sendingRef.current || conversation.snapshot().pending) {
          heldDraft.current = combined
          setNotice('Jag hörde dig. Skicka din fortsättning när det pågående svaret är klart.')
        } else void submitRef.current(combined, 'voice', lastQuietMs.current)
      },
    })
    capture.current = next
    next.setOutputActive(outputActive.current)
    try {
      await speak().prepare()
      if (mounted.current && token === lifetime.current) await next.start()
    } catch { if (mounted.current && token === lifetime.current) { stopAll(); setNotice('Ljudet kunde inte starta. Prova att klicka på provlyssna först.') } }
  }

  async function submit(text: string, inputSource: 'text' | 'voice', quietMs?: number) {
    if (!text.trim() || sendingRef.current || conversation.snapshot().pending) return
    sendingRef.current = true; setSending(true)
    const submittedRevision = draftRevision.current
    heldDraft.current = ''; capture.current?.discard()
    atlas?.deactivate(); stopSpeech(); setNotice(''); setReply('')
    const token = lifetime.current, audioToken = speechEpoch.current, selectedVoice = voice
    const record = { quietMs: quietMs ?? null, textMs: null as number | null, audioMs: null as number | null, startedAt: performance.now(), audioToken }
    timedReply.current = record; setTiming({ ...record })
    let responseText = '', spoken = 0
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
      let id = conversation.snapshot().id
      if (!id) {
        const response = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Atlas · svenskt rösttest' }) })
        const data = await response.json()
        if (!response.ok || typeof data.id !== 'string') throw new Error('conversation_failed')
        if (!current()) return
        id = data.id
        conversation.activateConversation({ id: id!, saved: [], state: 'ok' })
      }
      if (!current()) return
      if (draftRevision.current === submittedRevision) writeDraft('', inputSource)
      const outcome = await conversation.sendTurn({ conversationId: id!, text, inputSource,
        onEvent: event => {
          if (!current()) return
          if (event.event === 'text' && typeof event.text === 'string') {
            if (event.text && record.textMs === null && timedReply.current === record) { record.textMs = performance.now() - record.startedAt; setTiming({ ...record }) }
            responseText += event.text; setReply(responseText); flush(false)
          }
        },
      })
      if (current()) { flush(true); if (!outcome.ok) setNotice(outcome.notice ?? 'Atlas kunde inte slutföra svaret. Öppna chatten för att fortsätta.') }
    } catch { if (current()) setNotice('Samtalet kunde inte starta. Texten finns kvar, försök igen.') }
    finally { sendingRef.current = false; if (mounted.current) setSending(false) }
  }
  submitRef.current = submit

  const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
  return <main className="mx-auto w-full max-w-3xl px-5 py-8 text-white">
    <Link href="/atlas" onClick={stopAll} className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16} /> Till Atlas</Link>
    <p className="text-xs font-medium uppercase tracking-widest text-teal-300">Omnira · separat rösttest</p>
    <h1 className="mt-3 text-3xl font-semibold">Atlas, på naturlig svenska</h1>
    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Prova två svenska ElevenLabs-röster. Välj ljudläge och hur lång tankepaus du vill ha.</p>
    <section className="mt-7 rounded-2xl border border-white/10 bg-slate-900/70 p-5" aria-label="Röstinställningar">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-300">Röst<select value={voice} disabled={!voices.length} onChange={e => { stopAll(); if (isAtlasSwedishVoice(e.target.value)) setVoice(e.target.value) }} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-white">{!voices.length && <option>Hämtar svenska röster…</option>}{voices.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}</select></label>
        <label className="text-sm text-slate-300">Tid att tänka<select value={pauseMs} onChange={e => { stopAll(); setPauseMs(Number(e.target.value)) }} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-white"><option value={1200}>1,2 sekunder · snabbare turer</option><option value={2000}>2 sekunders tystnad</option><option value={3500}>3,5 sekunder · gott om tid</option><option value={5000}>5 sekunder · längre tankepauser</option></select></label>
        <label className="text-sm text-slate-300">Ljud<select value={playbackMode} onChange={e => { stopAll(); setPlaybackMode(e.target.value === 'headphones' ? 'headphones' : 'speakers') }} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-white"><option value="speakers">Högtalare</option><option value="headphones">Hörlurar</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button className={button} disabled={!voices.length} onClick={() => void sample(SAMPLE)}><Play size={16} /> Provlyssna</button><button className={button} disabled={!voices.length} onClick={() => void sample(SAMPLE_NAMES)}>Testa svenska namn</button></div>
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Headphones size={14} />{playbackMode === 'speakers' ? 'Med högtalare lyssnar Atlas när han har tystnat. Tryck på Avbryt under svaret och börja prata när det står Atlas lyssnar.' : 'Med hörlurar kan du avbryta genom att börja prata.'}</p>
    </section>
    <section className="mt-5 rounded-2xl border border-white/10 bg-slate-900/40 p-5" aria-label="Testsamtal">
      <div className="flex flex-wrap items-center gap-3">
        <button className={button + (mic || opening ? ' bg-teal-400/15 text-teal-200' : '')} disabled={!voices.length} onClick={() => void toggleMic()}>{mic || opening ? <MicOff size={17} /> : <Mic size={17} />}{opening ? 'Avbryt mikrofonstart' : mic ? 'Stäng mikrofonen' : 'Starta mikrofonen'}</button>
        <button className={button} onClick={stopAll}><Square size={15} /> Stoppa allt ljud</button>
        {mic && playbackMode === 'speakers' && outputBusy && <button className={button + ' border-teal-300 text-teal-200'} onClick={stopSpeech}>Avbryt</button>}
        <p role="status" className="text-sm text-teal-200">{speaking ? playbackMode === 'speakers' ? 'Atlas pratar · avbryt med knappen' : 'Atlas pratar · du kan avbryta' : mic || opening ? listening ? 'Atlas lyssnar' : 'Vänta ett ögonblick · mikrofonen görs redo' : 'Mikrofonen är avstängd'}</p>
      </div>
      <div className="mt-5 space-y-4" aria-live="polite">
        {snapshot.history.map((message, index) => <div key={index} className={message.role === 'user' ? 'ml-8 rounded-xl bg-teal-500/10 p-4' : 'mr-8 rounded-xl bg-white/5 p-4'}><p className="mb-1 text-xs text-slate-400">{message.role === 'user' ? 'Du' : 'Atlas'}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p></div>)}
        {snapshot.pending && <p className="text-sm leading-6 text-slate-300">{reply || 'Atlas tänker…'}</p>}
      </div>
      <form className="mt-5" onSubmit={e => { e.preventDefault(); void submit(draft, draftSource.current) }}>
        <label htmlFor="voice-draft" className="text-sm text-slate-300">Det du vill säga</label>
        <textarea id="voice-draft" value={draft} onChange={e => { heldDraft.current = e.target.value; capture.current?.discard(); writeDraft(e.target.value, 'text') }} rows={3} placeholder="Prata eller skriv till Atlas…" className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-slate-950 p-3 text-sm focus:border-teal-300 focus:outline-none" />
        <button className={button + ' mt-3 bg-teal-300 text-slate-950 hover:bg-teal-200'} disabled={sending || snapshot.pending || !draft.trim()}><Send size={16} />{sending ? 'Atlas arbetar…' : 'Skicka'}</button>
      </form>
      {notice && <p role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">{notice}</p>}
      {timing && <details className="mt-4 text-xs leading-6 text-slate-400"><summary className="cursor-pointer">Svarstid i senaste frågan</summary><p>{timing.quietMs !== null && <>Tystnad före skickat: {(timing.quietMs / 1000).toFixed(1)} s. </>}Till första text: {timing.textMs === null ? '—' : (timing.textMs / 1000).toFixed(1) + ' s'}. Till ljudstart: {timing.audioMs === null ? '—' : (timing.audioMs / 1000).toFixed(1) + ' s'}.</p></details>}
      {snapshot.id && <Link href={'/chat/' + snapshot.id} onClick={stopAll} className="mt-4 inline-block text-sm text-teal-200 underline underline-offset-4">Öppna samtalet för projektjobb och godkännanden</Link>}
    </section>
    <p className="mt-5 text-xs leading-5 text-slate-400">Rösten debiteras per uppläst tecken inom Omniras kostnadskontroll. Atlas chattkostnad tillkommer. Avbryter du talet fortsätter ett redan påbörjat jobb; din fortsättning väntar i textrutan medan Atlas arbetar.</p>
  </main>
}
