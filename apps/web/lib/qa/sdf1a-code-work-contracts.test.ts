/**
 * SDF-1A — bounded code-work contracts and pure policy primitives.
 *
 * These tests intentionally prove refusals and the absence of an execution
 * path. No database, network, Git mutation, filesystem mutation, model call or
 * process launch occurs.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAuthorizationEvent } from '@/lib/atlas/authorization/build'
import {
  bindingForCodeWorkAdmission,
  codeWorkAdmissionHash,
  isCodeWorkAuthorizationEffective,
} from '@/lib/atlas/code-work/binding'
import {
  CODE_WORK_CAPABILITY,
  CODE_WORK_FORBIDDEN_OPERATION_FAMILIES,
  lookupCodeWorkCapability,
} from '@/lib/atlas/code-work/capability'
import {
  CODE_WORK_COMMANDS,
  codeWorkCommandRegistryHash,
  COMMAND_REGISTRY_VERSION,
  resolveCommandInvocation,
} from '@/lib/atlas/code-work/command-registry'
import {
  annotatedCodeWorkReceiptHash,
  codeWorkReceiptHash,
  validateCodeWorkReceipt,
} from '@/lib/atlas/code-work/evidence'
import type { CodeWorkReceiptV1 } from '@/lib/atlas/code-work/evidence'
import {
  canTransitionCodeWork,
  CODE_WORK_TERMINAL_STATES,
  validateCodeWorkTransition,
} from '@/lib/atlas/code-work/lifecycle'
import { validateStructuredPatch } from '@/lib/atlas/code-work/patch-protocol'
import {
  evaluateRepoPath,
  normalizeRepoRelativePath,
  SDF1_PATH_ENFORCEMENT_LEVEL,
} from '@/lib/atlas/code-work/path-policy'
import { validateCodeWorkAdmission } from '@/lib/atlas/code-work/policy'
import { terminalEvidenceRequirements } from '@/lib/atlas/code-work/terminal-evidence'
import {
  normalizeGitHubRemote,
  OMNIRA_REPOSITORY_ID,
  OMNIRA_TRUSTED_REPOSITORY,
} from '@/lib/atlas/code-work/repository-registry'
import {
  CODE_WORK_ADMISSION_SCHEMA,
  CODE_WORK_ADMISSION_VERSION,
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_AUTHORIZATION_TARGET_TYPE,
  CODE_WORK_BASELINE_RECEIPT_CLASSES,
  CODE_WORK_CAPABILITY_ID,
  CODE_WORK_CAPABILITY_VERSION,
  CODE_WORK_OUTPUT_PROTOCOL,
  CODE_WORK_STOP_CONDITIONS,
  CODE_WORK_WORKER_ADAPTER_ID,
  CODE_WORK_WORKER_ADAPTER_VERSION,
  CODE_WORK_WORKTREE_POLICY_ID,
  SDF1_LIMITS,
} from '@/lib/atlas/code-work/types'
import type { CodeWorkAdmissionV1 } from '@/lib/atlas/code-work/types'
import { CLAUDE_PATCH_V1, lookupCodeWorkWorker } from '@/lib/atlas/code-work/worker-registry'

const REPO_ROOT = resolve(__dirname, '../../../..')
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const BASE_SHA = 'd8b81b79848bd5aefec8fcc6776b95a56004318e'

function admission(overrides: Partial<CodeWorkAdmissionV1> = {}): CodeWorkAdmissionV1 {
  const workId = overrides.workId ?? 'work-sdf1a-1'
  const base: CodeWorkAdmissionV1 = {
    schema: CODE_WORK_ADMISSION_SCHEMA,
    version: CODE_WORK_ADMISSION_VERSION,
    workId,
    projectId: 'project-1',
    governance: {
      mission: { id: 'mission-1', version: 1, hash: HASH_A },
      authorizationTarget: {
        targetType: CODE_WORK_AUTHORIZATION_TARGET_TYPE,
        targetId: workId,
        actionKind: CODE_WORK_AUTHORIZATION_ACTION_KIND,
      },
      delegation: { envelopeId: 'delegation-1', hash: HASH_B },
      workPackage: { id: 'package-1', hash: HASH_A },
    },
    repository: {
      repositoryId: OMNIRA_REPOSITORY_ID,
      owner: 'Bumbi190',
      name: 'ai-operating-platform',
      expectedRemote: { provider: 'github', host: 'github.com', owner: 'bumbi190', name: 'ai-operating-platform' },
      pinnedBaseSha: BASE_SHA,
      approvedRemote: 'origin',
      approvedBaseRef: 'refs/remotes/origin/main',
    },
    worktree: { branchPrefix: 'sdf1/', policyId: CODE_WORK_WORKTREE_POLICY_ID },
    worker: {
      capabilityId: CODE_WORK_CAPABILITY_ID,
      capabilityVersion: CODE_WORK_CAPABILITY_VERSION,
      adapterId: CODE_WORK_WORKER_ADAPTER_ID,
      adapterVersion: CODE_WORK_WORKER_ADAPTER_VERSION,
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      outputProtocol: CODE_WORK_OUTPUT_PROTOCOL,
    },
    files: {
      readScopes: ['apps/web/lib'],
      writeScopes: ['apps/web/lib/atlas/code-work'],
      deniedScopes: ['apps/web/lib/atlas/code-work/private'],
      permissions: { create: true, update: true, delete: false, rename: false },
    },
    commands: {
      approvedCommandIds: ['sdf1.proof.fixture_test', 'sdf1.proof.typecheck'],
      registryVersion: COMMAND_REGISTRY_VERSION,
      registryHash: codeWorkCommandRegistryHash(),
    },
    limits: { ...SDF1_LIMITS },
    isolation: { network: 'denied', secrets: 'none' },
    evidence: { requiredReceiptClasses: [...CODE_WORK_BASELINE_RECEIPT_CLASSES] },
    stopConditions: [...CODE_WORK_STOP_CONDITIONS],
  }
  return { ...base, ...overrides }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function codes(result: ReturnType<typeof validateCodeWorkAdmission>): string[] {
  return result.ok ? [] : result.violations.map(item => item.code)
}

describe('SDF-1A admission and semantic authorization binding', () => {
  it('accepts the exact bounded V1 contract and binds the exact target/action', () => {
    const value = admission()
    expect(validateCodeWorkAdmission(value)).toEqual({ ok: true, value })
    expect(bindingForCodeWorkAdmission(value)).toEqual({
      projectId: 'project-1',
      target: {
        targetType: 'atlas.code_work_admission',
        targetId: 'work-sdf1a-1',
        versionHash: codeWorkAdmissionHash(value),
      },
      actionKind: 'code.worktree.prepare_and_patch',
    })
  })

  it('canonicalizes set order and duplicates without weakening content binding', () => {
    const a = admission()
    const b = admission({
      files: {
        ...a.files,
        readScopes: ['apps/web/lib', 'apps/web/lib'],
        writeScopes: [...a.files.writeScopes].reverse(),
      },
      commands: { ...a.commands, approvedCommandIds: [...a.commands.approvedCommandIds].reverse() },
      evidence: { requiredReceiptClasses: [...a.evidence.requiredReceiptClasses].reverse() },
      stopConditions: [...a.stopConditions].reverse(),
    })
    expect(codeWorkAdmissionHash(b)).toBe(codeWorkAdmissionHash(a))
    const changed = clone(a)
    changed.limits.maxDiffBytes -= 1
    expect(codeWorkAdmissionHash(changed)).not.toBe(codeWorkAdmissionHash(a))
  })

  it.each([
    ['project', (x: CodeWorkAdmissionV1) => { x.projectId = 'project-2' }],
    ['mission', (x: CodeWorkAdmissionV1) => { x.governance.mission.hash = HASH_B }],
    ['delegation', (x: CodeWorkAdmissionV1) => { x.governance.delegation.hash = HASH_A }],
    ['work package', (x: CodeWorkAdmissionV1) => { x.governance.workPackage.id = 'package-2' }],
    ['base', (x: CodeWorkAdmissionV1) => { x.repository.pinnedBaseSha = 'c'.repeat(40) }],
    ['file scope', (x: CodeWorkAdmissionV1) => { x.files.writeScopes = ['apps/web/lib/qa'] }],
    ['permission', (x: CodeWorkAdmissionV1) => { x.files.permissions.delete = true }],
    ['command set', (x: CodeWorkAdmissionV1) => { x.commands.approvedCommandIds = ['sdf1.proof.typecheck'] }],
    ['runtime limit', (x: CodeWorkAdmissionV1) => { x.limits.maxTotalRuntimeSeconds -= 1 }],
  ] as const)('hash-binds authority-bearing %s', (_label, mutate) => {
    const a = admission()
    const b = clone(a)
    mutate(b)
    expect(codeWorkAdmissionHash(b)).not.toBe(codeWorkAdmissionHash(a))
  })

  it('rejects unknown versions, unknown fields and a target not bound to workId', () => {
    expect(codes(validateCodeWorkAdmission({ ...admission(), version: 2 }))).toContain('unknown_version')
    expect(codes(validateCodeWorkAdmission({ ...admission(), surprise: true }))).toContain('unknown_field')
    const value = clone(admission())
    value.governance.authorizationTarget.targetId = 'another-work'
    expect(codes(validateCodeWorkAdmission(value))).toContain('work_id_mismatch')
  })

  it('never treats a conditional Authorization V1 grant as effective', () => {
    const value = admission()
    const binding = bindingForCodeWorkAdmission(value)
    const common = {
      authorizationId: 'authorization-1',
      projectId: value.projectId,
      principalId: 'human-owner-1',
      target: binding.target,
      authority: { actionKind: binding.actionKind, description: 'Prepare one bounded isolated patch.' },
    }
    const requested = buildAuthorizationEvent({
      ...common,
      type: 'requested',
      occurredAt: '2026-09-18T08:00:00.000Z',
      eventId: 'event-1',
    })
    const granted = buildAuthorizationEvent({
      ...common,
      type: 'granted_with_conditions',
      occurredAt: '2026-09-18T08:01:00.000Z',
      expiresAt: '2026-09-18T09:00:00.000Z',
      eventId: 'event-2',
      conditions: [{ conditionId: 'condition-1', type: 'manual', value: 'review', description: 'Unenforced.' }],
    })
    expect(isCodeWorkAuthorizationEffective(
      [requested, granted], value, '2026-09-18T08:02:00.000Z',
    )).toMatchObject({ effective: false, reason: 'conditions_unverified' })
  })
})

describe('SDF-1A static registries are identity and policy, never permission', () => {
  it('recognizes only the locked capability and worker identity', () => {
    expect(lookupCodeWorkCapability('code.worktree.patch.v1', 1)).toBe(CODE_WORK_CAPABILITY)
    expect(lookupCodeWorkCapability('code.worktree.patch.v2', 1)).toBeNull()
    expect(lookupCodeWorkWorker({
      adapterId: 'claude_patch_v1', adapterVersion: 1, provider: 'anthropic',
      modelId: 'claude-sonnet-4-6', outputProtocol: CODE_WORK_OUTPUT_PROTOCOL,
    })).toBe(CLAUDE_PATCH_V1)
    expect(lookupCodeWorkWorker({
      adapterId: 'claude_patch_v1', adapterVersion: 1, provider: 'anthropic',
      modelId: 'claude-opus-4-1', outputProtocol: CODE_WORK_OUTPUT_PROTOCOL,
    })).toBeNull()
  })

  it('explicitly forbids Git publication, arbitrary shell/network and authority mutation', () => {
    expect(CODE_WORK_FORBIDDEN_OPERATION_FAMILIES).toEqual(expect.arrayContaining([
      'git.commit', 'git.push', 'pull_request.mutate', 'git.merge', 'deployment.execute',
      'shell.arbitrary', 'network.arbitrary', 'credential.access', 'authority.mutate',
    ]))
    expect(CODE_WORK_CAPABILITY.workerRequirements).toMatchObject({
      structuredOutputOnly: true, directFilesystemAccess: false, shellAccess: false,
      gitAccess: false, toolAccess: false,
    })
  })

  it('normalizes the verified GitHub remote but rejects lookalikes and credentials', () => {
    const expected = { provider: 'github', host: 'github.com', owner: 'bumbi190', name: 'ai-operating-platform' }
    expect(normalizeGitHubRemote('https://github.com/Bumbi190/ai-operating-platform.git')).toEqual(expected)
    expect(normalizeGitHubRemote('git@github.com:Bumbi190/ai-operating-platform.git')).toEqual(expected)
    expect(normalizeGitHubRemote('ssh://git@github.com/Bumbi190/ai-operating-platform.git')).toEqual(expected)
    expect(normalizeGitHubRemote('https://github.example/Bumbi190/ai-operating-platform.git')).toBeNull()
    expect(normalizeGitHubRemote('https://token@github.com/Bumbi190/ai-operating-platform.git')).toBeNull()
    expect(OMNIRA_TRUSTED_REPOSITORY).toMatchObject({
      approvedWorktreeParent: '/Users/andrehultgren/Projects/Omnira/.worktrees/sdf1',
      approvedBranchPrefix: 'sdf1/', cleanupPolicy: 'explicit_action_only',
    })
  })

  it('rejects repository, worker, command, network and secret-policy drift', () => {
    const cases: Array<[string, (value: CodeWorkAdmissionV1) => void]> = [
      ['repository_not_trusted', value => { value.repository.repositoryId = 'github.com/other/repo' }],
      ['remote_identity_mismatch', value => { value.repository.expectedRemote.owner = 'other' }],
      ['worker_not_registered', value => { value.worker.modelId = 'other' as never }],
      ['command_not_registered', value => { value.commands.approvedCommandIds = ['shell.anything'] }],
      ['network_must_be_denied', value => { value.isolation.network = 'allowed' as never }],
      ['secrets_must_be_none', value => { value.isolation.secrets = 'ambient' as never }],
    ]
    for (const [expected, mutate] of cases) {
      const value = clone(admission())
      mutate(value)
      expect(codes(validateCodeWorkAdmission(value)), expected).toContain(expected)
    }
  })
})

describe('SDF-1A lexical paths and structured patch validation', () => {
  it('states the lexical-only, not symlink-safe boundary', () => {
    expect(SDF1_PATH_ENFORCEMENT_LEVEL).toBe('lexical_only_not_symlink_safe')
  })

  it.each([
    '/etc/passwd', '../secret', 'apps//web', 'apps/./web', 'C:/Windows', 'apps\\web',
    '.git/config', '.env.production', 'config/service-account.json', 'keys/id_rsa', 'certs/prod.pem',
  ])('rejects unsafe or platform-denied path %s', value => {
    expect(normalizeRepoRelativePath(value).ok).toBe(false)
  })

  it('gives explicit denial precedence over an allowlist', () => {
    expect(evaluateRepoPath({
      path: 'apps/web/lib/atlas/code-work/private/key.ts',
      allowedScopes: ['apps/web/lib'],
      deniedScopes: ['apps/web/lib/atlas/code-work/private'],
    })).toMatchObject({ ok: false, violations: [{ code: 'path_explicitly_denied' }] })
  })

  it('accepts bounded text create/replace operations with hash preconditions', () => {
    const value = admission()
    expect(validateStructuredPatch({
      protocol: CODE_WORK_OUTPUT_PROTOCOL,
      version: 1,
      operations: [
        { op: 'create', path: 'apps/web/lib/atlas/code-work/new.ts', content: 'export {}\n' },
        { op: 'replace', path: 'apps/web/lib/atlas/code-work/types.ts', expected_sha256: HASH_A, content: 'export {}\n' },
      ],
    }, value)).toMatchObject({ ok: true, value: { touchedPaths: [
      'apps/web/lib/atlas/code-work/new.ts', 'apps/web/lib/atlas/code-work/types.ts',
    ] } })
  })

  it('rejects mutation without expected hash, binary content, conflicts and denied operations', () => {
    const value = admission()
    const missingHash = validateStructuredPatch({
      protocol: CODE_WORK_OUTPUT_PROTOCOL, version: 1,
      operations: [{ op: 'replace', path: 'apps/web/lib/atlas/code-work/types.ts', content: 'x' }],
    }, value)
    expect(missingHash.ok ? [] : missingHash.violations.map(item => item.code)).toContain('expected_hash_required')

    const binary = validateStructuredPatch({
      protocol: CODE_WORK_OUTPUT_PROTOCOL, version: 1,
      operations: [{ op: 'create', path: 'apps/web/lib/atlas/code-work/binary.ts', content: 'x\0y' }],
    }, value)
    expect(binary.ok ? [] : binary.violations.map(item => item.code)).toContain('binary_content_forbidden')

    const conflict = validateStructuredPatch({
      protocol: CODE_WORK_OUTPUT_PROTOCOL, version: 1,
      operations: [
        { op: 'create', path: 'apps/web/lib/atlas/code-work/same.ts', content: 'a' },
        { op: 'replace', path: 'apps/web/lib/atlas/code-work/same.ts', expected_sha256: HASH_A, content: 'b' },
      ],
    }, value)
    expect(conflict.ok ? [] : conflict.violations.map(item => item.code)).toContain('conflicting_operations')

    const deletion = validateStructuredPatch({
      protocol: CODE_WORK_OUTPUT_PROTOCOL, version: 1,
      operations: [{ op: 'delete', path: 'apps/web/lib/atlas/code-work/types.ts', expected_sha256: HASH_A }],
    }, value)
    expect(deletion.ok ? [] : deletion.violations.map(item => item.code)).toContain('operation_not_permitted')
  })

  it.each([
    { op: 'rename', from: '../outside.ts', to: 'apps/web/lib/atlas/code-work/in.ts', expected_sha256: HASH_A },
    { op: 'rename', from: 'apps/web/lib/atlas/code-work/in.ts', to: '/tmp/outside.ts', expected_sha256: HASH_A },
  ])('applies the same path policy to rename source and destination', operation => {
    const value = admission({
      files: { ...admission().files, permissions: { create: true, update: true, delete: false, rename: true } },
    })
    const result = validateStructuredPatch({
      protocol: CODE_WORK_OUTPUT_PROTOCOL, version: 1, operations: [operation],
    }, value)
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.violations.map(item => item.code)).toEqual(
      expect.arrayContaining(['path_traversal'].filter(() => operation.from.startsWith('..')).concat(
        operation.to.startsWith('/') ? ['path_absolute'] : [],
      )),
    )
  })

  it('enforces operation and text payload budgets', () => {
    const value = admission({ limits: { ...SDF1_LIMITS, maxChangedFiles: 1, maxDiffBytes: 3 } })
    const result = validateStructuredPatch({
      protocol: CODE_WORK_OUTPUT_PROTOCOL, version: 1,
      operations: [
        { op: 'create', path: 'apps/web/lib/atlas/code-work/a.ts', content: 'four' },
        { op: 'create', path: 'apps/web/lib/atlas/code-work/b.ts', content: 'x' },
      ],
    }, value)
    const found = result.ok ? [] : result.violations.map(item => item.code)
    expect(found).toEqual(expect.arrayContaining(['operation_limit_exceeded', 'changed_file_limit_exceeded', 'diff_limit_exceeded']))
  })
})

describe('SDF-1A command IDs and lifecycle fail closed', () => {
  it('resolves only typed allowlisted enum arguments without accepting argv', () => {
    expect(resolveCommandInvocation({
      commandId: 'sdf1.proof.fixture_test', version: 1,
      arguments: { suite: 'lib/qa/sdf1a-code-work-contracts.test.ts' },
    })).toMatchObject({ ok: true, value: {
      executableIdentity: 'toolchain.npm',
      argv: ['exec', '--', 'vitest', 'run', 'lib/qa/sdf1a-code-work-contracts.test.ts'],
      networkRequirement: 'denied', timeoutMaximumSeconds: 300,
    } })
    expect(resolveCommandInvocation({
      commandId: 'sdf1.proof.fixture_test', version: 1,
      arguments: { suite: 'lib/qa/sdf1a-code-work-contracts.test.ts', argv: ['--watch'] },
    })).toMatchObject({ ok: false, violations: [{ code: 'free_argument_forbidden' }] })
    expect(resolveCommandInvocation({
      commandId: 'shell', version: 1, arguments: {},
    })).toMatchObject({ ok: false, violations: [{ code: 'unknown_command' }] })
    expect(Object.values(CODE_WORK_COMMANDS).every(command => command.shell === 'forbidden')).toBe(true)
  })

  it('permits only explicit transitions and no transition out of a terminal', () => {
    expect(canTransitionCodeWork('proposed', 'authorized')).toBe(true)
    expect(canTransitionCodeWork('proposed', 'working')).toBe(false)
    expect(validateCodeWorkTransition('unknown', 'working')).toMatchObject({
      ok: false, violations: [{ code: 'unknown_state' }],
    })
    for (const state of CODE_WORK_TERMINAL_STATES) {
      expect(canTransitionCodeWork(state, 'working'), state).toBe(false)
    }
  })
})

describe('SDF-1A evidence is structured, deterministic and annotation-free', () => {
  function receipt(paths: string[]): CodeWorkReceiptV1 {
    return {
      workId: 'work-sdf1a-1', sequence: 14, observedAt: '2026-09-18T08:10:00.000Z',
      evidence: { receiptClass: 'final_diff', diffHash: HASH_A, diffBytes: 42, changedPaths: paths },
    }
  }

  it('hashes set-like path order deterministically and excludes commentary', () => {
    const a = receipt(['apps/web/lib/b.ts', 'apps/web/lib/a.ts'])
    const b = receipt(['apps/web/lib/a.ts', 'apps/web/lib/b.ts', 'apps/web/lib/a.ts'])
    expect(codeWorkReceiptHash(a)).toBe(codeWorkReceiptHash(b))
    expect(annotatedCodeWorkReceiptHash({ receipt: a, annotation: { author: 'ai', text: 'not evidence' } }))
      .toBe(codeWorkReceiptHash(a))
  })

  it('rejects unknown receipt classes, unknown fields and non-terminal terminal receipts', () => {
    expect(validateCodeWorkReceipt({ ...receipt([]), evidence: { receiptClass: 'made_up' } }))
      .toMatchObject({ ok: false, violations: [{ code: 'unknown_receipt_class' }] })
    expect(validateCodeWorkReceipt({ ...receipt([]), extra: true })).toMatchObject({
      ok: false, violations: [{ code: 'unknown_field' }],
    })
    expect(validateCodeWorkReceipt({
      workId: 'work-sdf1a-1', sequence: 15, observedAt: '2026-09-18T08:11:00.000Z',
      evidence: { receiptClass: 'terminal', state: 'working', iterationCount: 1 },
    })).toMatchObject({ ok: false, violations: [{ code: 'terminal_state_required' }] })
  })
})

describe('SDF-1A terminal evidence profiles', () => {
  it('keeps baseline receipts separate from mutually exclusive outcomes', () => {
    expect(CODE_WORK_BASELINE_RECEIPT_CLASSES).toEqual(['authority_pins'])
    const invalid = validateCodeWorkAdmission(admission({
      evidence: { requiredReceiptClasses: ['authority_pins', 'policy_denial'] },
    }))
    expect(invalid.ok).toBe(false)
    expect(terminalEvidenceRequirements('policy_denied', admission()).requiredReceiptClasses)
      .toEqual(expect.arrayContaining(['authority_pins', 'policy_denial', 'terminal']))
    expect(terminalEvidenceRequirements('cancelled', admission()).requiredReceiptClasses)
      .toEqual(expect.arrayContaining(['authority_pins', 'cancellation_fencing', 'terminal']))
  })

  it('derives successful command/test requirements without requiring policy denial', () => {
    const required = terminalEvidenceRequirements('ready_for_human_review', admission())
    expect(required.requiredCommandIds).toEqual(['sdf1.proof.fixture_test', 'sdf1.proof.typecheck'])
    expect(required.requiredReceiptClasses).not.toContain('policy_denial')
    expect(required.patchOperation).toBe('when_changed')
  })
})

describe('SDF-1A structural no-execution proof', () => {
  it('contains contracts/policy only and no execution, model, store or route seam', () => {
    const directory = resolve(REPO_ROOT, 'apps/web/lib/atlas/code-work')
    const files = readdirSync(directory).filter(name => name.endsWith('.ts')).sort()
    expect(files).toEqual([
      'binding.ts', 'capability.ts', 'command-registry.ts', 'evidence.ts', 'lifecycle.ts',
      'patch-protocol.ts', 'path-policy.ts', 'policy.ts', 'repository-registry.ts',
      'terminal-evidence.ts', 'types.ts', 'worker-registry.ts',
    ])
    const source = files.map(file => readFileSync(resolve(directory, file), 'utf8')).join('\n')
    expect(source).not.toMatch(/from ['"](?:node:)?child_process['"]|require\(['"](?:node:)?child_process['"]\)/)
    expect(source).not.toMatch(/from ['"](?:node:)?(?:fs|net|http|https)['"]|from ['"]@anthropic-ai\/sdk['"]|from ['"]openai['"]|from ['"]@supabase\//)
    expect(source).not.toMatch(/\b(?:execFile|spawn|fork)\s*\(|\bchildProcess\.exec\s*\(|\bfetch\s*\(|\b(?:writeFile|appendFile|createWriteStream)\s*\(/)
    expect(source).not.toMatch(/git\s+worktree\s+add|git\s+commit|gh\s+pr|vercel\s+deploy/i)
    expect(source).not.toMatch(/process\.env|SUPABASE_SERVICE_ROLE|ANTHROPIC_API_KEY|OPENAI_API_KEY/)
  })
})
