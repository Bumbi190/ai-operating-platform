import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({saved:[] as Record<string,unknown>[],scores:vi.fn()}))
vi.mock('@/lib/media/quality',async()=>{const real=await vi.importActual<typeof import('@/lib/media/quality')>('@/lib/media/quality');return {...real,scoreScript:state.scores}})
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const q:any={select:()=>q,eq:()=>q,limit:()=>q,update:()=>q,insert:(row:Record<string,unknown>)=>{if(table==='media_scripts')state.saved.push(row);return q},single:async()=>({data:table==='projects'?{id:'project',slug:'ai-media-automation'}:{id:table==='media_scripts'?'script-id':'news-id'},error:null})};return q
}})}))
vi.mock('@/lib/media/news-hunter',()=>({runNewsHunter:async()=>({candidates:[{story:{title:'Verified source',summary:'Verified facts',url:'https://example.com/news',sourceLabel:'Source'},estimatedViralityScore:90,suggestedAngle:'Explain significance',editorialNote:'Verified insight'}]})}))
vi.mock('@/lib/media/hermes',()=>({isHermesConfigured:()=>false,callHermesTrends:async()=>null,callHermesRead:vi.fn(),callHermesScrape:vi.fn(),callHermesCompetitors:vi.fn()}))
vi.mock('@/lib/media/run-log',()=>({logRun:async()=>null}))
vi.mock('@/lib/cost/track',()=>({logLlmCost:vi.fn()}))
vi.mock('@/lib/atlas/content-tags',()=>({classifyTopic:()=> 'tools'}))
vi.mock('@/lib/media/script-prompt',()=>({NEWS_SYSTEM:'news',buildScriptSystem:()=> 'script'}))
vi.mock('@/lib/media/text-client',()=>({getMediaTextClient:(ctx:{operation:string})=>({messages:{create:async()=>({content:[{type:'text',text:JSON.stringify(ctx.operation==='Analyze News'?{title:'Verified source',summary:'Verified facts',key_insight:'Insight',virality_score:90}: {hook:ctx.operation==='Rewrite Script'?'Revised hook':'First hook',script:ctx.operation==='Rewrite Script'?'Revised final script':'First script',captions:[],hashtags:[],cta:'Read more',tone:'clear',estimated_duration:'30s'})}]})}})}))
import {GET} from '@/app/api/media/cron/step1/route'
const good={hook_strength:8,retention_score:8,visual_relevance:8,shareability:8,discussion_potential:8,hallucination_risk:9,overall:8,passed:true,verdict:'Grounded',weak_spots:[]}
const bad={...good,passed:false,hook_strength:3,overall:5,verdict:'Unsupported claim'}
beforeEach(()=>{vi.clearAllMocks();state.saved.length=0;vi.stubEnv('CRON_SECRET','test-secret');vi.spyOn(console,'log').mockImplementation(()=>{})})
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()})
async function run(){return (await GET(new Request('https://example.com/api/media/cron/step1',{headers:{authorization:'Bearer test-secret'}}))).json()}
describe('scheduled script quality disposition',()=>{
 it('keeps a rejected rewrite pending instead of admitting it to voice and images',async()=>{state.scores.mockResolvedValue(bad);const response=await run();expect(state.saved).toHaveLength(1);expect(state.saved[0]).toMatchObject({hook:'Revised hook',script:'Revised final script',status:'pending_review',voice_status:'none',video_status:'none',quality_score:bad});expect(response.status).toBe('quality_review_required')})
 it('scores the rewritten text and stores its own passing evidence',async()=>{state.scores.mockResolvedValueOnce(bad).mockResolvedValueOnce(good);await run();expect(state.saved[0]).toMatchObject({script:'Revised final script',status:'approved',quality_score:good});expect(state.scores.mock.calls[1].slice(1,3)).toEqual(['Revised hook','Revised final script'])})
 it('does not rewrite a passing first script',async()=>{state.scores.mockResolvedValue(good);await run();expect(state.saved[0]).toMatchObject({script:'First script',status:'approved',quality_score:good});expect(state.scores).toHaveBeenCalledTimes(1)})
})
