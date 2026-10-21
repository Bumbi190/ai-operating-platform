
import {vi} from 'vitest'
import {listFacebookCandidates,readFacebookCandidate} from './provider'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {publicationFixture} from '../fixtures.test-utils'
import {initializePublicationDb} from '../test-db'
import {publicationPrepare,publicationStep} from '../store'
import {testSql} from '../../../website-build/test-db'
import type {ReconciliationCandidate,ReconciliationDependencies} from './types'
export function initializeReconciliationDb(){
 const db=initializePublicationDb()
 if(testSql("select to_regclass('public.social_publication_reconciliation_proofs') is null;")==='t'){
  const dir=resolve(process.cwd(),'supabase/migrations'),file=readdirSync(dir).find(f=>f.endsWith('_social_publication_reconciliation.sql'))!
  testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;')
 }
 return db
}
export async function reconciliationFixture(db:ReturnType<typeof initializeReconciliationDb>){
 const f=await publicationFixture(db,'facebook',true)
 let record=await publicationPrepare(db,f.p,f.input)
 record=(await publicationStep(db,f.p,{projectId:f.projectId,postId:f.postId,publicationId:record.id,expectedVersion:record.version,action:'claim_create',capabilityHash:'a'.repeat(64)})).record
 record=(await publicationStep(db,f.p,{projectId:f.projectId,postId:f.postId,publicationId:record.id,expectedVersion:record.version,action:'uncertain',failureCode:'provider_unavailable'})).record
 const candidate:ReconciliationCandidate={id:f.accountId+'_123',providerId:f.accountId+'_123',accountId:f.accountId,createdAt:new Date(record.requestedAt).toISOString(),text:f.post.revision.draft.text,permalink:'https://www.facebook.com/'+f.accountId+'/posts/123',photoId:'888',imageUrl:'https://scontent.fna.fbcdn.net/fixture.jpg'}
 const credential={channel:'facebook' as const,bindingId:f.bindingId,accountId:f.accountId,token:'fixture-token',apiBase:'https://graph.facebook.com/v21.0'}
 const calls:RequestInit[]=[]
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push(init);const raw={id:candidate.providerId,from:{id:candidate.accountId},message:candidate.text,created_time:candidate.createdAt,permalink_url:candidate.permalink,attachments:{data:[{type:'photo',target:{id:candidate.photoId},media:{image:{src:candidate.imageUrl}}}]}};return Response.json(url.includes('/published_posts?')?{data:[raw]}:raw)})
 const deps:ReconciliationDependencies={provider:{list:listFacebookCandidates,read:readFacebookCandidate},resolveCredential:async()=>credential,now:()=>Date.now()}
 const scope={projectId:f.projectId,postId:f.postId,publicationId:record.id}
 return {principal:f.p,scope,completeInput:{...scope,candidateId:'',expectedVersion:record.version,imageConfirmed:true as const},deps,candidate,credential,
  get providerPosts(){return calls.filter(c=>c.method==='POST').length},
  get providerReads(){return calls.filter(c=>!c.method||c.method==='GET').length}}
}
