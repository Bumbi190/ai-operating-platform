import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Atlas Phase B integration contracts', () => {
  const runtime = read('lib/atlas/runtime.tsx')
  const route = read('app/api/chat/route.ts')
  const miniOrb = read('components/platform/os/AtlasMiniOrb.tsx')
  const commandCore = read('components/platform/vnext/AtlasCommandCore.tsx')
  const progressive = read('lib/atlas/progressive-playback.ts')

  it('does not block the client on auth or conversation insertion', () => {
    expect(runtime).not.toContain('ensureConversation')
    expect(runtime).not.toContain('@/lib/supabase/client')
    expect(runtime).toContain('create_conversation: !convRef.current')
  })

  it('creates the first conversation server-side and returns its id over SSE', () => {
    expect(route).toContain("send('conversation', { id })")
    expect(runtime).toContain("d.event === 'conversation'")
    expect(runtime).toContain('setConversationId(d.id)')
  })

  it('renders streamed response text while audio is still being prepared', () => {
    expect(miniOrb).toContain('{!!atlas.response && (')
    expect(miniOrb).toContain("atlas.voicePhase === 'thinking' && !atlas.response")
    expect(miniOrb).toContain('atlas.reportTextVisible()')
    expect(runtime).toContain("markOnce(marksRef.current, generation, 'firstVisible'")
  })

  it('opens the SSE transport with a semantic-free flush chunk', () => {
    expect(route).toContain("const SSE_STREAM_OPEN_COMMENT = `: stream-open ${' '.repeat(2_048)}\\n\\n`")
    expect(route).toContain('controller.enqueue(encoder.encode(SSE_STREAM_OPEN_COMMENT))')
    expect(route).toContain("'Cache-Control': 'no-cache, no-transform'")
    expect(route).toContain("'X-Accel-Buffering': 'no'")
  })

  it('warms only read caches while canonical governance remains on dispatch', () => {
    expect(route).toContain('const governanceWarmup = warmGovernanceReadCaches(PLATFORM_COMPAT_PROJECT)')
    expect(route).toContain('await governanceWarmup')
    expect(route).toContain('const llm = await anthropic.messages.stream({')
  })

  it('keeps speaking truth bound to the audio playing event path', () => {
    expect(runtime.match(/setVoicePhase\('speaking'\)/g)).toHaveLength(1)
    expect(runtime).toContain('onStart: () => {')
    expect(runtime).toContain("markOnce(marksRef.current, generation, 'firstAudio'")
  })

  it('exposes the raw same-request timeline locally without persisting it', () => {
    expect(runtime).toContain('formatRawLatency(marksRef.current, serverTiming)')
    expect(runtime).toContain('perfRaw:     string | null')
    expect(commandCore).toContain('data-atlas-latency-raw')
    expect(route).toContain('modelStartMs')
    expect(runtime).not.toContain('perfRaw: body')
  })

  it('leaves the locked model, TTS model, voice and silence threshold unchanged', () => {
    expect(route).toContain("model: 'claude-sonnet-4-6'")
    expect(read('app/api/chat/tts/route.ts')).toContain("const ATLAS_TTS_MODEL = 'gpt-4o-mini-tts'")
    expect(runtime).toContain("voice: 'onyx'")
    expect(runtime).toContain('const SILENCE_MS    = 800')
  })

  it('shapes voice output around a useful first clause without filler', () => {
    expect(route).toContain('användbar, direkt sak-klausul')
    expect(route).toContain('högst cirka 10 ord')
    expect(route).toContain('Ingen hälsningsutfyllnad')
  })

  it('limits progressive playback to the first segment and exposes the runtime probe', () => {
    expect(runtime).toContain('fetchTTSUrl(s, signal, generation, isFirstSegment)')
    expect(runtime).toContain('progressivePlayback: ProgressiveCapability')
    expect(commandCore).toContain('data-atlas-progressive-playback={atlas.progressivePlayback}')
    expect(progressive).toContain("MediaSourceCtor.isTypeSupported(ATLAS_PROGRESSIVE_MIME)")
  })

  it('keeps playback FIFO and forbids post-playing Blob replay', () => {
    expect(runtime).toContain('const tts = await urlQueue[idx]; idx++')
    expect(runtime).toContain('const outcome = await playResponse(tts.response, generation, serverTiming)')
    expect(progressive).toContain('if (started || fallbackUsed)')
    expect(progressive).toContain("deps.onBodyEvent?.('blob-fallback')")
  })
})
