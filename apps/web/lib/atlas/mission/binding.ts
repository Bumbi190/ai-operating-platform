/**
 * lib/atlas/mission/binding.ts — the material Mission version and the exact
 * authorization a prospective mission act requires.
 *
 * WHAT A HUMAN AUTHORIZES IS THE ACT THAT WILL BE APPENDED.
 *
 * §20.126 names the material changes — objective, scope, authority, budget,
 * deadline, success criteria, approval gate, risk, project — and §20.75 makes
 * approval expire when the object changes materially. Both are unsatisfiable if
 * the terms can move after the human says yes, so the binding is computed from
 * the CANDIDATE RECORD: the exact row about to be written.
 *
 * The projection below is EXPLICIT rather than a spread. §20.126's list is the
 * floor, not the ceiling — the question applied to every remaining field was
 * "could changing this after approval materially change what the human
 * approved?" Where the answer is yes, it is bound, including fields that
 * already existed before the act, because carrying them forward unchanged is
 * itself part of what was approved.
 *
 * Deliberately EXCLUDED, each for a stated reason:
 *
 *   recordId             random row identity; carries no mission meaning
 *   occurredAt           the server instant of the append, unknowable when the
 *                        human authorizes
 *   principalId          the acting human, verified directly against the
 *                        authorization's own principal
 *   authorityRecord      the proof being computed; including it is circular
 *   lifecycleGeneration  optimistic-concurrency position, not mission content
 *   report / blocker / clearsBlockerId / evidence / reviewNote
 *                        annotation payloads — annotations are not authority
 *                        acts and never carry a binding
 *
 * `MISSION_UNBOUND_FIELDS` names them so a test can prove every field of
 * `MissionRecord` is either bound or explicitly ruled out. Adding a material
 * field without a decision fails that test.
 *
 * Zero I/O. Order-independent canonical serialization, so an equal act always
 * hashes equal regardless of key order.
 */

import { createHash } from 'node:crypto'
import type { AuthorizationTarget } from '@/lib/atlas/authorization/types'
import type { MissionRecord } from './types'

/**
 * The authority acts a mission can require, each a distinct permission
 * (§27.313 minimum authority, §20.55 no implied authority).
 *
 * Pause, resume, archive and every annotation are absent: canon treats them as
 * operational or mechanical, and none widens what a mission may do. Pausing and
 * clearing a blocker reduce activity; inventing an authority act for them would
 * add ceremony without adding safety.
 */
export const MISSION_ACTION = {
  approve:   'mission.approve',    // §20.100
  activate:  'mission.activate',   // §20.105
  amend:     'mission.amend',      // §20.126
  cancel:    'mission.cancel',     // §20.96
  supersede: 'mission.supersede',  // §20.97
} as const

export type MissionAct = keyof typeof MISSION_ACTION

/** Fields excluded from the bound projection. Named for the guard test. */
export const MISSION_UNBOUND_FIELDS = [
  'recordId', 'occurredAt', 'principalId', 'authorityRecord', 'lifecycleGeneration',
  'report', 'blocker', 'clearsBlockerId', 'evidence', 'reviewNote',
  // EI-S1.4B-R1 additions, all observations rather than terms:
  //   projectMode            the world's state when the act happened, compared
  //                          live by §20.75; binding it would only duplicate a
  //                          check the operational gate already performs
  //   dependencyObservation  §20.101 — a prerequisite's real state
  //   gateResolution         §20.73 — how a declared gate was resolved
  'projectMode', 'dependencyObservation', 'gateResolution',
] as const

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** Stable ordering for a list of objects, so member order cannot change a hash. */
function sorted<T>(items: T[]): T[] {
  return [...items].map(i => (i && typeof i === 'object' ? { ...i } : i))
    .sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1))
}

