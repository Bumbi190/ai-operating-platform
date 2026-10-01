/**
 * Deterministic local Phase B microbenchmark.
 *
 * Synthetic only: no credentials, database, provider, network, or production
 * writes. It compares the old wait topology with the bounded implementation.
 */
import { performance } from 'node:perf_hooks'
import { readAtlasContextSlices } from '../lib/atlas/context-slices'
import { IncrementalSpeechSegmenter } from '../lib/atlas/speech-segmenter'

const SAMPLES = 12
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil((percentileValue / 100) * sorted.length) - 1]
}

function summary(values: number[]) {
  return {
    samples: values.length,
    min_ms: Math.round(Math.min(...values) * 10) / 10,
    p50_ms: Math.round(percentile(values, 50) * 10) / 10,
    p95_ms: Math.round(percentile(values, 95) * 10) / 10,
    max_ms: Math.round(Math.max(...values) * 10) / 10,
  }
}

async function contextSample(parallel: boolean): Promise<number> {
  const waits = [8, 12, 16, 20]
  const readers = waits.map((ms, index) => async () => {
    await delay(ms)
    return index === 2 ? { text: 'action', hasRecentDelegation: false } : `slice-${index}`
  })
  const start = performance.now()
  if (parallel) {
    await readAtlasContextSlices({
      live: readers[0] as () => Promise<string>,
      tool: readers[1] as () => Promise<string>,
      action: readers[2] as () => Promise<{ text: string; hasRecentDelegation: boolean }>,
      records: readers[3] as () => Promise<string>,
    })
  } else {
    await readers[0](); await readers[1](); await readers[2](); await readers[3]()
  }
  return performance.now() - start
}

async function speechSample(softBoundary: boolean): Promise<number> {
  const chunks = [
    'Jag har granskat dagens viktigaste signaler, ',
    'och allt ser stabilt ut just nu.',
  ]
  const segmenter = new IncrementalSpeechSegmenter()
  const start = performance.now()
  await delay(10)
  if (softBoundary && segmenter.push(chunks[0]).length) return performance.now() - start
  await delay(20)
  const complete = chunks.join('')
  if (softBoundary) segmenter.push(chunks[1])
  else if (/[.!?…]+\s*$/u.test(complete)) return performance.now() - start
  return performance.now() - start
}

async function transportSample(streamed: boolean): Promise<number> {
  const start = performance.now()
  await delay(8) // response headers + first bytes
  if (streamed) return performance.now() - start
  await delay(24) // remaining body before the old arrayBuffer() route returned
  return performance.now() - start
}

async function samples(run: () => Promise<number>): Promise<number[]> {
  const values: number[] = []
  for (let i = 0; i < SAMPLES; i += 1) values.push(await run())
  return values
}

async function main() {
  const result = {
    kind: 'synthetic_local_controlled',
    samples_per_case: SAMPLES,
    context_assembly: {
      before_sequential: summary(await samples(() => contextSample(false))),
      after_parallel: summary(await samples(() => contextSample(true))),
    },
    first_speakable: {
      before_sentence_only: summary(await samples(() => speechSample(false))),
      after_soft_boundary: summary(await samples(() => speechSample(true))),
    },
    tts_proxy_transport: {
      before_full_buffer: summary(await samples(() => transportSample(false))),
      after_pass_through: summary(await samples(() => transportSample(true))),
    },
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

void main()
