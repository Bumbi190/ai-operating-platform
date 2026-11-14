/**
 * Atlas -> creative worker handoff proposal, without execution authority.
 * This is an intentionally non-executable draft. The creative worker is not
 * permitted to execute an LLM-authored command or accept arbitrary file paths.
 */
import type { AssetId, AssetKind } from './asset/types'
import type { CreativePlan, CreativeIntent, CreativeEngine } from './creative-routing'

export const CREATIVE_WORK_DRAFT_SCHEMA = 'omnira.creative_work.draft.v1' as const
export type CreativeEditIntent = Extract<CreativeIntent, 'image-retouch' | 'video-timeline-edit'>
export interface CreativeInputAsset {
  id: AssetId
  projectId: string
  kind: AssetKind
  status: 'active' | 'archived' | 'superseded'
  checksumSha256: string
}
export interface CreativeDraftInput {
  workId: string
  projectId: string
  intent: CreativeEditIntent
  asset: CreativeInputAsset
  editingGoal: string
}
export type CreativeWorkDraft = Readonly<{
  schema: typeof CREATIVE_WORK_DRAFT_SCHEMA
  workId: string
  projectId: string
  intent: CreativeEditIntent
  sourceAssetId: AssetId
  sourceChecksumSha256: string
  editingGoal: string
  suggestedEngine: CreativeEngine
  fallbackEngine: CreativeEngine
  status: 'draft'
  assetVisibility: 'internal'
  requiresIndependentReview: true
  requiresHumanApproval: true
  executionAuthorized: false
  publishAuthorized: false
  remoteToolCall: null
}>

const WORK_ID = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/
const SHA = /^[0-9a-f]{64}$/
const ASSET_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function prepareCreativeWorkDraft(input: CreativeDraftInput, route: CreativePlan): CreativeWorkDraft {
  if (!WORK_ID.test(input.workId)) throw new Error('invalid creative work identity')
  if (!PROJECT_ID.test(input.projectId)) throw new Error('invalid creative project identity')
  if (!ASSET_UUID.test(input.asset.id)) throw new Error('invalid canonical source asset identity')
  if (input.asset.projectId !== input.projectId) throw new Error('source asset does not belong to project')
  if (input.asset.status !== 'active') throw new Error('source asset is not active')
  if (!SHA.test(input.asset.checksumSha256)) throw new Error('source asset has no valid integrity hash')
  if (input.intent === 'image-retouch' && input.asset.kind !== 'image') throw new Error('image edit requires an image asset')
  if (input.intent === 'video-timeline-edit' && input.asset.kind !== 'video') throw new Error('video edit requires a video asset')
  if (typeof input.editingGoal !== 'string' || input.editingGoal.trim().length < 4 ||
      input.editingGoal.length > 600) throw new Error('invalid creative editing goal')
  if (route.intent !== input.intent || route.executionAuthorized !== false) {
    throw new Error('invalid or unauthorized creative route');
  }
  return Object.freeze({
    schema: CREATIVE_WORK_DRAFT_SCHEMA,
    workId: input.workId,
    projectId: input.projectId,
    intent: input.intent,
    sourceAssetId: input.asset.id,
    sourceChecksumSha256: input.asset.checksumSha256,
    editingGoal: input.editingGoal.trim(),
    suggestedEngine: route.preferred,
    fallbackEngine: route.fallback,
    status: 'draft',
    assetVisibility: 'internal',
    requiresIndependentReview: true,
    requiresHumanApproval: true,
    executionAuthorized: false,
    publishAuthorized: false,
    remoteToolCall: null,
  })
}
