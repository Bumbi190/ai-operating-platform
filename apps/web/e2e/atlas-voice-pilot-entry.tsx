// Native Web Audio/worklet + real local Silero + simulated transcription/API. No paid calls, mic permission,
// project jobs or login. Controls make lifecycle races reproducible through UI.
import React, { useState, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { AtlasVoiceTrial } from '../app/(platform)/atlas/rosttest/voice-trial'
import { AtlasRuntimeProvider, useAtlas } from '../lib/atlas/runtime'
import { AtlasConversationProvider, useAtlasConversation } from '../lib/atlas/conversation/provider'
import { AtlasChatConversation } from '../components/platform/vnext/AtlasChatConversation'
import { AtlasHomeVNext } from '../components/platform/vnext/AtlasHomeVNext'
import { usePathname, useRouter } from './atlas-overview-messenger-navigation'
import { simulateSignout } from './atlas-voice-pilot-boundaries'
import '../app/globals.css'

const nativeContext = window.AudioContext
let delayResume = false, delayCreate = false, holdChat = true
let pendingResumes: (() => void)[] = [], releaseCreate: (() => void) | undefined
let chat: ReadableStreamDefaultController<Uint8Array> | null = null
let mediaContext: AudioContext | null = null, gain: GainNode | null = null
let speechBuffer: AudioBuffer | null = null, background: GainNode | null = null
const nativeFetch = window.fetch.bind(window)
const initialParams = new URLSearchParams(location.search)
const chatBodies: any[] = [], creations: any[] = [], resumes: boolean[] = []
Object.assign(window, { fixtureChatBodies: chatBodies, fixtureCreations: creations, fixtureResumes: resumes, legacyStarts: 0, microphoneStarts: 0, voiceLookupsCompleted: 0 })
class ForbiddenLegacyRecognition { start() { (window as any).legacyStarts++; throw new Error('Legacy voice must not start') } }
Object.assign(window, { SpeechRecognition: ForbiddenLegacyRecognition, webkitSpeechRecognition: ForbiddenLegacyRecognition })

let tracks = 0, speechRequests = 0, chatRequests = 0, transcriptionRequests = 0, update = () => {}
let transcription = '', delayTranscription = false, releaseTranscription: (() => void) | undefined
const encoder = new TextEncoder()
const event = (value: unknown) => encoder.encode('data: ' + JSON.stringify(value) + '\n\n')

class DelayedContext extends nativeContext {
  resume(): Promise<void> {
    resumes.push(navigator.userActivation.isActive)
    if (!delayResume) return super.resume()
    return new Promise(resolve => pendingResumes.push(() => { void super.resume().then(resolve) }))
  }
}
window.AudioContext = DelayedContext
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
  ;(window as any).microphoneStarts++
  if (initialParams.has('denied')) throw new DOMException('Microphone denied', 'NotAllowedError')
  mediaContext ??= new nativeContext()
  await mediaContext.resume()
  const destination = mediaContext.createMediaStreamDestination()
  speechBuffer ??= await mediaContext.decodeAudioData(await (await nativeFetch('/e2e/fixtures/voice-question.wav')).arrayBuffer())
  const noise = mediaContext.createBufferSource(), buffer = mediaContext.createBuffer(1, mediaContext.sampleRate, mediaContext.sampleRate)
  let seed = 42
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = (seed / 4294967296 - 0.5) * 2 }
  noise.buffer = buffer; noise.loop = true
  background = mediaContext.createGain(); background.gain.value = 0.002
  noise.connect(background); background.connect(destination); noise.start()
  gain = mediaContext.createGain(); gain.gain.value = 0.4; gain.connect(destination)
  for (const track of destination.stream.getTracks()) {
    tracks++; const original = track.stop.bind(track); let closed = false
    track.stop = () => { if (!closed) { closed = true; tracks--; noise.stop(); background?.disconnect(); gain?.disconnect(); original(); update() } }
  }
  update(); return destination.stream
} })

