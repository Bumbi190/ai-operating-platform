/**
 * YouTube-kanalens oberoende — incident 2026-07-19.
 *
 * YouTube-cronen kraschade aldrig, men dess kandidatfråga krävde
 * `published_at IS NOT NULL`. När Instagram failade sattes published_at aldrig,
 * så YouTube fick noll kandidater och teg helt — trots att videon var färdig och
 * redaktionellt godkänd.
 *
 * Testerna låser fast att YouTube nu väljer scripts oberoende av Instagram,
 * men fortfarande ENDAST godkända scripts med färdig video, och aldrig laddar
 * upp något som redan har youtube_video_id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Filter = [string, unknown[]]

const captured = { filters: [] as Filter[] }
const dbState = {
  rows:    [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  paused:  false,
}

function makeChain(table: string) {
  const calls: Filter[] = []
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (onOk: (v: unknown) => unknown) => {
          if (table === 'platform_config') {
            return Promise.resolve({
              data: { automation_paused: dbState.paused, max_daily_renders: 4, max_retry_attempts: 3,
                      paused_at: null, paused_reason: dbState.paused ? 'operatör stoppade' : null },
              error: null,
            }).then(onOk)
          }
          if (table === 'media_scripts' && !calls.some(([m]) => m === 'update')) {
            captured.filters = calls
            return Promise.resolve({ data: dbState.rows, error: null }).then(onOk)
          }
          return Promise.resolve({ data: null, error: null }).then(onOk)
        }
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), args])
        if (prop === 'update') dbState.updates.push(args[0] as Record<string, unknown>)
        return proxy
      }
    },
  }) as Record<string, unknown>
  return proxy
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
}))

const uploadShort = vi.fn()
vi.mock('@/lib/media/youtube', () => ({
  isYouTubeConfigured: () => true,
  uploadShort:         (...a: unknown[]) => uploadShort(...a),
  buildYouTubeMeta:    () => ({ title: 't', description: 'd', tags: [] }),
}))
vi.mock('@/lib/media/alert', () => ({ sendPipelineAlert: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/media/run-log', () => ({ logRun: vi.fn().mockResolvedValue(null) }))

import { GET } from '@/app/api/media/cron/youtube/route'

const call = (qs = '') =>
  GET(new Request(`http://test/api/media/cron/youtube${qs}`, {
    headers: { authorization: 'Bearer test-secret' },
  }))

beforeEach(() => {
  vi.clearAllMocks()
  captured.filters = []
  dbState.rows = []
  dbState.updates = []
  dbState.paused = false
  process.env.CRON_SECRET = 'test-secret'
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('YouTube — oberoende av Instagram', () => {
  it('A — kandidatfrågan filtrerar INTE längre på published_at', async () => {
    await call()

    const methods = captured.filters.map(([m, a]) => `${m}(${JSON.stringify(a)})`).join(' ')
    expect(methods).not.toContain('published_at')
  })

  it('B — kräver godkänt innehåll och färdig video (kanalspecifika krav)', async () => {
    await call()

    const inCall = captured.filters.find(([m]) => m === 'in')
    expect(inCall?.[1][0]).toBe('status')
    expect(inCall?.[1][1]).toEqual(['approved', 'published'])

    const eqCalls = captured.filters.filter(([m]) => m === 'eq')
    expect(eqCalls.some(([, a]) => a[0] === 'video_status' && a[1] === 'ready')).toBe(true)
  })

  it('C — ett script vars Instagram failade kan ändå väljas och laddas upp', async () => {
    // Exakt läget för 800d2efc efter incidenten: godkänd, video klar,
    // published_at null eftersom Instagram aldrig gick igenom.
    dbState.rows = [{
      id: '800d2efc', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null, media_news_items: null,
    }]
    uploadShort.mockResolvedValue({ videoId: 'YT1', url: 'https://youtu.be/YT1' })

    const res  = await call()
    const body = await res.json()

    expect(uploadShort).toHaveBeenCalledTimes(1)
    expect(body.status).toBe('uploaded')
    expect(dbState.updates.some(u => u.youtube_video_id === 'YT1')).toBe(true)
  })

  it('D — script som redan har youtube_video_id laddas ALDRIG upp igen', async () => {
    dbState.rows = [{
      id: 's1', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: 'YT_EXISTING', media_news_items: null,
    }]

    await call('?scriptId=s1')   // ?scriptId kringgår kandidatfiltret

    expect(uploadShort).not.toHaveBeenCalled()
  })

  it('E2 — global paus stoppar YouTube (killswitchen gäller efter frikopplingen)', async () => {
    // Före frikopplingen ärvde YouTube pauskontrollen indirekt via published_at,
    // eftersom bara publish-cronen kunde sätta det fältet. Nu måste YouTube göra
    // kontrollen själv — annars hade killswitchen tappat en kanal.
    dbState.paused = true
    dbState.rows = [{
      id: 's1', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null, media_news_items: null,
    }]

    const body = await (await call()).json()

    expect(uploadShort).not.toHaveBeenCalled()
    expect(body.status).toBe('paused')
  })

  it('E — ett fel på ett script stoppar inte de andra', async () => {
    dbState.rows = [
      { id: 'a', hook: 'h', cta: null, hashtags: [], video_url: 'u1', youtube_video_id: null, media_news_items: null },
      { id: 'b', hook: 'h', cta: null, hashtags: [], video_url: 'u2', youtube_video_id: null, media_news_items: null },
    ]
    uploadShort.mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce({ videoId: 'YT2', url: 'u' })

    const body = await (await call()).json()

    expect(uploadShort).toHaveBeenCalledTimes(2)
    expect(body.status).toBe('partial')
    expect(body.uploadedCount).toBe(1)
    expect(body.failedCount).toBe(1)
  })
})
