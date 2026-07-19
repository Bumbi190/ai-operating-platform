/**
 * Regressionstester för publiceringsincidenten 2026-07-19.
 *
 * Bevisar att:
 *  - en för gammal eller EXPIRED Instagram-container ERSÄTTS i stället för att
 *    återanvändas i evighet (grundorsaken),
 *  - en container som redan är PUBLISHED aldrig publiceras igen,
 *  - ett Instagram-fel INTE stoppar Facebook,
 *  - kanaler med befintligt id aldrig publiceras om (idempotens),
 *  - partiell framgång sparas kanal för kanal och returneras som HTTP 207,
 *  - permanenta fel går direkt till granskning (löser head-of-line blocking),
 *  - dryRun aldrig gör ett enda skrivande externt anrop,
 *  - inga access tokens läcker till loggar eller sparat tillstånd.
 *
 * Alla externa publiceringsanrop är mockade. Ingenting publiceras live.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MetaApiError } from '@/lib/media/meta-errors'

// ─── Supabase-mock ────────────────────────────────────────────────────────────

type ChainState = { table: string; op?: string; payload?: unknown; calls: [string, unknown[]][] }

const dbState = {
  script:   null as Record<string, unknown> | null,
  updates:  [] as Record<string, unknown>[],
  approvals: [] as Record<string, unknown>[],
  retryCount: 0,
  maxRetries: 3,
}

function resolveQuery(s: ChainState): { data: unknown; error: null } {
  const colsCall = s.calls.find(([m]) => m === 'select')
  const cols = String(colsCall?.[1]?.[0] ?? '')

  if (s.table === 'platform_config') {
    return { data: { automation_paused: false, max_daily_renders: 4, max_retry_attempts: dbState.maxRetries }, error: null }
  }

  if (s.table === 'approvals') {
    if (s.op === 'insert') dbState.approvals.push(s.payload as Record<string, unknown>)
    return { data: null, error: null }
  }

  if (s.table === 'media_scripts') {
    if (s.op === 'update') {
      const payload = s.payload as Record<string, unknown>
      // Den atomiska hävdningen approved → publishing
      if (payload.status === 'publishing') return { data: { id: dbState.script?.id }, error: null }
      // Registrera bara uppdateringar som riktar sig mot ETT script (.eq('id', …)).
      // Bulkunderhåll (släpp hängda 'publishing', arkivera gamla) filtrerar inte
      // på id och ska inte förväxlas med scriptets eget tillstånd.
      const targetsOneScript = s.calls.some(([m, a]) => m === 'eq' && a[0] === 'id')
      if (targetsOneScript) {
        dbState.updates.push(payload)
        if (typeof payload.retry_count === 'number') dbState.retryCount = payload.retry_count
      }
      return { data: [], error: null }
    }
    // Rendering-pollen
    if (cols.includes('render_id')) return { data: [], error: null }
    // Retry-räknaren i safeguards
    if (cols.trim() === 'retry_count') return { data: { retry_count: dbState.retryCount }, error: null }
    // Publiceringskön
    if (cols.includes('instagram_creation_id')) {
      return { data: dbState.script ? [dbState.script] : [], error: null }
    }
  }

  return { data: null, error: null }
}

function makeChain(table: string) {
  const state: ChainState = { table, calls: [] }
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
          Promise.resolve(resolveQuery(state)).then(onOk, onErr)
      }
      return (...args: unknown[]) => {
        state.calls.push([String(prop), args])
        if (prop === 'update' || prop === 'insert' || prop === 'upsert') {
          state.op = String(prop)
          state.payload = args[0]
        } else if (prop === 'select' && !state.op) {
          state.op = 'select'
        }
        return proxy
      }
    },
  }) as Record<string, unknown>
  return proxy
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeChain(table) }),
}))

// ─── Externa moduler ──────────────────────────────────────────────────────────

const getContainerStatus   = vi.fn()
const createReelContainer  = vi.fn()
const pollUntilReady       = vi.fn()
const publishContainer     = vi.fn()
const resolvePublishedMedia = vi.fn()

vi.mock('@/lib/media/instagram', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/instagram')>('@/lib/media/instagram')
  return {
    buildInstagramCaption: actual.buildInstagramCaption,
    getContainerStatus:    (...a: unknown[]) => getContainerStatus(...a),
    createReelContainer:   (...a: unknown[]) => createReelContainer(...a),
    pollUntilReady:        (...a: unknown[]) => pollUntilReady(...a),
    publishContainer:      (...a: unknown[]) => publishContainer(...a),
    resolvePublishedMedia: (...a: unknown[]) => resolvePublishedMedia(...a),
  }
})

const postReelToFacebook = vi.fn()
vi.mock('@/lib/media/facebook', () => ({
  postReelToFacebook: (...a: unknown[]) => postReelToFacebook(...a),
}))

vi.mock('@/lib/media/token-store', () => ({ getToken: async () => null }))
vi.mock('@/lib/media/lambda-render', () => ({ getLambdaRenderProgress: vi.fn() }))

const sendPipelineAlert = vi.fn().mockResolvedValue(undefined)
const sendRunReport     = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/media/alert', () => ({
  sendPipelineAlert: (...a: unknown[]) => sendPipelineAlert(...a),
  sendRunReport:     (...a: unknown[]) => sendRunReport(...a),
}))
vi.mock('@/lib/media/run-log', () => ({ logRun: vi.fn().mockResolvedValue(null) }))

import { GET } from '@/app/api/media/cron/publish/route'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SCRIPT_ID = '800d2efc-726f-4735-b9f0-e722fea0d96b'
const TOKEN     = 'EAAWabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ'

function script(overrides: Record<string, unknown> = {}) {
  return {
    id:                       SCRIPT_ID,
    hook:                     'Security researchers just turned prompt injection against AI hackers.',
    cta:                      null,
    hashtags:                 [],
    video_url:                'https://cdn.example.com/reel.mp4',
    video_status:             'ready',
    status:                   'approved',
    instagram_creation_id:    null,
    instagram_creation_id_at: null,
    instagram_media_id:       null,
    instagram_url:            null,
    facebook_post_id:         null,
    facebook_url:             null,
    published_at:             null,
    media_news_items:         { url: 'https://news.example.com/a', source_name: 'Example' },
    ...overrides,
  }
}

/**
 * Kör rutten med fake timers. Retry-backoffen är avsiktligt flera sekunder i
 * produktion; här drivs klockan framåt manuellt så att de FAKTISKA retries
 * verifieras utan att testsviten tar 30 sekunder.
 */
