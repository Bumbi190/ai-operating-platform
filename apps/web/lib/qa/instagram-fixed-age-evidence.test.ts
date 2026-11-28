import { describe, expect, it } from 'vitest'
import { selectSyntheticFixedAgeEvidence as select } from '../content-growth/instagram-fixed-age-evidence'
import { assessInstagramObservationQuality } from '../content-growth/instagram-observation-quality'
import { TARGET_COMPARISON_AGE_HOURS } from '../content-growth/instagram-experiments'

const H = 3_600_000
const published = 1000 * H
const now = published + 100 * H
const scope = { projectId: 'synthetic-project', accountId: 'synthetic-account', bindingId: 'synthetic-binding' }
const post = (postId = 'p1', publishedAtMs: number | null = published) => ({ ...scope, postId, publishedAtMs })
type Receipt = Parameters<typeof select>[2][number]
const receipt = (receiptId = 'r1', age = 48, patch: Partial<Receipt> = {}): Receipt => ({
  ...scope, receiptId, postId: 'p1', origin: 'synthetic_refresh', publishedAtMs: published,
  observedAtMs: published + age * H, views: 100, reach: 50, saves: 0, shares: 2, ...patch,
})
const run = (receipts: readonly Receipt[], cutoff = now, enrolled = [post()]) => select(scope, enrolled, receipts, cutoff, now)

describe('synthetic fixed-age evidence selection; no production provenance or pilot authority', () => {
  it('selects the first in-window measurement independently of counts and ordering', () => {
    const early = receipt('early', 49, { views: 0, saves: null })
    const late = receipt('late', 53, { views: 99999, saves: 30 })
    const input = [late, early, receipt('outside', 60)]
    const before = JSON.stringify(input)
    const r = run(input)
    expect(r.posts[0]).toEqual({ postId: 'p1', status: 'selected_candidate', candidate: {
      receiptId: 'early', publishedAtMs: published, observedAtMs: published + 49*H,
      views: 0, reach: 50, saves: null, shares: 2,
    } })
    expect(run([...input].reverse())).toEqual(r)
    expect(JSON.stringify(input)).toBe(before)
    expect(r.excluded.outsideAge).toBe(1)
  })
  it('accepts inclusive age boundaries and refuses one millisecond outside', () => {
    expect(run([receipt('r', TARGET_COMPARISON_AGE_HOURS)]).selectedCount).toBe(1)
    expect(run([receipt('r', TARGET_COMPARISON_AGE_HOURS + 6)]).selectedCount).toBe(1)
    for (const age of [48*H-1,54*H+1]) {
      expect(run([receipt('r', 48, { observedAtMs: published + age })]).posts[0].status).toBe('missing_at_cutoff')
    }
  })
  it('never promotes cached totals or account-level observations even in the exact age window', () => {
    const r=run([receipt('cache',48,{origin:'cache_only'}),receipt('account',50,{origin:'account_level'})])
    expect(r.selectedCount).toBe(0);expect(r.excluded.untrustedOrigin).toBe(2)
    expect(r.posts[0].status).toBe('missing_at_cutoff')
  })
  it('preserves every enrolled post including missing or unknown publication time', () => {
    const r=run([receipt()],now,[post(),post('p2'),post('p3',null)])
    expect(r.enrolledCount).toBe(3)
    expect(r.posts.map(p=>p.status)).toEqual(['selected_candidate','missing_at_cutoff','publication_time_unknown'])
    expect(r.posts.slice(1).every(p=>p.candidate===null)).toBe(true)
  })
  it('distinguishes unfinished window from missing at inclusive final cutoff', () => {
    expect(run([],published+54*H-1).posts[0].status).toBe('window_not_complete')
    expect(run([],published+54*H).posts[0].status).toBe('missing_at_cutoff')
  })
  it('does not use a receipt after an earlier explicit cutoff', () => {
    const r=run([receipt('late',50)],published+49*H)
    expect(r.excluded.afterCutoff).toBe(1)
    expect(r.posts[0].status).toBe('window_not_complete')
    expect(r.posts[0].candidate).toBeNull()
  })
  it('withholds conflicting or duplicate earliest-time candidates, not the next later one', () => {
    const r=run([receipt('a',49),receipt('b',49,{views:900}),receipt('c',50)])
    expect(r.posts[0].status).toBe('ambiguous_earliest')
    expect(r.posts[0].candidate).toBeNull()
    expect(r.selectedCount).toBe(0)
  })
  it('rejects duplicate receipt and roster IDs, including exact replays', () => {
    expect(()=>run([receipt(),receipt()])).toThrow(/duplicate/)
    expect(()=>run([],now,[post(),post()])).toThrow(/duplicate/)
  })
  it('fails closed on mixed project, account, binding and out-of-roster receipts', () => {
    for(const k of ['projectId','accountId','bindingId'] as const) {
      expect(()=>run([receipt('r',48,{[k]:'other'})])).toThrow(/mixed/)
      expect(()=>run([],now,[{...post(),[k]:'other'}])).toThrow(/mixed/)
    }
    expect(()=>run([receipt('r',48,{postId:'unknown'})])).toThrow(/mixed/)
  })
  it('rejects conflicting publication timestamps and observations before publication', () => {
    expect(()=>run([receipt('r',48,{publishedAtMs:published-1})])).toThrow(/Conflicting/)
    expect(()=>run([receipt('r',-1)])).toThrow(/before publication/)
  })
  it('withholds unknown timestamps and rejects future or malformed counts/time', () => {
    expect(run([receipt('r',48,{observedAtMs:null})]).excluded.unknownTime).toBe(1)
    expect(run([receipt('r',48,{publishedAtMs:null})]).selectedCount).toBe(0)
    expect(()=>run([receipt('r',101)])).toThrow(/time/)
    for(const views of [-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1]) {
      expect(()=>run([receipt('r',48,{views})])).toThrow(/metrics/)
    }
    expect(()=>run([],now+1)).toThrow(/clock/)
  })
  it('bounds collection size and does not treat no roster as all-data access', () => {
    expect(()=>run([],now,Array.from({length:201},(_,i)=>post('p'+i)))).toThrow(/collection/)
    expect(()=>run(Array.from({length:801},(_,i)=>receipt('r'+i)))).toThrow(/collection/)
    expect(()=>run([receipt()],now,[])).toThrow(/mixed/)
    expect(run([],now,[]).enrolledCount).toBe(0)
  })
  it('does not produce a production observation; reuses existing quality gate only in test fixture', () => {
    const r=run([receipt('r',49,{views:0,reach:0,saves:null,shares:0})])
    expect(r.mode).toBe('synthetic_only');expect(r.evidence).toBe('not_verified')
    expect(r.requiresTrustedSource).toBe(true)
    expect(r.authorizesPilot).toBe(false);expect(r.authorizesPublication).toBe(false)
    const c=r.posts[0].candidate!
    expect(c).not.toHaveProperty('source')
    // This explicit assertion is ONLY a synthetic unit-test fixture.
    const q=assessInstagramObservationQuality(scope,[{ ...scope,postId:'p1',
      source:'caller_attested_provider_snapshot',publishedAtMs:c.publishedAtMs,observedAtMs:c.observedAtMs,
      views:c.views,reach:c.reach,saves:c.saves,shares:c.shares,
    }],{nowMs:now,minAgeHours:48,maxAgeHours:54,freshnessHours:168,minimumPosts:1})
    expect(q.viewSamplePostIds).toEqual(['p1']);expect(q.engagementRateSamplePostIds).toEqual([])
  })
})