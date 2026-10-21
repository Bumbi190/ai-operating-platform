/**
 * P17 disabled-by-default server read projection. No Next route imports it.
 * Never return raw SPKI keys, signed payloads or secret signing material.
 */
import 'server-only'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { makeCreativeReviewPreviewReader } from './review-preview.mjs'

interface PendingRow {
  enrollment_id: string
  worker_id: string
  requested_by: string
  project_ids: string[]
  state: string
  public_key_sha256: string
  canonical_proof_sha256: string
}
interface ProjectOwnerRow { id: string; owner_id: string }

export function createDormantCreativeReviewDependencies() {
  const db = createAdminClient()
  const lookup = async (id: string) => {
    // Private P13 table is unapplied; isolate the temporary ungenerated
    // Supabase type cast here, and remove after reviewed migration/types.
    const { data, error } = await (db as any).from('atlas_creative_enrollment_staging')
      .select('enrollment_id,worker_id,requested_by,project_ids,state,public_key_sha256,canonical_proof_sha256')
      .eq('enrollment_id', id).maybeSingle()
    if (error || !data) return null
    const item = data as PendingRow
    return {
      enrollmentId: item.enrollment_id, workerId: item.worker_id,
      requestedBy: item.requested_by, projectIds: item.project_ids,
      state: item.state, keySha256: item.public_key_sha256,
      proofSha256: item.canonical_proof_sha256,
    }
  }
  const projectOwners = async (ids: string[]) => {
    const {data,error} = await db.from('projects')
      .select('id,owner_id').in('id', ids)
    if(error || !data) throw new Error('project ownership unavailable')
    return (data as ProjectOwnerRow[]).map(row=>({
      id:row.id, ownerId:row.owner_id,
    }))
  }
  return {operator: resolvePlatformOperator, lookup, projectOwners}
}

export function createDormantCreativeReviewPreviewReader() {
  return makeCreativeReviewPreviewReader(createDormantCreativeReviewDependencies())
}