const call = async (qs = '') => {
  const p = GET(new Request(`http://test/api/media/cron/publish${qs}`, {
    headers: { authorization: 'Bearer test-secret' },
  }))
  await vi.runAllTimersAsync()
  return p
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

let logSpy:  ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errSpy:  ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  dbState.script = null
  dbState.updates = []
  dbState.approvals = []
  dbState.retryCount = 0
  dbState.maxRetries = 3

  process.env.CRON_SECRET                = 'test-secret'
  process.env.FACEBOOK_PAGE_ID           = 'PAGE_1'
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = TOKEN
  process.env.INSTAGRAM_ACCESS_TOKEN     = TOKEN

  pollUntilReady.mockResolvedValue(undefined)
  logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
  warnSpy.mockRestore()
  errSpy.mockRestore()
  vi.useRealTimers()
})

// ─── Containerlivscykel — grundorsaken ────────────────────────────────────────

describe('Instagram-container: validering före återanvändning', () => {
  it('A — container äldre än 20h ERSÄTTS utan att ens fråga Meta om status', async () => {
    dbState.script = script({
      instagram_creation_id:    '18085720493234266',
      instagram_creation_id_at: hoursAgo(24.3),   // exakt incidentens läge kl. 18:00
    })
    getContainerStatus.mockResolvedValue('FINISHED')
    createReelContainer.mockResolvedValue('NEW_CONTAINER')
    publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: 'https://ig/p/1' })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: 'https://fb/1' })

    const res = await call()

    expect(createReelContainer).toHaveBeenCalledTimes(1)
    expect(publishContainer).toHaveBeenCalledWith('NEW_CONTAINER')
    expect(res.status).toBe(200)
  })

  it('B — container utan känd ålder (NULL) kontrolleras ändå mot Meta, sedan ersätts', async () => {
    dbState.script = script({
      instagram_creation_id:    '18085720493234266',
      instagram_creation_id_at: null,
    })
    getContainerStatus.mockResolvedValue('FINISHED')
    createReelContainer.mockResolvedValue('NEW_CONTAINER')
    publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: null })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    await call()

    // Statusen MÅSTE läsas även när åldern är okänd — annars kan en redan
    // publicerad container få en efterföljare och videon publiceras två gånger.
    expect(getContainerStatus).toHaveBeenCalledWith('18085720493234266')
    expect(createReelContainer).toHaveBeenCalledTimes(1)
  })

  it('B2 — GAMMAL container som Meta rapporterar som PUBLISHED ersätts ALDRIG', async () => {
    // Regression mot dubbelpublicering: ålderskontrollen får inte köras före
    // statuskontrollen. 24,3h gammal = exakt incidentens läge kl. 18:00.
    dbState.script = script({
      instagram_creation_id:    '18085720493234266',
      instagram_creation_id_at: hoursAgo(24.3),
    })
    getContainerStatus.mockResolvedValue('PUBLISHED')
    resolvePublishedMedia.mockResolvedValue({ mediaId: 'IG_REC', permalink: 'https://ig/p/rec' })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    const body = await (await call()).json()

    expect(createReelContainer).not.toHaveBeenCalled()
    expect(publishContainer).not.toHaveBeenCalled()
    expect(body.channels.instagram).toMatchObject({ ok: true, id: 'IG_REC', recovered: true })
  })

  it('B3 — PUBLISHED utan verifierbar permalink skriver INTE ett gissat media-id', async () => {
    dbState.script = script({
      instagram_creation_id:    'CID_ONLY',
      instagram_creation_id_at: hoursAgo(2),
    })
    getContainerStatus.mockResolvedValue('PUBLISHED')
    resolvePublishedMedia.mockResolvedValue(null)   // kunde inte resolvas
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    const body = await (await call()).json()

    expect(publishContainer).not.toHaveBeenCalled()
    expect(body.channels.instagram).toMatchObject({ ok: true, id: null, needsVerification: true })
    // Container-id:t får ALDRIG hamna i instagram_media_id
    expect(JSON.stringify(dbState.updates)).not.toContain('"instagram_media_id":"CID_ONLY"')
  })

  it('C — färsk container med status EXPIRED ersätts', async () => {
    dbState.script = script({
      instagram_creation_id:    'OLD',
      instagram_creation_id_at: hoursAgo(2),
    })
    getContainerStatus.mockResolvedValue('EXPIRED')
    createReelContainer.mockResolvedValue('FRESH')
    publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: null })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    await call()

    expect(getContainerStatus).toHaveBeenCalledWith('OLD')
    expect(createReelContainer).toHaveBeenCalledTimes(1)
    expect(publishContainer).toHaveBeenCalledWith('FRESH')
  })

  it('D — status ERROR och NOT_FOUND ersätts också', async () => {
    for (const status of ['ERROR', 'NOT_FOUND', 'UNKNOWN']) {
      vi.clearAllMocks()
      dbState.script = script({ instagram_creation_id: 'OLD', instagram_creation_id_at: hoursAgo(1) })
      getContainerStatus.mockResolvedValue(status)
      createReelContainer.mockResolvedValue('FRESH')
      pollUntilReady.mockResolvedValue(undefined)
      publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: null })
      postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

      await call()
      expect(createReelContainer, `status=${status}`).toHaveBeenCalledTimes(1)
    }
  })

  it('E — FINISHED återanvänds (ingen onödig omuppladdning)', async () => {
    dbState.script = script({ instagram_creation_id: 'GOOD', instagram_creation_id_at: hoursAgo(1) })
    getContainerStatus.mockResolvedValue('FINISHED')
    publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: null })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    await call()

    expect(createReelContainer).not.toHaveBeenCalled()
    expect(publishContainer).toHaveBeenCalledWith('GOOD')
  })

  it('F — PUBLISHED publiceras ALDRIG igen; media-id återhämtas i stället', async () => {
    dbState.script = script({ instagram_creation_id: 'DONE', instagram_creation_id_at: hoursAgo(1) })
    getContainerStatus.mockResolvedValue('PUBLISHED')
    resolvePublishedMedia.mockResolvedValue({ mediaId: 'IG_RECOVERED', permalink: 'https://ig/p/x' })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    const res  = await call()
    const body = await res.json()

    expect(publishContainer).not.toHaveBeenCalled()
    expect(createReelContainer).not.toHaveBeenCalled()
    expect(body.channels.instagram).toMatchObject({ ok: true, id: 'IG_RECOVERED', recovered: true })
  })
})

