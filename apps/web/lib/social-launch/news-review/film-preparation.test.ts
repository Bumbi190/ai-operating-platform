import {it,expect,vi} from 'vitest'
import {prepareFilm} from './film-preparation'
import {fixture,project} from './film-preparation-fixture'
const post='22222222-2222-4222-8222-222222222222',revision='33333333-3333-4333-8333-333333333333',planId='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555',sha='a'.repeat(64),planSha='b'.repeat(64)
const now=Date.parse('2026-10-19T06:00:00.000Z')
const run=(f:ReturnType<typeof fixture>,clock=()=>now)=>prepareFilm(f.db,f.p,f.input,f.brief,clock)
it('pins the saved manuscript and approved plan without generation authority',async()=>{
 const f=fixture(),r=await run(f)
 expect(r).toMatchObject({kind:'the-prompt-film-preparation-v1',dryRun:true,persisted:false,jobId:null,projectId:project,post:{id:post,revisionId:revision,sha256:sha},plan:{revisionId:planId,sha256:planSha,decisionId:other},canGenerate:false,canPublish:false,sourceVerification:'operator_supplied_not_verified'})
 expect(r.candidate.editorial.script).toBe(f.content.posts[0].revision.draft.text);expect(r.candidate.scenes).toEqual(f.brief.scenes)
 expect(r.preparationSha256).toMatch(/^[a-f0-9]{64}$/);expect(r.sourceExpiresAt).toBe('2026-10-20T16:49:35.513Z')
 expect(r.blockers).toEqual(['SOURCE_REVERIFICATION_REQUIRED','CANONICAL_NEWS_SCRIPT_PREPARATION_REQUIRED','GENERATION_BUDGET_REQUIRED','IMAGE_VOICE_USAGE_EVIDENCE_REQUIRED','GENERATED_MEDIA_REQUIRED','RENDER_QA_AND_REVIEW_REQUIRED'])
})
it('keeps fingerprint stable across key order and observation time',async()=>{
 const a=fixture(),b=fixture();b.brief.source=Object.fromEntries(Object.entries(b.brief.source).reverse())
 const one=await run(a),two=await run(b,()=>now+1000)
 expect(two.preparationSha256).toBe(one.preparationSha256);expect(two.checkedAt).not.toBe(one.checkedAt)
})
it.each(['hook','scene order','script','plan decision','draft media brief'])('changes fingerprint when %s changes',async(change)=>{
 const a=fixture(),b=fixture()
 if(change==='hook')b.brief.editorial.hook='A DIFFERENT HOOK'
 if(change==='scene order')b.brief.scenes.reverse()
 if(change==='script'){b.brief.editorial.script+=' Details are forthcoming.';b.content.posts[0].revision.draft.text=b.brief.editorial.script;b.input.sha256='c'.repeat(64);b.content.posts[0].revision.sha256=b.input.sha256}
 if(change==='plan decision')b.plan.decision.id='66666666-6666-4666-8666-666666666666'
 if(change==='draft media brief'){b.content.posts[0].revision.draft.mediaBrief='Revised image direction';b.input.sha256='d'.repeat(64);b.content.posts[0].revision.sha256=b.input.sha256}
 expect((await run(b)).preparationSha256).not.toBe((await run(a)).preparationSha256)
})
it('refuses an unowned project before private reads',async()=>{const f=fixture();f.p.allowedProjectIds=[];await expect(run(f)).rejects.toMatchObject({code:'NOT_FOUND'});expect(f.calls).toEqual([])})
it('checks the actual owner rather than trusting the caller list',async()=>{const f=fixture();f.owners[0].owner_id=other;await expect(run(f)).rejects.toMatchObject({code:'NOT_FOUND'});expect(f.calls.includes('rpc:social_content_read')).toBe(false)})
it('honors the existing stop',async()=>{const f=fixture();f.stop();await expect(run(f)).rejects.toMatchObject({code:'STOPPED'})})
it.each(['revision','checksum'])('refuses changed expected %s',async(which)=>{const f=fixture();if(which==='revision')f.input.revisionId=other;else f.input.sha256='f'.repeat(64);await expect(run(f)).rejects.toMatchObject({code:'REVISION_CONFLICT'})})
it('refuses an old approval for a new plan',async()=>{const f=fixture();f.plan.currentRevision.id=other;await expect(run(f)).rejects.toMatchObject({code:'PLAN_REQUIRED'})})
it('requires the draft to use the current approved plan',async()=>{const f=fixture();f.content.posts[0].revision.planRevisionId=other;await expect(run(f)).rejects.toMatchObject({code:'PLAN_CHANGED'})})
it('requires a video destination in the plan',async()=>{const f=fixture();f.plan.currentRevision.choices[0].format='image';await expect(run(f)).rejects.toMatchObject({code:'UNSUPPORTED_DRAFT'})})
it.each(['script','source URL'])('refuses mismatched %s',async(which)=>{const f=fixture();if(which==='script')f.brief.editorial.script+=' Changed.';else f.brief.source.url='https://www.anthropic.com/news/another';await expect(run(f)).rejects.toMatchObject({code:'BRIEF_MISMATCH'})})
it.each(['root','source','editorial','scene'])('refuses unsupported evidence in %s',async(where)=>{const f=fixture();Object.assign(where==='root'?f.brief:where==='source'?f.brief.source:where==='editorial'?f.brief.editorial:f.brief.scenes[0],{rightsVerified:true});await expect(run(f)).rejects.toMatchObject({code:'INVALID_BODY'})})
it('refuses apply in read-only input',async()=>{const f=fixture();f.input.apply=true;await expect(run(f)).rejects.toMatchObject({code:'INVALID_BODY'})})
it.each([
 ['stale','2026-10-17T05:59:59.999Z','SOURCE_EXPIRED'],['future','2026-10-19T06:15:00.001Z','SOURCE_EXPIRED'],
 ['invalid date','2026-02-30T06:00:00.000Z','INVALID_BODY'],['unsafe URL','https://www.anthropic.com/news/example?token=secret','INVALID_BODY'],['foreign issuer','rss_openai','SOURCE_NOT_ELIGIBLE']
])('refuses %s source metadata',async(kind,value,code)=>{const f=fixture();if(kind==='unsafe URL')f.brief.source.url=value;else if(kind==='foreign issuer')f.brief.source.key=value;else f.brief.source.publishedAt=value;await expect(run(f)).rejects.toMatchObject({code})})
it('rechecks the clock after reading',async()=>{const f=fixture();f.brief.source.publishedAt='2026-10-17T06:00:00.000Z';let n=0;await expect(run(f,()=>n++===0?now:now+1)).rejects.toMatchObject({code:'SOURCE_EXPIRED'})})
it('refuses a draft replaced during preparation',async()=>{const f=fixture();f.onContent(n=>{if(n===2)f.content.posts[0].revision.id=other});await expect(run(f)).rejects.toMatchObject({code:'REVISION_CONFLICT'})})
it('refuses a plan replaced during preparation',async()=>{const f=fixture();f.onPlan(n=>{if(n===2){f.plan.currentRevision.id=other;f.plan.decision.revisionId=other}});await expect(run(f)).rejects.toMatchObject({code:'PLAN_CHANGED'})})
it('does not fetch or issue any write-capable database operation',async()=>{
 const f=fixture(),fetch=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('No network allowed')})
 try{const r=await run(f);expect(r.canGenerate).toBe(false);expect(fetch).not.toHaveBeenCalled()
 expect(f.calls.filter(c=>!['from:projects','rpc:social_content_active','rpc:social_content_read','rpc:social_launch_plan_read'].includes(c))).toEqual([])}finally{fetch.mockRestore()}
})
