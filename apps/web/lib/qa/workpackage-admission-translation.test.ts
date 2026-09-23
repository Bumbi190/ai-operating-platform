/**
 * Phase 1A — WorkPackage evaluation -> CodeWorkAdmissionV1 pure translation.
 *
 * Proves the translator is pure (no I/O, no clocks), non-authoritative (every
 * governance pin comes from the WorkPackage or a caller binding, never
 * invented), gated on LIVE usability (a structurally valid but currently
 * invalidated WorkPackage cannot translate), persistence-shape aware (a
 * non-UUID workId cannot translate, since SDF-1B's real store column is
 * Postgres `uuid`), fail-closed (every widening attempt is rejected by
 * SDF-1A's own validators, not by a duplicate check here), and deterministic.
 * No database, network, Git mutation, filesystem mutation, model call or
 * process launch occurs anywhere in this suite.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workPackageHash } from '@/lib/atlas/workpackage/binding'
import type { WorkPackage, WorkPackageEvaluation, WorkPackageUnusableReason } from '@/lib/atlas/workpackage/types'
import {
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_CAPABILITY_ID,
} from '@/lib/atlas/code-work/types'
import { codeWorkRepositoryResource } from '@/lib/atlas/code-work/control-plane/work-package'
import {
  OMNIRA_REPOSITORY_ID,
  OMNIRA_TRUSTED_REPOSITORY,
} from '@/lib/atlas/code-work/repository-registry'
import { CLAUDE_PATCH_V1 } from '@/lib/atlas/code-work/worker-registry'
import {
  lookupMissionRiskLevelPolicy,
  MISSION_RISK_LEVEL_POLICIES,
} from '@/lib/atlas/code-work/mission-translation/types'
import type {
  CodeWorkMissionBindings,
  MissionTranslationResult,
} from '@/lib/atlas/code-work/mission-translation/types'
import { translateWorkPackageToAdmission } from '@/lib/atlas/code-work/mission-translation/translate'
import { validateCodeWorkAdmission } from '@/lib/atlas/code-work/policy'
import { validateCodeWorkPackageAttenuation } from '@/lib/atlas/code-work/control-plane/work-package'

const REPO_ROOT = resolve(__dirname, '../../../..')
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const BASE_SHA = 'd8b81b79848bd5aefec8fcc6776b95a56004318e'
const SCOPE = 'apps/web/lib/atlas/code-work/mission-translation'
const ASSIGNED_AT = '2026-09-23T00:00:00.000Z'

// Valid, distinguishable UUID-shaped identities. SDF-1B's real store column
// is Postgres `uuid` (see translate.ts's `isUuidShaped` comment) — every
// fixture that expects a successful translation must use one of these, never
// a human-readable slug.
const WORK_ID_1 = '11111111-1111-4111-8111-111111111111'
const WORK_ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WORK_ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const WORK_ID_DISTINCT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function workPackage(overrides: Partial<Omit<WorkPackage, 'packageHash'>> = {}): WorkPackage {
  const terms: Omit<WorkPackage, 'packageHash'> = {
    workPackageId: 'wp-translate-1',
    envelopeId: 'delegation-1',
    delegationBoundHash: HASH_B,
    missionId: 'mission-1',
    missionVersion: 1,
    missionBoundHash: HASH_A,
    projectId: 'project-1',
    assignedRole: { roleId: 'role-1', roleName: 'Coding Worker' },
    taskObjective: 'Translate a bounded Work Package into a code-work admission.',
    inputs: [],
    expectedOutput: [{ outputId: 'out-1', description: 'A tested patch.', verification: null }],
    authority: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND, note: null }],
    allowedActions: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND, note: null }],
    forbiddenActions: [],
    constraints: [],
    tools: [{ tool: CODE_WORK_CAPABILITY_ID, restriction: null }],
    dataScope: [{
      resource: codeWorkRepositoryResource(OMNIRA_REPOSITORY_ID, SCOPE),
      access: 'write',
      justification: 'bounded translation slice',
    }],
    budget: null,
    deadline: null,
    reporting: [],
    escalationTriggers: [],
    stopConditions: [],
    approvalGates: [],
    inScope: [SCOPE],
    outOfScope: [],
    dependencies: [],
    fallback: null,
    packageVersion: 1,
    ...overrides,
  }
  return { ...terms, packageHash: workPackageHash(terms) }
}

/**
 * The live-resolved shape `resolveWorkPackage()` would return for a currently
 * usable package. The translator never calls `resolveWorkPackage()` itself
 * (it is `server-only` and reads a real Delegation/Mission chain) — these
 * tests construct the evaluation directly, exactly as
 * `control-plane/principal-write.ts`'s `proposeCodeWork` receives it.
 */
