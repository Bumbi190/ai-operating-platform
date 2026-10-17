import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({
  reserve: vi.fn(), settle: vi.fn(), release: vi.fn(), mark: vi.fn(), waitUntil: vi.fn(), dispose: vi.fn(), admit: vi.fn(),
  socket: null as any, created: 0, order: [] as string[], watch: null as AbortController | null,
}))
vi.mock('@vercel/functions', () => ({ waitUntil: (work: Promise<unknown>) => s.waitUntil(work) }))
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (...a: unknown[]) => s.reserve(...a), settleSpend: (...a: unknown[]) => s.settle(...a),
  releaseSpend: (...a: unknown[]) => s.release(...a), markSpendDispatchIntent: (...a: unknown[]) => s.mark(...a),
  openOverrideReservation: async () => null,
}))
vi.mock('@/lib/cost/advisory-override', () => ({ recordAdvisoryOverride: async () => {} }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10, elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour: 0.48 }) }))
vi.mock('@/lib/cost/atlas-realtime-billing', () => ({ verifiedAtlasRealtimeRate: () => 0.48 }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/governance/execution-stop', async orig => ({
  ...await orig<any>(), resolveExecutionStopForContract: async () => ({ allowed: true, resolution: 'RESOLVED' }),
}))
vi.mock('@/lib/governance/execution-signal', async orig => ({
  ...await orig<any>(), admitPhysicalRequest: (...a: unknown[]) => s.admit(...a),
  watchExecutionAuthority: () => ({ signal: s.watch!.signal, abortReason: null, authorityUnavailable: false, dispose: s.dispose }),
}))
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  return { default: class Socket extends EventEmitter {
    readyState = 1; bufferedAmount = 0; sent: any[] = []
    constructor() {
      super(); s.created++; s.order.push('connect'); s.socket = this
      queueMicrotask(() => this.provider({ message_type: 'session_started', config: { model_id: 'scribe_v2_realtime', language_code: 'swe', sample_rate: 16000, audio_format: 'pcm_16000' } }))
    }
    provider(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value)), false) }
    send(raw: string, callback?: (error?: Error) => void) { this.sent.push(JSON.parse(raw)); callback?.() }
    close(code: number) { this.readyState = 3; this.emit('close', code) }
    terminate() { this.readyState = 3; this.emit('close', 1006) }
  } }
})
import { openAtlasSwedishRealtime } from '@/lib/media/elevenlabs-realtime'
const ctx = { project: { projectId: 'project-test' }, operation: 'test-realtime',
  execution: { context: 'OPERATOR_INTERACTIVE' as const, scope: { kind: 'GLOBAL_ONLY' as const } } }
const settled = { settled: true, result: 'settled', settledSek: 0.16, ceilingExceeded: false }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ELEVENLABS_API_KEY', 'synthetic-key')
  s.socket = null; s.created = 0; s.order = []; s.watch = new AbortController()
  s.reserve.mockImplementation(async () => { s.order.push('reserve'); return { allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok', reservationId: 'res-test' } })
  s.mark.mockImplementation(async () => { s.order.push('intent'); return true })
  s.settle.mockResolvedValue(settled); s.admit.mockImplementation(async () => { s.order.push('admit') })
})
afterEach(async () => {
  s.socket?.terminate()
  for (const [work] of s.waitUntil.mock.calls) await work
  vi.unstubAllEnvs()
})
const start = (signal = new AbortController().signal) => openAtlasSwedishRealtime(ctx, signal)
it('records intent before connecting and keeps full cost pending until session termination and durable RPC', async () => {
  let releaseRpc!: (value: typeof settled) => void
  s.settle.mockReturnValue(new Promise(resolve => { releaseRpc = resolve }))
  try {
    const turn = await start()
    expect(s.order).toEqual(['reserve', 'intent', 'admit', 'connect'])
    expect(s.waitUntil).toHaveBeenCalledTimes(1); expect(s.settle).not.toHaveBeenCalled(); expect(s.release).not.toHaveBeenCalled()
    turn.send(new Uint8Array(6400)); const final = turn.finish('pause')
    s.socket.provider({ message_type: 'committed_transcript', text: 'Hej' })
    await expect(final).resolves.toBe('Hej')
    await vi.waitFor(() => expect(s.settle).toHaveBeenCalledTimes(1))
    expect(s.settle.mock.calls[0][1]).toMatchObject({ kind: 'estimate_unmetered', rows: [] })
    let durableDone = false; void s.waitUntil.mock.calls[0][0].then(() => { durableDone = true })
    await Promise.resolve(); expect(durableDone).toBe(false)
    releaseRpc(settled); await s.waitUntil.mock.calls[0][0]
    expect(s.dispose).toHaveBeenCalledTimes(1)
  } finally { releaseRpc?.(settled) }
})
it.each(['client_abort', 'socket_loss', 'revocation'])('holds the full ambiguous ceiling after %s and never reconnects', async mode => {
  const controller = new AbortController(), turn = await start(controller.signal)
  turn.send(new Uint8Array(6400))
  if (mode === 'client_abort') controller.abort()
  else if (mode === 'revocation') s.watch!.abort()
  else s.socket.terminate()
  await s.waitUntil.mock.calls[0][0]
  expect(s.settle.mock.calls[0][1]).toMatchObject({ kind: 'estimate_ambiguous', rows: [] })
  expect(s.release).not.toHaveBeenCalled(); expect(s.created).toBe(1)
})
it('retains the reservation when durable settlement fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    s.settle.mockResolvedValue({ ...settled, settled: false, result: 'failed' })
    const turn = await start(); turn.abort(); await s.waitUntil.mock.calls[0][0]
    expect(s.release).not.toHaveBeenCalled()
    expect(log.mock.calls.flat().join(' ')).toContain('stays held')
  } finally { log.mockRestore() }
})
it('releases a proven pre-constructor caller cancellation after admission', async () => {
  const controller = new AbortController()
  s.admit.mockImplementation(async () => { controller.abort() })
  await expect(start(controller.signal)).rejects.toBeDefined()
  expect(s.created).toBe(0); expect(s.release).toHaveBeenCalledTimes(1); expect(s.settle).not.toHaveBeenCalled()
})
it('does not connect when durable dispatch intent cannot be recorded', async () => {
  s.mark.mockResolvedValue(false)
  await expect(start()).rejects.toBeDefined()
  expect(s.created).toBe(0); expect(s.release).toHaveBeenCalledTimes(1)
})
