
import {beforeAll,afterEach,it,expect,vi} from 'vitest'
import {initializeReconciliationDb,reconciliationFixture} from './fixtures.test-utils'
import {candidateHash,inspectReconciliation,completeReconciliation} from './service'
import {testSql} from '../../../website-build/test-db'
let db:ReturnType<typeof initializeReconciliationDb>
afterEach(()=>vi.unstubAllGlobals())
beforeAll(()=>{db=initializeReconciliationDb()})
it('image_confirmation_is_required_and_never_posts',async()=>{
 const f=await reconciliationFixture(db);const view=await inspectReconciliation(db,f.principal,f.scope,f.deps)
 expect(view.candidates).toHaveLength(1)
 await expect(completeReconciliation(db,f.principal,{...f.completeInput,candidateId:view.candidates[0].id,imageConfirmed:false} as never,f.deps)).rejects.toMatchObject({code:'INVALID_BODY'})
 expect(f.providerPosts).toBe(0)
},15000)
it('reconciles paused history once and identical parallel completion is harmless',async()=>{
 const f=await reconciliationFixture(db),view=await inspectReconciliation(db,f.principal,f.scope,f.deps)
 testSql("update projects set execution_paused=true where id='"+f.scope.projectId+"';")
 const input={...f.completeInput,candidateId:view.candidates[0].id}
 const result=await Promise.all([completeReconciliation(db,f.principal,input,f.deps),completeReconciliation(db,f.principal,input,f.deps)])
 expect(result.map(r=>r.state)).toEqual(['published','published']);expect(result[0].reconciledAt).toBeTruthy()
 expect(testSql("select count(*) from social_publication_events where publication_id='"+f.scope.publicationId+"' and event='reconcile_verified';")).toBe('1')
 expect(f.providerPosts).toBe(0)
},20000)
it('rejects expired proofs changed posts and current account mismatch',async()=>{
 for(const mode of ['expired','changed','account','project'] as const){
  const f=await reconciliationFixture(db),view=await inspectReconciliation(db,f.principal,f.scope,f.deps),input={...f.completeInput,candidateId:view.candidates[0].id}
  if(mode==='expired')testSql("update social_publication_reconciliation_proofs set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 second' where publication_id='"+f.scope.publicationId+"';")
  if(mode==='changed')f.candidate.text+=' '
  if(mode==='account')f.credential.accountId='999'
  const principal=mode==='project'?{...f.principal,allowedProjectIds:[]}:f.principal
  await expect(completeReconciliation(db,principal,input,f.deps)).rejects.toBeTruthy()
  expect(f.providerPosts).toBe(0)
 }
},30000)
it('rejects a cross-project credential before inspecting or completing a Facebook proof',async()=>{
 const f=await reconciliationFixture(db)
 const wrong={...f.deps,resolveCredential:async()=>({...f.credential,projectId:crypto.randomUUID()})}
 await expect(inspectReconciliation(db,f.principal,f.scope,wrong)).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 expect(f.providerReads).toBe(0)
 const view=await inspectReconciliation(db,f.principal,f.scope,f.deps)
 const reads=f.providerReads
 await expect(completeReconciliation(db,f.principal,{...f.completeInput,candidateId:view.candidates[0].id},wrong)).rejects.toMatchObject({code:'REVIEW_REQUIRED'})
 expect(f.providerReads).toBe(reads)
 expect(f.providerPosts).toBe(0)
},20000)
it('denies public roles and rejects unknown RPC fields',async()=>{
 const f=await reconciliationFixture(db)
 expect(()=>testSql("set role authenticated;select social_publication_reconciliation_inspect('{}','{}');")).toThrow()
 const r=await (db as any).rpc('social_publication_reconciliation_inspect',{p_principal:f.principal,p_input:{...f.scope,extra:true}})
 expect(r.error).toBeTruthy();expect(f.providerPosts).toBe(0)
},15000)

it('documents that direct service-role RPC can register a fabricated provider candidate',async()=>{
 const f=await reconciliationFixture(db)
 // Bypass the service's provider.list call while using the real migration RPC.
 const invented={...f.candidate,providerId:f.candidate.accountId+'_99999',
  id:f.candidate.accountId+'_99999',
  permalink:'https://www.facebook.com/'+f.candidate.accountId+'/posts/99999'}
 const {data,error}=await (db as any).rpc('social_publication_reconciliation_inspect',{
  p_principal:f.principal,p_input:{...f.scope,candidates:[{...invented,candidateHash:candidateHash(invented)}]}
 })
 expect(error).toBeNull()
 expect(data.proofs).toHaveLength(1)
 expect(data.proofs[0].providerId).toBe(invented.providerId)
 expect(f.providerReads).toBe(0)
 expect(f.providerPosts).toBe(0)
},15000)

it('documents that direct service-role UPDATE can forge published state',async()=>{
 const f=await reconciliationFixture(db)
 testSql("set role service_role; update public.social_publications set state='published',"+
  "provider_id='"+f.candidate.providerId+"',permalink='"+f.candidate.permalink+"',"+
  "confirmation='provider_id',version=version+1 where id='"+f.scope.publicationId+"';")
 expect(testSql("select state from public.social_publications where id='"+f.scope.publicationId+"';")).toBe('published')
 expect(f.providerReads).toBe(0)
 expect(f.providerPosts).toBe(0)
},15000)
