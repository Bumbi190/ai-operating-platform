/**
 * G3C-2B — a stop must refuse an external write that costs nothing.
 *
 * G3C-1 proved the paid boundary. These prove the unpaid one: a new Remotion
 * render, a Meta media container, a YouTube upload, a comment reply. All are
 * externally visible and materially irreversible, and all were reachable after a
 * pause committed — either with no check at all (step4) or behind a single
 * global-only route-entry read that could not see a project pause and could not
 * see a pause that committed mid-loop.
 *
 * Every stop here is expressed by flipping the same `stop_state` RPC the real
 * resolver reads, so these tests pause the switch an operator would pause. No
 * stop policy is reimplemented in this file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Stop authority, answered exactly as production answers it ────────────────

const stop = { global: false, project: false, projectFound: true }

type Row = Record<string, unknown>
const dbState = {
  scripts: [] as Row[],
  comments: [] as Row[],
  updates: [] as { table: string; payload: Row }[],
  lookupScript: null as Row | null,
}

function resolve(table: string, op: string | undefined, payload: Row | undefined, calls: [string, unknown[]][]) {
  if (op === 'update' || op === 'insert') {
    dbState.updates.push({ table, payload: payload ?? {} })
    return { data: { id: 'x' }, error: null }
  }
  if (table === 'media_scripts') {
    // The reply route looks up the originating post by id; the pipeline routes
    // select their own work queue.
    const isLookup = calls.some(([m, a]) =>
      m === 'or' && String(a[0] ?? '').includes('instagram_media_id'))
    if (isLookup) return { data: dbState.lookupScript, error: null }
    const single = calls.some(([m]) => m === 'single' || m === 'maybeSingle')
    return { data: single ? (dbState.scripts[0] ?? null) : dbState.scripts, error: null }
  }
  if (table === 'comment_replies') return { data: dbState.comments, error: null }
  if (table === 'platform_config') return { data: { automation_paused: stop.global }, error: null }
  return { data: null, error: null }
}

function makeChain(table: string) {
  const calls: [string, unknown[]][] = []
  let op: string | undefined
  let payload: Row | undefined
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(resolve(table, op, payload, calls)).then(ok, err)
      }
      return (...args: unknown[]) => {
        calls.push([String(prop), args])
        if (prop === 'update' || prop === 'insert') { op = String(prop); payload = args[0] as Row }
        return proxy
      }
    },
  }) as Record<string, unknown>
  return proxy
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => makeChain(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'stop_state') return { data: null, error: { message: `unexpected rpc ${fn}` } }
      const wants = args?.p_project_id != null
      return {
        data: [{
          global_paused: stop.global, global_paused_at: null, global_paused_reason: null,
          project_requested: wants, project_found: wants ? stop.projectFound : false,
          project_paused: wants ? stop.project : null,
          project_paused_at: null, project_paused_reason: null,
        }],
        error: null,
      }
    },
  }),
}))

// ─── External systems. Every one of these is a packet leaving the machine. ────

const startLambdaRender      = vi.fn()
const getLambdaRenderProgress = vi.fn()
vi.mock('@/lib/media/lambda-render', () => ({
  startLambdaRender:       (...a: unknown[]) => startLambdaRender(...a),
  getLambdaRenderProgress: (...a: unknown[]) => getLambdaRenderProgress(...a),
}))

const createReelContainer = vi.fn()
vi.mock('@/lib/media/instagram', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/instagram')>('@/lib/media/instagram')
  return { ...actual, createReelContainer: (...a: unknown[]) => createReelContainer(...a) }
})

const uploadShort = vi.fn()
vi.mock('@/lib/media/youtube', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/youtube')>('@/lib/media/youtube')
  return { ...actual, isYouTubeConfigured: () => true, uploadShort: (...a: unknown[]) => uploadShort(...a) }
})

vi.mock('@/lib/media/video-props', () => ({ buildVideoInputProps: async () => ({}) }))
const generateNewsImages = vi.fn()
vi.mock('@/lib/media/ideogram', () => ({
  generateNewsImages: (...a: unknown[]) => generateNewsImages(...a),
}))
vi.mock('@/lib/media/storage', () => ({
  uploadSceneImage: async (_p: string, _s: string, i: number) => `https://cdn/img-${i}.jpg`,
}))
vi.mock('@/lib/media/token-store', () => ({ getToken: async () => null }))
vi.mock('@/lib/media/channel-persistence', () => ({ persistChannelSuccess: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/media/run-log', () => ({ logRun: vi.fn().mockResolvedValue(null) }))
const sendPipelineAlert = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/media/alert', () => ({
  sendPipelineAlert: (...a: unknown[]) => sendPipelineAlert(...a),
  sendRunReport: vi.fn().mockResolvedValue(undefined),
}))

// The reply route generates its text through the governed provider path. That
// boundary is G3C-1's and is proven there; here it always succeeds so the test
// isolates the EXTERNAL WRITE that follows it.
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: () => ({
    messages: { create: async () => ({ content: [{ type: 'text', text: 'tack!' }] }) },
  }),
}))
vi.mock('@/lib/cost/track', () => ({ logLlmCost: vi.fn().mockResolvedValue(null) }))

// Instagram/Facebook comment replies are posted with bare fetch inside the route.
const fetchSpy = vi.fn()
vi.stubGlobal('fetch', (...a: unknown[]) => fetchSpy(...a))

import { GET as step3 } from '@/app/api/media/cron/step3/route'
import { GET as step4 } from '@/app/api/media/cron/step4/route'
import { GET as youtube } from '@/app/api/media/cron/youtube/route'
import { GET as replyComments } from '@/app/api/media/cron/reply-comments/route'

const PROJECT_A = '11111111-1111-1111-1111-111111111111'
const PROJECT_B = '22222222-2222-2222-2222-222222222222'
const req = (path: string) =>
  new Request(`http://test${path}`, { headers: { authorization: 'Bearer test-secret' } })

beforeEach(() => {
  vi.clearAllMocks()
  stop.global = false; stop.project = false; stop.projectFound = true
  dbState.scripts = []; dbState.comments = []; dbState.updates = []; dbState.lookupScript = null
  process.env.CRON_SECRET = 'test-secret'
  process.env.INSTAGRAM_ACCESS_TOKEN = 'IGtoken'
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'FBtoken'
  process.env.FACEBOOK_PAGE_ID = 'PAGE'
  fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'reply-1' }) })
})

// ══ STEP 4 ═══════════════════════════════════════════════════════════════════

const renderingScript = (over: Row = {}) => ({
  id: 's-1', project_id: PROJECT_A, hook: 'h', cta: null, hashtags: [],
  video_url: null, video_status: 'rendering', render_id: 'r1', render_bucket: 'b1',
  instagram_creation_id: null, retry_count: 0, composition: 'SimpleNewsReel',
  audio_url: 'a', timing_url: 't', duration_ms: 1000, images: [],
  media_news_items: { url: 'u', source_name: 's' }, ...over,
})

describe('step4 · starting a NEW render is external compute', () => {
  beforeEach(() => {
    dbState.scripts = [renderingScript()]
    // The previous render failed, so the route wants to start a fresh one.
    getLambdaRenderProgress.mockResolvedValue({ done: true, error: 'render blew up', progress: 1 })
    startLambdaRender.mockResolvedValue({ renderId: 'r2', bucketName: 'b2' })
  })

  it('clear → a new Lambda render starts', async () => {
    const body = await (await step4(req('/api/media/cron/step4'))).json()
    expect(startLambdaRender).toHaveBeenCalledTimes(1)
    expect(body.status).toBe('render_retry')
  })

  it('PROJECT paused → no new render', async () => {
    stop.project = true
    const body = await (await step4(req('/api/media/cron/step4'))).json()
    expect(startLambdaRender).toHaveBeenCalledTimes(0)
    expect(body.status).toBe('render_retry_deferred_by_stop')
    expect(body.reason).toBe('project_execution_paused')
  })

  it('GLOBAL paused → no new render', async () => {
    stop.global = true
    const body = await (await step4(req('/api/media/cron/step4'))).json()
    expect(startLambdaRender).toHaveBeenCalledTimes(0)
    expect(body.reason).toBe('global_automation_paused')
  })

  it('a stop does not increment retry_count and does not mark the video failed', async () => {
    // The load-bearing part. Inside the try below the assert, a throw falls
    // through to "permanently failed" — marking the video failed and alerting an
    // operator because THEY pressed stop. A failed old render stays a failed old
    // render; a stop preventing the NEXT one is not another failure.
    stop.project = true
    await step4(req('/api/media/cron/step4'))
    expect(dbState.updates.some(u => 'retry_count' in u.payload),
      'the operator’s pause must not consume a render retry').toBe(false)
    expect(dbState.updates.some(u => u.payload.video_status === 'failed'),
      'a stop is not a render failure').toBe(false)
    expect(sendPipelineAlert, 'no alert may report a stop as a pipeline fault')
      .toHaveBeenCalledTimes(0)
  })

  it('READING render progress stays allowed while stopped', async () => {
    // Over-stopping is its own failure mode: the system must still be able to
    // learn what already-running work did.
    stop.global = true
    await step4(req('/api/media/cron/step4'))
    expect(getLambdaRenderProgress, 'observation is not execution').toHaveBeenCalled()
  })
})

describe('step4 · creating a Meta container is an external write', () => {
  beforeEach(() => {
    dbState.scripts = [renderingScript({ video_status: 'ready', video_url: 'https://cdn/v.mp4' })]
    createReelContainer.mockResolvedValue('C1')
  })

  it('clear → the container is created', async () => {
    const body = await (await step4(req('/api/media/cron/step4'))).json()
    expect(createReelContainer).toHaveBeenCalledTimes(1)
    expect(body.status).toBe('step4_done')
  })

  it('stopped → no container call, and the video stays resumable', async () => {
    stop.project = true
    const body = await (await step4(req('/api/media/cron/step4'))).json()
    expect(createReelContainer).toHaveBeenCalledTimes(0)
    expect(body.status).toBe('ig_container_deferred_by_stop')
    expect(dbState.updates.some(u => u.payload.video_status === 'failed')).toBe(false)
  })
})

// ══ YOUTUBE ══════════════════════════════════════════════════════════════════

describe('youtube · a stop mid-queue stops the next video', () => {
  const vid = (id: string, project = PROJECT_A) => ({
    id, project_id: project, hook: 'h', cta: null, hashtags: [],
    video_url: `https://cdn/${id}.mp4`, youtube_video_id: null,
    media_news_items: { url: 'u', source_name: 's' },
  })

  it('video A uploads, the pause commits, video B is never uploaded', async () => {
    dbState.scripts = [vid('a'), vid('b')]
    uploadShort.mockImplementationOnce(async () => {
      stop.project = true                       // pause commits after A
      return { videoId: 'YT_A', url: 'https://yt/a' }
    })
    uploadShort.mockResolvedValue({ videoId: 'YT_B', url: 'https://yt/b' })

    const body = await (await youtube(req('/api/media/cron/youtube'))).json()

    expect(uploadShort, 'only video A may reach YouTube').toHaveBeenCalledTimes(1)
    expect(body.uploadedCount).toBe(1)
    expect(body.deferredCount).toBe(1)
  })

  it('a deferred video is not counted as a YouTube failure and raises no alert', async () => {
    dbState.scripts = [vid('a')]
    stop.global = true

    const body = await (await youtube(req('/api/media/cron/youtube'))).json()

    expect(uploadShort).toHaveBeenCalledTimes(0)
    expect(body.failedCount).toBe(0)
    expect(body.status).toBe('deferred_by_stop')
    expect(sendPipelineAlert).toHaveBeenCalledTimes(0)
  })
})

// ══ REPLY COMMENTS ═══════════════════════════════════════════════════════════

describe('reply-comments · a stop mid-queue stops the next reply', () => {
  const comment = (id: string, project: string | null = PROJECT_A) => ({
    id, project_id: project, platform: 'instagram', comment_id: `c-${id}`,
    post_id: 'p-1', commenter_name: 'someone', comment_text: 'this is a real question about the topic',
  })

  it('comment 1 is answered, the pause commits, comment 2 is not posted', async () => {
    dbState.comments = [comment('1'), comment('2')]
    fetchSpy.mockImplementationOnce(async () => {
      stop.project = true                       // pause commits after reply 1
      return { ok: true, json: async () => ({ id: 'r1' }) }
    })

    const body = await (await replyComments(req('/api/media/cron/reply-comments'))).json()

    expect(fetchSpy, 'only the first reply may leave the machine').toHaveBeenCalledTimes(1)
    expect(body.results.find((r: Row) => r.id === '1')).toMatchObject({ status: 'replied' })
    // Comment 2 IS reported — as deferred, not as replied and not as failed. It
    // stays pending in the table so resume picks it up.
    expect(body.results.find((r: Row) => r.id === '2'))
      .toMatchObject({ status: 'deferred_by_stop' })
    // Exactly ONE row was marked replied. The updates carry no row id (the
    // filter lives in .eq, not the payload), so counting is the honest check —
    // substring-matching the id against the whole payload would also match any
    // timestamp containing that digit.
    const repliedWrites = dbState.updates.filter(
      u => u.table === 'comment_replies' && u.payload.reply_status === 'replied')
    expect(repliedWrites, 'only comment 1 may be marked replied').toHaveLength(1)
  })

  it('a deferred comment is NOT marked failed — it stays pending and resumable', async () => {
    dbState.comments = [comment('1')]
    stop.global = true

    await replyComments(req('/api/media/cron/reply-comments'))

    expect(fetchSpy).toHaveBeenCalledTimes(0)
    const marked = dbState.updates.filter(u => u.table === 'comment_replies')
    expect(marked.some(u => u.payload.reply_status === 'failed'),
      'governance deferral is not a delivery failure').toBe(false)
    expect(marked.some(u => u.payload.reply_status === 'replied')).toBe(false)
  })

  it('a comment with no establishable project is skipped, never answered', async () => {
    // Fail closed. Inventing a project from the billing slug is the exact bypass
    // this slice removes, so an orphan comment goes unanswered instead.
    dbState.comments = [comment('1', null)]
    dbState.lookupScript = null

    const body = await (await replyComments(req('/api/media/cron/reply-comments'))).json()

    expect(fetchSpy).toHaveBeenCalledTimes(0)
    expect(body.results[0].status).toBe('skipped_no_project')
  })
})

// ══ PROJECT SEPARATION ═══════════════════════════════════════════════════════

describe('authority is the row’s project, never billing attribution', () => {
  it('pausing the row’s project refuses the write, whatever the billing project is', async () => {
    // The row belongs to B. Billing still flows through the media pipeline
    // project; execution answers to B, so pausing B must refuse.
    dbState.scripts = [{
      id: 'yt-b', project_id: PROJECT_B, hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/b.mp4', youtube_video_id: null,
      media_news_items: { url: 'u', source_name: 's' },
    }]
    stop.project = true

    const body = await (await youtube(req('/api/media/cron/youtube'))).json()

    expect(uploadShort).toHaveBeenCalledTimes(0)
    expect(body.status).toBe('deferred_by_stop')
  })

  it('an unresolvable project refuses rather than falling back to global-only', async () => {
    dbState.scripts = [{
      id: 'yt-x', project_id: PROJECT_B, hook: 'h', cta: null, hashtags: [],
      video_url: 'https://cdn/x.mp4', youtube_video_id: null,
      media_news_items: { url: 'u', source_name: 's' },
    }]
    stop.projectFound = false        // the project row cannot be read

    const body = await (await youtube(req('/api/media/cron/youtube'))).json()

    expect(uploadShort, 'an unreadable scope is not permission').toHaveBeenCalledTimes(0)
    expect(body.deferredCount).toBe(1)
  })
})


// ══ STEP 3 — the initial render dispatch ═════════════════════════════════════

describe('step3 · the INITIAL Lambda render is external compute too', () => {
  /**
   * Missed by the first pass of G3C-2B. The structural guard owned a hardcoded
   * list of four route files; step3 starts a Remotion render and was filed under
   * "latent scope bug", so it never entered that list and nothing noticed. The
   * inventory is derived from the call sites now.
   */
  const s3 = (over: Row = {}) => ({
    id: 's-3', project_id: PROJECT_A, video_status: null, hook: 'h',
    audio_url: 'https://cdn/a.mp3', timing_url: 'https://cdn/t.json',
    duration_ms: 60000, images: ['https://cdn/i0.jpg'], script: 'a script',
    composition: 'SimpleNewsReel', render_attempts: 0,
    media_news_items: { title: 'a headline' }, ...over,
  })
  const call = () => step3(req('/api/media/cron/step3?scriptId=s-3'))

  beforeEach(() => {
    dbState.scripts = [s3()]
    startLambdaRender.mockResolvedValue({ renderId: 'r9', bucketName: 'b9' })
  })

  it('clear → the render starts', async () => {
    const body = await (await call()).json()
    expect(startLambdaRender).toHaveBeenCalledTimes(1)
    expect(body.status).toBe('step3_done')
  })

  it('PROJECT paused → no Lambda call at all', async () => {
    stop.project = true
    const body = await (await call()).json()
    expect(startLambdaRender).toHaveBeenCalledTimes(0)
    expect(body.status).toBe('step3_deferred_by_stop')
    expect(body.reason).toBe('project_execution_paused')
  })

  it('GLOBAL paused → no Lambda call at all', async () => {
    stop.global = true
    const body = await (await call()).json()
    expect(startLambdaRender).toHaveBeenCalledTimes(0)
    expect(body.reason).toBe('global_automation_paused')
  })

  it('attempt 1 fails transiently, the pause commits, attempt 2 makes ZERO Lambda calls', async () => {
    // The step3 equivalent of publish's M3 proof. withRetry sleeps between
    // attempts; authorising outside the callback would let attempt 2 launch new
    // external compute after the operator stopped everything.
    startLambdaRender.mockImplementationOnce(async () => {
      stop.project = true
      throw new Error('503 lambda unavailable')
    })
    startLambdaRender.mockResolvedValue({ renderId: 'r-second', bucketName: 'b' })

    const body = await (await call()).json()

    expect(startLambdaRender, 'the second attempt must not reach Lambda')
      .toHaveBeenCalledTimes(1)
    expect(body.status).toBe('step3_deferred_by_stop')
  })

  it('a stop consumes no render attempt and raises no pipeline alert', async () => {
    stop.project = true
    await call()
    expect(dbState.updates.some(u => 'render_attempts' in u.payload),
      'the operator’s pause must not burn a render attempt').toBe(false)
    expect(dbState.updates.some(u => u.payload.video_status === 'failed'),
      'a stop is not a render failure').toBe(false)
    expect(dbState.updates.some(u => 'pipeline_next_retry_at' in u.payload),
      'a stop must not schedule a pipeline retry').toBe(false)
    expect(sendPipelineAlert).toHaveBeenCalledTimes(0)
  })

  it('the row is restored to its ORIGINAL video_status, not stranded', async () => {
    // step3 claims the row as `generating_images` before doing anything. That
    // value is not in the automatic selection predicate (`none` or NULL), so a
    // row abandoned there is silently retired rather than postponed.
    stop.project = true
    await call()
    const last = dbState.updates.filter(u => 'video_status' in u.payload).pop()
    expect(last?.payload.video_status, 'restore the exact prior state').toBeNull()
  })

  it('an existing video_status is restored exactly, not replaced by a guess', async () => {
    dbState.scripts = [s3({ video_status: 'none' })]
    stop.global = true
    await call()
    const last = dbState.updates.filter(u => 'video_status' in u.payload).pop()
    expect(last?.payload.video_status).toBe('none')
  })
})