function usable(pkg: WorkPackage = workPackage()): WorkPackageEvaluation {
  return {
    lifecycleState: 'assigned',
    effectiveState: 'assigned',
    usable: true,
    reason: 'usable',
    workPackage: pkg,
    assignedAt: ASSIGNED_AT,
  }
}

/** The same shape `resolveWorkPackage()` returns once the live chain no longer holds. */
function invalidated(pkg: WorkPackage, reason: WorkPackageUnusableReason): WorkPackageEvaluation {
  return {
    lifecycleState: 'assigned',
    effectiveState: 'invalidated',
    usable: false,
    reason,
    workPackage: pkg,
    assignedAt: ASSIGNED_AT,
  }
}

function bindings(overrides: Partial<CodeWorkMissionBindings> = {}): CodeWorkMissionBindings {
  return {
    workId: WORK_ID_1,
    repository: {
      repositoryId: OMNIRA_REPOSITORY_ID,
      owner: OMNIRA_TRUSTED_REPOSITORY.owner,
      name: OMNIRA_TRUSTED_REPOSITORY.name,
      expectedRemote: OMNIRA_TRUSTED_REPOSITORY.remoteIdentity,
      pinnedBaseSha: BASE_SHA,
      approvedRemote: OMNIRA_TRUSTED_REPOSITORY.approvedRemote,
      approvedBaseRef: OMNIRA_TRUSTED_REPOSITORY.approvedBaseRefs[0],
    },
    worktree: { branchPrefix: OMNIRA_TRUSTED_REPOSITORY.approvedBranchPrefix },
    files: {
      readScopes: [SCOPE],
      writeScopes: [SCOPE],
      deniedScopes: [],
      permissions: { create: true, update: true, delete: false, rename: false },
    },
    requiredCommandIds: ['sdf1.proof.typecheck'],
    ...overrides,
  }
}

function rejectionCodes(result: MissionTranslationResult): string[] {
  if (result.ok) return []
  const rejection = result.rejection
  return rejection.kind === 'admission_invalid' || rejection.kind === 'attenuation_failed'
    ? rejection.violations.map(v => v.code)
    : [rejection.kind]
}

