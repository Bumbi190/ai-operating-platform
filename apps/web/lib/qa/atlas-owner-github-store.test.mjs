import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadStoredOwnerGithubReadScope, OWNER_GITHUB_BINDINGS_TABLE } from '../atlas/project-connections/owner-github-catalog.ts'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '99999999-9999-4999-8999-999999999999'
const projects = [
  { id:'22222222-2222-4222-8222-222222222222', slug:'family-project', owner_id:owner },
  { id:'33333333-3333-4333-8333-333333333333', slug:'cars-project', owner_id:owner },
  { id:'44444444-4444-4444-8444-444444444444', slug:'new-project', owner_id:owner },
]
const approved = (project=projects[0],repoId=1001) => ({
  project_id:project.id, project_slug:project.slug, owner_user_id:owner,
  installation_id:6001, repository_id:repoId, repository_owner_id:321,
  repository_owner:'ExampleOwner', repository_name:'repo-'+repoId,
  default_branch:'main', state:'approved',
  approved_by:owner, approved_at:'2026-10-28T20:00:00Z',
})
function makeDb({projectRows=projects,bindingRows=[approved()],failProject=false,failBinding=false,throwTable=null,overrideFilter=false}={}) {
  const queries=[]
  return {
    queries,
    db:{from(table){
      if (throwTable === table) throw Error('unavailable database')
      assert.ok(['projects',OWNER_GITHUB_BINDINGS_TABLE].includes(table), 'no unrelated table access')
      const parts={table,columns:null,filters:[],limit:null}
      queries.push(parts)
      const q={
        select(cols){parts.columns=cols;return q},
        eq(col,val){parts.filters.push({kind:'eq',col,val});return q},
        in(col,values){parts.filters.push({kind:'in',col,values});return q},
        limit(count){
          parts.limit=count
          if (table==='projects' && failProject) return Promise.resolve({data:null,error:{code:'error'}})
          if (table===OWNER_GITHUB_BINDINGS_TABLE && failBinding) return Promise.resolve({data:null,error:{code:'42P01'}})
          let records=table==='projects'?projectRows:bindingRows
          if (!overrideFilter && Array.isArray(records)) {
            for(const f of parts.filters){
              records=records.filter(row=> f.kind==='eq'?row[f.col]===f.val:f.values.includes(row[f.col]))
            }
          }
          return Promise.resolve({data:records,error:null})
        },
      }
      return q
    }},
  }
}
const load=(sample,id=projects[0].id,ownerId=owner)=>loadStoredOwnerGithubReadScope({
  db:sample.db, authenticatedOwnerUserId:ownerId,requestedProjectId:id,
})