window.fetch = async (input, init) => {
  const url = String(input)
  if (url === '/__voice-stream-fixture') return nativeFetch(input, init)
  if (url.startsWith('/atlas-vad/') || url.includes('/atlas-vad/')) return nativeFetch(input, init)
  if (url === '/api/atlas/voice-pilot/speech' && !init?.method) {
    if (initialParams.has('slow-voices')) await new Promise(resolve => setTimeout(resolve, 1500))
    ;(window as any).voiceLookupsCompleted++; update()
    return Response.json({ voices: [
    { key: 'anders', label: 'Anders · varm rikssvenska' }, { key: 'peter', label: 'Peter · naturlig skånska' },
  ] }) }
  if (url === '/api/conversations') {
    creations.push(JSON.parse(String(init?.body)))
    if (delayCreate) await new Promise<void>(resolve => { releaseCreate = resolve })
    return Response.json({ id: '50000000-0000-4000-8000-000000000001' })
  }
  if (url === '/api/chat') {
    chatBodies.push(JSON.parse(String(init?.body)))
    chatRequests++; update()
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      chat = controller
      if (initialParams.has('navigate')) controller.enqueue(event({ event: 'navigate', href: '/costs' }))
      controller.enqueue(event({ event: 'text', text: 'Jag tittar på det. ' }))
      if (!holdChat) { controller.enqueue(event({ event: 'done' })); controller.close(); chat = null }
    } }))
  }
  if (url === '/api/atlas/voice-pilot/speech' && init?.method === 'POST') {
    if (new Headers(init.headers).get('content-type') === 'audio/pcm') {
      transcriptionRequests++; update()
      const text = transcription
      if (delayTranscription) await new Promise<void>(resolve => { releaseTranscription = resolve })
      init.signal?.throwIfAborted()
      return Response.json({ text })
    }
    speechRequests++; update()
    const bytes = new Uint8Array(24_000 * 2 * 3), view = new DataView(bytes.buffer)
    for (let i = 0; i < bytes.length / 2; i++) view.setInt16(i * 2, Math.sin(i * 2 * Math.PI * 440 / 24_000) * 600, true)
    return new Response(bytes, { headers: { 'Content-Type': 'audio/pcm' } })
  }
  throw new Error('Fixture refused unexpected network request: ' + url)
}

