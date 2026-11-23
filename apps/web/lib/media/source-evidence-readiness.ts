/**
 * The Prompt: reject news candidates where only a headline/AI editorial note
 * exists, before spending on scriptwriting or claiming editorial approval.
 * The actual source summary is the feed/Hermes summary, NEVER an AI-created
 * "news.summary" inferred from a title alone.
 * Pure decision only: no provider calls, auth, DB writes or bypasses.
 */
import {officialPrimarySourceUrl} from '../article/daily-editorial-policy'

export interface SourcePreview {
 url:string|null|undefined
 summary:string|null|undefined
}
const substantiveSummary=(x:string|null|undefined)=>
 typeof x==='string' && x.trim().length>=80

/** Official article URL can be fetched and validated after the pick. */
export function sourceCandidateMayBeEvaluated(
 source:SourcePreview,
):boolean{
 if(!source||typeof source.url!=='string'||!source.url)return false
 let url:URL
 try{url=new URL(source.url)}catch{return false}
 if(url.protocol!=='https:'||url.username||url.password||
    url.hostname==='localhost'||url.hostname.endsWith('.localhost'))
   return false
 return substantiveSummary(source.summary)||officialPrimarySourceUrl(source.url)
}

/**
 * Always use the ORIGINAL publisher/feed summary or a verified-length article,
 * never a new model-generated summary of an unsourced title.
 */
export function hasEnoughSourceToWrite(
 fullArticleText:string|null|undefined,
 originalSummary:string|null|undefined,
):boolean {
 if(typeof fullArticleText==='string' &&
   fullArticleText.trim().split(/\s+/).filter(Boolean).length>=100)return true
 return substantiveSummary(originalSummary)
}