/** Every field of a mission act that carries meaning a human approved. */
export function missionBoundProjection(candidate: MissionRecord): Record<string, unknown> {
  return {
    // Which act, on which mission, in which scope, at which version.
    type:        candidate.type,
    missionId:   candidate.missionId,
    projectId:   candidate.projectId,          // §20.126 — project is material
    version:     candidate.version,

    // §20.26/§20.31 — identity and the objective itself.
    title:       candidate.title,
    missionType: candidate.missionType,        // §20.11
    objective:   candidate.objective,          // §20.126
    // §20.29/§20.30 — accountability. Swapping the owner after approval changes
    // who the institution believes is answerable.
    executiveOwner: candidate.executiveOwner,
    missionOwner:   candidate.missionOwner ?? null,
    // §20.32/§20.33 — the context the approver read.
    strategicContext: candidate.strategicContext ?? null,
    // §20.34/§20.35 — what was promised.
    expectedOutcome: candidate.expectedOutcome ?? null,
    deliverables: [...candidate.deliverables].sort(),
    // §20.126 — success criteria are material by name.
    successCriteria: sorted(candidate.successCriteria),
    // §20.126 — scope, and the exclusions that bound it (§20.43).
    inScope:     [...candidate.inScope].sort(),
    outOfScope:  [...candidate.outOfScope].sort(),
    constraints: sorted(candidate.constraints),
    // §20.126 — budget boundary.
    budget:      candidate.budget ?? null,
    // §20.126 — authority, and where it comes from (§20.54).
    authority:       sorted(candidate.authority),
    authoritySource: candidate.authoritySource ?? null,
    // §20.56/§20.57 — the action envelope. Widening either after approval is
    // exactly the §29.7 Authority Violation this binding exists to prevent.
    allowedActions:   sorted(candidate.allowedActions),
    forbiddenActions: sorted(candidate.forbiddenActions),
    // §20.58–§20.61 — tools and data are authority in practice.
    tools:     sorted(candidate.tools),
    dataScope: sorted(candidate.dataScope),
    // §20.62 — what the mission waits on; §20.66 — what it assumes.
    dependencies: sorted(candidate.dependencies),
    assumptions:  sorted(candidate.assumptions),
    // §20.126 — risk is material. Declarative only; no engine evaluates it.
    risks: sorted(candidate.risks),
    // §20.126 — approval gates are material by name.
    approvalGates: sorted(candidate.approvalGates),
    // §20.126 — deadline is material.
    deadline: candidate.deadline ?? null,
    // §20.76/§20.84/§20.88/§20.89 — the reporting, escalation and halt contract
    // a human relied on when approving.
    reporting:          sorted(candidate.reporting),
    escalationTriggers: sorted(candidate.escalationTriggers),
    stopConditions:     sorted(candidate.stopConditions),
    pauseConditions:    sorted(candidate.pauseConditions),
    // §20.92/§20.80 — how completion will be judged and proven.
    completionConditions: [...candidate.completionConditions].sort(),
    evidenceRequirements: sorted(candidate.evidenceRequirements),
    // §20.137 — which decision this implements, if any.
    decisionRef:  candidate.decisionRef ?? null,
    // §20.97 — WHICH mission replaces this one.
    supersededBy: candidate.supersededBy ?? null,
    // §20.126/§20.129 — the recorded reason for the act.
    reason:  candidate.reason ?? null,
    // §20.196 — the closure being asserted, when the act closes the mission.
    closure: candidate.closure ?? null,
  }
}

/** sha256 over the canonical serialization of the bound projection. */
export function missionBindingHash(candidate: MissionRecord): string {
  return createHash('sha256').update(canonicalJson(missionBoundProjection(candidate))).digest('hex')
}

export interface MissionAuthorizationBinding {
  projectId:  string
  target:     AuthorizationTarget
  actionKind: string
}

/**
 * The exact authorization this prospective mission act requires.
 *
 * No component is a caller argument: the project and mission come from the
 * lineage, the version hash from the candidate act's own content, and the
 * action from which act is being performed.
 */
export function bindingForMissionCandidate(
  candidate: MissionRecord,
  act: MissionAct,
): MissionAuthorizationBinding {
  return {
    projectId: candidate.projectId,
    target: {
      targetType:  'mission',
      targetId:    candidate.missionId,
      versionHash: missionBindingHash(candidate),
    },
    actionKind: MISSION_ACTION[act],
  }
}
