/**
 * The Prompt: optional direct official-source fetch when Hermes did not
 * deliver an article. Pure permission/time-budget decision; never dispatch
 * a paid model, change an approval, or open arbitrary non-official URLs.
 */
import {officialPrimarySourceUrl} from '../article/daily-editorial-policy'
import {articleReadTimeoutMs} from './article-read-policy'

export function officialArticleFallbackBudgetMs(
 sourceUrl:string|null|undefined,
 elapsedMs:number,
 alreadyHasArticle:boolean,
):number{
 if(alreadyHasArticle||!sourceUrl||!officialPrimarySourceUrl(sourceUrl))return 0
 // One official first-party source read under the exact existing
 // enrichment deadline: finish by t+28s to preserve writer + QA.
 return articleReadTimeoutMs(sourceUrl,elapsedMs)
}