describe('Atlas owner repository DB loader Stage 1: no live SQL or provider calls',()=>{
  it('selects verified owner projects and approved repo rows with both scopes in SQL',async()=>{
    const x=makeDb()
    const out=await load(x)
    assert.equal(out.ok,true)
    assert.equal(out.scope.projectId,projects[0].id)
    assert.equal(out.scope.repositoryId,1001)
    assert.deepEqual(x.queries.map(q=>q.table),['projects',OWNER_GITHUB_BINDINGS_TABLE])
    assert.ok(x.queries[0].filters.some(f=>f.col==='owner_id'&&f.val===owner))
    assert.ok(x.queries[1].filters.some(f=>f.col==='owner_user_id'&&f.val===owner))
    assert.ok(x.queries[1].filters.some(f=>f.col==='state'&&f.val==='approved'))
    assert.deepEqual(x.queries[1].filters.find(f=>f.col==='project_id')?.values,projects.map(p=>p.id))
    assert.ok(x.queries.every(q=>q.limit===201))
  })
  it('supports three distinct owner-registered project bindings without changing code',async()=>{
    const entries=projects.map((p,i)=>approved(p,1001+i))
    for(const [i,p] of projects.entries()){
      const out=await load(makeDb({bindingRows:entries}),p.id)
      assert.equal(out.ok,true)
      assert.equal(out.scope.repositoryId,1001+i)
      assert.equal(out.scope.projectSlug,p.slug)
    }
  })
  it('independently refuses a foreign project row even if a broken DB adapter ignores owner filters',async()=>{
    const x=makeDb({projectRows:[{...projects[0],owner_id:other}],overrideFilter:true})
    assert.equal((await load(x)).ok,false)
    assert.deepEqual(x.queries.map(q=>q.table),['projects'])
  })
  it('refuses a foreign project before reading the repository binding table',async()=>{
    const x=makeDb()
    const out=await load(x,'55555555-5555-4555-8555-555555555555')
    assert.equal(out.ok,false)
    assert.deepEqual(x.queries.map(q=>q.table),['projects'])
  })
  it('refuses a fake operator or non-UUID project before the first query',async()=>{
    const x=makeDb()
    assert.equal((await load(x,projects[0].id,'not-a-user')).ok,false)
    assert.equal((await load(x,'some-project-slug')).ok,false)
    assert.deepEqual(x.queries,[])
  })
  it('fails closed if binding table is not migrated/exposed',async()=>{
    const x=makeDb({failBinding:true})
    assert.deepEqual(await load(x),{ok:false,code:'not_available'})
  })
  it('fails closed if project source query or binding source query throws',async()=>{
    for(const table of ['projects',OWNER_GITHUB_BINDINGS_TABLE]){
      assert.equal((await load(makeDb({throwTable:table}))).ok,false)
    }
    assert.equal((await load(makeDb({failProject:true}))).ok,false)
  })
  it('refuses no owner projects and duplicate or corrupt project identity rows',async()=>{
    assert.equal((await load(makeDb({projectRows:[]}))).ok,false)
    assert.equal((await load(makeDb({projectRows:[projects[0],projects[0]]}))).ok,false)
    assert.equal((await load(makeDb({projectRows:[{...projects[0],slug:'../bad'}]}))).ok,false)
  })
  it('refuses a stale or misattributed slug even when row claims approval',async()=>{
    assert.equal((await load(makeDb({bindingRows:[{...approved(),project_slug:'other'}]}))).ok,false)
  })
  it('refuses an approved record attributed to another owner or a forged reviewer',async()=>{
    const x=makeDb({bindingRows:[{...approved(),approved_by:other}]})
    assert.equal((await load(x)).ok,false)
    const y=makeDb({bindingRows:[{...approved(),owner_user_id:other}],overrideFilter:true})
    assert.equal((await load(y)).ok,false)
  })
  it('does not let pending, disabled or revoked rows masquerade as approved',async()=>{
    for(const state of ['pending','revoked','disabled']){
      const x=makeDb({bindingRows:[{...approved(),state}],overrideFilter:true})
      assert.equal((await load(x)).ok,false)
    }
  })
  it('requires a real non-future approval timestamp and matching owner',async()=>{
    for(const approved_at of [null,'bogus','2099-01-01T00:00:00Z']){
      assert.equal((await load(makeDb({bindingRows:[{...approved(),approved_at}]}))).ok,false)
    }
  })
  it('refuses duplicate approved mappings and two projects sharing one repo ID',async()=>{
    assert.equal((await load(makeDb({bindingRows:[approved(),approved()]}))).ok,false)
    assert.equal((await load(makeDb({bindingRows:[approved(),approved(projects[1])]}))).ok,false)
  })
  it('refuses a silent truncation of more than 200 projects',async()=>{
    const rows=Array.from({length:201},(_,i)=>({
      id:i.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111',
      slug:'p'+i, owner_id:owner,
    }))
    assert.equal((await load(makeDb({projectRows:rows}))).ok,false)
  })
  it('refuses a silent truncation of approved bindings with over 200 rows',async()=>{
    const rows=Array.from({length:201},(_,i)=>approved(projects[0],1001+i))
    assert.equal((await load(makeDb({bindingRows:rows}))).ok,false)
  })
  it('refuses malformed numeric repository ID instead of accepting display names',async()=>{
    assert.equal((await load(makeDb({bindingRows:[{...approved(),repository_id:'1001'}]}))).ok,false)
  })
  it('never allows the request to choose a URL, repo ID or write access',async()=>{
    const fake=makeDb()
    const out=await load(fake)
    assert.equal(out.ok,true)
    assert.equal('accessToken' in out.scope,false)
    assert.equal(out.scope.access,'read')
    assert.ok(fake.queries.every(q=>q.table==='projects'||q.table===OWNER_GITHUB_BINDINGS_TABLE))
  })
})
