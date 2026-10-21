/**
 * P20 server-only composition of dormant P17 reader with GET-only contract.
 * Unused by live P19 Next route. Does NOT attach the privileged P18 POST.
 */
import 'server-only'
import {createDormantCreativeReviewDependencies} from './review-preview-server'
import {makeCreativeReviewReadHttpBoundary} from './review-read-http.mjs'

export function createDormantCreativeReviewReadHttpHandler() {
  const canonicalOrigin=process.env.CREATIVE_REVIEW_CANONICAL_ORIGIN
  if(!canonicalOrigin)throw new Error('Creative review origin not configured')
  return makeCreativeReviewReadHttpBoundary({
    ...createDormantCreativeReviewDependencies(),
    canonicalOrigin,
  })
}
