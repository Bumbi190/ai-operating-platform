/** Purpose-specific Work Package → CodeWorkAdmission attenuation. */

import type { MissionDataScope } from '@/lib/atlas/mission/types'
import type { WorkPackage } from '@/lib/atlas/workpackage/types'
import { evaluateRepoPath, normalizeRepoRelativePath } from '../path-policy'
import {
  CODE_WORK_AUTHORIZATION_ACTION_KIND,
  CODE_WORK_CAPABILITY_ID,
} from '../types'
import type {
  CodeWorkAdmissionV1,
  CodeWorkPolicyViolation,
  CodeWorkValidation,
} from '../types'

const PREFIX = 'repo:'

interface RepositoryResource {
  repositoryId: string
  path: string
  access: MissionDataScope['access']
}

export function codeWorkRepositoryResource(repositoryId: string, path = ''): string {
  return `${PREFIX}${repositoryId}:${path === '.' ? '' : path}`
}

function parseResource(resource: string, access: MissionDataScope['access']): RepositoryResource | null {
  if (!resource.startsWith(PREFIX)) return null
  const splitAt = resource.indexOf(':', PREFIX.length)
  if (splitAt < 0) return null
  const repositoryId = resource.slice(PREFIX.length, splitAt)
  const rawPath = resource.slice(splitAt + 1)
  if (!repositoryId) return null
  if (rawPath === '') return { repositoryId, path: '', access }
  const normalized = normalizeRepoRelativePath(rawPath, 'workPackage.dataScope.resource')
  return normalized.ok ? { repositoryId, path: normalized.value, access } : null
}

function covers(parent: string, child: string): boolean {
  return parent === '' || child === parent || child.startsWith(`${parent}/`)
}

function violation(path: string, code: string, detail: string): CodeWorkPolicyViolation {
  return { path, code, detail }
}

export function validateCodeWorkPackageAttenuation(
  workPackage: WorkPackage,
  admission: CodeWorkAdmissionV1,
): CodeWorkValidation<CodeWorkAdmissionV1> {
  const violations: CodeWorkPolicyViolation[] = []
  const action = CODE_WORK_AUTHORIZATION_ACTION_KIND

  if (!workPackage.authority.some(item => item.action === action)
    || !workPackage.allowedActions.some(item => item.action === action)
    || workPackage.forbiddenActions.some(item => item.action === action)) {
    violations.push(violation('workPackage.authority', 'code_action_not_authorized', `missing exact ${action} authority`))
  }
  if (!workPackage.tools.some(item => item.tool === CODE_WORK_CAPABILITY_ID)) {
    violations.push(violation('workPackage.tools', 'code_capability_not_authorized', `missing exact ${CODE_WORK_CAPABILITY_ID} tool`))
  }
  if (workPackage.projectId !== admission.projectId
    || workPackage.workPackageId !== admission.governance.workPackage.id
    || workPackage.packageHash !== admission.governance.workPackage.hash
    || workPackage.missionId !== admission.governance.mission.id
    || workPackage.missionVersion !== admission.governance.mission.version
    || workPackage.missionBoundHash !== admission.governance.mission.hash
    || workPackage.envelopeId !== admission.governance.delegation.envelopeId
    || workPackage.delegationBoundHash !== admission.governance.delegation.hash) {
    violations.push(violation('workPackage', 'governance_pin_mismatch', 'Work Package pins do not match the admission'))
  }

  const resources = workPackage.dataScope
    .map(item => parseResource(item.resource, item.access))
    .filter((item): item is RepositoryResource => item !== null)
  const repoResources = resources.filter(item => item.repositoryId === admission.repository.repositoryId)
  if (repoResources.length === 0) {
    violations.push(violation('workPackage.dataScope', 'repository_not_covered', 'no resource names the exact trusted repository'))
  }

  const denied = workPackage.outOfScope
    .map(item => parseResource(item, 'write'))
    .filter((item): item is RepositoryResource => item !== null)
    .filter(item => item.repositoryId === admission.repository.repositoryId)

  const check = (paths: string[], access: MissionDataScope['access'], field: string) => {
    if (paths.length === 0) {
      violations.push(violation(field, 'empty_resource_scope', 'explicit admission scope is required'))
      return
    }
    for (const path of paths) {
      if (denied.some(item => covers(item.path, path) || covers(path, item.path))) {
        violations.push(violation(field, 'work_package_resource_denied', `${path} is denied by the Work Package`))
        continue
      }
      const locallyAllowed = evaluateRepoPath({
        path,
        allowedScopes: paths,
        deniedScopes: admission.files.deniedScopes,
      })
      if (!locallyAllowed.ok) {
        violations.push(violation(field, 'admission_scope_self_denied', `${path} overlaps the admission deny list`))
        continue
      }
      const covered = repoResources.some(item =>
        (access === 'read' || item.access === 'write') && covers(item.path, path))
      if (!covered) {
        violations.push(violation(field, 'work_package_scope_exceeded', `${access} path ${path} is outside Work Package resources`))
      }
    }
  }
  check(admission.files.readScopes, 'read', 'admission.files.readScopes')
  check(admission.files.writeScopes, 'write', 'admission.files.writeScopes')

  return violations.length > 0 ? { ok: false, violations } : { ok: true, value: admission }
}
