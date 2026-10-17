import type { AtlasLiveVoice } from './config'
import { decodeAtlasLiveEvent, type AtlasLiveEvent, type LiveCloseReason } from './protocol'

export interface LiveVoiceSnapshot {
  phase: 'idle' | 'connecting' | 'connected' | 'closing' | 'closed' | 'failed'
  sessionId: string | null
  observedSeconds: number
  audioBlocked: boolean
}

/** Browser diagnostics only. Server-side spend must use its own trusted events. */
export interface LiveVoiceCloseResult {
  confirmed: boolean
  seconds: number | null
  reason: LiveCloseReason | null
}

export interface LiveVoiceOptions {
  voice: AtlasLiveVoice
  /** Must be backed by an authenticated, governed server exchange before use. */
  exchange: (offer: { sdp: string; voice: AtlasLiveVoice }, signal: AbortSignal) => Promise<{ sessionId: string; sdp: string }>
  onEvent?: (event: AtlasLiveEvent) => void
  onNotice?: (code: 'audio_playback_blocked' | 'live_provider_error' | 'live_connection_lost') => void
}

export interface LiveVoiceDependencies {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  createPeer: () => RTCPeerConnection
  createAudio: () => HTMLAudioElement
  createRemoteStream: (track: MediaStreamTrack) => MediaStream
}

const browserDependencies: LiveVoiceDependencies = {
  getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
  createPeer: () => new RTCPeerConnection(),
  createAudio: () => new Audio(),
  createRemoteStream: track => new MediaStream([track]),
}
const unconfirmed = (): LiveVoiceCloseResult => ({ confirmed: false, seconds: null, reason: null })

/**
 * One session, one explicit connection attempt. No provider URL, credential,
 * retry, legacy-runtime dependency, or client-side spending authority.
 * Live owns turn-taking; transcript fragments never mute the microphone.
 */
