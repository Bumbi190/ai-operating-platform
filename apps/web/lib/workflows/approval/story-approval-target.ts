/**
 * lib/workflows/approval/story-approval-target.ts — semantic story approval.
 *
 * A FORWARD-ONLY target that binds an Editor's approval to the exact bytes of
 * one story. Nothing here changes how any existing authorization is computed,
 * read or validated.
 *
 * ── WHY A NEW TARGET TYPE RATHER THAN A BETTER GATE PAYLOAD ─────────────────
 * The obvious fix for the Phase 2B-0.5 gap is to bind a content hash into
 * `workflowGateTargetPayload`. That is not available: four
 * `workflow.gate.advance` authorizations already exist for the 2099-01 planning
 * gate and ONE HAS BEEN CONSUMED by a recorded transition. Changing that payload
 * would hand an already-pinned, already-used target a new meaning — the precise
 * failure this work exists to prevent. History must keep its semantics.
 *
 * So the binding arrives as a NEW `targetType`. The repository already treats
 * that field as a discriminator:
 *
 *   • `sameTarget` in `lib/atlas/authorization/derive.ts` compares targetType,
 *     targetId AND versionHash — so a story-approval grant can never satisfy a
 *     gate check, and a legacy gate grant can never satisfy a story approval.
 *   • `listPendingWorkflowAuthorizations` skips events whose targetType is not
 *     `workflow_gate`; `rearm.ts` refuses them outright.
 *
 * A new type is therefore inert to every legacy path by construction rather than
 * by convention, which is what makes this safe without migrating anything.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * No runtime wiring. Nothing calls this yet, because there is no Story to
 * approve. Building the primitive now — with its compatibility proven — is what
 * lets the StoryV1 phase adopt it instead of inventing an approval model under
 * deadline.
 */

import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import type { AuthorizationTarget } from '@/lib/atlas/authorization/types'

/**
 * The discriminator. Distinct from `workflow_gate` (state advance) and
 * `workflow_action` (one action run) because it authorises a different thing:
 * this exact content, not this transition and not this attempt.
 */
export const WORKFLOW_STORY_APPROVAL_TARGET_TYPE = 'workflow_story_approval'

/** The purpose recorded on the authorization event. */
export const WORKFLOW_STORY_APPROVAL_ACTION_KIND = 'workflow.story.approve'

/** Bump only if the payload's MEANING changes. Old hashes keep their schema. */
export const STORY_APPROVAL_TARGET_SCHEMA = 1 as const

/**
 * Everything an Editor is actually approving.
 *
 * `storyContentHash` is the identity. `briefHash` and `storyContractVersion` are
 * the requirements and the rules it was judged against — approving a story tells
 * you nothing unless you also know what it was asked to be.
 *
 * `story_id` and `story_version` are deliberately ABSENT. They are ours to
 * assign, so binding them would let a rename or a renumber invalidate an
 * approval that still describes the same bytes — and, worse, would let two
 * genuinely different stories share a target if a number were reused. Content
 * identity must not depend on an operator-assigned label.
 */
export interface StoryApprovalTargetInput {
  readonly instanceId: string
  /** The state whose human gate this approval belongs to. */
  readonly state: string
  /** sha256 over the story's semantic payload. THE identity. */
  readonly storyContentHash: string
  /** The `brief_hash` the story was generated from. */
  readonly briefHash: string
  /** The story contract version it was judged against. */
  readonly storyContractVersion: string
}

const SHA256_HEX = /^[a-f0-9]{64}$/

function requireHash(value: string, field: string): string {
  if (!SHA256_HEX.test(value)) {
    throw new Error(`storyApprovalTarget: ${field} must be a sha256 hex digest`)
  }
  return value
}

function requireText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`storyApprovalTarget: ${field} must be a non-empty string`)
  }
  return value
}

/**
 * Readable, and checkable in SQL without recomputing a hash — the property
 * `workflowGateTargetId` was built for, kept here.
 *
 * The content hash is IN the id, not only in the version hash. A database-side
 * guard can then refuse a grant that names a different story without needing to
 * understand the payload at all.
 */
export function storyApprovalTargetId(
  instanceId: string, state: string, storyContentHash: string,
): string {
  return `${instanceId}:${state}:${storyContentHash}`
}

/**
 * The reviewed payload.
 *
 * `recorded_at` is deliberately absent. Phase 2B-0.5 established that the gate
 * payload binds a timestamp rather than a content identity, which means two
 * stories recorded in the same instant collide. Time is not identity; the hash
 * is. Nothing here is derived from when anything happened.
 */
export function storyApprovalTargetPayload(
  input: StoryApprovalTargetInput,
): Record<string, unknown> {
  return {
    kind: 'workflow.story_approval',
    schema: STORY_APPROVAL_TARGET_SCHEMA,
    instance_id: requireText(input.instanceId, 'instanceId'),
    state: requireText(input.state, 'state'),
    story_content_hash: requireHash(input.storyContentHash, 'storyContentHash'),
    generated_from_brief_hash: requireHash(input.briefHash, 'briefHash'),
    story_contract_version: requireText(input.storyContractVersion, 'storyContractVersion'),
  }
}

/** The target an Editor's approval pins. */
export function computeStoryApprovalTarget(
  input: StoryApprovalTargetInput,
): AuthorizationTarget {
  return {
    targetType: WORKFLOW_STORY_APPROVAL_TARGET_TYPE,
    targetId: storyApprovalTargetId(input.instanceId, input.state, input.storyContentHash),
    versionHash: canonicalTargetVersionHash(storyApprovalTargetPayload(input)),
  }
}

/**
 * The cross-check the workflow must pass before it may leave `approval_content`.
 *
 * Three facts are established by three different parties — generation, the
 * structural validator, and a human — and each names a story. If they do not all
 * name the SAME story, something was regenerated between them and the approval
 * describes bytes that are no longer the candidate.
 *
 * A pure comparison, so it can be proven long before there is anything to run it
 * against.
 */
export function storyFactsAgree(facts: {
  generatedHash: string
  structurallyValidatedHash: string
  approvedHash: string
}): boolean {
  return facts.generatedHash === facts.structurallyValidatedHash
    && facts.structurallyValidatedHash === facts.approvedHash
}
