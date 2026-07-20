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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Filter = [string, unknown[]]

const captured = { filters: [] as Filter[] }
const dbState = {
  rows:                    [] as Record<string, unknown>[],
  updates:                 [] as Record<string, unknown>[],
  publishedAt:             null as string | null,
  paused:                  false,
  scriptExists:            true,
  forceConditionalNoMatch: false,
  conditionalUpdateError:  null as string | null,
  fallbackAttempts:        0,
}

function makeChain(table: string) {
  const calls: Filter[] = []
  let updatePayload: Record<string, unknown> | null = null
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
          if (table === 'media_scripts' && updatePayload) {
            const guardedFirstPublish = 'published_at' in updatePayload
              && calls.some(([m, a]) => m === 'is' && a[0] === 'published_at' && a[1] === null)

            if (guardedFirstPublish && dbState.conditionalUpdateError) {
              return Promise.resolve({
                data: null,
                error: { message: dbState.conditionalUpdateError },
              }).then(onOk)
            }

            if (guardedFirstPublish && (dbState.forceConditionalNoMatch || dbState.publishedAt !== null)) {
              return Promise.resolve({ data: null, error: null }).then(onOk)
            }

            if (!guardedFirstPublish) {
              dbState.fallbackAttempts += 1
              const expectedPublishedAt = calls.find(
                ([m, a]) => m === 'eq' && a[0] === 'published_at',
              )?.[1]?.[1]
              if (!dbState.scriptExists || expectedPublishedAt !== dbState.publishedAt) {
                return Promise.resolve({ data: null, error: null }).then(onOk)
              }
            }

            dbState.updates.push(updatePayload)
            if (typeof updatePayload.published_at === 'string') {
              dbState.publishedAt = updatePayload.published_at
            }

            const scriptId = calls.find(([m, a]) => m === 'eq' && a[0] === 'id')?.[1]?.[1]
            return Promise.resolve({
              data: { id: scriptId },
              error: null,
            }).then(onOk)
          }
          if (table === 'media_scripts') {
            const selectedColumns = String(
              calls.find(([method]) => method === 'select')?.[1]?.[0] ?? '',
            )
            if (selectedColumns === 'published_at') {
              return Promise.resolve({
                data: dbState.scriptExists ? { published_at: dbState.publishedAt } : null,
                error: null,
              }).then(onOk)
            }
            captured.filters = calls
            return Promise.resolve({ data: dbState.rows, error: null }).then(onOk)
          }
          return Promise.resolve({ data: null, error: null }).then(onOk)
        }
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), args])
        if (prop === 'update') updatePayload = args[0] as Record<string, unknown>
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
const sendPipelineAlert = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/media/alert', () => ({
  sendPipelineAlert: (...a: unknown[]) => sendPipelineAlert(...a),
}))
vi.mock('@/lib/media/run-log', () => ({ logRun: vi.fn().mockResolvedValue(null) }))

import { GET } from '@/app/api/media/cron/youtube/route'

const call = (qs = '') =>
  GET(new Request(`http://test/api/media/cron/youtube${qs}`, {
    headers: { authorization: 'Bearer test-secret' },
  }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-20T07:15:13.000Z'))
  uploadShort.mockReset()
  captured.filters = []
  dbState.rows = []
  dbState.updates = []
  dbState.publishedAt = null
  dbState.paused = false
  dbState.scriptExists = true
  dbState.forceConditionalNoMatch = false
  dbState.conditionalUpdateError = null
  dbState.fallbackAttempts = 0
  process.env.CRON_SECRET = 'test-secret'
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
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
    const write = dbState.updates.find(u => u.youtube_video_id === 'YT1')
    expect(write).toMatchObject({
      youtube_video_id: 'YT1',
      youtube_url: 'https://youtu.be/YT1',
      published_at: '2026-07-20T07:15:13.000Z',
    })
    expect(dbState.publishedAt).toBe('2026-07-20T07:15:13.000Z')
  })

  it('C2 — Meta-first bevarar Meta-tiden när YouTube publiceras senare', async () => {
    dbState.publishedAt = '2026-07-20T07:04:16.192Z'
    dbState.rows = [{
      id: 's1', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null, media_news_items: null,
    }]
    uploadShort.mockResolvedValue({ videoId: 'YT1', url: 'https://youtu.be/YT1' })

    await call()

    expect(dbState.publishedAt).toBe('2026-07-20T07:04:16.192Z')
    expect(dbState.updates).toContainEqual({
      youtube_video_id: 'YT1',
      youtube_url: 'https://youtu.be/YT1',
    })
    expect(dbState.updates.every(u => !('published_at' in u))).toBe(true)
    expect(dbState.fallbackAttempts).toBe(1)
  })

  it('C3 — noll träffar och saknad script-rad ger tydligt fel utan fallback', async () => {
    dbState.forceConditionalNoMatch = true
    dbState.scriptExists = false
    dbState.rows = [{
      id: 'missing', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null, media_news_items: null,
    }]
    uploadShort.mockResolvedValue({ videoId: 'YT1', url: 'https://youtu.be/YT1' })

    const body = await (await call()).json()

    expect(body.status).toBe('youtube_failed')
    expect(body.failed[0].error).toContain('Media-script missing saknas')
    expect(dbState.fallbackAttempts).toBe(0)
  })

  it('C4 — Supabase-updatefel kastas och maskeras inte av fallback', async () => {
    dbState.conditionalUpdateError = 'write denied'
    dbState.rows = [{
      id: 's1', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null, media_news_items: null,
    }]
    uploadShort.mockResolvedValue({ videoId: 'YT1', url: 'https://youtu.be/YT1' })

    const body = await (await call()).json()

    expect(body.status).toBe('youtube_failed')
    expect(body.failed[0].error).toContain('write denied')
    expect(dbState.fallbackAttempts).toBe(0)
  })

  it('C5 — noll träffar med kvarvarande null är ett oväntat tillstånd', async () => {
    dbState.forceConditionalNoMatch = true
    dbState.rows = [{
      id: 's1', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null, media_news_items: null,
    }]
    uploadShort.mockResolvedValue({ videoId: 'YT1', url: 'https://youtu.be/YT1' })

    const body = await (await call()).json()

    expect(body.status).toBe('youtube_failed')
    expect(body.failed[0].error).toContain('published_at är fortfarande null')
    expect(dbState.fallbackAttempts).toBe(0)
  })

  it('D — script som redan har youtube_video_id laddas ALDRIG upp igen', async () => {
    dbState.rows = [{
      id: 's1', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: 'YT_EXISTING', media_news_items: null,
    }]

    await call('?scriptId=s1')   // ?scriptId kringgår kandidatfiltret

    expect(uploadShort).not.toHaveBeenCalled()
    expect(dbState.updates).toHaveLength(0)
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

  it('F — YouTube-felalerten gör inga antaganden om Meta-kanalerna', async () => {
    dbState.rows = [{
      id: 's1', hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null, media_news_items: null,
    }]
    uploadShort.mockRejectedValue(new Error('quota exceeded'))

    await call()

    expect(sendPipelineAlert).toHaveBeenCalledTimes(1)
    const alert = sendPipelineAlert.mock.calls[0][0] as { context: { note: string } }
    expect(alert.context.note).toContain('övriga kanalers status verifierades inte')
    expect(alert.context.note).not.toMatch(/IG|Facebook/)
  })
})
