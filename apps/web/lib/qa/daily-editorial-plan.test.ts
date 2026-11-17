import { describe, it, expect } from 'vitest'
import { buildDailyPromptPlan, requiresEnhancedEditorialReview } from '@/lib/article/daily/editorial-plan'

const PID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const FOREIGN='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW='2026-11-17T08:00:00Z'
const id=(n: number)=>'aaaaaaaa-bbbb-4ccc-8ddd-'+String(n).padStart(12,'0')
const item=(n: number, changes: Record<string,unknown>={})=>({
  id:id(n),project_id:PID,title:'AI tech development '+n,
  url:'https://example.com/ai-'+n,source_name:'Example News',
  status:'new',fetched_at:'2026-11-17T07:00:00Z',
  created_at:'2026-11-17T07:00:00Z',virality_score:75,...changes,
})
const social=(n: number, changes: Record<string,unknown>={})=>({
  id:id(100+n),project_id:PID,news_item_id:id(n),status:'published',
  generated_at:'2026-11-15T16:00:00Z',published_at:'2026-11-16T16:05:00Z',
  instagram_media_id:'igs_'+n,facebook_post_id:null,youtube_video_id:null,...changes,
})
const plan=(news: any[],scripts: any[],websiteArticles: any[]=[])=>
  buildDailyPromptPlan({projectId:PID,now:NOW,news,scripts,websiteArticles})

describe('The Prompt daily editorial plan is non-billable and non-publishing',()=>{
  it('selects one receipted social expansion + distinct fresh independent article',()=>{
    const p=plan([item(1),item(2)],[social(1)])
    expect(p.mode).toBe('prepare_only')
    expect(p.canDispatch).toBe(false)
    expect(p.canPublish).toBe(false)
    expect(p.candidates).toHaveLength(2)
    expect(p.candidates[0]).toMatchObject({
      slot:'social_expansion',newsItemId:id(1),socialReceiptVerified:true,suggestedTier:'deep',
      canPublish:false,sourceFactsIndependentlyVerified:false,
    })
    expect(p.candidates[1]).toMatchObject({
      slot:'independent_news',newsItemId:id(2),socialReceiptVerified:false,suggestedTier:'standard',
    })
    for(const c of p.candidates){
      expect(c.needs).toContain('find_independent_corroboration')
      expect(c.needs).toContain('human_publish_approval')
      expect(c.canWrite).toBe(false)
    }
  })
  it('a pending or approved manuscript without public media receipt is NEVER called social-posted',()=>{
    const p=plan([item(1)], [social(1,{status:'pending_review',instagram_media_id:null})])
    expect(p.candidates).toHaveLength(0)
  })
  it('a fake published flag without external media ID is not sufficient',()=>{
    expect(plan([item(1)], [social(1,{instagram_media_id:null})]).candidates).toHaveLength(0)
  })
  it('a socially published source is never counted as independent news',()=>{
    const p=plan([item(1)], [social(1)])
    expect(p.candidates).toHaveLength(1)
    expect(p.candidates[0].slot).toBe('social_expansion')
  })
  it('an existing website_content draft or rejected item is not regenerated',()=>{
    for(const status of ['pending_review','published','rejected','draft']){
      const p=plan([item(1),item(2)],[social(1)],[
        {news_item_id:id(1),external_id:'omnira_'+id(1),status},
      ])
      expect(p.candidates.map(c=>c.newsItemId)).toEqual([id(2)])
    }
  })
  it('existing website external_id blocks a duplicate even if news_item_id is absent',()=>{
    const p=plan([item(1)],[],[{news_item_id:null,external_id:'omnira_'+id(1),status:'published'}])
    expect(p.candidates).toHaveLength(0)
  })
  it('foreign-project news and scripts NEVER leak into the plan',()=>{
    const p=plan([item(1,{project_id:FOREIGN}),item(2)],[social(1,{project_id:FOREIGN})])
    expect(p.candidates).toHaveLength(1)
    expect(p.candidates[0].newsItemId).toBe(id(2))
  })
  it('stale candidate cannot be published as today news',()=>{
    const p=plan([item(1,{fetched_at:'2026-09-01T09:00:00Z'}),
      item(2,{fetched_at:'2026-11-15T07:00:00Z'})],
      [social(1,{published_at:'2026-10-01T08:00:00Z'})])
    expect(p.candidates.map(c=>c.newsItemId)).toEqual([id(2)])
  })
  it('high-risk allegations and self-harm topics never enter unattended selection',()=>{
    expect(requiresEnhancedEditorialReview('A 13-year-old asked AI about suicide')).toBe(true)
    const p=plan([item(1,{title:'CEO accused in a spying affair'}),item(2)],
      [social(1)])
    expect(p.candidates.map(c=>c.newsItemId)).toEqual([id(2)])
  })
  it('source URLs must be HTTPS, noncredentialed and not localhost',()=>{
    const p=plan([item(1,{url:'http://example.com/story'}),
      item(2,{url:'https://user:pass@example.com/story'}),
      item(3,{url:'https://localhost/story'}),item(4)],[])
    expect(p.candidates.map(c=>c.newsItemId)).toEqual([id(4)])
  })
  it('duplicate canonical links and duplicate titles do not create two pieces',()=>{
    const p=plan([item(1,{url:'https://example.com/one?utm_source=ig'}),
      item(2,{url:'https://example.com/one?utm_source=fb'}),
      item(3,{title:'AI tech development 1'})],[social(1)])
    expect(p.candidates).toHaveLength(1)
  })
  it('invalid time or scope fails closed rather than defaulting to first project',()=>{
    expect(()=>buildDailyPromptPlan({projectId:'not-uuid',now:NOW,news:[],scripts:[],websiteArticles:[]})).toThrow()
    expect(()=>buildDailyPromptPlan({projectId:PID,now:'not-a-time',news:[],scripts:[],websiteArticles:[]})).toThrow()
  })
})
