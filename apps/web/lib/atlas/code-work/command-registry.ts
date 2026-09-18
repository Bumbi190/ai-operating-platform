/**
 * SDF-1A command-ID registry. Definitions and pure argument resolution only.
 * There is deliberately no child_process import and no execution function.
 */

import { canonicalTargetVersionHash } from '../authorization/build'
import type { CodeWorkValidation } from './types'

export const COMMAND_REGISTRY_VERSION = 'sdf1.commands.v1' as const

export interface CommandEnumArgument {
  name: string
  type: 'enum'
  values: readonly string[]
}

export type CommandArgvToken =
  | { kind: 'literal'; value: string }
  | { kind: 'argument'; name: string }

export interface CodeWorkCommandDefinition {
  commandId: string
  version: 1
  executableIdentity: string
  argvTemplate: readonly CommandArgvToken[]
  arguments: readonly CommandEnumArgument[]
  cwdPolicy: { kind: 'repo_relative'; path: string }
  environmentAllowlist: readonly string[]
  networkRequirement: 'denied'
  timeoutMaximumSeconds: number
  transientOutputPolicy: {
    allowedRepoRelativePaths: readonly string[]
    mustBeAbsentFromFinalDiff: true
  }
  shell: 'forbidden'
}

const literal = (value: string): CommandArgvToken => ({ kind: 'literal', value })

export const CODE_WORK_COMMANDS = Object.freeze({
  'sdf1.proof.fixture_test': Object.freeze({
    commandId: 'sdf1.proof.fixture_test',
    version: 1,
    executableIdentity: 'toolchain.npm',
    argvTemplate: Object.freeze([
      literal('exec'), literal('--'), literal('vitest'), literal('run'),
      { kind: 'argument', name: 'suite' } as const,
    ]),
    arguments: Object.freeze([{
      name: 'suite', type: 'enum', values: Object.freeze(['lib/qa/sdf1a-code-work-contracts.test.ts']),
    } as const]),
    cwdPolicy: Object.freeze({ kind: 'repo_relative', path: 'apps/web' }),
    environmentAllowlist: Object.freeze(['CI', 'NO_COLOR', 'TMPDIR']),
    networkRequirement: 'denied',
    timeoutMaximumSeconds: 300,
    transientOutputPolicy: Object.freeze({
      allowedRepoRelativePaths: Object.freeze([]), mustBeAbsentFromFinalDiff: true,
    }),
    shell: 'forbidden',
  }),
  'sdf1.proof.typecheck': Object.freeze({
    commandId: 'sdf1.proof.typecheck',
    version: 1,
    executableIdentity: 'toolchain.npm',
    argvTemplate: Object.freeze([literal('run'), literal('typecheck')]),
    arguments: Object.freeze([]),
    cwdPolicy: Object.freeze({ kind: 'repo_relative', path: 'apps/web' }),
    environmentAllowlist: Object.freeze(['CI', 'NO_COLOR', 'TMPDIR']),
    networkRequirement: 'denied',
    timeoutMaximumSeconds: 300,
    transientOutputPolicy: Object.freeze({
      allowedRepoRelativePaths: Object.freeze(['apps/web/tsconfig.tsbuildinfo']),
      mustBeAbsentFromFinalDiff: true,
    }),
    shell: 'forbidden',
  }),
} satisfies Record<string, CodeWorkCommandDefinition>)

export type CodeWorkCommandId = keyof typeof CODE_WORK_COMMANDS

export function lookupCodeWorkCommand(id: unknown, version: unknown): CodeWorkCommandDefinition | null {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(CODE_WORK_COMMANDS, id)) return null
  const definition = CODE_WORK_COMMANDS[id as CodeWorkCommandId]
  return version === definition.version ? definition : null
}

function registryProjection() {
  return Object.values(CODE_WORK_COMMANDS)
    .map(definition => ({ ...definition }))
    .sort((a, b) => a.commandId.localeCompare(b.commandId))
}

export function codeWorkCommandRegistryHash(): string {
  return canonicalTargetVersionHash({ version: COMMAND_REGISTRY_VERSION, commands: registryProjection() })
}

export interface ResolvedCommandInvocation {
  commandId: string
  commandVersion: number
  executableIdentity: string
  argv: string[]
  cwd: string
  environmentAllowlist: readonly string[]
  networkRequirement: 'denied'
  timeoutMaximumSeconds: number
  transientOutputPolicy: CodeWorkCommandDefinition['transientOutputPolicy']
}

/** Resolve typed enum arguments to argv. No caller can supply an argv array. */
export function resolveCommandInvocation(input: {
  commandId: unknown
  version: unknown
  arguments: unknown
}): CodeWorkValidation<ResolvedCommandInvocation> {
  const definition = lookupCodeWorkCommand(input.commandId, input.version)
  if (!definition) {
    return { ok: false, violations: [{ path: 'commandId', code: 'unknown_command', detail: 'unknown command/version' }] }
  }
  if (!input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments)) {
    return { ok: false, violations: [{ path: 'arguments', code: 'arguments_object_required', detail: 'arguments must be an object' }] }
  }
  const supplied = input.arguments as Record<string, unknown>
  const expected = new Set(definition.arguments.map(argument => argument.name))
  const extra = Object.keys(supplied).filter(key => !expected.has(key))
  if (extra.length > 0) {
    return { ok: false, violations: [{ path: 'arguments', code: 'free_argument_forbidden', detail: `unexpected: ${extra.sort().join(',')}` }] }
  }

  const resolved = new Map<string, string>()
  for (const argument of definition.arguments) {
    const value = supplied[argument.name]
    if (typeof value !== 'string' || !argument.values.includes(value)) {
      return {
        ok: false,
        violations: [{ path: `arguments.${argument.name}`, code: 'argument_not_allowlisted', detail: 'value is not in the enum' }],
      }
    }
    resolved.set(argument.name, value)
  }

  const argv = definition.argvTemplate.map(token => {
    if (token.kind === 'literal') return token.value
    const value = resolved.get(token.name)
    if (value === undefined) throw new Error('registry invariant: unresolved typed argument')
    return value
  })

  return {
    ok: true,
    value: {
      commandId: definition.commandId,
      commandVersion: definition.version,
      executableIdentity: definition.executableIdentity,
      argv,
      cwd: definition.cwdPolicy.path,
      environmentAllowlist: definition.environmentAllowlist,
      networkRequirement: definition.networkRequirement,
      timeoutMaximumSeconds: definition.timeoutMaximumSeconds,
      transientOutputPolicy: definition.transientOutputPolicy,
    },
  }
}
