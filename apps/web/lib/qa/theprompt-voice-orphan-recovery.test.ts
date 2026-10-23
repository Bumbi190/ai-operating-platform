import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  voice: vi.fn(),
  images: vi.fn(),
  uploadAudio: vi.fn(),
  uploadTiming: vi.fn(),
  uploadImage: vi.fn(),
  logRun: vi.fn(),
  alert: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: fake.createAdminClient }))
vi.mock('@/lib/media/elevenlabs', () => ({ generateVoiceover: fake.voice }))
vi.mock('@/lib/media/ideogram', () => ({ generateNewsImages: fake.images }))
vi.mock('@/lib/media/storage', () => ({
  uploadAudio: fake.uploadAudio,
  uploadTimingData: fake.uploadTiming,
  uploadSceneImage: fake.uploadImage,
}))
vi.mock('@/lib/media/run-log', () => ({ logRun: fake.logRun }))
vi.mock('@/lib/media/alert', () => ({ sendPipelineAlert: fake.alert }))
vi.mock('@/lib/media/retry', () => ({ withRetry: (fn: () => unknown) => fn(), nextRetryDelayMs: () => 1000, isPermanentByStatusText: () => false }))
import { GET as runStep2 } from '@/app/api/media/cron/step2/route'
import { GET as runRetry } from '@/app/api/media/cron/pipeline-retry/route'
import { validatedVoiceOrphanRecoveryStartAt } from '@/lib/media/voice-orphan-recovery-policy'

const projectId = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const scriptId = 'd95b077a-a977-4a48-b596-b89459f0518e'
const latestScript = {
  id: scriptId, project_id: projectId, hook: 'A source-grounded news hook',
  script: 'Short sourced news summary.', voice_status: 'none',
  voice_attempts: 0, media_news_items: { title: 'News title' },
}
type Recorded = { table: string; method: string; args: unknown[] }
const operations: Recorded[] = []
let step2Script: typeof latestScript | null = { ...latestScript }
let claimResult: { data: { id: string } | null; error: { message: string } | null } = { data: { id: scriptId }, error: null }
let claimQueue: Array<typeof claimResult> | null = null
let orphanCandidates: Array<{ id: string }> = [{ id: scriptId }]
let orphanCreatedAt = '2026-10-23T10:00:00.000Z'
let missingPromptProject = false
function query(table: string) {
  const filters: Recorded[] = []
  const q = {
    select(...args: unknown[]) { operations.push({ table, method: 'select', args });return q },
    update(...args: unknown[]) { operations.push({ table, method: 'update', args });return q },
    eq(...args: unknown[]) { operations.push({ table, method: 'eq', args }); filters.push({ table, method: 'eq', args });return q },
    is(...args: unknown[]) { operations.push({ table, method: 'is', args });filters.push({table,method:'is',args});return q },
    or(...args: unknown[]) { operations.push({ table, method: 'or', args });filters.push({table,method:'or',args});return q },
    lt(...args: unknown[]) { operations.push({table,method:'lt',args});filters.push({table,method:'lt',args});return q },
    gte(...args: unknown[]) { operations.push({table,method:'gte',args});filters.push({table,method:'gte',args});return q },
    order(...args: unknown[]) { operations.push({table,method:'order',args});return q },
    limit(...args: unknown[]) { operations.push({table,method:'limit',args}); return q },
    async single() { return {data:step2Script,error:null} },
    async maybeSingle() {
      if (table==='projects') return {data:missingPromptProject?null:{id:projectId},error:null}
      return claimQueue?.shift() ?? claimResult
    },
    then(resolve: (x: unknown)=>unknown, reject?:(e:unknown)=>unknown) {
      const isVoiceOrphan=table==='media_scripts'&&filters.some(f=>f.method==='or' && f.args[0]==='voice_status.eq.none,voice_status.is.null')
      const lower = filters.filter(f=>f.method==='gte'&&f.args[0]==='generated_at')
        .map(f=>Date.parse(String(f.args[1])))
      const upper = filters.filter(f=>f.method==='lt'&&f.args[0]==='generated_at')
        .map(f=>Date.parse(String(f.args[1])))
      const time = Date.parse(orphanCreatedAt)
      const isWithinRange = lower.every(v=>time>=v) && upper.every(v=>time<v)
      return Promise.resolve({data:isVoiceOrphan?(isWithinRange?orphanCandidates:[]):null,error:null}).then(resolve,reject)
    },
  }
  return q
}
const db = { from: vi.fn((table:string)=>query(table)) }
beforeEach(() => {
  vi.clearAllMocks();operations.length=0
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T10:20:00Z'))
  vi.stubEnv('CRON_SECRET','synthetic-cron-secret')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://app.omniraos.se')
  vi.stubEnv('H1_SPEND_GATE','1')
  vi.stubEnv('MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_ENABLED','true')
  vi.stubEnv('MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_FROM_UTC','2026-10-23T10:00:00.000Z')
  step2Script={...latestScript}
  claimResult={data:{id:scriptId},error:null}
  claimQueue=null
  orphanCandidates=[{id:scriptId}]
  orphanCreatedAt='2026-10-23T10:00:00.000Z'
  missingPromptProject=false
  fake.createAdminClient.mockReturnValue(db)
  fake.voice.mockResolvedValue({audioBuffer:Buffer.from('SYNTHETIC'),durationMs:9000,words:[]})
  fake.images.mockResolvedValue(['https://fixture.test/scene'])
  fake.uploadAudio.mockResolvedValue('storage://audio')
  fake.uploadTiming.mockResolvedValue('storage://timing')
  fake.uploadImage.mockResolvedValue('storage://image')
  fake.logRun.mockResolvedValue({})
  fake.alert.mockResolvedValue(undefined)
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals()})
function request(path:string){return new Request('https://app.omniraos.se'+path,{headers:{Authorization:'Bearer synthetic-cron-secret'}})}