// ─── Kanaloberoende ───────────────────────────────────────────────────────────

describe('kanaloberoende publicering', () => {
  it('G — Instagram misslyckas men Facebook publiceras ändå (207 partial)', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: 'An unknown error occurred', httpStatus: 400, code: 1, endpoint: 'media_publish',
    }))
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: 'https://fb/1' })

    const res  = await call()
    const body = await res.json()

    expect(postReelToFacebook).toHaveBeenCalledTimes(1)   // <- kärnan i regressionen
    expect(res.status).toBe(207)
    expect(body.status).toBe('partial')
    expect(body.channels.instagram.ok).toBe(false)
    expect(body.channels.facebook).toMatchObject({ ok: true, id: 'FB1' })
  })

  it('H — Facebook misslyckas men Instagram lyckas (207 partial)', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: 'https://ig/p/1' })
    postReelToFacebook.mockRejectedValue(new MetaApiError({
      message: 'Page unavailable', httpStatus: 403, endpoint: 'fb_video_post',
    }))

    const res  = await call()
    const body = await res.json()

    expect(res.status).toBe(207)
    expect(body.channels.instagram.ok).toBe(true)
    expect(body.channels.facebook.ok).toBe(false)
  })

  it('I — båda kanalerna misslyckas → 500 med strukturerat per-kanalresultat', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: 'Invalid OAuth access token', httpStatus: 400, code: 190, endpoint: 'media_publish',
    }))
    postReelToFacebook.mockRejectedValue(new MetaApiError({
      message: 'Invalid OAuth access token', httpStatus: 400, code: 190, endpoint: 'fb_video_post',
    }))

    const res  = await call()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.status).toBe('failed')
    expect(body.channels.instagram.permanent).toBe(true)
    expect(body.channels.facebook.permanent).toBe(true)
  })
})

