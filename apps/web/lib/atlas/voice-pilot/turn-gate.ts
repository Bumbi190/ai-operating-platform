/** Acoustic inactivity, not transcript arrival, decides when a thought may end. */
export function createAcousticTurnGate(options: {
  pauseMs: number; receive(text: string): void; interrupt(): void
  endpoint?(quietMs: number): void
}) {
  const pauseMs = Math.max(1200, Math.min(5000, options.pauseMs))
  let text = '', candidate: number | null = null, lastVoice: number | null = null
  let confirmed = false, lastSample = -Infinity
  const discard = () => { text = ''; candidate = lastVoice = null; confirmed = false }
  return {
    text(value: string) { text = value.trim() },
    discard,
    sample(rms: number, now: number) {
      if (!Number.isFinite(rms) || !Number.isFinite(now) || now < lastSample) return
      lastSample = now
      if (rms >= 0.015) {
        candidate ??= now
        lastVoice = now
        if (!confirmed && now - candidate >= 150) {
          confirmed = true
          options.interrupt()
        }
        return
      }
      candidate = null
      if (confirmed && lastVoice !== null && now - lastVoice >= pauseMs && text) {
        const utterance = text
        options.endpoint?.(now - lastVoice)
        discard()
        options.receive(utterance)
      }
    },
  }
}