describe('Step2 never duplicates paid voice/image generation',()=>{
  it('denies missing cron secret before any database or provider call',async()=>{
    const x=await runStep2(new Request('https://app.omniraos.se/api/media/cron/step2'))
    expect(x.status).toBe(401)
    expect(fake.createAdminClient).not.toHaveBeenCalled()
    expect(fake.voice).not.toHaveBeenCalled()
  })
  it('an existing ready voice cannot be regenerated by a scriptId override',async()=>{
    step2Script={...latestScript,voice_status:'ready'}
    const res=await runStep2(request('/api/media/cron/step2?scriptId='+scriptId))
    expect((await res.json()).status).toBe('nothing_to_do')
    expect(fake.voice).not.toHaveBeenCalled()
    expect(fake.images).not.toHaveBeenCalled()
  })
  it('a lost compare-and-set claim stops before any provider dispatch',async()=>{
    claimResult={data:null,error:null}
    const res=await runStep2(request('/api/media/cron/step2?scriptId='+scriptId))
    expect((await res.json()).status).toBe('nothing_to_do')
    expect(fake.voice).not.toHaveBeenCalled()
    expect(fake.images).not.toHaveBeenCalled()
    expect(operations.some(o=>o.method==='update'&&JSON.stringify(o.args).includes('generating'))).toBe(true)
    expect(operations.some(o=>o.method==='eq'&&o.args[0]==='voice_status'&&o.args[1]==='none')).toBe(true)
  })
  it('two concurrent claimants trigger only one paid voice/image request',async()=>{
    claimQueue=[{data:{id:scriptId},error:null},{data:null,error:null}]
    const [a,b]=await Promise.all([
      runStep2(request('/api/media/cron/step2?scriptId='+scriptId)),
      runStep2(request('/api/media/cron/step2?scriptId='+scriptId)),
    ])
    const statuses=[(await a.json()).status,(await b.json()).status].sort()
    expect(statuses).toEqual(['nothing_to_do','step2_done'])
    expect(fake.voice).toHaveBeenCalledTimes(1)
    expect(fake.images).toHaveBeenCalledTimes(1)
  })
  it('a database claim error fails closed before dispatch',async()=>{
    claimResult={data:null,error:{message:'synthetic-db-failure'}}
    const res=await runStep2(request('/api/media/cron/step2?scriptId='+scriptId))
    expect(res.status).toBe(503)
    expect(fake.voice).not.toHaveBeenCalled()
    expect(fake.images).not.toHaveBeenCalled()
  })
  it('successful claim dispatches one voice and one image request',async()=>{
    const res=await runStep2(request('/api/media/cron/step2?scriptId='+scriptId))
    expect((await res.json()).status).toBe('step2_done')
    expect(fake.voice).toHaveBeenCalledTimes(1)
    expect(fake.images).toHaveBeenCalledTimes(1)
    expect(operations.some(o=>o.method==='eq'&&o.args[0]==='project_id'&&o.args[1]===projectId)).toBe(true)
    expect(['published_at','audio_url','timing_url'].every(col => operations.some(o=>o.method==='is'&&o.args[0]===col&&o.args[1]===null))).toBe(true)
  })
  it('manual failed retry cannot exceed three attempts',async()=>{
    step2Script={...latestScript,voice_status:'failed',voice_attempts:3}
    const res=await runStep2(request('/api/media/cron/step2?scriptId='+scriptId))
    expect((await res.json()).status).toBe('nothing_to_do')
    expect(fake.voice).not.toHaveBeenCalled()
  })
  it('a recoverable failed attempt can be claimed with an observed attempt count',async()=>{
    step2Script={...latestScript,voice_status:'failed',voice_attempts:2}
    const res=await runStep2(request('/api/media/cron/step2?scriptId='+scriptId))
    expect((await res.json()).status).toBe('step2_done')
    expect(operations.some(o=>o.method==='eq'&&o.args[0]==='voice_attempts'&&o.args[1]===2)).toBe(true)
  })
})