// ─── Idempotens ───────────────────────────────────────────────────────────────

describe('idempotens per kanal', () => {
  it('J — script med instagram_media_id publiceras inte om på Instagram', async () => {
    dbState.script = script({ instagram_media_id: 'IG_EXISTING', instagram_url: 'https://ig/p/old' })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    const res  = await call()
    const body = await res.json()

    expect(publishContainer).not.toHaveBeenCalled()
    expect(createReelContainer).not.toHaveBeenCalled()
    expect(body.channels.instagram).toMatchObject({ ok: true, skipped: 'already_published' })
  })

  it('K — script med facebook_post_id publiceras inte om på Facebook', async () => {
    dbState.script = script({ facebook_post_id: 'FB_EXISTING' })
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: null })

    const res  = await call()
    const body = await res.json()

    expect(postReelToFacebook).not.toHaveBeenCalled()
    expect(body.channels.facebook).toMatchObject({ ok: true, skipped: 'already_published' })
  })

  it('L — lyckad kanal skrivs till DB direkt, innan nästa kanal körs', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockResolvedValue({ mediaId: 'IG1', permalink: 'https://ig/p/1' })
    postReelToFacebook.mockRejectedValue(new Error('nätverk nere'))

    await call()

    // Instagram-id:t måste ha persisterats trots att Facebook failade efteråt.
    const igWrite = dbState.updates.find(u => u.instagram_media_id === 'IG1')
    expect(igWrite).toBeTruthy()
    // published_at stämplas vid FÖRSTA lyckade kanal, inte först när allt är klart.
    expect(igWrite?.published_at).toBeTruthy()
    // …men scriptet ligger kvar i kön (status approved) så Facebook kan retrias.
    expect(dbState.updates.some(u => u.status === 'approved')).toBe(true)
  })

  it('L2 — published_at skrivs inte om vid en senare körning', async () => {
    dbState.script = script({
      instagram_media_id: 'IG_DONE',
      published_at:       '2026-07-19T08:00:00.000Z',
    })
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    await call()

    expect(dbState.updates.every(u => !('published_at' in u))).toBe(true)
  })
})