describe('Phase 1A — happy path produces a genuinely admissible candidate', () => {
  it('translates a usable Work Package evaluation into an admission that independently passes both canonical validators', () => {
    const pkg = workPackage()
    const result = translateWorkPackageToAdmission(usable(pkg), 1, bindings())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.riskPolicy).toEqual(MISSION_RISK_LEVEL_POLICIES[1])

    // Re-run the EXISTING canonical checks independently on the output, rather
    // than trusting translateWorkPackageToAdmission's own internal "ok": the
    // proof that this is a genuine admission is that SDF-1A's own validators,
    // called fresh, accept it too.
    expect(validateCodeWorkAdmission(result.admission)).toEqual({ ok: true, value: result.admission })
    expect(validateCodeWorkPackageAttenuation(pkg, result.admission)).toEqual({ ok: true, value: result.admission })
  })

  it('carries governance pins through from the Work Package verbatim, never a fixed/default value', () => {
    const a = workPackage({
      workPackageId: 'wp-a', missionId: 'mission-a', missionVersion: 3, missionBoundHash: HASH_A,
      envelopeId: 'delegation-a', delegationBoundHash: HASH_B, projectId: 'project-a',
    })
    const b = workPackage({
      workPackageId: 'wp-b', missionId: 'mission-b', missionVersion: 7, missionBoundHash: HASH_B,
      envelopeId: 'delegation-b', delegationBoundHash: HASH_A, projectId: 'project-b',
    })
    const resultA = translateWorkPackageToAdmission(usable(a), 0, bindings({ workId: WORK_ID_A }))
    const resultB = translateWorkPackageToAdmission(usable(b), 0, bindings({ workId: WORK_ID_B }))
    expect(resultA.ok && resultB.ok).toBe(true)
    if (!resultA.ok || !resultB.ok) return

    expect(resultA.admission.projectId).toBe('project-a')
    expect(resultA.admission.governance).toEqual({
      mission: { id: 'mission-a', version: 3, hash: HASH_A },
      authorizationTarget: { targetType: 'atlas.code_work_admission', targetId: WORK_ID_A, actionKind: 'code.worktree.prepare_and_patch' },
      delegation: { envelopeId: 'delegation-a', hash: HASH_B },
      workPackage: { id: 'wp-a', hash: a.packageHash },
    })
    expect(resultB.admission.projectId).toBe('project-b')
    expect(resultB.admission.governance).toEqual({
      mission: { id: 'mission-b', version: 7, hash: HASH_B },
      authorizationTarget: { targetType: 'atlas.code_work_admission', targetId: WORK_ID_B, actionKind: 'code.worktree.prepare_and_patch' },
      delegation: { envelopeId: 'delegation-b', hash: HASH_A },
      workPackage: { id: 'wp-b', hash: b.packageHash },
    })
    // Distinct inputs produced distinct governance pins — the translator did
    // not fall back to one fixed/default set regardless of what it was given.
    expect(resultA.admission.governance).not.toEqual(resultB.admission.governance)
  })

  it('sources the default worker identity from the real worker registry entry, not a second copy', () => {
    const result = translateWorkPackageToAdmission(usable(), 0, bindings())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.admission.worker).toMatchObject({
      adapterId: CLAUDE_PATCH_V1.adapterId,
      adapterVersion: CLAUDE_PATCH_V1.adapterVersion,
      provider: CLAUDE_PATCH_V1.provider,
      modelId: CLAUDE_PATCH_V1.modelId,
      outputProtocol: CLAUDE_PATCH_V1.outputProtocol,
    })
  })
})

describe('Phase 1A — determinism', () => {
  it('produces byte-identical results for structurally identical input', () => {
    const first = translateWorkPackageToAdmission(usable(workPackage()), 1, bindings())
    const second = translateWorkPackageToAdmission(usable(workPackage()), 1, bindings())
    expect(first).toEqual(second)
  })
})

