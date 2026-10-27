/** Local-only audio-level feedback. Never stores or transmits recorded samples. */
export type MicSignal = { level: number; voiceProbability: number }

export function createMicSignalMeter(
  emit: (signal: MicSignal) => void,
  now: () => number,
  intervalMs = 180,
) {
  let peak = 0, voicePeak = 0, lastEmit = -Infinity
  return {
    observe(samples: Float32Array, speechProbability: number) {
      if (!samples.length) return
      let total = 0
      for (let i = 0; i < samples.length; i++) total += samples[i] * samples[i]
      const rms = Math.sqrt(total / samples.length)
      peak = Math.max(peak, Number.isFinite(rms) ? rms : 0)
      voicePeak = Math.max(voicePeak, Number.isFinite(speechProbability) ? speechProbability : 0)
      const time = now()
      if (time - lastEmit >= intervalMs) {
        lastEmit = time
        emit({
          level: Math.min(1, Math.max(0, peak * 20)),
          voiceProbability: Math.min(1, Math.max(0, voicePeak)),
        })
        peak = 0; voicePeak = 0
      }
    },
    reset() { peak = 0; voicePeak = 0; lastEmit = -Infinity; emit({ level: 0, voiceProbability: 0 }) },
  }
}

/** Explicit device selection is local to the browser; no device ID goes to Atlas's server. */
export function microphoneConstraints(selectedDeviceId: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
  }
  if (selectedDeviceId && selectedDeviceId.length <= 512) {
    constraints.deviceId = { exact: selectedDeviceId }
  }
  return constraints
}

/**
 * External meter store: only the tiny meter subscribes, not the shared Atlas
 * runtime context. Its values are ephemeral numeric levels, not user audio.
 */
const silence: MicSignal = Object.freeze({ level: 0, voiceProbability: 0 })
export function createMicSignalStore() {
  let value = silence
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => value,
    getServerSnapshot: () => silence,
    update(next: MicSignal) {
      const level = Number.isFinite(next.level) ? Math.max(0, Math.min(1, next.level)) : 0
      const probability = Number.isFinite(next.voiceProbability) ? Math.max(0, Math.min(1, next.voiceProbability)) : 0
      if (level === value.level && probability === value.voiceProbability) return
      value = { level, voiceProbability: probability }
      listeners.forEach(listener => listener())
    },
    reset() {
      if (value === silence) return
      value = silence
      listeners.forEach(listener => listener())
    },
  }
}
export type MicSignalStore = ReturnType<typeof createMicSignalStore>