// ─── Retries och permanens ────────────────────────────────────────────────────

describe('retries och permanenta fel', () => {
  it('M — transient fel försöks faktiskt om 3 gånger i SAMMA körning', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: 'Fatal', httpStatus: 500, code: -1, endpoint: 'media_publish',
    }))
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    await call()

    expect(publishContainer).toHaveBeenCalledTimes(3)
  })

  it('N — permanent fel försöks INTE om, och går direkt till granskning', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: 'Invalid OAuth access token', httpStatus: 400, code: 190, endpoint: 'media_publish',
    }))
    postReelToFacebook.mockRejectedValue(new MetaApiError({
      message: 'Invalid OAuth access token', httpStatus: 400, code: 190, endpoint: 'fb_video_post',
    }))

    await call()

    expect(publishContainer).toHaveBeenCalledTimes(1)
    // Retry-räknaren står på 1 men scriptet ska ändå ut ur kön direkt:
    const review = dbState.updates.find(u => u.status === 'pending_review')
    expect(review).toBeTruthy()
    expect(dbState.approvals).toHaveLength(1)
    expect(dbState.retryCount).toBe(1)
  })

  it('O — permanent fel blockerar inte nästa script (head-of-line blocking löst)', async () => {
    dbState.script = script()
    createReelContainer.mockRejectedValue(new MetaApiError({
      message: 'Media could not be fetched', httpStatus: 400, code: 1, subcode: 2207003, endpoint: 'media_create',
    }))
    postReelToFacebook.mockRejectedValue(new MetaApiError({
      message: 'Media could not be fetched', httpStatus: 400, code: 1, subcode: 2207003, endpoint: 'fb_video_post',
    }))

    await call()

    // Scriptet lämnar kön efter EN körning i stället för efter tre cron-cykler.
    expect(dbState.updates.some(u => u.status === 'pending_review')).toBe(true)
    expect(dbState.updates.some(u => u.status === 'approved')).toBe(false)
  })

  it('P — transient fel på alla kanaler släpper tillbaka scriptet i kön', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: 'Fatal', httpStatus: 500, code: -1, endpoint: 'media_publish',
    }))
    postReelToFacebook.mockRejectedValue(new MetaApiError({
      message: 'temporarily unavailable', httpStatus: 503, endpoint: 'fb_video_post',
    }))

    await call()

    expect(dbState.updates.some(u => u.status === 'approved')).toBe(true)
    expect(dbState.updates.some(u => u.status === 'pending_review')).toBe(false)
  })
})

