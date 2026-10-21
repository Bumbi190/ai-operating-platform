import {beforeEach,describe,expect,it,vi} from 'vitest'
import {
 listFamilyMonthSourceReviews,proposeFamilyMonthSource,
 decideFamilyMonthSource,readLatestOwnerApprovedFamilyMonthSource,FamilySourceStoreError,
} from './family-month-source-store'
import type {FamilyMonthSourceProposal} from './family-month-source-review'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import {readSocialContent} from './store'
const state=vi.hoisted(()=>({planApproved:true,planId:'e745041f-ad3a-493f-bd3b-025525d561b2'}))
vi.mock('./store',()=>({readSocialContent:vi.fn(async()=>({
 planApproved:state.planApproved,currentPlanRevisionId:state.planId,
}))}))
const OWNER='10000000-0000-4000-8000-000000000001'
const OTHER='20000000-0000-4000-8000-000000000002'
const actor={userId:OWNER,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
const plan=state.planId
type Table='projects'|'family_month_source_candidates'|'family_month_source_decisions'
class MemoryDb{
 tables:Record<Table,any[]>={projects:[{id:FAMILY_WEEKLY_PROJECT_ID,
  slug:'familje-stunden',owner_id:OWNER}],family_month_source_candidates:[],
  family_month_source_decisions:[]}
 sequence=0
 from(name:string){
  if(!(name in this.tables))throw Error('unknown table '+name)
  return new MemoryQuery(this,name as Table)
 }
}
class MemoryQuery{
 filters:Array<(row:any)=>boolean>=[]
 sortFields:{key:string;ascending:boolean}[]=[]
 take=100
 newValue:any=null
 constructor(private db:MemoryDb,private table:Table){}
 select(_:string){return this}
 eq(key:string,value:any){this.filters.push(r=>r[key]===value);return this}
 in(key:string,values:string[]){this.filters.push(r=>values.includes(r[key]));return this}
 order(key:string,{ascending}:{ascending:boolean}){this.sortFields.push({key,ascending});return this}
 limit(n:number){this.take=n;return this}
 insert(row:any){this.newValue=row;return this}
 private execute(){
  if(this.newValue){
   const row=this.newValue
   if(this.table==='family_month_source_candidates'&&
    this.db.tables[this.table].some(r=>r.project_id===row.project_id&&
     r.source_month===row.source_month&&r.candidate_sha256===row.candidate_sha256))
    return {data:null,error:{code:'23505'}}
   if(this.table==='family_month_source_decisions'&&
    this.db.tables[this.table].some(r=>r.candidate_id===row.candidate_id))
    return {data:null,error:{code:'23505'}}
   this.db.sequence++
   const newRow={...row,id:'30000000-0000-4000-8000-'+String(this.db.sequence).padStart(12,'0'),
    created_at:new Date(1000000000+this.db.sequence*1000).toISOString(),
    decided_at:new Date(1000000000+this.db.sequence*1000).toISOString()}
   this.db.tables[this.table].push(newRow)
   return {data:newRow,error:null}
  }
  let rows=this.db.tables[this.table].filter(r=>this.filters.every(f=>f(r)))
  rows=rows.sort((a,b)=>{
   for(const {key,ascending} of this.sortFields){
    const v=String(a[key]).localeCompare(String(b[key]))
    if(v)return ascending?v:-v
   }
   return 0
  }).slice(0,this.take)
  return {data:rows,error:null}
 }
 async single(){
  const x=this.execute()
  return x.error?x:{data:Array.isArray(x.data)?x.data[0]??null:x.data,error:x.data?null:{code:'PGRST116'}}
 }
 async maybeSingle(){
  const x=this.execute()
  return x.error?x:{data:Array.isArray(x.data)?x.data[0]??null:x.data,error:null}
 }
 then(resolve:(value:any)=>any,reject?:any){return Promise.resolve(this.execute()).then(resolve,reject)}
}
function candidate():FamilyMonthSourceProposal{
 return {
  projectId:FAMILY_WEEKLY_PROJECT_ID,month:'2026-12',planRevisionId:plan,
  title:'December family preview',publicSummary:'A December preview with public content.',
  campaignPurpose:'Introduce verified family activities',
  proof:[{kind:'owner-project-public-evidence',referenceId:'december-public-image',
   sha256:'a'.repeat(64),description:'Owner supplied public image',
   privateSubscriberAsset:false}],
  proposedCopy:[{date:'2026-11-27',variant:'winter',
   title:'December is approaching',
   text:'A public teaser to review with families.'}],
 }
}
beforeEach(()=>{state.planApproved=true;state.planId=plan;vi.clearAllMocks()})
describe('private, durable source review store on isolated append-only tables',()=>{
 it('saves candidate with exact digest and returns short owner card, not authority',async()=>{
  const db=new MemoryDb() as any
  const r=await proposeFamilyMonthSource(db,actor,candidate())
  expect(r).toMatchObject({stored:true,replayed:false,canActivate:false,
   canPublish:false,month:'2026-12'})
  expect(r.candidateSha256).toMatch(/^[a-f0-9]{64}$/)
  const list=await listFamilyMonthSourceReviews(db,actor,{month:'2026-12'})
  expect(list.kind).toBe('family-month-source-owner-review-list-v1')
  expect(list.records).toHaveLength(1)
  const full=await listFamilyMonthSourceReviews(db,actor,{
   month:'2026-12',candidateId:r.candidateId,
  })
  expect(full.proposal).toEqual(candidate())
  expect(full.latest).toBe(true)
 })
 it('retrying identical candidate returns the same persisted receipt, no extra row',async()=>{
  const db=new MemoryDb()
  const first=await proposeFamilyMonthSource(db as any,actor,candidate())
  const second=await proposeFamilyMonthSource(db as any,actor,candidate())
  expect(second).toMatchObject({candidateId:first.candidateId,replayed:true})
  expect(db.tables.family_month_source_candidates).toHaveLength(1)
 })
 it('two simultaneous decisions produce exactly one immutable decision row',async()=>{
  const db=new MemoryDb()
  const proposal=await proposeFamilyMonthSource(db as any,actor,candidate())
  const payload={month:'2026-12',candidateId:proposal.candidateId,
   candidateSha256:proposal.candidateSha256,decision:'approve' as const,confirmed:true as const}
  const results=await Promise.allSettled([
   decideFamilyMonthSource(db as any,actor,payload),
   decideFamilyMonthSource(db as any,actor,{...payload,decision:'reject'}),
  ])
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1)
  expect(results.filter(x=>x.status==='rejected')).toHaveLength(1)
  expect(db.tables.family_month_source_decisions).toHaveLength(1)
  expect(results.find(x=>x.status==='fulfilled')?.value).toMatchObject({
   stored:true,activationAllowed:false,canPublish:false,
  })
 })
 it('a newer candidate makes an older exact-hash proposal undecidable',async()=>{
  const db=new MemoryDb()
  const first=await proposeFamilyMonthSource(db as any,actor,candidate())
  const newer=candidate();newer.proposedCopy[0].text+=' Revision two.'
  const second=await proposeFamilyMonthSource(db as any,actor,newer)
  expect(second.candidateId).not.toBe(first.candidateId)
  await expect(decideFamilyMonthSource(db as any,actor,{
   month:'2026-12',candidateId:first.candidateId,
   candidateSha256:first.candidateSha256,decision:'approve',confirmed:true,
  })).rejects.toMatchObject({code:'CONFLICT'})
  expect(db.tables.family_month_source_decisions).toHaveLength(0)
 })
 it('invalid or private evidence never persists and reports invalid input',async()=>{
  const db=new MemoryDb()
  const value=candidate();value.proof[0].privateSubscriberAsset=true as false
  await expect(proposeFamilyMonthSource(db as any,actor,value))
   .rejects.toMatchObject({code:'INVALID_INPUT'})
  expect(db.tables.family_month_source_candidates).toHaveLength(0)
 })
 it('reads only a persisted approved latest candidate for later public source verification',async()=>{
  const db=new MemoryDb()
  const proposed=await proposeFamilyMonthSource(db as any,actor,candidate())
  await expect(readLatestOwnerApprovedFamilyMonthSource(db as any,actor,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
  await decideFamilyMonthSource(db as any,actor,{
   month:'2026-12',candidateId:proposed.candidateId,
   candidateSha256:proposed.candidateSha256,decision:'approve',confirmed:true,
  })
  const result=await readLatestOwnerApprovedFamilyMonthSource(db as any,actor,'2026-12')
  expect(result).toMatchObject({
   month:'2026-12',candidateId:proposed.candidateId,
   candidateSha256:proposed.candidateSha256,proposal:candidate(),
  })
  expect(result.decisionId).toMatch(/^30000000-/)
 })
 it('rejects an owner decision and newer unapproved source block activation',async()=>{
  const db=new MemoryDb()
  const old=await proposeFamilyMonthSource(db as any,actor,candidate())
  await decideFamilyMonthSource(db as any,actor,{
   month:'2026-12',candidateId:old.candidateId,
   candidateSha256:old.candidateSha256,decision:'reject',confirmed:true,
  })
  await expect(readLatestOwnerApprovedFamilyMonthSource(db as any,actor,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
  const newer=candidate();newer.proposedCopy[0].text+=' Different caption.'
  await proposeFamilyMonthSource(db as any,actor,newer)
  await expect(readLatestOwnerApprovedFamilyMonthSource(db as any,actor,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 })
 it('a newer unapproved revision also blocks an older approved candidate',async()=>{
  const db=new MemoryDb()
  const older=await proposeFamilyMonthSource(db as any,actor,candidate())
  await decideFamilyMonthSource(db as any,actor,{
   month:'2026-12',candidateId:older.candidateId,
   candidateSha256:older.candidateSha256,decision:'approve',confirmed:true,
  })
  const newer=candidate();newer.proposedCopy[0].text+=' More text.'
  await proposeFamilyMonthSource(db as any,actor,newer)
  await expect(readLatestOwnerApprovedFamilyMonthSource(db as any,actor,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
  expect(db.tables.family_month_source_decisions).toHaveLength(1)
 })
 it('approved candidate with tampered stored decision hash is not an activatable source',async()=>{
  const db=new MemoryDb()
  const proposed=await proposeFamilyMonthSource(db as any,actor,candidate())
  await decideFamilyMonthSource(db as any,actor,{
   month:'2026-12',candidateId:proposed.candidateId,
   candidateSha256:proposed.candidateSha256,decision:'approve',confirmed:true,
  })
  db.tables.family_month_source_decisions[0].candidate_sha256='b'.repeat(64)
  await expect(readLatestOwnerApprovedFamilyMonthSource(db as any,actor,'2026-12'))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 })
 it('owner scope and current plan are mandatory for every store operation',async()=>{
  const db=new MemoryDb()
  const fake={userId:OTHER,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
  await expect(proposeFamilyMonthSource(db as any,fake,candidate()))
   .rejects.toMatchObject({code:'NOT_FOUND'})
  await expect(listFamilyMonthSourceReviews(db as any,fake,{month:'2026-12'}))
   .rejects.toMatchObject({code:'NOT_FOUND'})
  state.planApproved=false
  await expect(proposeFamilyMonthSource(db as any,actor,candidate()))
   .rejects.toMatchObject({code:'REVIEW_REQUIRED'})
  expect(db.tables.family_month_source_candidates).toHaveLength(0)
 })
 it('cross-project tampering or changed digest is denied before decision insert',async()=>{
  const db=new MemoryDb()
  const stored=await proposeFamilyMonthSource(db as any,actor,candidate())
  await expect(decideFamilyMonthSource(db as any,actor,{
   month:'2026-12',candidateId:stored.candidateId,
   candidateSha256:'b'.repeat(64),decision:'approve',confirmed:true,
  })).rejects.toMatchObject({code:'CONFLICT'})
  expect(db.tables.family_month_source_decisions).toHaveLength(0)
 })
})
