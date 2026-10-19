import 'server-only'
import type {SocialContentPrincipal} from '../content/types'
import {resolveNewsEvidence,type ReviewDb} from './verify'
import {NewsReviewError,type NewsReviewView,type PrepareNewsReviewInput,type NewsReviewRpcClient} from './types'
export function reviewDatabaseError(error:{message?:string;code?:string}):NewsReviewError{
 const m=error.message??''
 if(error.code==='P0002'||error.code==='42501'||m.includes('NOT_FOUND'))return new NewsReviewError('NOT_FOUND')
 if(m.includes('INVALID_BODY'))return new NewsReviewError('INVALID_BODY')
 if(m.includes('STOPPED'))return new NewsReviewError('STOPPED')
 if(m.includes('REVISION_CONFLICT')||error.code==='23505')return new NewsReviewError('REVISION_CONFLICT')
 if(m.includes('news_source_expired'))return new NewsReviewError('SOURCE_EXPIRED')
 if(m.includes('REVIEW_REQUIRED'))return new NewsReviewError('MEDIA_CHANGED')
 return new NewsReviewError('UNAVAILABLE')
}
export async function prepareNewsReview(db:ReviewDb,p:SocialContentPrincipal,input:PrepareNewsReviewInput,nowMs:number):Promise<NewsReviewView[]>{
 const snapshot=await resolveNewsEvidence(db,p,input,nowMs)
 const {data,error}=await (db as unknown as NewsReviewRpcClient).rpc('media_news_review_prepare',{p_principal:p,p_input:input,p_snapshot:snapshot})
 if(error)throw reviewDatabaseError(error)
 if(!Array.isArray(data)||!data.length||data.some(v=>v.projectId!==input.projectId||v.canPublish!==false||v.dispatchEnabled!==false))throw new NewsReviewError('UNAVAILABLE')
 return data
}
