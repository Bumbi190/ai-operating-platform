/* Same-origin microphone worklet. Sends ~20 ms mono frames; output stays silent. */
class AtlasVoiceRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frame = new Float32Array(Math.round(sampleRate / 50))
    this.offset = 0
  }
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel) for (const sample of channel) {
      this.frame[this.offset++] = sample
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame, [this.frame.buffer])
        this.frame = new Float32Array(Math.round(sampleRate / 50)); this.offset = 0
      }
    }
    return true
  }
}
registerProcessor('atlas-voice-recorder', AtlasVoiceRecorder)
