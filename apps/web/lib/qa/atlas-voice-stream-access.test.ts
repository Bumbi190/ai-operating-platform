import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const state = vi.hoisted(() => ({
  auth: { ok: true, userId: 'operator' } as any,
  membership: { role: 'owner', revoked_at: null } as any,
  memberError: null as any, owns: false, ownershipError: null as any, hanging: false,
  release: null as null | (() => void),
  upgraded: vi.fn(), socket: null as any,
}))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: async () => state.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => {
      if (state.hanging) await new Promise<void>(resolve => { state.release = resolve })
      return { data: state.membership, error: state.memberError }
    },
    limit: async () => ({ data: state.owns ? [{ id: 'owned' }] : [], error: state.ownershipError }),
  }) }) }),
}) }))
vi.mock('@vercel/functions', () => ({
  upgradeWebSocket: async (handler: (ws: any) => Promise<void>, options: unknown) => {
    state.upgraded(options)
    void handler(state.socket)
    return new Response(null, { status: 204 })
  },
}))
// Import failure is caught so the first RED is an assertion of the missing route,
// rather than a test-collection error. All behavior tests use the actual route.
const route = () => import('@/app/api/atlas/voice-pilot/stream/route')
class Socket extends EventEmitter {
  readyState = 1
  bufferedAmount = 0
  sent: Buffer[] = []
  send(bytes: Uint8Array, options?: unknown, callback?: (error?: Error) => void) { this.sent.push(Buffer.from(bytes)); callback?.() }
  terminate() { this.readyState = 3; this.emit('close') }
  close() { this.terminate() }
}
const request = (origin: string | null = 'https://preview.test', signal?: AbortSignal) => new Request('https://preview.test/api/atlas/voice-pilot/stream', {
  headers: { ...(origin === null ? {} : { origin }), upgrade: 'websocket', connection: 'Upgrade' }, signal,
})
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('ATLAS_VOICE_STREAM_MODE', 'probe')
  state.auth = { ok: true, userId: 'operator' }; state.membership = { role: 'owner', revoked_at: null }
  state.memberError = state.ownershipError = null; state.owns = state.hanging = false; state.release = null
  state.upgraded.mockClear(); state.socket = new Socket()
})
afterEach(() => { state.socket?.terminate(); vi.useRealTimers(); vi.unstubAllEnvs() })
describe('preview WebSocket access before upgrade', () => {
  it('provides the preview GET handler', async () => {
    const value = await route().catch(() => null)
    expect(value?.GET, 'stream route GET is missing').toBeTypeOf('function')
  })
  it.each(['production', 'disabled', 'pilot'])('does not expose the probe in %s mode', async scenario => {
    if (scenario === 'production') vi.stubEnv('VERCEL_ENV', 'production')
    else vi.stubEnv('ATLAS_VOICE_STREAM_MODE', scenario === 'disabled' ? '' : 'pilot')
    expect((await (await route()).GET(request())).status).toBe(404)
    expect(state.upgraded).not.toHaveBeenCalled()
  })
  it.each([null, 'https://evil.test', 'null'])('denies origin %s without upgrading', async origin => {
    expect((await (await route()).GET(request(origin))).status).toBe(403)
    expect(state.upgraded).not.toHaveBeenCalled()
  })
  it.each(['anonymous', 'nonoperator', 'collaborator', 'revoked', 'unknown', 'lookup_failure', 'ownership_failure'])('denies %s before upgrading', async scenario => {
    if (scenario === 'anonymous' || scenario === 'nonoperator') state.auth = { ok: false, reason: scenario === 'anonymous' ? 'unauthenticated' : 'not_platform_operator' }
    if (scenario === 'collaborator' || scenario === 'revoked') { state.membership = { role: 'collaborator', revoked_at: scenario === 'revoked' ? 'yesterday' : null }; state.owns = true }
    if (scenario === 'unknown' || scenario === 'lookup_failure' || scenario === 'ownership_failure') state.membership = null
    if (scenario === 'lookup_failure') state.memberError = { message: 'unavailable' }
    if (scenario === 'ownership_failure') { state.owns = true; state.ownershipError = {} }
    expect((await (await route()).GET(request())).status).toBe(scenario === 'anonymous' ? 401 : 403)
    expect(state.upgraded).not.toHaveBeenCalled()
  })
  it('preserves verified legacy ownership', async () => {
    state.membership = null; state.owns = true
    expect((await (await route()).GET(request())).status).toBe(204)
    expect(state.upgraded).toHaveBeenCalledWith({ maxPayload: 6404 })
  })
  it('fails a stalled membership read at 5 s and cannot upgrade after late recovery', async () => {
    vi.useFakeTimers(); state.hanging = true
    const GET = (await route()).GET
    const response = GET(request())
    await vi.advanceTimersByTimeAsync(5000)
    expect((await response).status).toBe(503)
    state.release?.(); await vi.advanceTimersByTimeAsync(0)
    expect(state.upgraded).not.toHaveBeenCalled()
  })
  it('does not upgrade a canceled request', async () => {
    const abort = new AbortController(); abort.abort()
    expect((await (await route()).GET(request(undefined, abort.signal))).status).toBe(503)
    expect(state.upgraded).not.toHaveBeenCalled()
  })
})
describe('bounded no-provider echo probe', () => {
  it('echoes exact binary data and closes at five seconds', async () => {
    vi.useFakeTimers()
    expect((await (await route()).GET(request())).status).toBe(204)
    const input = Buffer.from([0, 255, 22, 34])
    state.socket.emit('message', input, true)
    expect(state.socket.sent).toEqual([input])
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.socket.readyState).toBe(3)
    expect(state.socket.listenerCount('message')).toBe(0)
  })
  it.each(['text', 'oversize', 'backpressure', 'error', 'abort'])('terminates safely on %s', async scenario => {
    const abort = new AbortController()
    await (await route()).GET(request(undefined, abort.signal))
    if (scenario === 'text') state.socket.emit('message', Buffer.from('not binary'), false)
    if (scenario === 'oversize') state.socket.emit('message', Buffer.alloc(6405), true)
    if (scenario === 'backpressure') { state.socket.bufferedAmount = 64000; state.socket.emit('message', Buffer.alloc(4), true) }
    if (scenario === 'error') state.socket.emit('error', new Error('private socket failure'))
    if (scenario === 'abort') abort.abort()
    expect(state.socket.readyState).toBe(3)
    expect(state.socket.sent).toEqual([])
    expect(state.socket.listenerCount('message')).toBe(0)
  })
})
