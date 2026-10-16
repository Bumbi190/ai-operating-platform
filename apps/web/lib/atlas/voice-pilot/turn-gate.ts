/** Prefer acoustic/native endpoints; final-only ASR uses a conservative quiet wait. */
export function createAcousticTurnGate(options: {
  pauseMs: number; receive(text: string): void; interrupt(): void
  endpoint?(quietMs: number): void
  finalize?(): void
}) {
  const pauseMs = Math.max(1200, Math.min(5000, options.pauseMs))
  let text = '', candidate: number | null = null, lastVoice: number | null = null
  let confirmed = false, lastSample = -Infinity
  let nativeSpeaking = false, nativeEnded = false, levelConfirmed = false, finalText = true, finalizing = false
  const discard = () => { text = ''; candidate = lastVoice = null; confirmed = nativeSpeaking = nativeEnded = levelConfirmed = finalizing = false; finalText = true }
  return {
    text(value: string, final = true) { text = value.trim(); finalText = final },
    recognitionFinal(now: number) {
      if (!Number.isFinite(now) || now < lastSample) return
      // An actual final native transcript is also speech evidence. Requiring
      // this to exceed RMS again stranded short/quiet answers in the draft.
      // A final segment does not mean native speech has ended. Without a
      // stronger endpoint, each fresh segment renews the fallback pause.
      if (!confirmed || (!nativeSpeaking && !nativeEnded && !levelConfirmed)) lastVoice = now
      if (!confirmed) { confirmed = true; options.interrupt() }
    },
    speechStart(now: number) {
      if (!Number.isFinite(now) || now < lastSample) return
      nativeSpeaking = true; nativeEnded = false; levelConfirmed = false; lastVoice = now
      // Native speech detection also covers quiet speech and a short "ja"
      // that never exceeds the fixed RMS threshold for 150 ms.
      if (!confirmed) { confirmed = true; options.interrupt() }
    },
    speechEnd(now: number) {
      if (!nativeSpeaking || !Number.isFinite(now) || now < lastSample) return
      nativeSpeaking = false; nativeEnded = true
      if (!levelConfirmed) lastVoice = now
    },
    discard,
    sample(rms: number, now: number) {
      if (!Number.isFinite(rms) || !Number.isFinite(now) || now < lastSample) return
      lastSample = now
      if (rms >= 0.015) {
        candidate ??= now
        lastVoice = now
        if (now - candidate >= 150) {
          levelConfirmed = true
          if (!confirmed) { confirmed = true; options.interrupt() }
        }
        return
      }
      candidate = null
      if (nativeSpeaking && !levelConfirmed) return
      if (confirmed && lastVoice !== null && now - lastVoice >= pauseMs && text) {
        if (!finalText) {
          if (!finalizing) { finalizing = true; options.finalize?.() }
          return
        }
        const utterance = text
        options.endpoint?.(now - lastVoice)
        discard()
        options.receive(utterance)
      }
    },
  }
}