// ─── Partiell framgång sparas ─────────────────────────────────────────────────

describe('partiell framgång och observability', () => {
  it('Q — publish_channel_state sparas kanal för kanal', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: 'An unknown error occurred', httpStatus: 400, code: 1, subcode: 2207020,
      endpoint: 'media_publish', fbtraceId: 'TRACE1',
    }))
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: 'https://fb/1' })

    await call()

    const stateWrite = dbState.updates.find(u => u.publish_channel_state) as
      { publish_channel_state: Record<string, { ok: boolean; detail?: Record<string, unknown> }> }
    expect(stateWrite).toBeTruthy()
    expect(stateWrite.publish_channel_state.instagram.ok).toBe(false)
    expect(stateWrite.publish_channel_state.facebook.ok).toBe(true)
    // Metas strukturerade diagnostik ska finnas kvar
    expect(stateWrite.publish_channel_state.instagram.detail).toMatchObject({
      code: 1, subcode: 2207020, fbtraceId: 'TRACE1', permanent: true,
    })
  })

  it('R — alert skickas per felande kanal, med permanensflagga', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: 'Fatal', httpStatus: 500, code: -1, endpoint: 'media_publish',
    }))
    postReelToFacebook.mockResolvedValue({ postId: 'FB1', url: null })

    await call()

    expect(sendPipelineAlert).toHaveBeenCalledTimes(1)
    expect(sendPipelineAlert.mock.calls[0][0]).toMatchObject({
      step: 'instagram_publish', severity: 'warning',
    })
  })
})

// ─── dryRun ───────────────────────────────────────────────────────────────────

describe('dryRun', () => {
  it('S — dryRun anropar INGEN skrivande publiceringsendpoint och rör inte DB', async () => {
    dbState.script = script({ instagram_creation_id: 'C1', instagram_creation_id_at: hoursAgo(1) })
    getContainerStatus.mockResolvedValue('FINISHED')

    const res  = await call('?dryRun=1')
    const body = await res.json()

    expect(createReelContainer).not.toHaveBeenCalled()
    expect(publishContainer).not.toHaveBeenCalled()
    expect(postReelToFacebook).not.toHaveBeenCalled()
    expect(pollUntilReady).not.toHaveBeenCalled()
    expect(dbState.updates).toHaveLength(0)
    expect(body.status).toBe('dry_run')
    expect(body.channels.instagram.skipped).toBe('dry_run')
  })
})

// ─── Tokensäkerhet ────────────────────────────────────────────────────────────

describe('inga tokens läcker', () => {
  it('T — varken loggar, svar eller sparat tillstånd innehåller access token', async () => {
    dbState.script = script()
    createReelContainer.mockResolvedValue('C1')
    publishContainer.mockRejectedValue(new MetaApiError({
      message: `failed for ?access_token=${TOKEN}`, httpStatus: 400, code: 1, endpoint: 'media_publish',
    }))
    postReelToFacebook.mockRejectedValue(new Error(`Bearer ${TOKEN} rejected`))

    const res  = await call()
    const body = await res.json()

    // ALLA konsolkanaler granskas — retry-loggen (console.warn) läckte token
    // i klartext innan redaktionen sattes på plats.
    const logged = [logSpy, warnSpy, errSpy]
      .flatMap(s => s.mock.calls.map(c => c.map(String).join(' ')))
      .join('\n')
    expect(logged).not.toContain(TOKEN)
    expect(JSON.stringify(body)).not.toContain(TOKEN)
    expect(JSON.stringify(dbState.updates)).not.toContain(TOKEN)
    expect(JSON.stringify(sendPipelineAlert.mock.calls)).not.toContain(TOKEN)
  })
})