describe('step3 · a G3C-1 refusal stays a governance event through the orchestrator', () => {
  /**
   * Cross-slice integration. The paid image fallback is refused by G3C-1's own
   * boundary, which throws ExecutionStoppedError. That error then travels into
   * step3's generic catch — which increments render_attempts, marks the video
   * failed, schedules a retry and alerts. A stop must not arrive there.
   */
  const noImages = (over: Row = {}) => ({
    id: 's-3', project_id: PROJECT_A, video_status: null, hook: 'h',
    audio_url: 'https://cdn/a.mp3', timing_url: 'https://cdn/t.json',
    duration_ms: 60000, images: [], script: 'a script',
    composition: 'SimpleNewsReel', render_attempts: 0,
    media_news_items: { title: 'a headline' }, ...over,
  })

  it('a stopped image generation defers, and never reaches the render', async () => {
    dbState.scripts = [noImages()]
    const { ExecutionStoppedError } = await import('@/lib/governance/execution-stop')
    generateNewsImages.mockRejectedValue(new ExecutionStoppedError({
      reason: 'project_execution_paused', context: 'AUTONOMOUS', scopeKind: 'PROJECT',
      decision: { allowed: false, context: 'AUTONOMOUS', scopesEvaluated: [],
                  resolution: 'RESOLVED', globalPaused: false, projectPaused: true,
                  reason: 'project_execution_paused', observed: null },
    }))

    const body = await (await step3(req('/api/media/cron/step3?scriptId=s-3'))).json()

    expect(body.status).toBe('step3_deferred_by_stop')
    expect(startLambdaRender, 'no render may follow a refused image step')
      .toHaveBeenCalledTimes(0)
    expect(dbState.updates.some(u => 'render_attempts' in u.payload)).toBe(false)
    expect(sendPipelineAlert).toHaveBeenCalledTimes(0)
  })

  it('the refusal is not retried as a transient Ideogram fault', async () => {
    dbState.scripts = [noImages()]
    const { ExecutionStoppedError } = await import('@/lib/governance/execution-stop')
    generateNewsImages.mockRejectedValue(new ExecutionStoppedError({
      reason: 'global_automation_paused', context: 'AUTONOMOUS', scopeKind: 'PROJECT',
      decision: { allowed: false, context: 'AUTONOMOUS', scopesEvaluated: [],
                  resolution: 'RESOLVED', globalPaused: true, projectPaused: false,
                  reason: 'global_automation_paused', observed: null },
    }))

    await step3(req('/api/media/cron/step3?scriptId=s-3'))

    // withRetry(attempts: 2) would sleep and ask again without the composed
    // permanence rule, turning the operator's pause into an exhausted call.
    expect(generateNewsImages).toHaveBeenCalledTimes(1)
  })
})
