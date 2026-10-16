export const PCM_RATE = 16000
export const PCM_MAX_BYTES = PCM_RATE * 2 * 90

/** Weighted averaging retains fractional source position across worklet frames. */
export function createPcmResampler(sourceRate: number) {
  if (!Number.isFinite(sourceRate) || sourceRate < 8000 || sourceRate > 192000) throw new Error('unsupported_sample_rate')
  const width = sourceRate / PCM_RATE
  let weight = 0, sum = 0
  return (input: Float32Array): Float32Array => {
    const output: number[] = []
    for (const sample of input) {
      let remaining = 1
      while (remaining > 1e-9) {
        const used = Math.min(remaining, width - weight)
        sum += (Number.isFinite(sample) ? sample : 0) * used
        weight += used; remaining -= used
        if (weight >= width - 1e-9) { output.push(sum / width); sum = weight = 0 }
      }
    }
    return new Float32Array(output)
  }
}

export function pcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer)
  samples.forEach((sample, i) => {
    const value = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0))
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  })
  return bytes
}