export function createAtlasLiveVoiceTransport(options: LiveVoiceOptions, dependencies = browserDependencies) {
  const state: LiveVoiceSnapshot = { phase: 'idle', sessionId: null, observedSeconds: 0, audioBlocked: false }
  const abort = new AbortController()
  let microphone: MediaStream | null = null, peer: RTCPeerConnection | null = null
  let channel: RTCDataChannel | null = null, audio: HTMLAudioElement | null = null
  let closingTimer: ReturnType<typeof setTimeout> | null = null
  let attempted = false, ended = false, localReleased = false
  let resolveClosed!: (result: LiveVoiceCloseResult) => void
  const closed = new Promise<LiveVoiceCloseResult>(resolve => { resolveClosed = resolve })

  function stopTracks(stream: MediaStream) {
    for (const track of stream.getTracks()) { try { track.stop() } catch { /* release the remaining tracks */ } }
  }
  function silenceLocal() {
    if (localReleased) return
    localReleased = true
    if (microphone) { stopTracks(microphone); microphone = null }
    if (audio) {
      try { audio.pause() } catch { /* cleanup continues */ }
      audio.srcObject = null
    }
  }
  function notice(code: Parameters<NonNullable<LiveVoiceOptions['onNotice']>>[0]) {
    try { options.onNotice?.(code) } catch { /* a subscriber cannot own resource cleanup */ }
  }
  function notify(event: AtlasLiveEvent) {
    try { options.onEvent?.(event) } catch { /* state and device ownership remain here */ }
  }
  function finish(result: LiveVoiceCloseResult, phase: 'closed' | 'failed') {
    if (ended) return
    ended = true
    state.phase = phase
    abort.abort()
    if (closingTimer) clearTimeout(closingTimer)
    silenceLocal()
    if (channel) {
      channel.removeEventListener('message', onMessage)
      channel.removeEventListener('close', onConnectionLost)
      channel.removeEventListener('error', onConnectionLost)
      try { channel.close() } catch { /* peer cleanup still required */ }
    }
    if (peer) {
      peer.removeEventListener('track', onTrack)
      peer.removeEventListener('connectionstatechange', onPeerState)
      try { peer.close() } catch { /* all local resources already released */ }
    }
    resolveClosed(result)
  }
  function onConnectionLost() {
    if (ended) return
    notice('live_connection_lost')
    finish(unconfirmed(), 'failed')
  }
  function onPeerState() {
    if (peer && ['failed', 'closed', 'disconnected'].includes(peer.connectionState)) onConnectionLost()
  }
  const canPlayAudio = () => !ended && state.phase !== 'closing'
  async function playAudio() {
    if (!audio || !canPlayAudio()) return
    try {
      await audio.play()
      if (canPlayAudio()) state.audioBlocked = false
    } catch {
      if (canPlayAudio()) {
        state.audioBlocked = true
        notice('audio_playback_blocked')
      }
    }
  }
  function onTrack(event: RTCTrackEvent) {
    if (ended || state.phase === 'closing') { try { event.track.stop() } catch { /* already released */ }; return }
    if (!audio) return
    audio.srcObject = event.streams[0] ?? dependencies.createRemoteStream(event.track)
    void playAudio()
  }
  function onMessage(message: MessageEvent) {
    if (ended || typeof message.data !== 'string' || message.data.length > 131_072) return
    let raw: unknown
    try { raw = JSON.parse(message.data) } catch { return }
    const event = decodeAtlasLiveEvent(raw)
    if (!event || !state.sessionId) return
    if (event.type === 'session.closed') {
      if (event.sessionId !== state.sessionId || event.seconds < state.observedSeconds) return
      state.observedSeconds = event.seconds
      finish({ confirmed: true, seconds: event.seconds, reason: event.reason }, 'closed')
      notify(event)
      return
    }
    if (event.type === 'session.started') {
      if (event.sessionId !== state.sessionId || state.phase !== 'connecting') return
      state.phase = 'connected'
      notify(event)
      return
    }
    if (event.type === 'error') {
      notice('live_provider_error')
      finish(unconfirmed(), 'failed')
      notify(event)
      return
    }
    if (event.type === 'session.usage.updated') {
      // The provider can report additional billed duration while close drains.
      // Retain it so a regressing terminal report cannot look authoritative.
      if (state.phase !== 'connected' && state.phase !== 'closing') return
      state.observedSeconds = Math.max(state.observedSeconds, event.seconds)
      notify(event)
      return
    }
    if (state.phase !== 'connected') return
    notify(event)
  }

  async function connect() {
    if (attempted || ended) throw new Error('live_transport_one_shot')
    attempted = true
    state.phase = 'connecting'
    try {
      if (options.voice !== 'marin' && options.voice !== 'cedar') throw new Error('unsupported_live_voice')
      const captured = await dependencies.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      // Native permission cannot be aborted. A cancelled caller still owns and
      // must stop whatever the browser eventually returns.
      if (ended) { stopTracks(captured); return }
      microphone = captured
      audio = dependencies.createAudio()
      audio.autoplay = true
      peer = dependencies.createPeer()
      peer.addEventListener('track', onTrack)
      peer.addEventListener('connectionstatechange', onPeerState)
      for (const track of microphone.getAudioTracks()) peer.addTrack(track, microphone)
      channel = peer.createDataChannel('oai-events')
      channel.addEventListener('message', onMessage)
      channel.addEventListener('close', onConnectionLost)
      channel.addEventListener('error', onConnectionLost)
      const offer = await peer.createOffer()
      if (ended) return
      await peer.setLocalDescription(offer)
      if (ended) return
      const sdp = peer.localDescription?.sdp ?? offer.sdp
      if (!sdp?.trim()) throw new Error('missing_sdp_offer')
      const answer = await options.exchange({ sdp, voice: options.voice }, abort.signal)
      if (ended) return
      if (!answer || typeof answer.sessionId !== 'string' || !answer.sessionId.trim() || answer.sessionId.length > 256
        || typeof answer.sdp !== 'string' || !answer.sdp.trim() || answer.sdp.length > 65_536) throw new Error('invalid_session_answer')
      state.sessionId = answer.sessionId
      await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
    } catch {
      if (ended) return
      finish(unconfirmed(), 'failed')
      throw new Error('live_connection_failed')
    }
  }

  function close(): Promise<LiveVoiceCloseResult> {
    if (ended || state.phase === 'closing') return closed
    const canFinalize = state.phase === 'connected' && channel?.readyState === 'open'
    state.phase = 'closing'
    // Stop capture and playback immediately, but retain the event channel to
    // observe final usage. This wait is NOT a provider cost ceiling.
    silenceLocal()
    abort.abort()
    if (!canFinalize || !channel) { finish(unconfirmed(), 'closed'); return closed }
    closingTimer = setTimeout(() => finish(unconfirmed(), 'closed'), 2_000)
    try { channel.send(JSON.stringify({ type: 'session.close' })) } catch { finish(unconfirmed(), 'closed') }
    return closed
  }

  return { connect, close, resumeAudio: playAudio, snapshot: (): Readonly<LiveVoiceSnapshot> => ({ ...state }) }
}
