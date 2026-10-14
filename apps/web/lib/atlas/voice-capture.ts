export type CaptureResultEvent = { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }
export interface CaptureRecognition {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: CaptureResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
/** A single receiver owns one utterance. It yields text, never sends or builds. */
export function createVoiceCaptureDriver(factory: () => CaptureRecognition | null) {
  let generation = 0, activeCleanup: (() => void) | null = null
  const stop = () => { generation++; activeCleanup?.(); activeCleanup = null }
  const capture = (receive: (text: string) => void, report: (message: string) => void = () => {}) => {
    stop(); const token = generation; let live = true, rec: CaptureRecognition | null = null
    const cleanup = () => { if (!live) return; live = false; if (rec) { rec.onresult = null; rec.onerror = null; rec.onend = null; try { rec.abort() } catch { /* already stopped */ } } }
    activeCleanup = cleanup
    try { rec = factory() } catch { /* browser unavailable */ }
    if (!rec) { cleanup(); report('Röstinmatning stöds inte här. Du kan skriva text.'); return cleanup }
    rec.lang = 'sv-SE'; rec.continuous = false; rec.interimResults = false
    rec.onresult = event => {
      if (!live || token !== generation) return
      const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim()
      if (text) { cleanup(); receive(text) }
    }
    rec.onerror = event => {
      if (!live || token !== generation) return
      cleanup(); report(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Mikrofonåtkomst nekad. Du kan fortsätta med text.' : 'Rösten kunde inte fångas. Du kan fortsätta med text.')
    }
    rec.onend = () => { if (live && token === generation) { cleanup(); report('Ingen färdig rösttext fångades. Du kan skriva text eller försöka igen.') } }
    try { rec.start() } catch { cleanup(); report('Mikrofonen kunde inte starta. Du kan skriva text.') }
    return cleanup
  }
  return { capture, stop }
}
export function browserCaptureRecognition(): CaptureRecognition | null {
  const source = window as unknown as { SpeechRecognition?: new () => CaptureRecognition; webkitSpeechRecognition?: new () => CaptureRecognition }
  const Recognition = source.SpeechRecognition || source.webkitSpeechRecognition
  return Recognition ? new Recognition() : null
}