describe('Phase 1A — live usability gate: contract data is not proof of current authority', () => {
  it('rejects an invalidated evaluation even though the embedded Work Package itself is structurally valid', () => {
    // This Work Package's own authority/allowedActions/tools are exactly the
    // same well-formed contract data the happy-path test uses — proving the
    // rejection below comes from the LIVE usability gate, not from anything
    // wrong with the stored contract.
    const pkg = workPackage()
    expect(pkg.authority.some(item => item.action === CODE_WORK_AUTHORIZATION_ACTION_KIND)).toBe(true)
    expect(pkg.tools.some(item => item.tool === CODE_WORK_CAPABILITY_ID)).toBe(true)

    const result = translateWorkPackageToAdmission(invalidated(pkg, 'delegation_unusable'), 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toEqual(['work_package_not_usable'])
    expect(!result.ok && result.rejection.kind === 'work_package_not_usable' && result.rejection.reason)
      .toBe('delegation_unusable')
  })

  it.each([
    'delegation_unusable', 'delegation_pin_changed', 'mission_pin_changed',
    'exceeds_delegation', 'role_unavailable', 'delegation_unreadable',
  ] satisfies WorkPackageUnusableReason[])('rejects every unusable reason SDF-1A itself can produce: %s', reason => {
    const result = translateWorkPackageToAdmission(invalidated(workPackage(), reason), 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toEqual(['work_package_not_usable'])
  })

  it('never imports the server-only live resolver itself', () => {
    // The doc comments explain WHY resolveWorkPackage() is never called, so
    // they mention its name — this checks for the one thing that would
    // actually wire it in: an import from the module that defines it.
    const translateSource = readFileSync(
      resolve(REPO_ROOT, 'apps/web/lib/atlas/code-work/mission-translation/translate.ts'), 'utf8',
    )
    expect(translateSource).not.toMatch(/from ['"].*workpackage\/principal-read['"]/)
    expect(translateSource).not.toMatch(/from ['"]server-only['"]/)
  })
})

describe('Phase 1A — work id must be persistable by the real SDF-1B control plane', () => {
  it('rejects a non-UUID workId even when everything else is valid', () => {
    const result = translateWorkPackageToAdmission(usable(), 1, bindings({ workId: 'work-translate-1' }))
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toEqual(['work_id_not_persistable'])
    expect(!result.ok && result.rejection.kind === 'work_id_not_persistable' && result.rejection.workId)
      .toBe('work-translate-1')
  })

  it.each([
    'not-a-uuid',
    '11111111-1111-1111-1111-11111111111',  // one hex digit short
    '11111111-1111-1111-1111-1111111111111', // one hex digit long
    '11111111_1111_4111_8111_111111111111',  // wrong separators
    '11111111-1111-4111-8111-11111111111G',  // non-hex character
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',   // uppercase — SDF-1A's own hash patterns are lowercase-only too
  ])('rejects malformed UUID shape: %s', badWorkId => {
    const result = translateWorkPackageToAdmission(usable(), 1, bindings({ workId: badWorkId }))
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toEqual(['work_id_not_persistable'])
  })

  it('accepts a valid UUID workId (happy path already proves this; this test isolates it)', () => {
    const result = translateWorkPackageToAdmission(usable(), 1, bindings({ workId: WORK_ID_DISTINCT }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.admission.workId).toBe(WORK_ID_DISTINCT)
    expect(result.admission.governance.authorizationTarget.targetId).toBe(WORK_ID_DISTINCT)
  })
})

describe('Phase 1A — fail-closed: every widening attempt is rejected, never silently accepted', () => {
  it('rejects an undefined Mission Risk Level — a concept SDF-1A itself has no way to catch', () => {
    const result = translateWorkPackageToAdmission(usable(), 4 as never, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toEqual(['risk_policy_undefined'])
    expect(lookupMissionRiskLevelPolicy(4)).toBeNull()
    expect(lookupMissionRiskLevelPolicy('1')).toBeNull()
  })

  it('rejects an unmapped required check instead of falling back to a shell string', () => {
    const result = translateWorkPackageToAdmission(
      usable(), 1, bindings({ requiredCommandIds: ['sdf1.proof.typecheck', 'shell.anything'] }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('command_not_registered')
  })

  it('rejects a shell-metacharacter string smuggled as a command id — it is never turned into argv', () => {
    const result = translateWorkPackageToAdmission(
      usable(), 1, bindings({ requiredCommandIds: ['; rm -rf / #'] }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('command_not_registered')
  })

  it('rejects a worker hint that cannot resolve to the one registered worker', () => {
    const result = translateWorkPackageToAdmission(
      usable(), 1, bindings({ worker: { modelId: 'claude-opus-4-1' } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('worker_not_registered')
  })

  it('rejects a capability hint broader than the one SDF-1A permits', () => {
    const result = translateWorkPackageToAdmission(
      usable(), 1, bindings({ worker: { capabilityId: 'code.worktree.patch.v2' } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('capability_not_registered')
  })

  it('rejects a repository binding that cannot resolve to trusted repository state', () => {
    const result = translateWorkPackageToAdmission(
      usable(), 1,
      bindings({ repository: { ...bindings().repository, repositoryId: 'github.com/other/repo' } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('repository_not_trusted')
  })

  it('rejects a Work Package whose stored contract never authorized code-work action', () => {
    const pkg = workPackage({ authority: [], allowedActions: [] })
    const result = translateWorkPackageToAdmission(usable(pkg), 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('code_action_not_authorized')
  })

  it('rejects a Work Package that explicitly forbids the code-work action, even if also allowed', () => {
    const pkg = workPackage({ forbiddenActions: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND, note: null }] })
    const result = translateWorkPackageToAdmission(usable(pkg), 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('code_action_not_authorized')
  })

  it('rejects a Work Package missing the code-work tool bound', () => {
    const pkg = workPackage({ tools: [] })
    const result = translateWorkPackageToAdmission(usable(pkg), 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('code_capability_not_authorized')
  })

  it('rejects a malformed governance hash carried on the stored Work Package', () => {
    const pkg = workPackage({ missionBoundHash: 'not-a-real-hash' })
    const result = translateWorkPackageToAdmission(usable(pkg), 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('sha256_required')
  })

  it('rejects a file scope the Work Package never covered — path/scope incompatibility', () => {
    const result = translateWorkPackageToAdmission(
      usable(), 1,
      bindings({ files: { ...bindings().files, writeScopes: ['apps/web/lib/atlas/code-work/somewhere-else'] } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('work_package_scope_exceeded')
  })

  it('rejects a repository the Work Package data scope never named', () => {
    const pkg = workPackage({ dataScope: [] })
    const result = translateWorkPackageToAdmission(usable(pkg), 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('repository_not_covered')
  })
})

describe('Phase 1A — never manufactures authority', () => {
  it('binds authorizationTarget.targetId to the caller-supplied workId, never to workPackageId', () => {
    const pkg = workPackage({ workPackageId: 'wp-distinct' })
    const result = translateWorkPackageToAdmission(usable(pkg), 0, bindings({ workId: WORK_ID_DISTINCT }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.admission.governance.authorizationTarget.targetId).toBe(WORK_ID_DISTINCT)
    expect(result.admission.governance.authorizationTarget.targetId).not.toBe('wp-distinct')
  })

  it('the resulting commands carry only ids, never an argv or shell field of any kind', () => {
    const result = translateWorkPackageToAdmission(usable(), 0, bindings())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.admission.commands).sort()).toEqual(
      ['approvedCommandIds', 'registryHash', 'registryVersion'],
    )
    expect(JSON.stringify(result.admission)).not.toMatch(/argv|execv/i)
  })
})

describe('Phase 1A — Mission Risk Level table stays a distinct, closed vocabulary', () => {
  it('defines exactly levels 0-3, each requiring authority regardless of review posture', () => {
    expect(Object.keys(MISSION_RISK_LEVEL_POLICIES).sort()).toEqual(['0', '1', '2', '3'])
    expect(MISSION_RISK_LEVEL_POLICIES[0].independentReviewRequired).toBe(false)
    expect(MISSION_RISK_LEVEL_POLICIES[1].independentReviewRequired).toBe(true)
    expect(MISSION_RISK_LEVEL_POLICIES[1].humanApprovalRequired).toBe(false)
    expect(MISSION_RISK_LEVEL_POLICIES[2].humanApprovalRequired).toBe(true)
    expect(MISSION_RISK_LEVEL_POLICIES[3].humanApprovalRequired).toBe(true)
    // Nothing in this table can enable auto-merge; the field does not exist here.
    for (const policy of Object.values(MISSION_RISK_LEVEL_POLICIES)) {
      expect(policy).not.toHaveProperty('mayAutoMerge')
    }
  })
})

describe('Phase 1A structural no-execution proof', () => {
  it('the mission-translation directory contains only pure mapping/types and no execution seam', () => {
    const directory = resolve(REPO_ROOT, 'apps/web/lib/atlas/code-work/mission-translation')
    const files = readdirSync(directory).filter(name => name.endsWith('.ts')).sort()
    expect(files).toEqual(['translate.ts', 'types.ts'])
    const source = files.map(file => readFileSync(resolve(directory, file), 'utf8')).join('\n')
    expect(source).not.toMatch(/from ['"](?:node:)?child_process['"]|require\(['"](?:node:)?child_process['"]\)/)
    expect(source).not.toMatch(/from ['"](?:node:)?(?:fs|net|http|https)['"]|from ['"]@anthropic-ai\/sdk['"]|from ['"]openai['"]|from ['"]@supabase\//)
    expect(source).not.toMatch(/\b(?:execFile|spawn|fork)\s*\(|\bchildProcess\.exec\s*\(|\bfetch\s*\(|\b(?:writeFile|appendFile|createWriteStream)\s*\(/)
    expect(source).not.toMatch(/git\s+worktree\s+add|git\s+commit|gh\s+pr|vercel\s+deploy/i)
    expect(source).not.toMatch(/process\.env|SUPABASE_SERVICE_ROLE|ANTHROPIC_API_KEY|OPENAI_API_KEY/)
    // Import-based, not bare-word: both files' doc comments explain the
    // deliberate ABSENCE of a clock/random source and of resolveWorkPackage()
    // by naming them, so a bare-word match would false-positive on prose.
    expect(source).not.toMatch(/from ['"](?:node:)?crypto['"]/)
    expect(source).not.toMatch(/from ['"].*workpackage\/principal-read['"]/)
    expect(source).not.toMatch(/resolveCommandInvocation\(/)
    expect(source).not.toMatch(/from ['"]server-only['"]/)
  })
})