async function say(text: string, quiet = false, seconds?: number) {
  if (!tracks || !gain || !mediaContext || !speechBuffer) throw new Error('Start the fixture microphone first')
  transcription = text
  await nativeFetch('/__voice-stream-fixture', { method: 'POST', body: JSON.stringify({ text, delay: delayTranscription }) })
  gain.gain.value = quiet ? 0.015 : 0.4
  if (background) background.gain.value = quiet ? 0.0001 : 0.002
  const source = mediaContext.createBufferSource(); source.buffer = speechBuffer; source.connect(gain); source.loop = !!seconds; source.start(); if (seconds) source.stop(mediaContext.currentTime + seconds)
  await new Promise<void>(resolve => { source.onended = () => { source.disconnect(); resolve() } })
}
const shell = new URLSearchParams(location.search).has('shell')
function ShellWorkspace() {
  const atlas=useAtlas(), path=usePathname(), router=useRouter(), { controller } = useAtlasConversation()
  const chatId=path.split('/')[2]??'50000000-0000-4000-8000-000000000002'
  const chatModel=useMemo(()=>({id:chatId,title:'Fixture full chat',projectName:'Testprojekt',projectId:controller.snapshot().id===chatId?controller.snapshot().projectId:'project-b',state:'ok' as const,saved:[],chatBase:'/chat'}),[chatId])
  const model={projects:[],activity:[],generatedAt:'2026-10-17T10:00:00Z',totals:{projects:0,runningRuns:0,pendingApprovals:0,failedRuns24h:0},availability:{projects:true,runs:true,approvals:true}}
  return <><nav aria-label="Sidnavigation">{['/atlas/rosttest','/atlas/rost','/dashboard','/projects/test-project','/costs','/chat/50000000-0000-4000-8000-000000000002'].map(p=><button key={p} onClick={()=>router.push(p)}>{p}</button>)}<button onClick={()=>controller.activateConversation({id:'50000000-0000-4000-8000-000000000002',saved:[],state:'ok',projectId:'project-b'})}>Byt samtal</button><button onClick={atlas.activate}>Starta globalt samtal</button><button onClick={atlas.deactivate}>Avsluta globalt samtal</button></nav>{path==='/atlas/rosttest'?<AtlasHomeVNext model={model} collaboratorReadOnly={initialParams.has('readonly')} voiceHref="/atlas/rost" />:path==='/atlas/rost'?<AtlasVoiceTrial live streamingAvailable />:path.startsWith('/chat/')?<AtlasChatConversation model={chatModel}/>:<p>Aktuell vy: {path}</p>}</>
}
function Shell() { return <AtlasConversationProvider><AtlasRuntimeProvider projects={[{id:'project-a',slug:'test-project',name:'Testprojekt',color:'#69c'}]} voiceConversationEnabled={!new URLSearchParams(location.search).has('readonly')} voiceReadOnly={new URLSearchParams(location.search).has('readonly')}><ShellWorkspace /></AtlasRuntimeProvider></AtlasConversationProvider> }
function Fixture() {
  const [, render] = useState(0); update = () => render(n => n + 1)
  const style = { background: '#172033', color: '#fff', padding: 8, border: '1px solid #65758a', margin: 4 }
  return <>
    <details style={{ color: '#fff', padding: 12 }} open><summary>UI-testkontroller · simulerat ljud och API, inga avgifter</summary>
      <button style={style} onClick={() => { delayResume = !delayResume; update() }}>Fördröj ljudstart: {delayResume ? 'på' : 'av'}</button>
      <button style={style} onClick={() => { const pending = pendingResumes; pendingResumes = []; pending.forEach(resolve => resolve()); update() }}>Släpp ljudstart</button>
      <button style={style} onClick={() => { delayCreate = !delayCreate; update() }}>Fördröj chattskapande: {delayCreate ? 'på' : 'av'}</button>
      <button style={style} onClick={() => { releaseCreate?.(); releaseCreate = undefined }}>Släpp chattskapande</button>
      <button style={style} onClick={() => { holdChat = !holdChat; update() }}>Håll chattsvar: {holdChat ? 'på' : 'av'}</button>
      <button style={style} onClick={() => { chat?.enqueue(event({ event: 'done' })); chat?.close(); chat = null }}>Släpp chattsvar</button>
      <button style={style} onClick={() => void say('Testa en vanlig fråga.')}>Säg första frågan</button>
      <button style={style} onClick={() => void say('En sammanhängande längre fråga.', false, 22)}>Säg lång fråga</button>
      <button style={style} onClick={() => void say('En fråga för manuell granskning.', false, 92)}>Säg överlång fråga</button>
      <button style={style} onClick={() => void say('En lågmäld fråga.', true)}>Säg lågmäld fråga</button>
      <button style={style} onClick={() => void say('Lägg till en blå knapp.')}>Säg första avbrottet</button>
      <button style={style} onClick={() => void say('Och gör den stor.')}>Säg andra avbrottet</button>
      <button style={style} onClick={() => { delayTranscription = !delayTranscription; update() }}>Fördröj tolkning: {delayTranscription ? 'på' : 'av'}</button>
      <button style={style} onClick={() => { releaseTranscription?.(); releaseTranscription = undefined; void nativeFetch('/__voice-stream-fixture', { method: 'POST', body: JSON.stringify({ release: true }) }) }}>Släpp tolkning</button>
      <button style={style} onClick={() => { chat?.enqueue(event({ event: 'error', message: 'Testfel' })); chat?.close(); chat = null }}>Avsluta med fel</button>
      <button style={style} onClick={simulateSignout}>Simulera utloggning</button>
      <p role="status">Aktiva mikrofonspår: {tracks}. Talbegäranden: {speechRequests}. Chattbegäranden: {chatRequests}. Transkriberingar: {transcriptionRequests}.</p>
    </details>
    {shell ? <Shell /> : <AtlasVoiceTrial live={new URLSearchParams(location.search).get('live') === '1'} streamingAvailable={new URLSearchParams(location.search).get('streaming') === '1' || new URLSearchParams(location.search).get('live') === '1'} />}
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
