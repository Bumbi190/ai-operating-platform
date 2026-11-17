import { beforeEach, describe, expect, it, vi } from 'vitest'

const PID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const N1='aaaaaaaa-bbbb-4ccc-8ddd-000000000001'
const N2='aaaaaaaa-bbbb-4ccc-8ddd-000000000002'
const S1='aaaaaaaa-bbbb-4ccc-8ddd-000000000003'
const mock=vi.hoisted(()=>({
  queries:[] as Array<{table:string,key:string,value:unknown}>,
  errorTable:'' as string,
  projectMissing:false,
}))
vi.mock('@/lib/supabase/admin',()=>({
  createAdminClient:()=>({
    from:(table:string)=>{
      const clauses:Record<string,unknown>={}
      const builders:any={
        select(_cols:string){return builders},
        eq(key:string,value:unknown){mock.queries.push({table,key,value});clauses[key]=value;return builders},
        order(_key:string,_opt:unknown){return builders},
        limit(_n:number){return builders},
        async maybeSingle(){return result(true)},
        then(resolve: (value:unknown)=>void,reject:(error:unknown)=>void){
          return Promise.resolve(result(false)).then(resolve,reject)
        },
      }
      const fixture:Record<string,any[]> = {
        projects: mock.projectMissing?[]:[{id:PID,slug:'ai-media-automation'}],
        media_news_items:[
          {id:N1,project_id:PID,title:'AI tool update',url:'https://example.org/news-1',source_name:'Official',
            status:'scripted',fetched_at:'2026-11-17T07:00:00Z',created_at:'2026-11-17T07:00:00Z',virality_score:75},
          {id:N2,project_id:PID,title:'New AI research',url:'https://example.org/news-2',source_name:'Science',
            status:'new',fetched_at:'2026-11-17T07:00:00Z',created_at:'2026-11-17T07:00:00Z',virality_score:75},
        ],
        media_scripts:[
          {id:S1,project_id:PID,news_item_id:N1,status:'published',
            generated_at:'2026-11-16T07:00:00Z',published_at:'2026-11-16T08:00:00Z',
            instagram_media_id:'ig',facebook_post_id:null,youtube_video_id:null},
        ],
        website_content:[],
      }
      function result(single:boolean){
        if(mock.errorTable===table)return {data:null,error:{message:'unexpected error'}}
        const matches=(fixture[table]||[]).filter(row=>
          Object.entries(clauses).every(([k,v])=>row[k]===v))
        return {data:single?(matches[0]||null):matches,error:null}
      }
      return builders
    },
  }),
}))
beforeEach(()=>{mock.queries.length=0;mock.errorTable='';mock.projectMissing=false})
describe('The Prompt planner inventory uses only owned project data, read-only',()=>{
  it('resolves The Prompt slug and scopes all three inventory tables by its UUID',async()=>{
    const {planTodaysPromptArticles}=await import('@/lib/article/daily/inventory')
    const p=await planTodaysPromptArticles('2026-11-17T08:00:00Z')
    expect(p.ok).toBe(true)
    if(!p.ok)throw Error('expected plan')
    expect(p.plan.candidates).toHaveLength(2)
    expect(p.plan.canPublish).toBe(false)
    for(const table of ['media_news_items','media_scripts','website_content']){
      expect(mock.queries).toContainEqual({table,key:'project_id',value:PID})
    }
    expect(mock.queries).toContainEqual({table:'projects',key:'slug',value:'ai-media-automation'})
  })
  it('unknown The Prompt slug stops before reading any other tables',async()=>{
    mock.projectMissing=true
    const {planTodaysPromptArticles}=await import('@/lib/article/daily/inventory')
    expect(await planTodaysPromptArticles('2026-11-17T08:00:00Z'))
      .toEqual({ok:false,reason:'project_missing'})
    expect(mock.queries.some(x=>x.table==='media_scripts')).toBe(false)
  })
  it('read failure prevents partial plan (fail-closed)',async()=>{
    mock.errorTable='media_news_items'
    const {planTodaysPromptArticles}=await import('@/lib/article/daily/inventory')
    expect(await planTodaysPromptArticles('2026-11-17T08:00:00Z'))
      .toEqual({ok:false,reason:'inventory_unavailable'})
  })
})
