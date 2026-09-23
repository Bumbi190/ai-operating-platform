/**
 * Phase 1A — WorkPackage -> CodeWorkAdmissionV1 pure translation.
 *
 * Proves the translator is pure (no I/O, no clocks), non-authoritative (every
 * governance pin comes from the WorkPackage or a caller binding, never
 * invented), fail-closed (every widening attempt is rejected by SDF-1A's own
 * validators, not by a duplicate check here), and deterministic. No database,
 * network, Git mutation, filesystem mutation, model call or process launch
 * occurs anywhere in this suite.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workPackageHash } from '@/lib/atlas/workpackage/binding'
import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import {
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_CAPABILITY_ID,
} from '@/lib/atlas/code-work/types'
import { codeWorkRepositoryResource } from '@/lib/atlas/code-work/control-plane/work-package'
import {
  OMNIRA_REPOSITORY_ID,
  OMNIRA_TRUSTED_REPOSITORY,
} from '@/lib/atlas/code-work/repository-registry'
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

function bindings(overrides: Partial<CodeWorkMissionBindings> = {}): CodeWorkMissionBindings {
  return {
    workId: 'work-translate-1',
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
  return rejection.kind === 'risk_policy_undefined' ? [rejection.kind] : rejection.violations.map(v => v.code)
}

describe('Phase 1A — happy path produces a genuinely admissible candidate', () => {
  it('translates a valid bounded Work Package into an admission that independently passes both canonical validators', () => {
    const pkg = workPackage()
    const result = translateWorkPackageToAdmission(pkg, 1, bindings())
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
    const resultA = translateWorkPackageToAdmission(a, 0, bindings({ workId: 'work-a' }))
    const resultB = translateWorkPackageToAdmission(b, 0, bindings({ workId: 'work-b' }))
    expect(resultA.ok && resultB.ok).toBe(true)
    if (!resultA.ok || !resultB.ok) return

    expect(resultA.admission.projectId).toBe('project-a')
    expect(resultA.admission.governance).toEqual({
      mission: { id: 'mission-a', version: 3, hash: HASH_A },
      authorizationTarget: { targetType: 'atlas.code_work_admission', targetId: 'work-a', actionKind: 'code.worktree.prepare_and_patch' },
      delegation: { envelopeId: 'delegation-a', hash: HASH_B },
      workPackage: { id: 'wp-a', hash: a.packageHash },
    })
    expect(resultB.admission.projectId).toBe('project-b')
    expect(resultB.admission.governance).toEqual({
      mission: { id: 'mission-b', version: 7, hash: HASH_B },
      authorizationTarget: { targetType: 'atlas.code_work_admission', targetId: 'work-b', actionKind: 'code.worktree.prepare_and_patch' },
      delegation: { envelopeId: 'delegation-b', hash: HASH_A },
      workPackage: { id: 'wp-b', hash: b.packageHash },
    })
    // Distinct inputs produced distinct governance pins — the translator did
    // not fall back to one fixed/default set regardless of what it was given.
    expect(resultA.admission.governance).not.toEqual(resultB.admission.governance)
  })
})

describe('Phase 1A — determinism', () => {
  it('produces byte-identical results for structurally identical input', () => {
    const first = translateWorkPackageToAdmission(workPackage(), 1, bindings())
    const second = translateWorkPackageToAdmission(workPackage(), 1, bindings())
    expect(first).toEqual(second)
  })
})

describe('Phase 1A — fail-closed: every widening attempt is rejected, never silently accepted', () => {
  it('rejects an undefined Mission Risk Level — a concept SDF-1A itself has no way to catch', () => {
    const result = translateWorkPackageToAdmission(workPackage(), 4 as never, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toEqual(['risk_policy_undefined'])
    expect(lookupMissionRiskLevelPolicy(4)).toBeNull()
    expect(lookupMissionRiskLevelPolicy('1')).toBeNull()
  })

  it('rejects an unmapped required check instead of falling back to a shell string', () => {
    const result = translateWorkPackageToAdmission(
      workPackage(), 1, bindings({ requiredCommandIds: ['sdf1.proof.typecheck', 'shell.anything'] }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('command_not_registered')
  })

  it('rejects a shell-metacharacter string smuggled as a command id — it is never turned into argv', () => {
    const result = translateWorkPackageToAdmission(
      workPackage(), 1, bindings({ requiredCommandIds: ['; rm -rf / #'] }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('command_not_registered')
  })

  it('rejects a worker hint that cannot resolve to the one registered worker', () => {
    const result = translateWorkPackageToAdmission(
      workPackage(), 1, bindings({ worker: { modelId: 'claude-opus-4-1' } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('worker_not_registered')
  })

  it('rejects a capability hint broader than the one SDF-1A permits', () => {
    const result = translateWorkPackageToAdmission(
      workPackage(), 1, bindings({ worker: { capabilityId: 'code.worktree.patch.v2' } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('capability_not_registered')
  })

  it('rejects a repository binding that cannot resolve to trusted repository state', () => {
    const result = translateWorkPackageToAdmission(
      workPackage(), 1,
      bindings({ repository: { ...bindings().repository, repositoryId: 'github.com/other/repo' } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('repository_not_trusted')
  })

  it('rejects a Work Package that never authorized code-work action — missing authority binding', () => {
    const pkg = workPackage({ authority: [], allowedActions: [] })
    const result = translateWorkPackageToAdmission(pkg, 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('code_action_not_authorized')
  })

  it('rejects a Work Package that explicitly forbids the code-work action, even if also allowed', () => {
    const pkg = workPackage({ forbiddenActions: [{ action: CODE_WORK_AUTHORIZATION_ACTION_KIND, note: null }] })
    const result = translateWorkPackageToAdmission(pkg, 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('code_action_not_authorized')
  })

  it('rejects a Work Package missing the code-work tool bound', () => {
    const pkg = workPackage({ tools: [] })
    const result = translateWorkPackageToAdmission(pkg, 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('code_capability_not_authorized')
  })

  it('rejects an invalid governance binding — a Work Package hash that is not shaped like a hash', () => {
    const pkg = workPackage({ missionBoundHash: 'not-a-real-hash' })
    const result = translateWorkPackageToAdmission(pkg, 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('sha256_required')
  })

  it('rejects a file scope the Work Package never covered — path/scope incompatibility', () => {
    const result = translateWorkPackageToAdmission(
      workPackage(), 1,
      bindings({ files: { ...bindings().files, writeScopes: ['apps/web/lib/atlas/code-work/somewhere-else'] } }),
    )
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('work_package_scope_exceeded')
  })

  it('rejects a repository the Work Package data scope never named', () => {
    const pkg = workPackage({ dataScope: [] })
    const result = translateWorkPackageToAdmission(pkg, 1, bindings())
    expect(result.ok).toBe(false)
    expect(rejectionCodes(result)).toContain('repository_not_covered')
  })
})

describe('Phase 1A — never manufactures authority', () => {
  it('binds authorizationTarget.targetId to the caller-supplied workId, never to workPackageId', () => {
    const pkg = workPackage({ workPackageId: 'wp-distinct' })
    const result = translateWorkPackageToAdmission(pkg, 0, bindings({ workId: 'work-distinct' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.admission.governance.authorizationTarget.targetId).toBe('work-distinct')
    expect(result.admission.governance.authorizationTarget.targetId).not.toBe('wp-distinct')
  })

  it('the resulting commands carry only ids, never an argv or shell field of any kind', () => {
    const result = translateWorkPackageToAdmission(workPackage(), 0, bindings())
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
    expect(source).not.toMatch(/Date\.now\(\)|Math\.random\(\)|crypto\.randomUUID\(\)/)
    expect(source).not.toMatch(/resolveCommandInvocation/)
  })
})