describe('The Prompt pipeline retry finds late approved voice orphans only',()=>{
  it('never runs a provider without a valid cron authorization',async()=>{
    const res=await runRetry(new Request('https://app.omniraos.se/api/media/cron/pipeline-retry'))
    expect(res.status).toBe(401)
    expect(fake.createAdminClient).not.toHaveBeenCalled()
  })
  it('recovers a delayed approved voice-less script after ten minutes, scoped to The Prompt',async()=>{
    const calls:string[]=[]
    vi.stubGlobal('fetch',vi.fn(async(input:string)=>{calls.push(input);return new Response('{}',{status:200})}))
    const response=await runRetry(request('/api/media/cron/pipeline-retry'))
    const body=await response.json()
    expect(body.voiceOrphanRescued).toEqual([{scriptId,ok:true,status:200}])
    expect(calls).toEqual(['https://app.omniraos.se/api/media/cron/step2?scriptId='+scriptId])
    expect(operations.some(o=>o.method==='eq'&&o.args[0]==='project_id'&&o.args[1]===projectId)).toBe(true)
    expect(operations.some(o=>o.method==='is'&&o.args[0]==='audio_url'&&o.args[1]===null)).toBe(true)
    expect(operations.some(o=>o.method==='is'&&o.args[0]==='published_at'&&o.args[1]===null)).toBe(true)
    expect(operations.some(o=>o.method==='lt'&&o.args[0]==='generated_at'&&o.args[1]===new Date('2026-10-23T10:10:00Z').toISOString())).toBe(true)
    expect(operations.some(o=>o.method==='gte'&&o.args[0]==='generated_at'&&o.args[1]===new Date('2026-10-23T04:20:00Z').toISOString())).toBe(true)
  })
  it('requires an explicit UTC activation lower bound even if the paid flag and spend gate are enabled',async()=>{
    vi.stubEnv('MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_FROM_UTC','')
    const calls=vi.fn()
    vi.stubGlobal('fetch',calls)
    const res=await runRetry(request('/api/media/cron/pipeline-retry'))
    const body=await res.json()
    expect(body.voiceOrphanCandidates).toBe(1)
    expect(body.voiceOrphanRescued).toEqual([])
    expect(calls).not.toHaveBeenCalled()
  })
  it.each(['garbage','2026-10-23T12:00:00+02:00','2026-02-30T10:00:00Z','2026-10-23T10:15:00Z'])('refuses malformed, local-time or premature recovery cutover %s',async (startAt)=>{
    vi.stubEnv('MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_FROM_UTC',startAt)
    const calls=vi.fn()
    vi.stubGlobal('fetch',calls)
    const res=await runRetry(request('/api/media/cron/pipeline-retry'))
    expect((await res.json()).voiceOrphanRescued).toEqual([])
    expect(calls).not.toHaveBeenCalled()
  })
  it('does not backfill a historical 11 AM script created before a newly approved cutover',async()=>{
    orphanCreatedAt='2026-10-23T09:00:55.596Z'
    const calls=vi.fn()
    vi.stubGlobal('fetch',calls)
    const res=await runRetry(request('/api/media/cron/pipeline-retry'))
    const body=await res.json()
    expect(body.voiceOrphanCandidates).toBe(0)
    expect(body.voiceOrphanRescued).toEqual([])
    expect(calls).not.toHaveBeenCalled()
    expect(operations.some(o=>o.method==='gte' && o.args[0]==='generated_at' && o.args[1]==='2026-10-23T10:00:00.000Z')).toBe(true)
  })
  it('preserves pre-cutover monitoring when the paid feature remains disabled',async()=>{
    vi.stubEnv('MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_ENABLED','')
    orphanCreatedAt='2026-10-23T09:00:55.596Z'
    const calls=vi.fn()
    vi.stubGlobal('fetch',calls)
    const body=await (await runRetry(request('/api/media/cron/pipeline-retry'))).json()
    expect(body.voiceOrphanCandidates).toBe(1)
    expect(body.voiceOrphanRescued).toEqual([])
    expect(calls).not.toHaveBeenCalled()
  })
  it('validates ISO UTC cutovers and refuses invalid or too-recent timestamps',()=>{
    const now=new Date('2026-10-23T10:20:00Z')
    expect(validatedVoiceOrphanRecoveryStartAt('2026-10-23T10:00:00Z',now)).toBe('2026-10-23T10:00:00.000Z')
    expect(validatedVoiceOrphanRecoveryStartAt('2026-10-23T10:00:00.000Z',now)).toBe('2026-10-23T10:00:00.000Z')
    for(const invalid of ['', 'tomorrow','2026-10-23T12:00:00+02:00','2026-02-30T10:00:00Z','2026-10-23T10:11:00Z']) {
      expect(validatedVoiceOrphanRecoveryStartAt(invalid,now)).toBeNull()
    }
  })
  it('does not dispatch a paid voice recovery by default, but reports a safe candidate count',async()=>{
    vi.stubEnv('MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_ENABLED','')
    const calls=vi.fn()
    vi.stubGlobal('fetch',calls)
    const res=await runRetry(request('/api/media/cron/pipeline-retry'))
    const body=await res.json()
    expect(body.voiceOrphanRescued).toEqual([])
    expect(body.voiceOrphanCandidates).toBe(1)
    expect(calls).not.toHaveBeenCalled()
  })
  it('refuses paid recovery when the hard spend gate is not enforced',async()=>{
    vi.stubEnv('H1_SPEND_GATE','0')
    const calls=vi.fn()
    vi.stubGlobal('fetch',calls)
    const res=await runRetry(request('/api/media/cron/pipeline-retry'))
    expect((await res.json()).voiceOrphanRescued).toEqual([])
    expect(calls).not.toHaveBeenCalled()
  })
  it('does nothing if the The Prompt project cannot be resolved',async()=>{
    missingPromptProject=true
    const calls=vi.fn()
    vi.stubGlobal('fetch',calls)
    const res=await runRetry(request('/api/media/cron/pipeline-retry'))
    expect((await res.json()).voiceOrphanRescued).toEqual([])
    expect(calls).not.toHaveBeenCalled()
  })
})
