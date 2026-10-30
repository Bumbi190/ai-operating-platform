'use client'

import Link from 'next/link'
import { Mic, MicOff, Play, Send, Square, ArrowLeft, Headphones } from 'lucide-react'
import { useOptionalAtlas } from '@/lib/atlas/runtime'
import { useAtlasVoiceSession } from '@/lib/atlas/voice-pilot/use-voice-session'
import { isAtlasSwedishVoice } from '@/lib/atlas/voice-pilot/voices'
const SAMPLE = 'Hej André! Det är Atlas. Vi tar det lugnt, du får tänka färdigt. Tryck på Avbryt och rätta om du vill ändra något. Ska vi kika på Omnira tillsammans?'
const SAMPLE_NAMES = 'I dag är det fredag den sextonde oktober. Vi ses i Hässleholm klockan halv tre. Jag har tittat på Handlarbörsen och Familje-Stunden. Vad vill du börja med?'

export function AtlasVoiceTrial(props: { streamingAvailable?: boolean; live?: boolean } = {}) {
  const atlas = useOptionalAtlas()
  // The authenticated live shell owns one session. The preview/isolated trial retains its local lifetime.
  if (props.live && atlas?.voiceConversationAvailable) return <main className="mx-auto w-full max-w-3xl px-5 py-8 text-white">
    <h1 className="text-3xl font-semibold">Prata med Atlas</h1>
    <p className="my-5 text-slate-300">Samtalet följer med när du öppnar projekt, kostnader och Bygg med Atlas. Minimera samtalsfönstret för att arbeta på sidan.</p>
    <button className="rounded-xl bg-teal-300 px-5 py-3 text-slate-950" onClick={atlas.activate}>{atlas.isSessionActive ? 'Visa röstsamtalet' : 'Starta samtalet'}</button>
  </main>
  return <AtlasVoiceTrialView {...props} />
}
function AtlasVoiceTrialView({ streamingAvailable = false, live = false }: { streamingAvailable?: boolean; live?: boolean }) {
  const atlas = useOptionalAtlas()
  const { snapshot, voices, voice, setVoice, inputMode, setInputMode, measurements, pauseMs, setPauseMs, playbackMode, setPlaybackMode,
    outputBusy, listening, transcribing, timing, mic, opening, speaking, draft, reply, notice, sending, sample, toggleMic,
    stopAll, interruptForCorrection, finish, editDraft, submitDraft } = useAtlasVoiceSession({ streamingAvailable, live, beforeStart: () => atlas?.deactivate() })
  const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'
  return <main className="mx-auto w-full max-w-3xl px-5 py-8 text-white">
    <Link href="/atlas" onClick={stopAll} className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16} /> Till Atlas</Link>
    <p className="text-xs font-medium uppercase tracking-widest text-teal-300">{live ? 'Omnira · röstsamtal' : 'Omnira · separat rösttest'}</p>
    <h1 className="mt-3 text-3xl font-semibold">{live ? 'Prata med Atlas' : 'Atlas, på naturlig svenska'}</h1>
    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">{live ? 'Välj röst, ljudläge och hur lång tankepaus du vill ha.' : 'Prova två svenska ElevenLabs-röster. Välj ljudläge och hur lång tankepaus du vill ha.'}</p>
    <section className="mt-7 rounded-2xl border border-white/10 bg-slate-900/70 p-5" aria-label="Röstinställningar">
      <div className="grid gap-4 sm:grid-cols-2">
        {streamingAvailable && <label className="text-sm text-slate-300">Taligenkänning<select value={inputMode} onChange={e => { stopAll(); setInputMode(e.target.value === 'streaming' ? 'streaming' : 'batch') }} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-white"><option value="batch">Vanlig taligenkänning</option><option value="streaming">{live ? 'Strömmande tal' : 'Strömmande tal · test'}</option></select></label>}
        <label className="text-sm text-slate-300">Röst<select value={voice} disabled={!voices.length} onChange={e => { stopAll(); if (isAtlasSwedishVoice(e.target.value)) setVoice(e.target.value) }} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-white">{!voices.length && <option>Hämtar svenska röster…</option>}{voices.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}</select></label>
        <label className="text-sm text-slate-300">Tid att tänka<select value={pauseMs} onChange={e => { stopAll(); setPauseMs(Number(e.target.value)) }} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-white"><option value={1200}>1,2 sekunder · snabbare turer</option><option value={1400}>1,4 sekunder · standard</option><option value={2000}>2 sekunders tystnad</option><option value={3500}>3,5 sekunder · gott om tid</option><option value={5000}>5 sekunder · längre tankepauser</option></select></label>
        <label className="text-sm text-slate-300">Ljud<select value={playbackMode} onChange={e => { stopAll(); setPlaybackMode(e.target.value === 'headphones' ? 'headphones' : 'speakers') }} className="mt-2 block w-full rounded-lg border border-white/15 bg-slate-950 p-3 text-white"><option value="speakers">Högtalare</option><option value="headphones">Hörlurar</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button className={button} disabled={!voices.length} onClick={() => void sample(SAMPLE)}><Play size={16} /> Provlyssna</button><button className={button} disabled={!voices.length} onClick={() => void sample(SAMPLE_NAMES)}>Testa svenska namn</button></div>
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><Headphones size={14} />{playbackMode === 'speakers' ? 'Med högtalare lyssnar Atlas när han har tystnat. Tryck på Avbryt och rätta för att stoppa rösten och börja prata när det står Atlas lyssnar.' : 'Med hörlurar kan du avbryta genom att börja prata.'}</p>
    </section>
    <section className="mt-5 rounded-2xl border border-white/10 bg-slate-900/40 p-5" aria-label={live ? "Röstsamtal" : "Testsamtal"}>
      <p className="mb-4 text-xs leading-5 text-slate-400">Tala när det står Atlas lyssnar. Atlas svarar automatiskt efter din paus. Klar med frågan är bara ett extra sätt att avsluta direkt.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button className={button + (mic || opening ? ' bg-teal-400/15 text-teal-200' : '')} disabled={!voices.length} onClick={() => void toggleMic()}>{mic || opening ? <MicOff size={17} /> : <Mic size={17} />}{opening ? 'Avbryt mikrofonstart' : mic ? 'Stäng mikrofonen' : 'Starta mikrofonen'}</button>
        <button className={button} onClick={stopAll}><Square size={15} /> Stoppa allt ljud</button>
        {(mic || sending || outputBusy) && <button className={button + ' border-teal-300 text-teal-200'} onClick={interruptForCorrection}>{mic ? 'Avbryt och rätta' : 'Stoppa rösten'}</button>}
        {mic && <button className={button} disabled={!listening || transcribing} onClick={() => void finish()}>Klar med frågan</button>}
        <p role="status" className="text-sm text-teal-200">{transcribing ? 'Atlas tolkar det du sa…' : speaking ? playbackMode === 'speakers' ? 'Atlas pratar · avbryt med knappen' : 'Atlas pratar · du kan avbryta' : mic || opening ? listening ? 'Atlas lyssnar' : 'Vänta ett ögonblick · mikrofonen görs redo' : 'Mikrofonen är avstängd'}</p>
      </div>
      {notice && <p role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">{notice}</p>}
      <div className="mt-5 space-y-4" aria-live="polite">
        {snapshot.history.map((message, index) => <div key={index} className={message.role === 'user' ? 'ml-8 rounded-xl bg-teal-500/10 p-4' : 'mr-8 rounded-xl bg-white/5 p-4'}><p className="mb-1 text-xs text-slate-400">{message.role === 'user' ? 'Du' : 'Atlas'}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p></div>)}
        {snapshot.pending && <p className="text-sm leading-6 text-slate-300">{reply || 'Atlas tänker…'}</p>}
      </div>
      <form className="mt-5" onSubmit={e => { e.preventDefault(); void submitDraft() }}>
        <label htmlFor="voice-draft" className="text-sm text-slate-300">Det du vill säga</label>
        <textarea id="voice-draft" value={draft} onChange={e => { editDraft(e.target.value) }} rows={3} placeholder="Prata eller skriv till Atlas…" className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-slate-950 p-3 text-sm focus:border-teal-300 focus:outline-none" />
        <button className={button + ' mt-3 bg-teal-300 text-slate-950 hover:bg-teal-200'} disabled={sending || snapshot.pending || !draft.trim()}><Send size={16} />{sending ? 'Atlas arbetar…' : 'Skicka'}</button>
      </form>
      {timing && <details className="mt-4 text-xs leading-6 text-slate-400"><summary className="cursor-pointer">Svarstid i senaste frågan</summary><p>{timing.quietMs !== null && <>Väntan före skickat: {(timing.quietMs / 1000).toFixed(1)} s. </>}Till första text: {timing.textMs === null ? '—' : (timing.textMs / 1000).toFixed(1) + ' s'}. Till ljudstart: {timing.audioMs === null ? '—' : (timing.audioMs / 1000).toFixed(1) + ' s'}.</p></details>}
      {measurements.length > 0 && <details className="mt-3 text-xs leading-6 text-slate-400"><summary>Svarstider under detta besök ({measurements.length}/40)</summary><p>Från sista tal till schemalagd ljudstart. Bekräfta själv att ljudet hörs.</p><ol>{measurements.map((sample, index) => <li key={index}>{sample.mode === 'streaming' ? 'Strömmande' : 'Vanlig'}: {(sample.endToPlaybackMs / 1000).toFixed(2)} s</li>)}</ol></details>}
      {snapshot.id && <Link href={'/chat/' + snapshot.id} onClick={stopAll} className="mt-4 inline-block text-sm text-teal-200 underline underline-offset-4">Öppna samtalet för projektjobb och godkännanden</Link>}
    </section>
    <p className="mt-5 text-xs leading-5 text-slate-400">Taligenkänning debiteras efter inspelad ljudtid och rösten per uppläst tecken inom Omniras kostnadskontroll. Atlas chattkostnad tillkommer. Avbryter du talet fortsätter ett redan påbörjat jobb; din talade fortsättning väntar i textrutan och skickas när svaret är klart. Redigering eller Stoppa allt ljud avbryter automatisk skickning.</p>
  </main>
}
