/**
 * lib/workflows/approval/story-identity.ts — what a story approval must bind.
 *
 * DECLARATION ONLY. Nothing here is wired into the workflow, and that is
 * deliberate: the checks below cannot be satisfied until a Story artifact exists,
 * and a REQUIRED check that nothing can satisfy is a deadlock, not a safeguard.
 * This file states the contract so that Phase 2B implements it rather than
 * inventing it, and so the guard suite can prove today's gap is understood.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ─────────────────────────────────────────
 * `approval_content` declares ZERO checks. `workflowGateTargetPayload` binds
 * evidence for DECLARED checks in the state being left, so that gate's target
 * carries an empty evidence array: it identifies the instance, the state and the
 * decision, and nothing about WHICH story was approved. An Editor's grant there
 * would authorise any story, including one generated after the grant.
 *
 * ── WHY THE GATE TARGET IS NOT CHANGED HERE ─────────────────────────────────
 * The obvious fix — binding evidence `payload_hash` into the gate target so the
 * pin is semantic rather than temporal — is NOT safe to apply retroactively.
 * Four `workflow.gate.advance` authorizations already exist for the 2099-01
 * planning gate and one has been consumed by a recorded transition. Changing the
 * payload would silently give an already-pinned target a new meaning, which is
 * the exact failure this phase exists to prevent. Any such change must therefore
 * arrive as new binding on new states, never as a redefinition of old ones.
 */

/**
 * The subject of a story approval.
 *
 * `story_content_hash` is the identity. Everything else is scope or context: it
 * says WHICH instance the story belongs to and WHAT it was written and judged
 * against, so that a story approved under one set of requirements cannot be
 * carried into another.
 */
export interface StoryApprovalSubject {
  /** Content-addressed identity of the exact story text. THE distinguishing field. */
  readonly story_content_hash: string
  /** The month/instance the approval is scoped to. Prevents cross-instance replay. */
  readonly workflow_instance_id: string
  /** The requirements the story was written against (Phase 2A `brief_hash`). */
  readonly generated_from_brief_hash: string
  /** The rules it was judged by. */
  readonly story_contract_version: string
  /** Human-facing ordinal. Convenience, never identity — two versions can differ
   *  in number while being the same bytes, and the hash is what decides. */
  readonly story_version: number
  /** Stable handle across versions. Deliberately NOT identity-bearing. */
  readonly story_id: string
}

/**
 * The fields that alone guarantee `approval of Story A != approval of Story B`.
 *
 * Narrower than the full subject on purpose. `story_id` and `story_version` are
 * assigned by us and could repeat or be reused; the content hash cannot. Scoping
 * by instance stops an identical story in a different month inheriting an
 * approval it never received.
 */
export const STORY_IDENTITY_DISTINGUISHING_FIELDS = [
  'story_content_hash',
  'workflow_instance_id',
] as const

/**
 * The three future checks, and the separation that makes them meaningful.
 *
 * The split is the point. If one check covered all three, an Editor's word could
 * stand in for "a story exists" and an automated pass could stand in for "a human
 * approved it". Each fact must come from the party that can actually establish
 * it, which is why `allowed_provenance` differs per row.
 */
export interface DeclaredStoryCheck {
  readonly check_key: string
  readonly state: string
  readonly allowed_provenance: readonly ('automated' | 'attested')[]
  readonly establishes: string
  readonly why_this_provenance: string
}

export const STORY_APPROVAL_CHECKS: readonly DeclaredStoryCheck[] = [
  {
    check_key: 'story_generated',
    state: 'content_generation',
    allowed_provenance: ['automated'],
    establishes: 'an exact, immutable story exists and its content hash is bound',
    why_this_provenance:
      'Whether bytes exist is a fact Omnira can observe. Accepting a human’s ' +
      'word for it would let an approval precede the thing it approves.',
  },
  {
    check_key: 'story_structurally_valid',
    state: 'content_generation',
    allowed_provenance: ['automated'],
    establishes:
      'the exact story satisfies the structural rules: 16 content pages between ' +
      'cover and closing, unique complete page numbers, no empty page, a title, ' +
      'and per-page sentence counts within the canonical bounds',
    why_this_provenance:
      'Deterministically checkable against the story text. An attestation here ' +
      'would replace something computable with something asserted.',
  },
  {
    check_key: 'story_content_approved',
    state: 'approval_content',
    allowed_provenance: ['attested'],
    establishes: 'a named Editor approved that exact story',
    why_this_provenance:
      'A judgement no machine can make. Automated evidence must never be able to ' +
      'produce it, or generation would approve itself.',
  },
]

/**
 * What each check's evidence must CARRY for the binding to be semantic.
 *
 * Phase 2B-0.5 proved the gate binds `recorded_at` — when a fact was recorded,
 * not what it says. Time is not identity: two stories recorded in the same
 * instant collide. Every payload below therefore carries the story content hash
 * explicitly, and the cross-check compares those hashes rather than their
 * timestamps.
 */
export const STORY_EVIDENCE_PAYLOAD_FIELDS: Readonly<Record<string, readonly string[]>> = {
  story_generated: [
    'story_content_hash',
    'generated_from_brief_hash',
    'story_contract_version',
    'workflow_instance_id',
  ],
  story_structurally_valid: [
    'story_content_hash',
    'validation_contract_version',
  ],
  story_content_approved: [
    'story_content_hash',
    'approval_target_version_hash',
    // The Editor's identity is NOT copied here. It already lives on the
    // authorization event, and a second copy is a second answer to "who
    // approved this" that nothing reconciles.
  ],
} as const

/**
 * Every payload names the story. That is the whole mechanism: three facts from
 * three parties, each independently pinned to the same bytes.
 */
export const STORY_EVIDENCE_COMMON_FIELD = 'story_content_hash' as const

/**
 * What must be true before these can be declared for real.
 *
 * Written down because each is a genuine blocker, not a formality, and because
 * declaring the checks before they hold would deadlock the workflow rather than
 * protect it.
 */
export const STORY_APPROVAL_PREREQUISITES = [
  'StoryV1 exists with a content-addressed hash over its semantic payload',
  'a durable, immutable store binds that hash to the workflow instance',
  'an executor family exists that may run a paid generation action',
  'approval_content declares an automated_action upstream, or the attested ' +
    'evidence route is accepted as the binding site for the Editor decision',
] as const
