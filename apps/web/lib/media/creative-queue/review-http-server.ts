/**
 * P18 dormant server composition. NOT imported by any Next.js route.
 * Explicitly requires server-configured canonical origin; missing => refusal.
 *
 * Service-role never authenticates a human: resolvePlatformOperator reads the
 * actual logged-in Supabase session. Project scope is looked up independently.
 */
import 'server-only'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {makeCreativeOwnerGuardedReviewStore} from './review-store-p18.mjs'
import {makeCreativeReviewHttpBoundary} from './review-http.mjs'

interface OwnerRow {id: string; owner_id: string}

/** This composition is inert unless explicitly called by reviewed server code. */
export function createDormantCreativeReviewHttpHandler() {
  const configuredOrigin=process.env.CREATIVE_REVIEW_CANONICAL_ORIGIN
  if(!configuredOrigin)throw new Error('Creative review origin not configured')
  const db=createAdminClient()
  // P15 migration is not applied; its generated schema types are intentionally
  // absent. The unsafe temporary cast is confined here and must be removed
  // following approved migration and types regeneration.
  const store=makeCreativeOwnerGuardedReviewStore(db as any)
  const projectOwners=async (ids: string[]) => {
    const {data,error}=await db.from('projects')
      .select('id,owner_id').in('id',ids)
    if(error||!data)throw new Error('Project ownership unavailable')
    return (data as OwnerRow[]).map(x=>({id:x.id,ownerId:x.owner_id}))
  }
  return makeCreativeReviewHttpBoundary({
    expectedOrigin:configuredOrigin,
    operator:resolvePlatformOperator,
    projectOwners,
    store,
  })
}
